#!/usr/bin/env python3
"""
Deeper recon: for every Airtable grid view that wasn't auto-derivable in earlier
recon (incl. tables that were entirely skipped — IP Devices, Stations, Display
Locations), pull the view records and infer:

  - Homogeneous select filter (same as before)
  - Homogeneous blank-field filter (every record in view has X = blank)
  - Homogeneous notblank-field filter (every record in view has X populated)

Outputs JSON to /root/anc-services/scripts/ops-views-deep.json so we can hand-pick
which to provision.
"""
import json, sys, requests, urllib.parse
from collections import Counter
from pathlib import Path

ATC = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
ATH = {"Authorization": f"Bearer {ATC['AIRTABLE_PAT']}"}

BASES = [
    ("WMATA",  "appMtwRRHJN5wUX7q"),
    ("South",  "appB4LCFLFVH8Gk4f"),
    ("NewYork","appDn6nC8yRvdJHT2"),
]

# tables to deep-recon (not yet provisioned in earlier phases)
TARGET_TABLES = {
    "IP Devices", "Stations", "Display Locations",
    "Issues", "Walkthrough Log", "Maintenance Events", "Displays", "Rack Devices", "Venues",
    "WMATA Switches", "Security Scan Results", "Tasks",
    "To Do", "Client Interface Preferences", "Parts Lookup", "Technicians",
}

def at(path):
    r = requests.get(f"https://api.airtable.com/v0{path}", headers=ATH, timeout=60)
    r.raise_for_status()
    return r.json()

def view_records(base_id, table_name, view_id, max_pages=2):
    out, offset = [], None
    enc = urllib.parse.quote(table_name, safe='')
    for _ in range(max_pages):
        url = f"/{base_id}/{enc}?view={view_id}&pageSize=100"
        if offset: url += f"&offset={offset}"
        d = at(url)
        out.extend(d.get("records", []))
        offset = d.get("offset")
        if not offset: break
    return out

def all_records(base_id, table_name):
    out, offset = [], None
    enc = urllib.parse.quote(table_name, safe='')
    while True:
        url = f"/{base_id}/{enc}?pageSize=100"
        if offset: url += f"&offset={offset}"
        d = at(url)
        out.extend(d.get("records", []))
        offset = d.get("offset")
        if not offset: break
        if len(out) > 1000: break  # cap for recon
    return out

def derive_signature(view_recs, table_recs, schema_fields):
    """Compare view subset to full table to derive homogeneous select / blank-field filters."""
    if not view_recs:
        return {"empty_view": True}
    fcount = len(view_recs)
    sig = {"select": {}, "blank": [], "notblank": []}

    for f in schema_fields:
        fname = f["name"]
        ftype = f["type"]

        # 1) select-style homogeneity
        if ftype in ("singleSelect", "multipleSelects", "checkbox"):
            vals = []
            for r in view_recs:
                v = r.get("fields", {}).get(fname)
                if v is None: continue
                vals.extend(v) if isinstance(v, list) else vals.append(v)
            if vals:
                top, n = Counter(vals).most_common(1)[0]
                if n / fcount >= 0.95:
                    sig["select"][fname] = {"value": top, "homogeneity": round(n/fcount, 2)}

        # 2) blank-field homogeneity (every view record has this field as blank)
        n_blank = sum(1 for r in view_recs if not r.get("fields", {}).get(fname))
        n_blank_full = sum(1 for r in table_recs if not r.get("fields", {}).get(fname)) if table_recs else 0
        # only flag if the view's blank rate is significantly higher than full table's
        if n_blank == fcount and table_recs and (n_blank_full / max(len(table_recs),1)) < 0.5:
            sig["blank"].append({"field": fname, "type": ftype, "table_blank_rate": round(n_blank_full/max(len(table_recs),1), 2)})

        # 3) notblank-field homogeneity
        n_filled = sum(1 for r in view_recs if r.get("fields", {}).get(fname))
        if n_filled == fcount and table_recs and (n_filled / max(len(table_recs),1) < 1.0):
            # likely a "where X is filled" filter, only useful if not all records have it
            n_filled_full = sum(1 for r in table_recs if r.get("fields", {}).get(fname))
            if n_filled_full < len(table_recs) * 0.95:
                sig["notblank"].append({"field": fname, "type": ftype, "table_filled_rate": round(n_filled_full/max(len(table_recs),1), 2)})

    return sig

def main():
    out = {}
    for label, base_id in BASES:
        print(f"\n========== {label} ==========")
        meta = at(f"/meta/bases/{base_id}/tables")
        out[label] = {"base_id": base_id, "tables": {}}
        for t in meta["tables"]:
            tname = t["name"]
            if tname not in TARGET_TABLES: continue
            views = [v for v in t.get("views", []) if v["type"] in ("grid", "form")]
            if not views: continue
            print(f"\n--- {tname} ---")
            # pull all records once
            try:
                table_all = all_records(base_id, tname)
            except Exception as e:
                print(f"  ! all_records err: {e}"); continue
            print(f"  total records (sampled): {len(table_all)}")
            out[label]["tables"][tname] = {"total_records_sampled": len(table_all), "views": []}
            for v in views:
                vname = v["name"]
                if vname.lower() in ("working", "working view", "tyler working", "name change view", "grid view"):
                    continue
                try:
                    recs = view_records(base_id, tname, v["id"], max_pages=2)
                except Exception as e:
                    print(f"  ! view {vname} err: {e}"); continue
                sig = derive_signature(recs, table_all, t["fields"])
                rec = {"name": vname, "view_id": v["id"], "type": v["type"], "n_records": len(recs), "signature": sig}
                out[label]["tables"][tname]["views"].append(rec)
                summary = []
                for fname, info in sig.get("select", {}).items():
                    summary.append(f"{fname}={info['value']!r}({info['homogeneity']})")
                for b in sig.get("blank", []):
                    summary.append(f"BLANK:{b['field']}({b['table_blank_rate']})")
                for n in sig.get("notblank", []):
                    summary.append(f"NOTBLANK:{n['field']}({n['table_filled_rate']})")
                marker = "[empty]" if sig.get("empty_view") else ""
                print(f"  [{v['type']}] {vname:42s} n={len(recs):3d}  → {', '.join(summary) or marker or '(no signature)'}")

    Path("/root/anc-services/scripts/ops-views-deep.json").write_text(json.dumps(out, indent=2))
    print("\nWrote /root/anc-services/scripts/ops-views-deep.json")

if __name__ == "__main__":
    main()
