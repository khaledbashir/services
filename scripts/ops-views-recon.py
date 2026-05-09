#!/usr/bin/env python3
"""Recon: pull Airtable view metadata + sample records to derive filters for NocoDB."""
import json, sys, requests, urllib.parse
from collections import Counter
from pathlib import Path

CREDS = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
PAT = CREDS["AIRTABLE_PAT"]
H = {"Authorization": f"Bearer {PAT}"}

NCREDS = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCREDS["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCREDS["NOCODB_PAT"], "Content-Type": "application/json"}

BASES = [
    ("WMATA", "appMtwRRHJN5wUX7q"),
    ("South", "appB4LCFLFVH8Gk4f"),
    ("NewYork", "appDn6nC8yRvdJHT2"),
]

def at(path):
    r = requests.get(f"https://api.airtable.com/v0{path}", headers=H, timeout=60)
    r.raise_for_status()
    return r.json()

def view_records(base_id, table_name, view_id, max_pages=2):
    """Pull up to 200 records from a specific Airtable view."""
    out, offset = [], None
    encoded = urllib.parse.quote(table_name, safe='')
    for _ in range(max_pages):
        url = f"/{base_id}/{encoded}?view={view_id}&pageSize=100"
        if offset:
            url += f"&offset={offset}"
        d = at(url)
        out.extend(d.get("records", []))
        offset = d.get("offset")
        if not offset: break
    return out

def derive_filter_signature(records, schema_fields, view_name):
    """For each field, count value frequencies across the view's records.
    A field whose values are highly homogeneous in the view subset is likely a filter field."""
    if not records: return {}
    field_types = {f["name"]: f["type"] for f in schema_fields}
    sig = {}
    fcount = len(records)
    for f in schema_fields:
        fname = f["name"]
        ftype = f["type"]
        if ftype not in ("singleSelect", "multipleSelects", "checkbox", "multipleRecordLinks"):
            continue
        vals = []
        for r in records:
            v = r.get("fields", {}).get(fname)
            if v is None: continue
            if isinstance(v, list):
                vals.extend(v)
            else:
                vals.append(v)
        if not vals: continue
        c = Counter(vals)
        top, n = c.most_common(1)[0]
        homogeneity = n / fcount
        if homogeneity >= 0.95:
            sig[fname] = {"type": ftype, "value": top, "homogeneity": round(homogeneity, 2)}
    return sig

def main():
    summary = {}
    for label, base_id in BASES:
        print(f"\n========= {label} ({base_id}) =========")
        meta = at(f"/meta/bases/{base_id}/tables")
        summary[label] = {"base_id": base_id, "tables": {}}
        for t in meta["tables"]:
            tname = t["name"]
            if tname not in ("Issues", "Walkthrough Log", "Maintenance Events", "Displays", "Rack Devices", "Venues", "IP Devices", "Stations", "Display Locations", "To Do"):
                continue
            print(f"\n--- {tname} ---")
            summary[label]["tables"][tname] = {"airtable_table_id": t["id"], "fields": [{"name": f["name"], "type": f["type"]} for f in t["fields"]], "views": []}
            for v in t.get("views", []):
                if v["type"] not in ("grid",):
                    continue
                vname = v["name"]
                if vname.lower() in ("working", "working view", "tyler working", "name change view", "grid view"):
                    print(f"  [skip-personal] {vname}")
                    continue
                try:
                    recs = view_records(base_id, tname, v["id"], max_pages=1)
                except Exception as e:
                    print(f"  ! err reading view {vname}: {e}")
                    continue
                sig = derive_filter_signature(recs, t["fields"], vname)
                rec = {"name": vname, "view_id": v["id"], "type": v["type"], "n_records": len(recs), "signature": sig}
                summary[label]["tables"][tname]["views"].append(rec)
                sig_str = ", ".join(f"{k}={v['value']!r}({v['homogeneity']})" for k,v in sig.items())
                print(f"  {vname:40s}  n={len(recs):3d}  → {sig_str or '(no homogeneous filter)'}")

    Path("/root/anc-services/scripts/ops-views-recon.json").write_text(json.dumps(summary, indent=2, default=str))
    print("\nWrote /root/anc-services/scripts/ops-views-recon.json")

if __name__ == "__main__":
    main()
