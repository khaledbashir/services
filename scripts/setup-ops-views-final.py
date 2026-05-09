#!/usr/bin/env python3
"""
Final batch — closes the remaining gaps from deep recon:
  - Form views (NYC Operations Reporting on South Issues)
  - Blank-field filtered grids (Orphaned Issues, IP Devices Not Connected, Rack Devices Unassigned)
  - All-records grids on missing tables (IP Devices All, Stations All, Display Locations All, Security Scan All)
  - Date-range scan-from grids on Security Scan Results (skipped — needs date col, deferred)
  - NY Venues Active Venues (NOTBLANK:Display Locations)
  - South Display Locations All (Install Type=LED Wall)
"""
import sys, requests
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:300]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_views(t): return nc("GET", f"/api/v2/meta/tables/{t}/views").get("list", [])
def list_fields(t): return nc("GET", f"/api/v2/meta/tables/{t}").get("columns", [])
def fid(fs, name):
    for f in fs:
        if f.get("title") == name: return f["id"]
    return None
def has_view(t, title): return title in {v["title"] for v in list_views(t)}

def create_grid(t, title): return nc("POST", f"/api/v2/meta/tables/{t}/grids", json={"title": title})
def create_form(t, title): return nc("POST", f"/api/v2/meta/tables/{t}/forms", json={"title": title})

def add_filter(view_id, col_id, op, value=None):
    body = {"fk_column_id": col_id, "comparison_op": op, "logical_op": "and"}
    if value is not None: body["value"] = value
    return nc("POST", f"/api/v2/meta/views/{view_id}/filters", json=body)

def make_grid(label, table_id, title, filter_spec=()):
    if has_view(table_id, title): print(f"  [skip] {label} / {title}"); return
    fields = list_fields(table_id)
    v = create_grid(table_id, title); vid = v["id"]
    print(f"  [new ] {label} / {title} → {vid}")
    for fname, op, val in filter_spec:
        col = fid(fields, fname)
        if not col: print(f"        ! field '{fname}' not found"); continue
        add_filter(vid, col, op, val)
        print(f"        + {fname} {op} {val!r}")

def make_form(label, table_id, title):
    if has_view(table_id, title): print(f"  [skip-form] {label} / {title}"); return
    v = create_form(table_id, title)
    print(f"  [new-form] {label} / {title} → {v['id']}")

# === GRIDS — blank-field filters (clear signal from deep recon) ===
GRID_SPECS = [
    # (label, NC table id, view title, [(field, op, val)])
    ("WMATA / Issues",     "m9262xc5zga8nys", "Orphaned Issues",
        [("Affected Displays", "blank", None)]),
    ("WMATA / IPDevices",  "m1dhilldi492r3u", "Not Connected",
        [("Connected Displays", "blank", None)]),
    ("NY / Rack Devices",  "mxro9wqicb35ypk", "Unassigned Devices",
        [("Connected Displays", "blank", None)]),
    # === all-records grids on tables that had nothing in NocoDB ===
    ("WMATA / IPDevices",         "m1dhilldi492r3u", "All Devices",         []),
    ("WMATA / Stations",          "mpbbzczmreskpu7", "All Stations",        []),
    ("WMATA / Display Locations", "m3sszpgt3q512li", "All Locations",       []),
    ("WMATA / Display Locations", "m3sszpgt3q512li", "Active Locations",    []),
    ("WMATA / Security Scan",     "m6izesjptcj2psr", "All Scan Results",    []),
    ("WMATA / WMATA Switches",    "mgg1aio6kkymaip", "All Switches",        []),
    ("WMATA / Tasks",             "mxe7rlrwg4elhzw", "All Tasks",           []),
    # === clear single-select filters from deep recon ===
    ("South / Display Locations", "m5esro2omy4g72o", "LED Walls",           [("Install Type", "eq", "LED Wall")]),
    ("NY / Venues",               "m9a2n5hyxvwy5xi", "Active Venues",       [("Display Locations", "notblank", None)]),
    # === NY Display Locations / Parts Lookup / etc ===
    ("NY / Display Locations",     "mlc6f71gnnrqtyf", "All Locations",      []),
    ("NY / Client Interface Pref", "mqb6zr0i4obzw59", "All Preferences",    []),
    ("NY / Parts Lookup",          "me4rj1ei18axg97", "All Parts",          []),
    ("NY / Technicians",           "mrcu2fecparqhng", "All Technicians",    []),
]

# === FORMS ===
FORM_SPECS = [
    ("South / Issues", "mf8m21ecc24v91a", "NYC Operations Reporting"),
]

print("=== GRIDS ===")
for s in GRID_SPECS:
    try: make_grid(*s)
    except Exception as e: print(f"  ! ERR {s[0]} / {s[2]}: {e}")

print("\n=== FORMS ===")
for s in FORM_SPECS:
    try: make_form(*s)
    except Exception as e: print(f"  ! ERR {s[0]} / {s[2]}: {e}")
