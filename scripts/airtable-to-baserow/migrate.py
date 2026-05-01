#!/usr/bin/env python3
"""
Airtable → Baserow lift-and-shift migrator.

Loads ANC's Airtable bases into Baserow workspace 4 ("ANC Operations") at
ops.ancsports.net. Two-pass: (1) databases + tables + non-link fields + records,
(2) link_row fields backfilled with mapped row IDs.

Lossy by design where Baserow can't 1:1 (formulas, lookups, rollups, attachments
are stored as text or skipped — logged to MIGRATION_NOTES.md).

Usage:
    python3 migrate.py                  # all bases (skips Test)
    python3 migrate.py <base_id>        # single base
    python3 migrate.py --list           # list bases + table counts
"""
import os
import sys
import json
import time
import re
from pathlib import Path
import requests

# ----- creds -----
def load_env(path):
    return dict(l.strip().split("=", 1) for l in open(path) if "=" in l and not l.strip().startswith("#"))

AT = load_env("/root/.airtable-creds")
BR = load_env("/root/.baserow-creds")
AIRTABLE_PAT = AT["AIRTABLE_PAT"]
BASEROW_URL = BR["BASEROW_URL"].rstrip("/")
BASEROW_EMAIL = BR["BASEROW_EMAIL"]
BASEROW_PASSWORD = BR["BASEROW_PASSWORD"]
WORKSPACE_ID = 4

REPO_ROOT = Path("/root/anc-services/scripts/airtable-to-baserow")
NOTES_FILE = REPO_ROOT / "MIGRATION_NOTES.md"
STATE_FILE = REPO_ROOT / "state.json"

# ----- HTTP helpers -----
_jwt_cache = {"token": None, "fetched": 0}

def baserow_jwt():
    if _jwt_cache["token"] and time.time() - _jwt_cache["fetched"] < 480:
        return _jwt_cache["token"]
    r = requests.post(
        f"{BASEROW_URL}/api/user/token-auth/",
        json={"email": BASEROW_EMAIL, "password": BASEROW_PASSWORD},
        timeout=30,
    )
    r.raise_for_status()
    tok = r.json()["access_token"]
    _jwt_cache["token"] = tok
    _jwt_cache["fetched"] = time.time()
    return tok

def br(method, path, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"JWT {baserow_jwt()}"
    headers.setdefault("Content-Type", "application/json")
    url = path if path.startswith("http") else f"{BASEROW_URL}{path}"
    last_err = None
    for attempt in range(6):
        r = requests.request(method, url, headers=headers, timeout=120, **kwargs)
        if r.ok:
            return r.json() if r.text else None
        # Retry transient lock conflicts and 5xx
        if r.status_code in (409, 429, 500, 502, 503, 504):
            wait = min(2 ** attempt, 30)
            time.sleep(wait)
            last_err = r
            continue
        sys.stderr.write(f"\nBaserow {method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    sys.stderr.write(f"\nBaserow {method} {path} → exhausted retries; last {last_err.status_code}\n{last_err.text[:600]}\n")
    last_err.raise_for_status()

def at_get(path, params=None):
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
    url = f"https://api.airtable.com/v0{path}"
    for attempt in range(5):
        r = requests.get(url, headers=headers, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(30)
            continue
        if not r.ok:
            sys.stderr.write(f"Airtable GET {path} → {r.status_code}\n{r.text[:400]}\n")
            r.raise_for_status()
        return r.json()
    raise RuntimeError("Airtable rate-limit retries exhausted")

# ----- state for resumability -----
def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"bases": {}}

def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ----- notes -----
_notes = []
def note(msg):
    _notes.append(msg)
    print(f"  NOTE: {msg}")

def flush_notes():
    if not _notes:
        return
    existing = NOTES_FILE.read_text() if NOTES_FILE.exists() else "# Migration Notes\n\n"
    NOTES_FILE.write_text(existing + "\n## Run " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n\n" + "\n".join(f"- {n}" for n in _notes) + "\n")
    _notes.clear()

# ----- field type translation -----
def map_field(at_field):
    """Translate an Airtable field definition to a Baserow field-create payload.
    Returns (payload, is_link, original_type). is_link=True means defer to pass 2.
    Returns (None, False, type) if the field should be skipped entirely."""
    t = at_field["type"]
    name = at_field["name"]
    opts = at_field.get("options", {}) or {}

    if t == "multipleRecordLinks":
        return ({"name": name, "type": "link_row", "_link_target": opts.get("linkedTableId")}, True, t)

    if t in ("singleLineText", "email", "url", "phoneNumber", "barcode", "button"):
        return ({"name": name, "type": "text"}, False, t)
    if t in ("multilineText", "richText"):
        return ({"name": name, "type": "long_text"}, False, t)
    if t in ("number", "currency", "percent", "duration", "rating", "count"):
        precision = opts.get("precision", 0)
        decimals = min(max(precision, 5), 10)  # floor at 5 to absorb stray floats
        return ({"name": name, "type": "number", "number_decimal_places": decimals, "_decimals": decimals}, False, t)
    if t == "checkbox":
        return ({"name": name, "type": "boolean"}, False, t)
    if t == "singleSelect":
        choices = opts.get("choices", [])
        return ({"name": name, "type": "single_select",
                 "select_options": [{"value": c["name"][:255], "color": c.get("color", "blue").split("Light")[0].split("Bright")[0].lower() or "blue"} for c in choices]}, False, t)
    if t == "multipleSelects":
        choices = opts.get("choices", [])
        return ({"name": name, "type": "multiple_select",
                 "select_options": [{"value": c["name"][:255], "color": c.get("color", "blue").split("Light")[0].split("Bright")[0].lower() or "blue"} for c in choices]}, False, t)
    if t == "date":
        return ({"name": name, "type": "date", "date_include_time": False, "date_format": "ISO"}, False, t)
    if t == "dateTime":
        return ({"name": name, "type": "date", "date_include_time": True, "date_format": "ISO"}, False, t)
    if t in ("createdTime", "lastModifiedTime", "createdBy", "lastModifiedBy"):
        return ({"name": name, "type": "text"}, False, t)  # Baserow has these built-in but we copy values as text for fidelity
    if t == "autoNumber":
        return ({"name": name, "type": "number", "number_decimal_places": 0}, False, t)
    if t == "multipleCollaborators" or t == "singleCollaborator":
        return ({"name": name, "type": "text"}, False, t)
    if t == "multipleAttachments":
        # Airtable URLs expire in 2hr — store JSON for now, flag for re-host
        return ({"name": name, "type": "long_text"}, False, t)
    if t in ("formula", "rollup", "lookup", "count", "multipleLookupValues", "externalSyncSource", "aiText"):
        # Store the *computed* value as text (Airtable returns inline; can be array/scalar)
        return ({"name": name, "type": "long_text"}, False, t)
    # Unknown — fallback to text
    note(f"unknown Airtable field type '{t}' for field '{name}' — falling back to text")
    return ({"name": name, "type": "text"}, False, t)

def transform_value(at_field, original_type, val):
    """Convert an Airtable cell value into a Baserow-compatible value for the mapped type."""
    if val is None:
        return None
    if original_type == "multipleAttachments":
        return json.dumps([{"url": a.get("url"), "filename": a.get("filename"), "size": a.get("size")} for a in val])
    if original_type in ("multipleCollaborators", "multipleRecordLinks"):
        if isinstance(val, list):
            return val  # link_row handled in pass 2; collaborators stored as ids
        return [val]
    if original_type == "singleCollaborator":
        return val.get("name") if isinstance(val, dict) else str(val)
    if original_type in ("formula", "rollup", "lookup", "multipleLookupValues", "count", "aiText", "externalSyncSource"):
        if isinstance(val, (list, dict)):
            try:
                return ", ".join(str(v) for v in val) if isinstance(val, list) and all(not isinstance(x, (dict, list)) for x in val) else json.dumps(val)
            except Exception:
                return json.dumps(val, default=str)
        return str(val)
    if original_type in ("createdTime", "lastModifiedTime"):
        return str(val)
    if original_type in ("createdBy", "lastModifiedBy"):
        return val.get("name") if isinstance(val, dict) else str(val)
    if original_type == "barcode":
        return val.get("text", "") if isinstance(val, dict) else str(val)
    if original_type == "checkbox":
        return bool(val)
    if original_type in ("singleSelect",):
        # Baserow expects the select option value (string) — Airtable returns the option name
        return val
    if original_type in ("multipleSelects",):
        return val if isinstance(val, list) else [val]
    if original_type in ("date", "dateTime"):
        return val  # ISO string
    if original_type in ("number", "currency", "percent", "duration", "rating", "count", "autoNumber"):
        return val
    return val

# ----- Baserow operations -----
def br_create_database(name):
    return br("POST", f"/api/applications/workspace/{WORKSPACE_ID}/", json={"name": name, "type": "database"})

def br_list_databases():
    return br("GET", f"/api/applications/workspace/{WORKSPACE_ID}/")

def br_create_table(database_id, name):
    # Baserow needs at least one row + first_row_header to create a table; we use a stub then delete
    payload = {"name": name, "data": [["Name"]], "first_row_header": True}
    return br("POST", f"/api/database/tables/database/{database_id}/", json=payload)

def br_list_fields(table_id):
    return br("GET", f"/api/database/fields/table/{table_id}/")

def br_create_field(table_id, payload):
    # strip our private keys
    payload = {k: v for k, v in payload.items() if not k.startswith("_")}
    return br("POST", f"/api/database/fields/table/{table_id}/", json=payload)

def br_delete_field(field_id):
    return br("DELETE", f"/api/database/fields/{field_id}/")

def br_update_field(field_id, payload):
    payload = {k: v for k, v in payload.items() if not k.startswith("_")}
    return br("PATCH", f"/api/database/fields/{field_id}/", json=payload)

def br_batch_insert(table_id, rows):
    # rows: list of {field_<id>: value}
    if not rows:
        return []
    out = []
    BATCH = 200
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        resp = br(
            "POST",
            f"/api/database/rows/table/{table_id}/batch/?user_field_names=false",
            json={"items": chunk},
        )
        out.extend(resp["items"])
    return out

def br_batch_update(table_id, rows):
    if not rows:
        return
    BATCH = 200
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        br("PATCH", f"/api/database/rows/table/{table_id}/batch/?user_field_names=false", json={"items": chunk})

# ----- Airtable operations -----
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
        data = at_get(f"/{base_id}/{table_id}", params=params)
        for r in data.get("records", []):
            yield r
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.25)  # rate limit

# ----- Migration logic -----
def safe_field_name(name, used):
    """Baserow field names: 1-255 chars, no duplicates."""
    n = re.sub(r"\s+", " ", name).strip()[:250]
    if not n:
        n = "field"
    base = n
    i = 2
    while n.lower() in used:
        n = f"{base} ({i})"
        i += 1
    used.add(n.lower())
    return n

def migrate_base(base_id, base_name, state):
    print(f"\n{'='*60}\nBASE: {base_name} ({base_id})\n{'='*60}")

    base_state = state["bases"].setdefault(base_id, {"name": base_name, "tables": {}, "links_done": False})

    # Ensure database exists
    if "database_id" not in base_state:
        # Strip emoji + clean name for Baserow
        clean = re.sub(r"[^\w\s\-/().,&]", "", base_name).strip() or base_name
        existing = br_list_databases()
        match = next((d for d in existing if d["name"] == clean), None)
        if match:
            base_state["database_id"] = match["id"]
            print(f"  reusing existing database '{clean}' (id={match['id']})")
        else:
            db = br_create_database(clean)
            base_state["database_id"] = db["id"]
            print(f"  created database '{clean}' (id={db['id']})")
        save_state(state)

    db_id = base_state["database_id"]
    schema = at_get_schema(base_id)

    # Pass 1 — for each table: create + non-link fields + records
    for at_table in schema:
        at_tid = at_table["id"]
        at_tname = at_table["name"]
        tstate = base_state["tables"].setdefault(at_tid, {"name": at_tname, "fields": {}, "rows": {}, "primary_field_id": None})
        if tstate.get("rows_done"):
            print(f"  · {at_tname}: already loaded ({len(tstate['rows'])} rows) — skip")
            continue

        print(f"  · {at_tname}: ", end="", flush=True)

        # Create table if missing
        if "table_id" not in tstate:
            tbl = br_create_table(db_id, at_tname[:255])
            tstate["table_id"] = tbl["id"]
            # Get the auto-created primary field
            fields = br_list_fields(tbl["id"])
            tstate["primary_field_id"] = fields[0]["id"]
            save_state(state)
        br_table_id = tstate["table_id"]

        # Map fields, skip links (pass 2)
        used_names = set()
        # First field is primary — Baserow's first column. Airtable's first field is the primary.
        # We rename the auto-created primary to match the first Airtable field, type-changed to text or appropriate.
        at_fields = at_table["fields"]
        primary_at = at_fields[0]
        primary_name = safe_field_name(primary_at["name"], used_names)

        if "primary" not in tstate["fields"]:
            # Update primary field to match first AT field name (keep as text since type changes on primary are restricted)
            br_update_field(tstate["primary_field_id"], {"name": primary_name, "type": "text"})
            tstate["fields"]["primary"] = {
                "baserow_field_id": tstate["primary_field_id"],
                "airtable_field_id": primary_at["id"],
                "airtable_field_name": primary_at["name"],
                "airtable_type": primary_at["type"],
                "name": primary_name,
            }
            save_state(state)

        # Remaining fields
        for at_f in at_fields[1:]:
            af_id = at_f["id"]
            if af_id in tstate["fields"]:
                continue  # resume
            payload, is_link, orig_type = map_field(at_f)
            if payload is None:
                continue
            payload["name"] = safe_field_name(payload["name"], used_names)
            if is_link:
                # Defer; record stub
                tstate["fields"][af_id] = {
                    "deferred_link": True,
                    "airtable_field_id": af_id,
                    "airtable_field_name": at_f["name"],
                    "airtable_type": orig_type,
                    "linked_table_id": payload.get("_link_target"),
                    "name": payload["name"],
                }
                continue
            try:
                created = br_create_field(br_table_id, payload)
                tstate["fields"][af_id] = {
                    "baserow_field_id": created["id"],
                    "airtable_field_id": af_id,
                    "airtable_field_name": at_f["name"],
                    "airtable_type": orig_type,
                    "baserow_type": payload["type"],
                    "name": payload["name"],
                    "decimals": payload.get("_decimals"),
                }
            except Exception as e:
                note(f"{base_name}/{at_tname}: failed to create field '{at_f['name']}' (type {orig_type}): {e}")
            save_state(state)

        # Pull records and load
        rows_to_insert = []
        airtable_ids_in_order = []
        for rec in at_iter_records(base_id, at_tid):
            row = {}
            airtable_ids_in_order.append(rec["id"])
            # primary
            primary_field = tstate["fields"]["primary"]
            primary_at_name = primary_field["airtable_field_name"]
            v = rec["fields"].get(primary_at_name)
            if v is not None:
                if isinstance(v, list):
                    v = ", ".join(str(x) for x in v)
                row[f"field_{primary_field['baserow_field_id']}"] = str(v)[:65000]
            # rest
            for af_id, fmeta in tstate["fields"].items():
                if af_id == "primary":
                    continue
                if fmeta.get("deferred_link"):
                    continue
                v = rec["fields"].get(fmeta["airtable_field_name"])
                if v is None:
                    continue
                tv = transform_value(None, fmeta["airtable_type"], v)
                if tv is None:
                    continue
                # Defensive: text/long_text need string; coerce lists/dicts
                target = fmeta.get("baserow_type", "text")
                if target in ("text", "long_text") and not isinstance(tv, str):
                    tv = json.dumps(tv, default=str) if isinstance(tv, (list, dict)) else str(tv)
                    if target == "text":
                        tv = tv[:255]
                if target == "number":
                    try:
                        tv = float(tv) if isinstance(tv, str) else tv
                        decimals = fmeta.get("decimals")
                        if decimals is not None and isinstance(tv, (int, float)):
                            tv = round(tv, decimals)
                    except (ValueError, TypeError):
                        continue
                row[f"field_{fmeta['baserow_field_id']}"] = tv
            rows_to_insert.append(row)

        if rows_to_insert:
            print(f"inserting {len(rows_to_insert)} rows... ", end="", flush=True)
            inserted = br_batch_insert(br_table_id, rows_to_insert)
            for at_rid, br_row in zip(airtable_ids_in_order, inserted):
                tstate["rows"][at_rid] = br_row["id"]
        tstate["rows_done"] = True
        save_state(state)
        print(f"done ({len(rows_to_insert)} rows, {len([f for f in tstate['fields'].values() if not f.get('deferred_link')])} fields)")

    # Pass 2 — create link_row fields and backfill
    if base_state.get("links_done"):
        print("  links already done")
    else:
        print("  Pass 2: link fields + backfill")
        for at_tid, tstate in base_state["tables"].items():
            br_table_id = tstate["table_id"]
            for af_id, fmeta in list(tstate["fields"].items()):
                if not fmeta.get("deferred_link"):
                    continue
                if "baserow_field_id" in fmeta:
                    continue
                target_at_table_id = fmeta["linked_table_id"]
                target_tstate = base_state["tables"].get(target_at_table_id)
                if not target_tstate:
                    note(f"{base_name}/{tstate['name']}: link field '{fmeta['airtable_field_name']}' points to unknown table {target_at_table_id}, skipping")
                    continue
                target_br_table_id = target_tstate["table_id"]
                # Detect Baserow's auto-created reverse from a previously-created link
                existing_fields = br_list_fields(br_table_id)
                used_reverse_ids = {f.get("baserow_field_id") for f in tstate["fields"].values() if f.get("baserow_field_id")}
                reverse = next((f for f in existing_fields
                                if f.get("type") == "link_row"
                                and f.get("link_row_table_id") == target_br_table_id
                                and f["id"] not in used_reverse_ids), None)
                if reverse:
                    # Rename to match the Airtable field name so users see the right label
                    try:
                        if reverse.get("name") != fmeta["name"]:
                            br_update_field(reverse["id"], {"name": fmeta["name"]})
                    except Exception as e:
                        note(f"{base_name}/{tstate['name']}: could not rename auto-created reverse for '{fmeta['airtable_field_name']}': {e}")
                    fmeta["baserow_field_id"] = reverse["id"]
                    save_state(state)
                    continue
                try:
                    created = br_create_field(br_table_id, {
                        "name": fmeta["name"],
                        "type": "link_row",
                        "link_row_table_id": target_br_table_id,
                    })
                    fmeta["baserow_field_id"] = created["id"]
                    save_state(state)
                except Exception as e:
                    note(f"{base_name}/{tstate['name']}: failed link field '{fmeta['airtable_field_name']}': {e}")
                    continue

            # Backfill link values
            updates = []
            for at_rid, br_rid in tstate["rows"].items():
                # need a fresh airtable record fetch? No — we have the data still in memory? No, lost. Re-fetch this row.
                pass

        # Re-pull records for tables with deferred links and update
        for at_tid, tstate in base_state["tables"].items():
            link_fields = [f for f in tstate["fields"].values() if f.get("deferred_link") and "baserow_field_id" in f]
            if not link_fields:
                continue
            print(f"    backfill links in {tstate['name']}: {len(link_fields)} link fields")
            updates = []
            for rec in at_iter_records(base_id, at_tid):
                br_rid = tstate["rows"].get(rec["id"])
                if not br_rid:
                    continue
                payload = {"id": br_rid}
                touched = False
                for fmeta in link_fields:
                    val = rec["fields"].get(fmeta["airtable_field_name"])
                    if not val:
                        continue
                    target_at_table_id = fmeta["linked_table_id"]
                    target_tstate = base_state["tables"].get(target_at_table_id)
                    if not target_tstate:
                        continue
                    if isinstance(val, str):
                        val = [val]
                    mapped = [target_tstate["rows"].get(v) for v in val]
                    mapped = [m for m in mapped if m]
                    if mapped:
                        payload[f"field_{fmeta['baserow_field_id']}"] = mapped
                        touched = True
                if touched:
                    updates.append(payload)
            if updates:
                br_batch_update(tstate["table_id"], updates)
                print(f"      updated {len(updates)} rows with link values")
        base_state["links_done"] = True
        save_state(state)

    print(f"  ✓ {base_name} done")

# ----- main -----
def main():
    args = sys.argv[1:]
    if "--list" in args:
        for b in at_list_bases():
            tables = at_get_schema(b["id"])
            print(f"  {b['id']}  {len(tables):3d} tables  {b['name']}")
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
            note(f"FATAL on base {b['name']}: {e}")
            raise
    flush_notes()
    print("\nALL DONE.")

if __name__ == "__main__":
    main()
