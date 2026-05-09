#!/usr/bin/env python3
"""
Re-upload all NocoDB attachments by re-fetching fresh URLs from Airtable.

Background: the migration sent Airtable attachment URLs to NocoDB at upload time, but
those URLs expired (~2hr TTL) before NocoDB fetched the binaries — so we have stale
metadata pointing at 404s. This script:

  1. Iterates each (base, table) with Attachment columns
  2. Pulls all NocoDB rows that have any attachment metadata + their `Record ID`
  3. For each row:
     - HEAD-check its first attachment. If 200 → skip (already working).
     - Else → look up the Airtable record by `Record ID`, get fresh URLs,
       POST /api/v2/storage/upload-by-url for each, PATCH NocoDB with new metadata.

Read-only against Airtable. Writes only to NocoDB.

Resume-safe: a row with at least one working attachment URL is skipped.
"""
import json, sys, time, urllib.parse, requests, os
from pathlib import Path

ATC = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
ATH = {"Authorization": f"Bearer {ATC['AIRTABLE_PAT']}"}
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

# (NocoDB base_id, NocoDB table_id, Airtable base_id, Airtable table name, [attachment column titles])
TARGETS = [
    ("pf7f4hyzjbs2f8h", "mhafrmmiym54dch", "appMtwRRHJN5wUX7q", "Displays",          ["Image"]),
    ("pf7f4hyzjbs2f8h", "mga4koaws5ynfmf", "appMtwRRHJN5wUX7q", "Walkthrough Log",   ["Attachments"]),
    ("pf7f4hyzjbs2f8h", "m9262xc5zga8nys", "appMtwRRHJN5wUX7q", "Issues",            ["Attachments"]),
    ("pf7f4hyzjbs2f8h", "m3kk0zhxfyufb24", "appMtwRRHJN5wUX7q", "Maintenance Events",["Attachments"]),
    ("pf7f4hyzjbs2f8h", "m1dhilldi492r3u", "appMtwRRHJN5wUX7q", "IP Devices",        ["Attachments"]),
    ("pf7f4hyzjbs2f8h", "m3sszpgt3q512li", "appMtwRRHJN5wUX7q", "Display Locations", ["Photo", "Map"]),
    ("pcyjvsvwvhf0tpo", "mh1566n5k578cbf", "appDn6nC8yRvdJHT2", "Displays",          ["Image"]),
    ("pcyjvsvwvhf0tpo", "mk2m95l6g73a35y", "appDn6nC8yRvdJHT2", "Walkthrough Log",   ["Attachments"]),
    ("pcyjvsvwvhf0tpo", "moy7mzg7jism13q", "appDn6nC8yRvdJHT2", "Issues",            ["Attachments"]),
    ("pcyjvsvwvhf0tpo", "mwlja923da70kqv", "appDn6nC8yRvdJHT2", "Maintenance Events",["Attachments"]),
    ("pcyjvsvwvhf0tpo", "mxro9wqicb35ypk", "appDn6nC8yRvdJHT2", "Rack Devices",      ["Attachments"]),
    ("pcyjvsvwvhf0tpo", "mlc6f71gnnrqtyf", "appDn6nC8yRvdJHT2", "Display Locations", ["Photo", "Map"]),
]

def nc(method, path, **kw):
    for attempt in range(4):
        try:
            r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=120, **kw)
            if r.ok: return r.json() if r.text else None
            if r.status_code in (429, 502, 503, 504):
                time.sleep(2 ** attempt); continue
            sys.stderr.write(f"\nNC {method} {path} → {r.status_code}\n{r.text[:300]}\n")
            return None
        except Exception as e:
            sys.stderr.write(f"NC err: {e}\n"); time.sleep(2)
    return None

def at_get_record(base_id, table_name, rec_id):
    enc = urllib.parse.quote(table_name, safe='')
    for attempt in range(3):
        try:
            r = requests.get(f"https://api.airtable.com/v0/{base_id}/{enc}/{rec_id}", headers=ATH, timeout=60)
            if r.ok: return r.json()
            if r.status_code == 429:
                time.sleep(2 ** attempt); continue
            return None
        except Exception:
            time.sleep(2)
    return None

def head_ok(url):
    try:
        r = requests.head(url, timeout=10)
        return r.status_code == 200
    except Exception:
        return False

def list_fields(table_id): return nc("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])
def field_id(fields, name):
    for f in fields:
        if f.get("title") == name: return f["id"]
    return None

def page_records(table_id, fields_csv, batch=1000):
    out, offset = [], 0
    while True:
        d = nc("GET", f"/api/v2/tables/{table_id}/records?fields={urllib.parse.quote(fields_csv)}&limit={batch}&offset={offset}")
        if not d: break
        rows = d.get("list", [])
        out.extend(rows)
        if len(rows) < batch: break
        offset += batch
    return out

# Migration state — maps Airtable rec_id ↔ NocoDB Id, per (base, table)
_STATE = None
def load_migration_state():
    global _STATE
    if _STATE is None:
        _STATE = json.load(open("/root/anc-services/scripts/airtable-to-nocodb/state.json"))
    return _STATE

def build_nc_to_at_map(at_base_id, at_table_name):
    """Returns {nocodb_id: airtable_rec_id} for the given Airtable base/table."""
    s = load_migration_state()
    bases = s.get("bases", {})
    base = bases.get(at_base_id, {})
    for tid, t in base.get("tables", {}).items():
        if t.get("name") == at_table_name:
            return {nc_id: at_id for at_id, nc_id in t.get("rows", {}).items()}
    return {}

def upload_by_url(base_id, table_id, col_id, url, filename, mime):
    path = f"noco/{base_id}/{table_id}/{col_id}"
    body = [{"url": url, "fileName": filename, "mimetype": mime}]
    r = requests.post(f"{NCURL}/api/v2/storage/upload-by-url?path={urllib.parse.quote(path)}",
                      headers=NCH, json=body, timeout=120)
    if r.ok and r.text:
        return r.json()[0]
    sys.stderr.write(f"upload-by-url FAIL: {r.status_code} {r.text[:200]}\n")
    return None

def process_table(nc_base, nc_table, at_base, at_table, att_cols):
    print(f"\n=== {at_table} ({nc_table}) ===")
    fields = list_fields(nc_table)
    col_ids = {c: field_id(fields, c) for c in att_cols}
    nc_to_at = build_nc_to_at_map(at_base, at_table)
    print(f"  loaded migration map: {len(nc_to_at)} NC→AT IDs")
    fields_csv = "Id," + ",".join(att_cols)
    rows = page_records(nc_table, fields_csv)
    rows_with_att = [r for r in rows if any(isinstance(r.get(c), list) and r.get(c) for c in att_cols)]
    print(f"  rows total={len(rows)}, with attachments={len(rows_with_att)}")

    n_skip = n_done = n_fail = 0
    for i, r in enumerate(rows_with_att):
        # Skip if first attachment of first non-empty col is reachable
        first_url = None
        for c in att_cols:
            v = r.get(c)
            if isinstance(v, list) and v:
                p = v[0].get("signedPath") or v[0].get("path")
                if p: first_url = f"{NCURL}/{p}" if not p.startswith("http") else p
                break
        if first_url and head_ok(first_url):
            n_skip += 1
            if n_skip % 100 == 0: print(f"   …{i+1}/{len(rows_with_att)} (skipped {n_skip}, done {n_done}, fail {n_fail})")
            continue

        rec_id = nc_to_at.get(r["Id"])
        if not rec_id:
            n_fail += 1; continue
        at_rec = at_get_record(at_base, at_table, rec_id)
        if not at_rec:
            n_fail += 1; continue

        update = {"Id": r["Id"]}
        any_uploaded = False
        for c in att_cols:
            at_atts = at_rec.get("fields", {}).get(c, [])
            if not isinstance(at_atts, list) or not at_atts: continue
            new_atts = []
            for at in at_atts:
                url = at.get("url"); fname = at.get("filename") or "file"; mime = at.get("type") or "application/octet-stream"
                if not url: continue
                up = upload_by_url(nc_base, nc_table, col_ids[c], url, fname, mime)
                if up: new_atts.append(up); any_uploaded = True
            if new_atts: update[c] = new_atts

        if any_uploaded:
            res = nc("PATCH", f"/api/v2/tables/{nc_table}/records", json=[update])
            if res is None: n_fail += 1
            else: n_done += 1
        else:
            n_fail += 1

        if (i+1) % 25 == 0:
            print(f"   …{i+1}/{len(rows_with_att)} (skipped {n_skip}, done {n_done}, fail {n_fail})")
        time.sleep(0.2)  # gentle on Airtable rate limits (5/sec/base)

    print(f"  ✓ {at_table}: done={n_done}, skipped={n_skip}, failed={n_fail}")

def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    for spec in TARGETS:
        nc_base, nc_table, at_base, at_table, att_cols = spec
        if only and at_table not in only and nc_table not in only:
            continue
        try:
            process_table(nc_base, nc_table, at_base, at_table, att_cols)
        except Exception as e:
            print(f"  !! ERR {at_table}: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
