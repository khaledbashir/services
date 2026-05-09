#!/usr/bin/env python3
"""
Phase 3a: Restore WMATA Issues 'Created' that the bad type-change wiped, and
Phase 3b: Add a new DateTime column 'Created Date' (or equivalent) to each table that
needs date filtering, backfilled from the existing LongText. Original LongText is left
intact — no destructive changes after the WMATA Issues incident.

After this runs we can build 'Today's Issues' / 'Today's Walkthroughs' views against the
new DateTime columns.
"""
import json, sys, time, urllib.parse, requests
from collections import defaultdict
from pathlib import Path

ATC = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
ATH = {"Authorization": f"Bearer {ATC['AIRTABLE_PAT']}"}
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

def at_pages(base_id, table_name, fields=None):
    out, offset = [], None
    enc = urllib.parse.quote(table_name, safe='')
    while True:
        url = f"https://api.airtable.com/v0/{base_id}/{enc}?pageSize=100"
        if fields:
            for f in fields:
                url += f"&fields[]={urllib.parse.quote(f)}"
        if offset: url += f"&offset={offset}"
        r = requests.get(url, headers=ATH, timeout=60); r.raise_for_status()
        d = r.json()
        out.extend(d.get("records", []))
        offset = d.get("offset")
        if not offset: break
    return out

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def nc_pages(table_id, fields):
    out, offset = [], 0
    while True:
        d = nc("GET", f"/api/v2/tables/{table_id}/records?fields={urllib.parse.quote(fields)}&limit=1000&offset={offset}")
        rows = d.get("list", [])
        out.extend(rows)
        if len(rows) < 1000: break
        offset += 1000
    return out

def list_fields(table_id): return nc("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])
def field_id(fields, name):
    for f in fields:
        if f.get("title") == name: return f["id"]
    return None

def bulk_patch(table_id, updates, batch=10):
    """updates: list of {"Id": int, "<field>": value}. NocoDB v2 takes <=10/req."""
    n = 0
    for i in range(0, len(updates), batch):
        chunk = updates[i:i+batch]
        nc("PATCH", f"/api/v2/tables/{table_id}/records", json=chunk)
        n += len(chunk)
        if i % 100 == 0: print(f"    {n}/{len(updates)}")
    return n

# ============================================================
# Phase 3a: restore WMATA Issues Created
# ============================================================
def restore_wmata_issues_created():
    print("\n=== Phase 3a: restore WMATA Issues 'Created' (was wiped by type-change) ===")
    print("Pulling all Airtable Issues...")
    at_recs = at_pages("appMtwRRHJN5wUX7q", "Issues", fields=["Created"])
    at_map = {r["id"]: r["fields"].get("Created") or r.get("createdTime") for r in at_recs}
    print(f"  Airtable: {len(at_map)} records")

    print("Pulling all NocoDB Issues...")
    nc_recs = nc_pages("m9262xc5zga8nys", "Id,Record ID,Created")
    print(f"  NocoDB:   {len(nc_recs)} records")

    updates = []
    no_match = 0
    already_set = 0
    for r in nc_recs:
        rid = r.get("Record ID")
        if not rid: no_match += 1; continue
        if r.get("Created"): already_set += 1; continue
        v = at_map.get(rid)
        if not v: no_match += 1; continue
        updates.append({"Id": r["Id"], "Created": v})

    print(f"  to patch: {len(updates)}, already_set: {already_set}, unmatched: {no_match}")
    if updates:
        bulk_patch("m9262xc5zga8nys", updates)
    print("  ✓ restore complete")

# ============================================================
# Phase 3b: add DateTime mirror columns
# ============================================================
TARGETS = [
    # (label, base_id, AT base, AT table name, NC table id, source LongText field, new DateTime field)
    ("WMATA / Issues",        "pf7f4hyzjbs2f8h", "appMtwRRHJN5wUX7q", "Issues",          "m9262xc5zga8nys", "Created",         "Created Date"),
    ("WMATA / Walkthrough",   "pf7f4hyzjbs2f8h", "appMtwRRHJN5wUX7q", "Walkthrough Log", "mga4koaws5ynfmf", "Created Time",    "Created At"),
    ("South / Issues",        "pq021z1pvqv2o98", "appB4LCFLFVH8Gk4f", "Issues",          "mf8m21ecc24v91a", "Created",         "Created Date"),
    ("NY / Issues",           "pcyjvsvwvhf0tpo", "appDn6nC8yRvdJHT2", "Issues",          "moy7mzg7jism13q", "Date Reported",   "Date Reported Dt"),
    ("NY / Walkthrough",      "pcyjvsvwvhf0tpo", "appDn6nC8yRvdJHT2", "Walkthrough Log", "mk2m95l6g73a35y", "Log Date",        "Log Date Dt"),
]

def ensure_datetime_field(base_id, table_id, field_name):
    fields = list_fields(table_id)
    fid = field_id(fields, field_name)
    if fid:
        # check uidt
        f = nc("GET", f"/api/v2/meta/columns/{fid}")
        if f.get("uidt") == "DateTime":
            return fid, False
        # exists but wrong type — bail rather than risk another wipe
        raise RuntimeError(f"field {field_name!r} exists with uidt={f.get('uidt')} not DateTime — manual review needed")
    print(f"    + creating DateTime field {field_name!r}")
    r = nc("POST", f"/api/v2/meta/tables/{table_id}/columns",
           json={"title": field_name, "uidt": "DateTime", "column_name": field_name})
    return r["id"], True

def backfill(table_id, src_field, dst_field):
    rows = nc_pages(table_id, f"Id,{src_field},{dst_field}")
    updates = []
    for r in rows:
        src = r.get(src_field); dst = r.get(dst_field)
        if dst: continue   # already populated
        if not src: continue
        # NocoDB DateTime accepts ISO 8601; pass through
        updates.append({"Id": r["Id"], dst_field: src})
    print(f"    backfilling {len(updates)} of {len(rows)} rows ({src_field} → {dst_field})")
    if updates:
        bulk_patch(table_id, updates)

def phase_3b():
    print("\n=== Phase 3b: add DateTime mirror columns + backfill from LongText ===")
    for label, base_id, _at_base, _at_table, nc_table, src_field, new_field in TARGETS:
        print(f"\n  {label}")
        try:
            ensure_datetime_field(base_id, nc_table, new_field)
            backfill(nc_table, src_field, new_field)
        except Exception as e:
            print(f"  ! ERR {label}: {e}")

if __name__ == "__main__":
    restore_wmata_issues_created()
    phase_3b()
