#!/usr/bin/env python3
"""
Phase 2: Per-venue and per-station views.

Strategy: for each Airtable view that filters by linked record (Venue, Display Location,
Station, etc.), sample its Airtable records to extract the linked rec_id values, then
create a NocoDB view with the matching filter. NocoDB stores those linked rec_ids as
LongText (migration kept the original Airtable rec ID strings).
"""
import json, sys, requests, urllib.parse
from collections import Counter
from pathlib import Path

ATC = dict(l.strip().split("=", 1) for l in open("/root/.airtable-creds") if "=" in l and not l.strip().startswith("#"))
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
ATH = {"Authorization": f"Bearer {ATC['AIRTABLE_PAT']}"}
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

def at(path):
    r = requests.get(f"https://api.airtable.com/v0{path}", headers=ATH, timeout=60)
    r.raise_for_status()
    return r.json()

def at_view(base_id, table_name, view_id, max_pages=2):
    """Pull up to ~200 records from an Airtable view."""
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

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_views(table_id): return nc("GET", f"/api/v2/meta/tables/{table_id}/views").get("list", [])
def list_fields(table_id): return nc("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])
def field_id(fields, name):
    for f in fields:
        if f.get("title") == name: return f["id"]
    return None

def create_grid(t, title): return nc("POST", f"/api/v2/meta/tables/{t}/grids", json={"title": title})

def add_filter(view_id, col_id, op, value=None):
    body = {"fk_column_id": col_id, "comparison_op": op, "logical_op": "and"}
    if value is not None: body["value"] = value
    return nc("POST", f"/api/v2/meta/views/{view_id}/filters", json=body)

def derive_link_value(records, field_name):
    """Find the most-common value of `field_name` (LongText storing rec ID) in a sample of records.
    Returns (value, frequency, total) or (None, 0, 0) if no homogeneous link."""
    if not records: return None, 0, 0
    vals = []
    for r in records:
        v = r.get("fields", {}).get(field_name)
        if not v: continue
        if isinstance(v, list):
            vals.extend(v)
        else:
            vals.append(v)
    if not vals: return None, 0, 0
    c = Counter(vals)
    val, freq = c.most_common(1)[0]
    return val, freq, len(records)

def ensure_view(label, table_id, title, filter_spec):
    """filter_spec: list of (field_name, op, value)."""
    existing = {v["title"]: v["id"] for v in list_views(table_id)}
    if title in existing:
        print(f"  [skip] {label} / {title}")
        return existing[title]
    fields = list_fields(table_id)
    v = create_grid(table_id, title)
    vid = v["id"]
    print(f"  [new ] {label} / {title} → {vid}")
    for fname, op, val in filter_spec:
        fid = field_id(fields, fname)
        if not fid:
            print(f"        ! field '{fname}' not found"); continue
        add_filter(vid, fid, op, val)
    fs = ", ".join(f"{f}{op}{v!r}" for f,op,v in filter_spec)
    print(f"        {fs}")
    return vid

# ---- Specs: (NocoDB label, Airtable base_id, AT table name, AT view id, NocoDB table id,
#               link_field_name, NocoDB view title) ----
PER_VENUE_SPECS = [
    # NY Displays — per venue
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwIrWeo48Ehm00pJ", "mh1566n5k578cbf", "Venue", "Moynihan Train Hall — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwKFcIZk2MBfCIRF", "mh1566n5k578cbf", "Venue", "World Trade Center — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwqFAgLSkpmofWwk", "mh1566n5k578cbf", "Venue", "South Street — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viw6Tau0THOo1rRLf", "mh1566n5k578cbf", "Venue", "Fulton Center — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwMHpNPntdcyQU3a", "mh1566n5k578cbf", "Venue", "JP Morgan — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwJHZ0tO01h4HLna", "mh1566n5k578cbf", "Venue", "277 Park — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwfKWPxDDHWq15ss", "mh1566n5k578cbf", "Venue", "NBC 30 Rock — Displays"),
    ("NY", "appDn6nC8yRvdJHT2", "Displays", "viwq8Gby8aImUvUTM", "mh1566n5k578cbf", "Venue", "AT&T 3 Times Square — Displays"),
    # NY Rack Devices — per venue
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwjVTdUz3bkV8Rqy", "mxro9wqicb35ypk", "Venue", "Moynihan Train Hall — Rack Devices"),
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwWRE9ce404Ovmpr", "mxro9wqicb35ypk", "Venue", "World Trade Center — Rack Devices"),
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwgnS82mfVixhv3X", "mxro9wqicb35ypk", "Venue", "South Street — Rack Devices"),
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwzXstO1jSZcmOjs", "mxro9wqicb35ypk", "Venue", "Fulton Center — Rack Devices"),
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwUswSDwNhDT84dD", "mxro9wqicb35ypk", "Venue", "JP Morgan — Rack Devices"),
    ("NY", "appDn6nC8yRvdJHT2", "Rack Devices", "viwMjj0nsU27Oko5I", "mxro9wqicb35ypk", "Venue", "277 Park — Rack Devices"),
]

# Per-venue NY Issues from Airtable (Fulton Center Issues, South Street Issues, etc.)
PER_VENUE_ISSUES = [
    ("NY", "appDn6nC8yRvdJHT2", "Issues", "viwLxdfc6QU2x7477", "moy7mzg7jism13q", "Observed on", "Fulton Center — Issues"),
    ("NY", "appDn6nC8yRvdJHT2", "Issues", "viwtJlTGxoXnFNftW", "moy7mzg7jism13q", "Observed on", "South Street — Issues"),
    ("NY", "appDn6nC8yRvdJHT2", "Issues", "viwj58qDTXOFpzHOK", "moy7mzg7jism13q", "Observed on", "Moynihan — Issues (Past Week)"),
    ("NY", "appDn6nC8yRvdJHT2", "Issues", "viwplqmezg9cbp4ay", "moy7mzg7jism13q", "Observed on", "Moynihan — Issues Report"),
]

def main():
    n_new = n_skip = n_err = 0
    for spec in PER_VENUE_SPECS + PER_VENUE_ISSUES:
        label, at_base, at_table, at_view_id, nc_table, link_field, title = spec
        try:
            recs = at_view(at_base, at_table, at_view_id, max_pages=2)
            link_val, freq, total = derive_link_value(recs, link_field)
            if not link_val:
                print(f"  ! {label} / {title}: no link value derivable from {len(recs)} records ({link_field})")
                n_err += 1; continue
            if freq / max(total, 1) < 0.6:
                print(f"  ! {label} / {title}: weak signal ({freq}/{total} = {link_field}={link_val!r}) — skipping")
                n_err += 1; continue
            existing = {v["title"]: v["id"] for v in list_views(nc_table)}
            if title in existing:
                print(f"  [skip] {label} / {title}"); n_skip += 1; continue
            ensure_view(label, nc_table, title, [(link_field, "like", f"%{link_val}%")])
            n_new += 1
        except Exception as e:
            print(f"  ! ERR {label} / {title}: {e}"); n_err += 1
    print(f"\nDone — created {n_new}, skipped {n_skip}, errors/no-signal {n_err}")

if __name__ == "__main__":
    main()
