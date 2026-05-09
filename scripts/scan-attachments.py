#!/usr/bin/env python3
"""Scan all NocoDB tables for Attachment columns + count records with attachments."""
import sys, urllib.parse, requests
NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    r.raise_for_status()
    return r.json() if r.text else None

bases = []
for ws in nc("GET", "/api/v3/meta/workspaces")["list"]:
    for b in nc("GET", f"/api/v3/meta/workspaces/{ws['id']}/bases").get("list", []):
        bases.append((b["id"], b.get("title", b["id"])))

total_atts = 0
total_rows_with_att = 0
for base_id, base_title in bases:
    tables = nc("GET", f"/api/v3/meta/bases/{base_id}/tables").get("list", [])
    for t in tables:
        tid = t["id"]; tname = t.get("title", tid)
        cols = nc("GET", f"/api/v2/meta/tables/{tid}").get("columns", [])
        att_cols = [c for c in cols if c.get("uidt") == "Attachment"]
        if not att_cols: continue
        names = ",".join("Id" + "," + ",".join(c["title"] for c in att_cols) for _ in [0])
        # full sweep — count rows
        offset, n_rows, n_att = 0, 0, 0
        while True:
            d = nc("GET", f"/api/v2/tables/{tid}/records?fields={urllib.parse.quote(names)}&limit=1000&offset={offset}")
            rows = d.get("list", [])
            for r in rows:
                row_atts = 0
                for c in att_cols:
                    v = r.get(c["title"])
                    if isinstance(v, list):
                        row_atts += len(v)
                if row_atts:
                    n_rows += 1
                    n_att += row_atts
            if len(rows) < 1000: break
            offset += 1000
        if n_rows:
            print(f"{base_title:30s}  {tname:25s}  cols={[c['title'] for c in att_cols]}  rows_w_att={n_rows}  total_atts={n_att}")
            total_atts += n_att
            total_rows_with_att += n_rows
print(f"\nGRAND TOTAL: {total_rows_with_att} rows, {total_atts} attachments")
