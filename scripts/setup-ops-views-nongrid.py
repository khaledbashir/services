#!/usr/bin/env python3
"""
Phase 4: Non-grid views (Kanban / Calendar / Gallery) to mirror Airtable's equivalents.
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

def title_in(table_id, title):
    return title in {v["title"] for v in list_views(table_id)}

def make_kanban(label, table_id, title, group_by_field):
    if title_in(table_id, title): print(f"  [skip] {label} / {title}"); return
    f = fid(list_fields(table_id), group_by_field)
    if not f: print(f"  ! {label} / {title}: group field '{group_by_field}' not found"); return
    body = {"title": title, "fk_grp_col_id": f}
    v = nc("POST", f"/api/v2/meta/tables/{table_id}/kanbans", json=body)
    print(f"  [new ] {label} / {title} (kanban by {group_by_field}) → {v['id']}")

def make_calendar(label, table_id, title, date_field):
    if title_in(table_id, title): print(f"  [skip] {label} / {title}"); return
    f = fid(list_fields(table_id), date_field)
    if not f: print(f"  ! {label} / {title}: date field '{date_field}' not found"); return
    body = {"title": title, "calendar_range": [{"fk_from_column_id": f}]}
    v = nc("POST", f"/api/v2/meta/tables/{table_id}/calendars", json=body)
    print(f"  [new ] {label} / {title} (calendar on {date_field}) → {v['id']}")

def make_gallery(label, table_id, title, cover_field=None):
    if title_in(table_id, title): print(f"  [skip] {label} / {title}"); return
    body = {"title": title}
    if cover_field:
        f = fid(list_fields(table_id), cover_field)
        if f: body["fk_cover_image_col_id"] = f
    v = nc("POST", f"/api/v2/meta/tables/{table_id}/galleries", json=body)
    print(f"  [new ] {label} / {title} (gallery) → {v['id']}")

# === KANBAN: group by Status ===
KANBANS = [
    ("WMATA / Issues",             "m9262xc5zga8nys", "Issues Kanban",             "Status"),
    ("WMATA / Maintenance Events", "m3kk0zhxfyufb24", "Maintenance Kanban",        "Status"),
    ("South / Issues",             "mf8m21ecc24v91a", "Issues Kanban",             "Status"),
    ("South / Maintenance Events", "mrsz432dhd5r4x7", "Maintenance Kanban",        "Status"),
    ("NY / Issues",                "moy7mzg7jism13q", "Issues Kanban",             "Status"),
    ("NY / Maintenance Events",    "mwlja923da70kqv", "Maintenance Kanban",        "Status"),
]

# === CALENDAR ===
CALENDARS = [
    ("WMATA / Maintenance Events", "m3kk0zhxfyufb24", "Maintenance Calendar", "Scheduled Date"),
    ("WMATA / Walkthrough",        "mga4koaws5ynfmf", "Walkthrough Calendar", "Created At"),
    ("South / Maintenance Events", "mrsz432dhd5r4x7", "Maintenance Calendar", "Scheduled Date"),
    ("South / Walkthrough",        "m46k77h4xhgc0wz", "Walkthrough Calendar", "Log Date"),
    ("NY / Maintenance Events",    "mwlja923da70kqv", "Maintenance Calendar", "Scheduled Date"),
    ("NY / Walkthrough",           "mk2m95l6g73a35y", "Walkthrough Calendar", "Log Date Dt"),
]

# === GALLERY ===
GALLERIES = [
    ("WMATA / Displays",     "mhafrmmiym54dch", "Displays Gallery",     "Image"),
    ("NY / Displays",        "mh1566n5k578cbf", "Displays Gallery",     "Image"),
]

print("\n=== KANBANS ===")
for s in KANBANS:
    try: make_kanban(*s)
    except Exception as e: print(f"  ! ERR {s[0]} / {s[2]}: {e}")

print("\n=== CALENDARS ===")
for s in CALENDARS:
    try: make_calendar(*s)
    except Exception as e: print(f"  ! ERR {s[0]} / {s[2]}: {e}")

print("\n=== GALLERIES ===")
for s in GALLERIES:
    try: make_gallery(*s)
    except Exception as e: print(f"  ! ERR {s[0]} / {s[2]}: {e}")
