#!/usr/bin/env python3
"""
Cleanup: NocoDB rows where a LongText field stores Airtable's barcode-list JSON
(e.g. '[{"text": "076LHCSK9014", "type": "code39"}]'). Parse and overwrite with the
extracted .text value so it displays as plain text in the grid (matching Airtable).

Read-only against Airtable. Writes only to NocoDB.
"""
import json, sys, re, urllib.parse, requests
from pathlib import Path

NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:600]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_workspaces():
    return nc("GET", "/api/v3/meta/workspaces")["list"]

def list_bases():
    out = []
    for ws in list_workspaces():
        bases = nc("GET", f"/api/v3/meta/workspaces/{ws['id']}/bases").get("list", [])
        out.extend((ws["id"], b["id"], b.get("title", b["id"])) for b in bases)
    return out

def list_tables(base_id):
    return nc("GET", f"/api/v3/meta/bases/{base_id}/tables").get("list", [])

def list_fields(table_id):
    return nc("GET", f"/api/v2/meta/tables/{table_id}").get("columns", [])

def page_records(table_id, fields, batch=1000):
    out, offset = [], 0
    while True:
        d = nc("GET", f"/api/v2/tables/{table_id}/records?fields={urllib.parse.quote(fields)}&limit={batch}&offset={offset}")
        rows = d.get("list", [])
        out.extend(rows)
        if len(rows) < batch: break
        offset += batch
    return out

def bulk_patch(table_id, updates, batch=10):
    n = 0
    for i in range(0, len(updates), batch):
        chunk = updates[i:i+batch]
        nc("PATCH", f"/api/v2/tables/{table_id}/records", json=chunk)
        n += len(chunk)
        if i % 200 == 0 and i > 0: print(f"      ... {n}/{len(updates)}")
    return n

JSON_BARCODE_PATTERN = re.compile(r'^\s*\[\s*\{[^}]*"text"\s*:', re.UNICODE)

def parse_barcode_json(s):
    """[{"text": "X", "type": "Y"}, ...] → "X" (or "X, X2" if multiple)."""
    try:
        data = json.loads(s)
        if isinstance(data, list):
            texts = [d.get("text", "") for d in data if isinstance(d, dict)]
            return ", ".join(t for t in texts if t)
    except Exception:
        return None
    return None

def looks_like_barcode_json(val):
    return isinstance(val, str) and bool(JSON_BARCODE_PATTERN.match(val))

def scan_and_fix(base_label, base_id):
    print(f"\n=== {base_label} ({base_id}) ===")
    tables = list_tables(base_id)
    for t in tables:
        tid = t["id"]; tname = t.get("title", tid)
        fields = list_fields(tid)
        # narrow to LongText / SingleLineText
        text_fields = [f for f in fields if f.get("uidt") in ("LongText", "SingleLineText")]
        if not text_fields: continue
        # sample to detect which columns have barcode-JSON
        sample_fields_csv = ",".join(f["title"] for f in text_fields)
        sample = page_records(tid, f"Id,{sample_fields_csv}", batch=100)
        if not sample: continue
        bad_cols = []
        for f in text_fields:
            fname = f["title"]
            n = sum(1 for r in sample if looks_like_barcode_json(r.get(fname)))
            if n >= 3:  # at least a few matches → worth a full pass
                bad_cols.append(fname)
        if not bad_cols: continue
        print(f"  {tname}: barcode-JSON columns → {bad_cols}")
        # full pass
        all_rows = page_records(tid, f"Id,{','.join(bad_cols)}", batch=1000)
        updates = []
        for r in all_rows:
            update = {"Id": r["Id"]}
            changed = False
            for col in bad_cols:
                v = r.get(col)
                if looks_like_barcode_json(v):
                    parsed = parse_barcode_json(v)
                    if parsed is not None:
                        update[col] = parsed
                        changed = True
            if changed: updates.append(update)
        print(f"      → patching {len(updates)} rows")
        if updates:
            bulk_patch(tid, updates)

def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for ws_id, base_id, base_title in list_bases():
        if only and base_id not in only and base_title not in only:
            continue
        scan_and_fix(base_title, base_id)

if __name__ == "__main__":
    main()
