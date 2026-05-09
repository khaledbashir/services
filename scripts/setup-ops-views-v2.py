#!/usr/bin/env python3
"""
Phase 1: Provision all Status/Type/SingleSelect-based views in NocoDB to mirror Airtable.

Idempotent — re-running skips views that already exist by title.
Filter values were derived from /root/anc-services/scripts/ops-views-recon.json.
"""
import json, sys, requests
from pathlib import Path

CREDS = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
URL = CREDS["NOCODB_URL"].rstrip("/")
H = {"xc-token": CREDS["NOCODB_PAT"], "Content-Type": "application/json"}

def api(method, path, **kw):
    r = requests.request(method, f"{URL}{path}" if not path.startswith("http") else path, headers=H, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_views(table_id): return api("GET", f"/api/v2/meta/tables/{table_id}/views").get("list", [])
def list_fields(table_id): return api("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])

def field_id(fields, name):
    for f in fields:
        if f.get("title") == name: return f["id"]
    return None

def create_grid(table_id, title): return api("POST", f"/api/v2/meta/tables/{table_id}/grids", json={"title": title})

def add_filter(view_id, col_id, op, value=None):
    body = {"fk_column_id": col_id, "comparison_op": op, "logical_op": "and"}
    if value is not None: body["value"] = value
    return api("POST", f"/api/v2/meta/views/{view_id}/filters", json=body)

def add_sort(view_id, col_id, direction="asc"):
    return api("POST", f"/api/v2/meta/views/{view_id}/sorts",
               json={"fk_column_id": col_id, "direction": direction})

def ensure_view(label, table_id, title, filters, sorts=()):
    existing = {v["title"]: v["id"] for v in list_views(table_id)}
    if title in existing:
        print(f"  [skip] {label} / {title}")
        return existing[title]
    fields = list_fields(table_id)
    v = create_grid(table_id, title)
    vid = v["id"]
    print(f"  [new ] {label} / {title} → {vid}")
    skipped = []
    for fname, op, val in filters:
        fid = field_id(fields, fname)
        if not fid:
            skipped.append(fname); continue
        add_filter(vid, fid, op, val)
    for fname, direction in sorts:
        fid = field_id(fields, fname)
        if not fid: continue
        add_sort(vid, fid, direction)
    flt = ", ".join(f"{f}{op}{v!r}" for f,op,v in filters)
    print(f"         filters: {flt or '(none)'}")
    if skipped: print(f"         ! skipped fields: {skipped}")
    return vid

# (table_id, view_title, [(field_name, op, value), ...], [(sort_field, dir), ...])
SPECS = []

# === WMATA (pf7f4hyzjbs2f8h) ===
W_ISSUES   = "m9262xc5zga8nys"
W_WALK     = "mga4koaws5ynfmf"
W_MAINT    = "m3kk0zhxfyufb24"
W_DISPLAYS = "mhafrmmiym54dch"
W_LABEL = "WMATA"

# Issues
SPECS += [
    (W_LABEL, W_ISSUES, "All Issues",            [], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "Resolved Issues",       [("Status", "eq", "Resolved")], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "Unresolved Issues",     [("Status", "eq", "Unresolved")], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "Investigate Further",   [("Status", "eq", "Investigate Further")], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "Awaiting Parts",        [("Status", "eq", "Awaiting Parts")], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "Scheduled",             [("Status", "eq", "Scheduled")], [("Created", "desc")]),
    (W_LABEL, W_ISSUES, "For WMATA",             [("Status", "eq", "Unresolved"), ("Action", "eq", "Forward to WMATA")], [("Created", "desc")]),
]

# Walkthrough Log
SPECS += [
    (W_LABEL, W_WALK, "All Walkthroughs", [], [("Created Time", "desc")]),
]

# Maintenance Events
SPECS += [
    (W_LABEL, W_MAINT, "All Maintenance",        [], [("Scheduled Date", "desc")]),
    (W_LABEL, W_MAINT, "Completed Maintenance",  [("Status", "eq", "Completed")], [("Scheduled Date", "desc")]),
    (W_LABEL, W_MAINT, "Scheduled Maintenance",  [("Status", "eq", "Scheduled")], [("Scheduled Date", "asc")]),
    (W_LABEL, W_MAINT, "In-Progress Maintenance",[("Status", "eq", "In Progress")], [("Scheduled Date", "asc")]),
    (W_LABEL, W_MAINT, "Requested Maintenance",  [("Status", "eq", "Requested")], [("Scheduled Date", "asc")]),
]

# Displays
SPECS += [
    (W_LABEL, W_DISPLAYS, "All Displays",                       [], []),
    (W_LABEL, W_DISPLAYS, "DWS",                                [("ANC Responsibility", "eq", "Software & Maintenance"), ("Project Phase", "eq", "DWS Phase 2")], []),
    (W_LABEL, W_DISPLAYS, "PIDS Only",                          [("Type", "eq", "PID - Platform Info")], []),
    (W_LABEL, W_DISPLAYS, "KIDS Only",                          [("Type", "eq", "KID - Kiosk Info")], []),
    (W_LABEL, W_DISPLAYS, "Station Info Displays (WID)",        [("Type", "eq", "WID - Windscreen Info")], []),
    (W_LABEL, W_DISPLAYS, "CIDs (Customer Info)",               [("Type", "eq", "CID - Customer Info")], []),
    (W_LABEL, W_DISPLAYS, "2024 Phone Booth Replacement",       [("Project Phase", "eq", "Phone Booth Replacement")], []),
    (W_LABEL, W_DISPLAYS, "2025 Entrance Display Expansion",    [("Project Phase", "eq", "Entrance Display Expansion")], []),
    (W_LABEL, W_DISPLAYS, "Red Line Shutdown 24",               [("Project Phase", "eq", "Red Line Shutdown '24")], []),
    (W_LABEL, W_DISPLAYS, "BUS and RTRA",                       [("ANC Responsibility", "eq", "Software Only")], []),
    (W_LABEL, W_DISPLAYS, "Installed",                          [("Installation Status", "eq", "✅ Done")], []),
    (W_LABEL, W_DISPLAYS, "Touch Screens",                      [("Touch screen?", "checked", None)], []),
]

# === South (pq021z1pvqv2o98) ===
S_ISSUES   = "mf8m21ecc24v91a"
S_WALK     = "m46k77h4xhgc0wz"
S_MAINT    = "mrsz432dhd5r4x7"
S_VENUES   = "mzk0vbqz0ee67ze"
S_LABEL = "South"

SPECS += [
    (S_LABEL, S_ISSUES, "All Issues",            [], [("Created", "desc")]),
    (S_LABEL, S_ISSUES, "Resolved Issues",       [("Status", "eq", "Resolved")], [("Created", "desc")]),
    (S_LABEL, S_ISSUES, "Unresolved Issues",     [("Status", "eq", "Unresolved")], [("Created", "desc")]),
    (S_LABEL, S_ISSUES, "Investigate Further",   [("Status", "eq", "Investigate Further")], [("Created", "desc")]),
]
SPECS += [
    (S_LABEL, S_WALK, "All Walkthroughs", [], [("Log Date", "desc")]),
]
SPECS += [
    (S_LABEL, S_MAINT, "All Maintenance",        [], [("Scheduled Date", "desc")]),
    (S_LABEL, S_MAINT, "Completed Maintenance",  [("Status", "eq", "Completed")], [("Scheduled Date", "desc")]),
    (S_LABEL, S_MAINT, "Scheduled Maintenance",  [("Status", "eq", "Scheduled")], [("Scheduled Date", "asc")]),
]
SPECS += [
    (S_LABEL, S_VENUES, "All Venues", [], []),
]

# === New York (pcyjvsvwvhf0tpo) ===
N_ISSUES   = "moy7mzg7jism13q"
N_WALK     = "mk2m95l6g73a35y"
N_MAINT    = "mwlja923da70kqv"
N_VENUES   = "m9a2n5hyxvwy5xi"
N_RACKDEV  = "mxro9wqicb35ypk"
N_LABEL = "NY"

SPECS += [
    (N_LABEL, N_ISSUES, "All Issues",            [], [("Date Reported", "desc")]),
    (N_LABEL, N_ISSUES, "Resolved Issues",       [("Status", "eq", "Resolved")], [("Date Reported", "desc")]),
    (N_LABEL, N_ISSUES, "Unresolved Issues",     [("Status", "eq", "Unresolved")], [("Date Reported", "desc")]),
    (N_LABEL, N_ISSUES, "On Hold Issues",        [("Status", "eq", "On Hold")], [("Date Reported", "desc")]),
    (N_LABEL, N_ISSUES, "Awaiting Parts",        [("Status", "eq", "Awaiting Parts")], [("Date Reported", "desc")]),
]
SPECS += [
    (N_LABEL, N_WALK, "All Walkthroughs", [], [("Log Date", "desc")]),
]
SPECS += [
    (N_LABEL, N_MAINT, "All Maintenance",        [], [("Scheduled Date", "desc")]),
    (N_LABEL, N_MAINT, "Completed Maintenance",  [("Status", "eq", "Completed")], [("Scheduled Date", "desc")]),
    (N_LABEL, N_MAINT, "Scheduled Maintenance",  [("Status", "eq", "Scheduled")], [("Scheduled Date", "asc")]),
]
SPECS += [
    (N_LABEL, N_VENUES, "All Venues", [], []),
]
SPECS += [
    (N_LABEL, N_RACKDEV, "All Rack Devices",     [], []),
    (N_LABEL, N_RACKDEV, "All Matricies",        [("Device Type", "eq", "Video Matrix")], []),
    (N_LABEL, N_RACKDEV, "All Scalers",          [("Device Type", "eq", "Scaler")], []),
    (N_LABEL, N_RACKDEV, "All Decoders",         [("Device Type", "eq", "SDVoE Decoder")], []),
]

def main():
    n_new = n_skip = n_err = 0
    for label, table_id, title, filters, sorts in SPECS:
        try:
            existing = {v["title"]: v["id"] for v in list_views(table_id)}
            if title in existing:
                print(f"  [skip] {label} / {title}"); n_skip += 1; continue
            ensure_view(label, table_id, title, filters, sorts); n_new += 1
        except Exception as e:
            print(f"  ! ERR {label} / {title}: {e}"); n_err += 1
    print(f"\nDone — created {n_new}, skipped (existed) {n_skip}, errors {n_err}")

if __name__ == "__main__":
    main()
