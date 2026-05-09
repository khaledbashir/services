#!/usr/bin/env python3
"""
Date-based views (Today's Issues, This Week, etc.) using the new DateTime mirror columns
created in Phase 3b.
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
def field_id(fs, name):
    for f in fs:
        if f.get("title") == name: return f["id"]
    return None

def create_grid(t, title): return nc("POST", f"/api/v2/meta/tables/{t}/grids", json={"title": title})

def add_filter(view_id, col_id, op, sub_op=None, value=None):
    body = {"fk_column_id": col_id, "comparison_op": op, "logical_op": "and"}
    if sub_op: body["comparison_sub_op"] = sub_op
    if value is not None: body["value"] = value
    return nc("POST", f"/api/v2/meta/views/{view_id}/filters", json=body)

def add_sort(vid, col_id, direction):
    return nc("POST", f"/api/v2/meta/views/{vid}/sorts", json={"fk_column_id": col_id, "direction": direction})

# (label, table_id, date_field_name, [(view_title, comparison_op, sub_op, value)])
SPECS = [
    ("WMATA / Issues",      "m9262xc5zga8nys", "Created Date",     [
        ("Today's Issues",      "eq", "today", None),
        ("This Week's Issues",  "isWithin", "pastWeek", None),
        ("This Month's Issues", "isWithin", "pastMonth", None),
    ]),
    ("WMATA / Walkthrough", "mga4koaws5ynfmf", "Created At",       [
        ("Today's Walkthroughs",     "eq", "today", None),
        ("This Week's Walkthroughs", "isWithin", "pastWeek", None),
    ]),
    ("South / Issues",      "mf8m21ecc24v91a", "Created Date",     [
        ("Today's Issues",      "eq", "today", None),
        ("This Week's Issues",  "isWithin", "pastWeek", None),
    ]),
    ("NY / Issues",         "moy7mzg7jism13q", "Date Reported Dt", [
        ("Today's Issues",      "eq", "today", None),
        ("This Week's Issues",  "isWithin", "pastWeek", None),
        ("This Month's Issues", "isWithin", "pastMonth", None),
    ]),
    ("NY / Walkthrough",    "mk2m95l6g73a35y", "Log Date Dt",      [
        ("Today's Walkthroughs",     "eq", "today", None),
        ("This Week's Walkthroughs", "isWithin", "pastWeek", None),
    ]),
]

n_new = n_skip = n_err = 0
for label, table_id, date_field, views in SPECS:
    fields = list_fields(table_id)
    fid = field_id(fields, date_field)
    if not fid:
        print(f"  ! {label}: date field '{date_field}' not found"); n_err += 1; continue
    existing = {v["title"]: v["id"] for v in list_views(table_id)}
    for title, op, sub_op, value in views:
        if title in existing:
            print(f"  [skip] {label} / {title}"); n_skip += 1; continue
        try:
            v = create_grid(table_id, title); vid = v["id"]
            add_filter(vid, fid, op, sub_op, value)
            add_sort(vid, fid, "desc")
            print(f"  [new ] {label} / {title} → {vid}  ({date_field} {op} {sub_op})")
            n_new += 1
        except Exception as e:
            print(f"  ! ERR {label} / {title}: {e}"); n_err += 1

print(f"\nDone — created {n_new}, skipped {n_skip}, errors {n_err}")
