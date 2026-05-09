#!/usr/bin/env python3
"""
Add Visit form views — Nick's transcript demo flow:
  - Pick site (Locations Visited / Auto Fill from Stations / Venue link)
  - Pick result (Result SingleSelect: No action / Open Issue Observed / New Issue Detected)
  - If new, attach an issue (Problem Detected link)

Uses NocoDB native form views which support multi-field entry incl. linked records.
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

def has_view(t, title):
    return title in {v["title"] for v in nc("GET", f"/api/v2/meta/tables/{t}/views").get("list", [])}

def create_form(t, title, heading=None, subheading=None):
    body = {"title": title}
    if heading: body["heading"] = heading
    if subheading: body["subheading"] = subheading
    return nc("POST", f"/api/v2/meta/tables/{t}/forms", json=body)

TARGETS = [
    ("WMATA", "mga4koaws5ynfmf", "Add Visit", "Add a new walkthrough visit", "Pick the station, set the result, and if you saw a new issue, link it here."),
    ("South", "m46k77h4xhgc0wz", "Add Visit", "Add a new walkthrough visit", "Pick the venue, set the result, and if you saw a new issue, link it here."),
    ("NY",    "mk2m95l6g73a35y", "Add Visit", "Add a new walkthrough visit", "Pick the venue, set the result, and if you saw a new issue, link it here."),
]

for label, table_id, title, heading, sub in TARGETS:
    if has_view(table_id, title):
        print(f"  [skip] {label} / {title}"); continue
    v = create_form(table_id, title, heading, sub)
    print(f"  [new ] {label} / {title} → {v['id']}")
