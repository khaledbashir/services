#!/usr/bin/env python3
"""
Backfill link relationships from Airtable to NocoDB.

The original migration created link FIELDS but failed to populate the link DATA — every
Display has 0 connected devices, every Issue has 0 affected displays, etc. (See
MIGRATION_NOTES.md "link create failed" / "backfill failed" entries.)

For each Airtable base/table:
  1. Pull all AT records with their linked-record fields
  2. For each record, for each link field:
       - Convert AT linked-rec-IDs → NC IDs via state.json mapping
       - POST /api/v2/tables/{nc_table}/links/{field_id}/records/{nc_record_id}
         with [{"Id": linked_nc_id}, ...]
  3. Skip if NC link is already populated

Read-only against Airtable. Writes only to NocoDB.
"""
import json, sys, time, urllib.parse, requests
from pathlib import Path

ATC = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
ATH = {"Authorization": f"Bearer {ATC['AIRTABLE_PAT']}"}
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

# Migration state — maps Airtable rec_id → NocoDB Id for every (AT base, AT table)
STATE = json.load(open("/root/anc-services/scripts/airtable-to-nocodb/state.json"))

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
    for attempt in range(4):
        r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
        if r.ok: return r.json() if r.text else None
        if r.status_code in (429, 502, 503, 504):
            time.sleep(2 ** attempt); continue
        sys.stderr.write(f"\nNC {method} {path} → {r.status_code}\n{r.text[:300]}\n")
        return None
    return None

def list_fields(table_id): return nc("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])

def get_at_to_nc_map(at_base, at_table_name):
    """Returns {airtable_rec_id: nocodb_id} for given AT base/table."""
    base = STATE.get("bases", {}).get(at_base, {})
    for tid, t in base.get("tables", {}).items():
        if t.get("name") == at_table_name:
            return t.get("rows", {})
    return {}

def add_links(table_id, field_id, nc_record_id, linked_nc_ids):
    """POST link record(s)."""
    body = [{"Id": i} for i in linked_nc_ids]
    return nc("POST", f"/api/v2/tables/{table_id}/links/{field_id}/records/{nc_record_id}",
              json=body)

def has_existing_links(table_id, field_id, nc_record_id):
    """Return existing linked Id set."""
    d = nc("GET", f"/api/v2/tables/{table_id}/links/{field_id}/records/{nc_record_id}?limit=1000")
    if not d: return set()
    return {r["Id"] for r in d.get("list", [])}

# ----- mapping spec -----
# (NC base_id, NC table_id, AT base_id, AT table name, [(AT field name, NC field id, AT linked-table name)])
SPECS = [
    # ============ WMATA ============
    ("pf7f4hyzjbs2f8h", "m9262xc5zga8nys", "appMtwRRHJN5wUX7q", "Issues", [
        ("Affected Displays",  "cecjb558ueebwy8", "Displays"),
        ("Observed on",        "ceoapehxu1z8kgr", "Walkthrough Log"),
        ("Maintenance Events", "cu1l9eb8uyvh0ly", "Maintenance Events"),
    ]),
    ("pf7f4hyzjbs2f8h", "mhafrmmiym54dch", "appMtwRRHJN5wUX7q", "Displays", [
        ("Connected Devices",  "cbvphzydihdv5la", "IP Devices"),
        ("Issue Archive",      "clh8fhdjv118s7k", "Issues"),
        ("Display Location",   "cyqttxpa249wyuv", "Display Locations"),
        ("Maintenance Events", "cvxrzxe3x4nu7qc", "Maintenance Events"),
        ("Station",            "co13krtcjmpyg3h", "Stations"),
    ]),
    ("pf7f4hyzjbs2f8h", "mga4koaws5ynfmf", "appMtwRRHJN5wUX7q", "Walkthrough Log", [
        ("Locations Visited",       "ce3lnkfxi3truen", "Display Locations"),
        ("Problem Detected",        "cgzl2btmiwxmqv5", "Issues"),
        ("Auto Fill from Stations", "c0wjaglsi1517qt", "Stations"),
    ]),
    ("pf7f4hyzjbs2f8h", "m3kk0zhxfyufb24", "appMtwRRHJN5wUX7q", "Maintenance Events", [
        ("Displays",       "cg0we1ve4d0w44c", "Displays"),
        ("Related Issue",  "cu2u8mvtvoqbbkl", "Issues"),
        ("Stations",       "cd0x6lulvsjloxw", "Stations"),
    ]),
    ("pf7f4hyzjbs2f8h", "m1dhilldi492r3u", "appMtwRRHJN5wUX7q", "IP Devices", [
        ("Connected Displays",   "c440m9b5pi1hmg6", "Displays"),
        ("Locations",            "co0os7em25h6yug", "Display Locations"),
        ("Security Scan Issues", "ct4a9qz81s5pp6d", "Security Scan Results"),
    ]),
    ("pf7f4hyzjbs2f8h", "m3sszpgt3q512li", "appMtwRRHJN5wUX7q", "Display Locations", [
        ("Displays",     "cbc01u2lzola1cj", "Displays"),
        ("Rack Devices", "cuxafs4be9nnm02", "IP Devices"),
        ("Station",      "cc8kn3pyz9zx5v4", "Stations"),
    ]),
    # ============ South ============
    ("pq021z1pvqv2o98", "mf8m21ecc24v91a", "appB4LCFLFVH8Gk4f", "Issues", [
        ("Affected Displays",  "c85e5w3jy0gb3g1", "Displays"),
        ("Observed on",        "cfcvhp4h9yukbna", "Walkthrough Log"),
        ("Maintenance Events", "ckv4lc1tlvuf3kt", "Maintenance Events"),
    ]),
    ("pq021z1pvqv2o98", "m46k77h4xhgc0wz", "appB4LCFLFVH8Gk4f", "Walkthrough Log", [
        ("Locations Visited", "czo32a8xvwgqu3m", "Display Locations"),
        ("Issue Records",     "cqnctm5f4dffo93", "Issues"),
    ]),
    # ============ NY ============
    ("pcyjvsvwvhf0tpo", "moy7mzg7jism13q", "appDn6nC8yRvdJHT2", "Issues", [
        ("Affected Displays", "cvpf1614qm5hv11", "Displays"),
        ("Observed on",       "c46h2q629pkxa57", "Walkthrough Log"),
        ("Parts Lookup",      "c8n1dkyxnnsudn9", "Parts Lookup"),
    ]),
    ("pcyjvsvwvhf0tpo", "mh1566n5k578cbf", "appDn6nC8yRvdJHT2", "Displays", [
        ("Connected Devices", "cuzcawuz0ch1oq3", "Rack Devices"),
        ("Issues",            "cw9ydehgkj6u5fs", "Issues"),
        ("Display Location",  "c0o1xxq0wpsf6l2", "Display Locations"),
        ("Maintenance Events","cawkzk405cvb7u0", "Maintenance Events"),
    ]),
    ("pcyjvsvwvhf0tpo", "mk2m95l6g73a35y", "appDn6nC8yRvdJHT2", "Walkthrough Log", [
        ("Venue",            "c6ro61sdnhxirgv", "Venues"),
        ("Locations Visited","c345a0hqw1shjae", "Display Locations"),
        ("Problem Detected", "cu9el90bdvci9xj", "Issues"),
    ]),
]

def process(nc_base, nc_table, at_base, at_table, link_specs):
    print(f"\n=== {at_table} ({nc_table}) ===")
    # AT rec_id → NC id for current table
    self_map = get_at_to_nc_map(at_base, at_table)
    print(f"  self map: {len(self_map)} AT→NC IDs")
    # cache linked-table maps
    target_maps = {}
    for at_field, nc_field_id, at_target in link_specs:
        if at_target not in target_maps:
            target_maps[at_target] = get_at_to_nc_map(at_base, at_target)
            print(f"  target '{at_target}' map: {len(target_maps[at_target])} AT→NC IDs")

    # pull AT records — only the link fields we care about
    at_field_names = [s[0] for s in link_specs]
    print(f"  pulling AT records ({at_field_names})...")
    recs = at_pages(at_base, at_table, fields=at_field_names)
    print(f"  pulled {len(recs)} AT records")

    n_total = n_done = n_skip = n_fail = 0
    for r in recs:
        at_rec_id = r["id"]
        nc_rec_id = self_map.get(at_rec_id)
        if not nc_rec_id:
            continue
        for at_field, nc_field_id, at_target in link_specs:
            v = r["fields"].get(at_field)
            if not isinstance(v, list) or not v: continue
            target_map = target_maps[at_target]
            linked_ncs = [target_map[at_id] for at_id in v if at_id in target_map]
            if not linked_ncs: continue
            n_total += 1
            # check existing
            existing = has_existing_links(nc_table, nc_field_id, nc_rec_id)
            new_ids = [i for i in linked_ncs if i not in existing]
            if not new_ids:
                n_skip += 1; continue
            res = add_links(nc_table, nc_field_id, nc_rec_id, new_ids)
            if res is None:
                n_fail += 1
            else:
                n_done += 1
        if (n_done + n_skip + n_fail) % 100 == 0 and (n_done + n_skip + n_fail) > 0:
            print(f"   ... done={n_done}, skip={n_skip}, fail={n_fail}")
    print(f"  ✓ {at_table}: linked={n_done}, skipped={n_skip}, failed={n_fail}")

def main():
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    for spec in SPECS:
        nc_base, nc_table, at_base, at_table, links = spec
        if only and at_table not in only and nc_table not in only:
            continue
        try:
            process(nc_base, nc_table, at_base, at_table, links)
        except Exception as e:
            print(f"  !! ERR {at_table}: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
