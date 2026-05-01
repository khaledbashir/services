#!/usr/bin/env python3
"""Airtable → NocoDB migrator (v3 API). Drop-in for the Baserow migrator."""
import os, sys, json, time, re, requests
from pathlib import Path

ROOT = Path("/root/anc-services/scripts/airtable-to-nocodb")
ROOT.mkdir(exist_ok=True)

def load_env(p):
    return dict(l.strip().split("=", 1) for l in open(p) if "=" in l and not l.strip().startswith("#"))

AT = load_env("/root/.airtable-creds")
NC = load_env("/root/.nocodb-creds")
AIRTABLE_PAT = AT["AIRTABLE_PAT"]
NOCODB_URL = NC["NOCODB_URL"].rstrip("/")
NOCODB_PAT = NC["NOCODB_PAT"]
WORKSPACE_ID = "w2116qsq"

STATE_FILE = ROOT / "state.json"
NOTES_FILE = ROOT / "MIGRATION_NOTES.md"

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"bases": {}}

def save_state(s):
    STATE_FILE.write_text(json.dumps(s, indent=2))

_notes = []
def note(m):
    _notes.append(m); print(f"  NOTE: {m}")

# ---------- HTTP ----------
def nc(method, path, **kw):
    headers = kw.pop("headers", {})
    headers["xc-token"] = NOCODB_PAT
    headers.setdefault("Content-Type", "application/json")
    url = path if path.startswith("http") else f"{NOCODB_URL}{path}"
    for attempt in range(5):
        r = requests.request(method, url, headers=headers, timeout=120, **kw)
        if r.ok:
            return r.json() if r.text else None
        if r.status_code in (409, 429, 500, 502, 503, 504):
            time.sleep(min(2 ** attempt, 30))
            continue
        sys.stderr.write(f"\nNocoDB {method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    r.raise_for_status()

def at_get(path, params=None):
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
    url = f"https://api.airtable.com/v0{path}"
    for attempt in range(5):
        r = requests.get(url, headers=headers, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(30); continue
        if not r.ok:
            sys.stderr.write(f"AT GET {path} → {r.status_code}\n{r.text[:400]}\n")
            r.raise_for_status()
        return r.json()
    raise RuntimeError("AT retries exhausted")

# ---------- Field mapping ----------
def map_field(at_field):
    """Returns (nocodb_field_payload, is_link, original_at_type) or (None,False,t) to skip."""
    t = at_field["type"]
    name = at_field["name"][:255] or "field"
    opts = at_field.get("options", {}) or {}

    if t == "multipleRecordLinks":
        return ({"title": name, "type": "LinkToAnotherRecord",
                 "options": {"related_table_id": "PLACEHOLDER", "relation_type": "mm"},
                 "_linked_at_table_id": opts.get("linkedTableId")}, True, t)

    if t in ("singleLineText", "phoneNumber", "barcode", "button"):
        return ({"title": name, "type": "SingleLineText"}, False, t)
    if t == "email":
        return ({"title": name, "type": "Email"}, False, t)
    if t == "url":
        return ({"title": name, "type": "URL"}, False, t)
    if t in ("multilineText", "richText"):
        return ({"title": name, "type": "LongText"}, False, t)
    if t in ("number", "duration", "count"):
        return ({"title": name, "type": "Number"}, False, t)
    if t == "currency":
        return ({"title": name, "type": "Currency"}, False, t)
    if t == "percent":
        return ({"title": name, "type": "Percent"}, False, t)
    if t == "rating":
        return ({"title": name, "type": "Rating"}, False, t)
    if t == "checkbox":
        return ({"title": name, "type": "Checkbox"}, False, t)
    if t == "singleSelect":
        choices = [{"title": (c["name"] or "")[:255], "color": "#0A52EF"} for c in opts.get("choices", [])]
        return ({"title": name, "type": "SingleSelect", "options": {"choices": choices}}, False, t)
    if t == "multipleSelects":
        choices = [{"title": (c["name"] or "")[:255], "color": "#0A52EF"} for c in opts.get("choices", [])]
        return ({"title": name, "type": "MultiSelect", "options": {"choices": choices}}, False, t)
    if t == "date":
        return ({"title": name, "type": "Date"}, False, t)
    if t == "dateTime":
        return ({"title": name, "type": "DateTime"}, False, t)
    if t in ("createdTime", "lastModifiedTime", "createdBy", "lastModifiedBy"):
        return ({"title": name, "type": "LongText"}, False, t)
    if t == "autoNumber":
        return ({"title": name, "type": "Number"}, False, t)
    if t in ("multipleCollaborators", "singleCollaborator"):
        return ({"title": name, "type": "LongText"}, False, t)
    if t == "multipleAttachments":
        return ({"title": name, "type": "Attachment"}, False, t)
    if t in ("formula", "rollup", "lookup", "multipleLookupValues", "aiText", "externalSyncSource"):
        return ({"title": name, "type": "LongText"}, False, t)
    note(f"unknown AT type '{t}' field '{name}' — fallback LongText")
    return ({"title": name, "type": "LongText"}, False, t)

def transform_value(orig_type, val, target_type):
    if val is None:
        return None
    if orig_type == "multipleAttachments" and isinstance(val, list):
        # NocoDB Attachment expects array of {url, title, mimetype, size}
        return [{"url": a.get("url"), "title": a.get("filename"),
                 "mimetype": a.get("type"), "size": a.get("size")} for a in val if a.get("url")]
    if orig_type in ("formula", "rollup", "lookup", "multipleLookupValues", "count"):
        if isinstance(val, (list, dict)):
            try:
                return ", ".join(str(v) for v in val) if isinstance(val, list) and all(not isinstance(x, (dict,list)) for x in val) else json.dumps(val, default=str)
            except Exception:
                return json.dumps(val, default=str)
        return str(val)
    if orig_type in ("createdTime", "lastModifiedTime"):
        return str(val)
    if orig_type in ("createdBy", "lastModifiedBy"):
        return val.get("name") if isinstance(val, dict) else str(val)
    if orig_type == "barcode":
        return val.get("text", "") if isinstance(val, dict) else str(val)
    if orig_type == "checkbox":
        return bool(val)
    if orig_type == "multipleSelects":
        return ",".join(val) if isinstance(val, list) else str(val)
    if orig_type == "singleSelect":
        return val
    if orig_type in ("singleCollaborator",):
        return val.get("name") if isinstance(val, dict) else str(val)
    if orig_type == "multipleCollaborators" and isinstance(val, list):
        return ", ".join(c.get("name", str(c)) if isinstance(c, dict) else str(c) for c in val)
    if target_type in ("LongText", "SingleLineText", "Email", "URL"):
        if not isinstance(val, str):
            val = json.dumps(val, default=str) if isinstance(val, (list, dict)) else str(val)
        if target_type == "SingleLineText":
            val = val[:255]
        return val
    if target_type == "Number" and isinstance(val, str):
        try:
            return float(val)
        except (ValueError, TypeError):
            return None
    return val

# ---------- NocoDB ops ----------
def nc_create_base(title):
    return nc("POST", f"/api/v3/meta/workspaces/{WORKSPACE_ID}/bases", json={"title": title[:50]})

def nc_list_bases():
    return nc("GET", f"/api/v3/meta/workspaces/{WORKSPACE_ID}/bases")["list"]

def nc_create_table(base_id, title, fields):
    return nc("POST", f"/api/v3/meta/bases/{base_id}/tables", json={"title": title[:50], "fields": fields})

def nc_add_field(base_id, table_id, payload):
    return nc("POST", f"/api/v3/meta/bases/{base_id}/tables/{table_id}/fields", json=payload)

def nc_bulk_insert(base_id, table_id, records):
    out = []
    BATCH = 10
    for i in range(0, len(records), BATCH):
        chunk = records[i:i+BATCH]
        resp = nc("POST", f"/api/v3/data/{base_id}/{table_id}/records",
                  json=[{"fields": r} for r in chunk])
        if resp and "records" in resp:
            out.extend(resp["records"])
    return out

def nc_bulk_update(base_id, table_id, updates):
    BATCH = 10
    for i in range(0, len(updates), BATCH):
        chunk = updates[i:i+BATCH]
        nc("PATCH", f"/api/v3/data/{base_id}/{table_id}/records", json=chunk)

# ---------- Airtable ops ----------
def at_list_bases():
    return at_get("/meta/bases")["bases"]

def at_get_schema(base_id):
    return at_get(f"/meta/bases/{base_id}/tables")["tables"]

def at_iter_records(base_id, table_id):
    offset = None
    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset
        d = at_get(f"/{base_id}/{table_id}", params=params)
        for r in d.get("records", []):
            yield r
        offset = d.get("offset")
        if not offset:
            break
        time.sleep(0.25)

# ---------- Migration ----------
def safe_name(name, used):
    n = re.sub(r"\s+", " ", name).strip()[:50] or "field"
    base = n; i = 2
    while n.lower() in used:
        n = f"{base} ({i})"[:50]; i += 1
    used.add(n.lower())
    return n

def migrate_base(base_id, base_name, state):
    print(f"\n{'='*60}\nBASE: {base_name} ({base_id})\n{'='*60}")
    bs = state["bases"].setdefault(base_id, {"name": base_name, "tables": {}, "links_done": False})

    # Create or reuse base
    clean = re.sub(r"[^\w\s\-/().,&]", "", base_name).strip()[:50] or base_name[:50]
    if "nc_base_id" not in bs:
        existing = nc_list_bases()
        match = next((b for b in existing if b["title"] == clean), None)
        if match:
            bs["nc_base_id"] = match["id"]
            print(f"  reuse base '{clean}' (id={match['id']})")
        else:
            b = nc_create_base(clean)
            bs["nc_base_id"] = b["id"]
            print(f"  created base '{clean}' (id={b['id']})")
        save_state(state)

    nc_bid = bs["nc_base_id"]
    schema = at_get_schema(base_id)

    # Pass 1 — create tables + non-link fields + records
    for at_t in schema:
        at_tid = at_t["id"]
        at_tname = at_t["name"]
        ts = bs["tables"].setdefault(at_tid, {"name": at_tname, "fields": {}, "rows": {}})
        if ts.get("rows_done"):
            print(f"  · {at_tname}: cached ({len(ts['rows'])} rows) — skip")
            continue
        print(f"  · {at_tname}: ", end="", flush=True)

        # Build initial field payload — non-link fields. The first field becomes the display field.
        used = set()
        at_fields = at_t["fields"]
        initial_fields_payload = []
        field_meta_pending = []  # (af_id, original_type, payload, is_link)
        for at_f in at_fields:
            payload, is_link, ot = map_field(at_f)
            if payload is None:
                continue
            payload["title"] = safe_name(payload["title"], used)
            field_meta_pending.append((at_f["id"], at_f["name"], ot, payload, is_link))

        if "nc_table_id" not in ts:
            # Inline create-table only accepts simple field types (no select options, no links).
            # Create with the primary field only, then add the rest via add-field calls.
            simple_types = {"SingleLineText", "LongText", "Number", "Decimal", "Currency",
                           "Percent", "Duration", "Date", "DateTime", "Time", "Email",
                           "URL", "PhoneNumber", "Checkbox", "Rating"}
            primary = next(((af_id, af_name, ot, p) for (af_id, af_name, ot, p, is_link) in field_meta_pending
                            if not is_link and p["type"] in simple_types), None)
            if primary is None:
                # Fall back: create a generic Name primary field, treat ALL AT fields as added
                tbl = nc_create_table(nc_bid, at_tname[:50], [{"title": "Name", "type": "SingleLineText"}])
            else:
                af_id, af_name, ot, p = primary
                tbl = nc_create_table(nc_bid, at_tname[:50], [{"title": p["title"], "type": p["type"]}])
                # Record the primary in field meta
                nc_primary = next((f for f in tbl["fields"] if f["title"] == p["title"]), None)
                if nc_primary:
                    ts["fields"][af_id] = {
                        "nc_field_id": nc_primary["id"],
                        "nc_field_title": nc_primary["title"],
                        "airtable_field_id": af_id,
                        "airtable_field_name": af_name,
                        "airtable_type": ot,
                        "nc_type": p["type"],
                    }
            ts["nc_table_id"] = tbl["id"]
            save_state(state)

            # Now add remaining fields via add-field
            for af_id, af_name, ot, p, is_link in field_meta_pending:
                if af_id in ts["fields"]:
                    continue
                if is_link:
                    ts["fields"][af_id] = {
                        "deferred_link": True,
                        "airtable_field_id": af_id,
                        "airtable_field_name": af_name,
                        "airtable_type": ot,
                        "linked_at_table_id": p.get("_linked_at_table_id"),
                        "name": p["title"],
                    }
                    save_state(state)
                    continue
                clean_payload = {k: v for k, v in p.items() if not k.startswith("_")}
                try:
                    created = nc_add_field(nc_bid, ts["nc_table_id"], clean_payload)
                    ts["fields"][af_id] = {
                        "nc_field_id": created["id"],
                        "nc_field_title": created["title"],
                        "airtable_field_id": af_id,
                        "airtable_field_name": af_name,
                        "airtable_type": ot,
                        "nc_type": p["type"],
                    }
                except Exception as e:
                    note(f"{base_name}/{at_tname}: add field '{p['title']}' (type {p['type']}) failed: {e}")
                save_state(state)

        nc_tid = ts["nc_table_id"]

        # Pull records and bulk insert
        rows = []
        at_ids = []
        for rec in at_iter_records(base_id, at_tid):
            row = {}
            at_ids.append(rec["id"])
            for af_id, fmeta in ts["fields"].items():
                if fmeta.get("deferred_link"):
                    continue
                v = rec["fields"].get(fmeta["airtable_field_name"])
                if v is None:
                    continue
                tv = transform_value(fmeta["airtable_type"], v, fmeta.get("nc_type", "LongText"))
                if tv is None:
                    continue
                row[fmeta["nc_field_title"]] = tv
            rows.append(row)

        if rows:
            print(f"insert {len(rows)} rows... ", end="", flush=True)
            inserted = nc_bulk_insert(nc_bid, nc_tid, rows)
            for at_rid, ins in zip(at_ids, inserted):
                # NocoDB returns {"id":N, "id_fields":{"Id":N}, "fields":{...}}
                ts["rows"][at_rid] = ins.get("id")
        ts["rows_done"] = True
        save_state(state)
        non_link_count = len([f for f in ts["fields"].values() if not f.get("deferred_link")])
        print(f"done ({len(rows)} rows, {non_link_count} fields)")

    # Pass 2 — create link fields and backfill
    if not bs.get("links_done"):
        print("  Pass 2: link fields + backfill")
        for at_tid, ts in bs["tables"].items():
            nc_tid = ts["nc_table_id"]
            for af_id, fmeta in list(ts["fields"].items()):
                if not fmeta.get("deferred_link"):
                    continue
                if "nc_field_id" in fmeta:
                    continue
                target_at_tid = fmeta["linked_at_table_id"]
                target_ts = bs["tables"].get(target_at_tid)
                if not target_ts:
                    note(f"link '{fmeta['airtable_field_name']}' → unknown table {target_at_tid}")
                    continue
                target_nc_tid = target_ts["nc_table_id"]
                # Detect auto-created reverse link from a previously-created link in the other direction.
                existing = nc("GET", f"/api/v3/meta/bases/{nc_bid}/tables/{nc_tid}").get("fields", [])
                used_ids = {f.get("nc_field_id") for f in ts["fields"].values() if f.get("nc_field_id")}
                reverse = next((f for f in existing
                                if f.get("type") == "LinkToAnotherRecord"
                                and (f.get("options") or {}).get("related_table_id") == target_nc_tid
                                and f["id"] not in used_ids), None)
                if reverse:
                    try:
                        nc("PATCH", f"/api/v3/meta/bases/{nc_bid}/tables/{nc_tid}/fields/{reverse['id']}",
                           json={"title": fmeta["name"][:50]})
                    except Exception:
                        pass
                    fmeta["nc_field_id"] = reverse["id"]
                    fmeta["nc_field_title"] = fmeta["name"][:50]
                    save_state(state)
                    continue
                try:
                    created = nc_add_field(nc_bid, nc_tid, {
                        "title": fmeta["name"],
                        "type": "LinkToAnotherRecord",
                        "options": {"related_table_id": target_nc_tid, "relation_type": "mm"},
                    })
                    fmeta["nc_field_id"] = created["id"]
                    fmeta["nc_field_title"] = created["title"]
                    save_state(state)
                except Exception as e:
                    note(f"link create failed '{fmeta['airtable_field_name']}': {e}")

        # Backfill link values — re-fetch each table's records and PATCH link cells
        for at_tid, ts in bs["tables"].items():
            link_fields = [f for f in ts["fields"].values() if f.get("deferred_link") and f.get("nc_field_id")]
            if not link_fields:
                continue
            print(f"    backfill links in {ts['name']}: {len(link_fields)} link fields")
            updates = []
            for rec in at_iter_records(base_id, at_tid):
                nc_rid = ts["rows"].get(rec["id"])
                if not nc_rid:
                    continue
                payload = {"id": nc_rid, "fields": {}}
                touched = False
                for fmeta in link_fields:
                    val = rec["fields"].get(fmeta["airtable_field_name"])
                    if not val:
                        continue
                    if isinstance(val, str):
                        val = [val]
                    target_ts = bs["tables"].get(fmeta["linked_at_table_id"])
                    if not target_ts:
                        continue
                    mapped = [target_ts["rows"].get(v) for v in val]
                    mapped = [m for m in mapped if m]
                    if mapped:
                        payload["fields"][fmeta["nc_field_title"]] = mapped
                        touched = True
                if touched:
                    updates.append(payload)
            if updates:
                try:
                    nc_bulk_update(nc_bid, ts["nc_table_id"], updates)
                    print(f"      updated {len(updates)} rows")
                except Exception as e:
                    note(f"backfill failed in {ts['name']}: {e}")
        bs["links_done"] = True
        save_state(state)

    print(f"  ✓ {base_name} done")

def main():
    args = sys.argv[1:]
    if "--list" in args:
        for b in at_list_bases():
            print(f"  {b['id']}  {b['name']}")
        return

    bases = at_list_bases()
    if args:
        bases = [b for b in bases if b["id"] in args]
    else:
        bases = [b for b in bases if "Test" not in b["name"]]

    state = load_state()
    for b in bases:
        try:
            migrate_base(b["id"], b["name"], state)
        except Exception as e:
            note(f"FATAL on {b['name']}: {e}")
            raise

    if _notes:
        existing = NOTES_FILE.read_text() if NOTES_FILE.exists() else "# Migration Notes\n\n"
        NOTES_FILE.write_text(existing + "\n## Run " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n\n" + "\n".join(f"- {n}" for n in _notes) + "\n")
    print("\nALL DONE.")

if __name__ == "__main__":
    main()
