#!/usr/bin/env python3
"""
Provision NocoDB saved views for Nick's Operations workflow.

Per Nick's 5/1 demo, three list views per regional service base:
  - Issues             → "Open Issues"          (Status NOT Resolved/Informational, sort newest first)
  - Maintenance Events → "Upcoming Maintenance" (Status NOT Completed,            sort Scheduled Date asc)
  - Walkthrough Log    → "Recent Walkthroughs"  (sort newest first)

Idempotent — re-running skips views that already exist by title.
"""
import json, os, sys, requests
from pathlib import Path

CREDS = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NOCODB_URL = CREDS["NOCODB_URL"].rstrip("/")
NOCODB_PAT = CREDS["NOCODB_PAT"]
H = {"xc-token": NOCODB_PAT, "Content-Type": "application/json"}

def api(method, path, **kw):
    url = path if path.startswith("http") else f"{NOCODB_URL}{path}"
    r = requests.request(method, url, headers=H, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_views(table_id):
    return api("GET", f"/api/v2/meta/tables/{table_id}/views").get("list", [])

def list_fields(table_id):
    t = api("GET", f"/api/v2/meta/tables/{table_id}")
    return t.get("columns", [])

def field_id(fields, name):
    for f in fields:
        if f.get("title") == name:
            return f["id"]
    return None

def create_grid(table_id, title):
    return api("POST", f"/api/v2/meta/tables/{table_id}/grids", json={"title": title})

def add_filter(view_id, col_id, op, value=None, logical="and"):
    body = {"fk_column_id": col_id, "comparison_op": op, "logical_op": logical}
    if value is not None:
        body["value"] = value
    return api("POST", f"/api/v2/meta/views/{view_id}/filters", json=body)

def add_sort(view_id, col_id, direction="asc"):
    return api("POST", f"/api/v2/meta/views/{view_id}/sorts",
               json={"fk_column_id": col_id, "direction": direction})

def ensure_view(base_label, table_id, title, filters, sorts):
    """filters: list of (field_name, op, value). sorts: list of (field_name, direction)."""
    existing = {v["title"]: v["id"] for v in list_views(table_id)}
    if title in existing:
        print(f"  [skip] {base_label} / {title} already exists ({existing[title]})")
        return existing[title]
    fields = list_fields(table_id)
    v = create_grid(table_id, title)
    vid = v["id"]
    print(f"  [new ] {base_label} / {title} → {vid}")
    for fname, op, val in filters:
        fid = field_id(fields, fname)
        if not fid:
            print(f"    ! filter field '{fname}' not found, skipping")
            continue
        add_filter(vid, fid, op, val)
        print(f"    + filter {fname} {op} {val!r}")
    for fname, direction in sorts:
        fid = field_id(fields, fname)
        if not fid:
            print(f"    ! sort field '{fname}' not found, skipping")
            continue
        add_sort(vid, fid, direction)
        print(f"    + sort {fname} {direction}")
    return vid

# Per-base table mapping. Field names vary slightly between bases — we resolve at runtime.
BASES = [
    {
        "label": "WMATA",
        "base_id": "pf7f4hyzjbs2f8h",
        "tables": {
            "Issues":             "m9262xc5zga8nys",
            "Walkthrough Log":    "mga4koaws5ynfmf",
            "Maintenance Events": "m3kk0zhxfyufb24",
        },
    },
    {
        "label": "South",
        "base_id": "pq021z1pvqv2o98",
        "tables": {
            "Issues":             "mf8m21ecc24v91a",
            "Walkthrough Log":    "m46k77h4xhgc0wz",
            "Maintenance Events": "mrsz432dhd5r4x7",
        },
    },
    {
        "label": "New York",
        "base_id": "pcyjvsvwvhf0tpo",
        "tables": {
            "Issues":             "moy7mzg7jism13q",
            "Walkthrough Log":    "mk2m95l6g73a35y",
            "Maintenance Events": "mwlja923da70kqv",
        },
    },
]

# Sort field candidates per table — first one that exists wins.
SORT_CANDIDATES = {
    "Issues":             [("Created", "desc"), ("Date Reported", "desc"), ("Id", "desc")],
    "Walkthrough Log":    [("Log Date", "desc"), ("Created Time", "desc"), ("Id", "desc")],
    "Maintenance Events": [("Scheduled Date", "asc"), ("Id", "asc")],
}

def first_existing_sort(table_id, candidates):
    fields = list_fields(table_id)
    for fname, direction in candidates:
        if field_id(fields, fname):
            return [(fname, direction)]
    return []

def main():
    for b in BASES:
        print(f"\n=== Base: {b['label']} ({b['base_id']}) ===")

        # Open Issues
        t = b["tables"]["Issues"]
        ensure_view(
            b["label"], t, "Open Issues",
            filters=[
                ("Status", "neq", "Resolved"),
                ("Status", "neq", "Informational"),
            ],
            sorts=first_existing_sort(t, SORT_CANDIDATES["Issues"]),
        )

        # Upcoming Maintenance
        t = b["tables"]["Maintenance Events"]
        ensure_view(
            b["label"], t, "Upcoming Maintenance",
            filters=[
                ("Status", "neq", "Completed"),
            ],
            sorts=first_existing_sort(t, SORT_CANDIDATES["Maintenance Events"]),
        )

        # Recent Walkthroughs
        t = b["tables"]["Walkthrough Log"]
        ensure_view(
            b["label"], t, "Recent Walkthroughs",
            filters=[],
            sorts=first_existing_sort(t, SORT_CANDIDATES["Walkthrough Log"]),
        )

if __name__ == "__main__":
    main()
