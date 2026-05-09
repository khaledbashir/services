#!/usr/bin/env python3
"""
Geocode WMATA stations using Wikidata SPARQL (free, no API key, comprehensive).
Backfill the existing 'Location' GeoData column on the Stations table.
"""
import json, sys, time, re, urllib.parse, requests
from pathlib import Path

NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}

WMATA_STATIONS_TABLE = "mpbbzczmreskpu7"
LOCATION_FIELD = "Location"

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:300]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

# 1) Pull all WMATA station coords from Wikidata
OVERPASS_QUERY = '''[out:json][timeout:60];
(
  node["railway"="station"]["operator"~"WMATA"];
  node["railway"="station"]["network"~"Washington Metro|WMATA"];
);
out;'''

def fetch_overpass():
    r = requests.post("https://overpass-api.de/api/interpreter",
                      headers={"Content-Type": "text/plain", "User-Agent": "ANC-Sports-Ops/1.0"},
                      data=OVERPASS_QUERY, timeout=120)
    r.raise_for_status()
    out = {}
    for e in r.json().get("elements", []):
        name = (e.get("tags", {}).get("name") or "").strip()
        if not name: continue
        lat, lng = e.get("lat"), e.get("lon")
        if lat is None or lng is None: continue
        out[name.lower()] = (str(lat), str(lng))
        # variants
        out[name.lower().replace(" station", "").strip()] = (str(lat), str(lng))
        out[name.lower().replace("-", " ").strip()] = (str(lat), str(lng))
    print(f"Fetched {len(out)} entries from Overpass (OSM)")
    return out

def normalize(s):
    if not s: return ""
    return re.sub(r'[^\w]', '', s.lower())

def lookup(name, table):
    if not name: return None
    candidates = [
        name.lower(),
        name.lower().replace(" station", "").strip(),
        name.lower().replace("-", " "),
        f"{name.lower()} (washington metro)",
    ]
    for c in candidates:
        if c in table: return table[c]
    # normalized fallback
    norm_table = {normalize(k): v for k, v in table.items()}
    n = normalize(name)
    if n in norm_table: return norm_table[n]
    # contains
    for k, v in table.items():
        if n and (n in normalize(k) or normalize(k) in n):
            return v
    return None

def page_records(table_id, fields_csv, batch=1000):
    out, offset = [], 0
    while True:
        d = nc("GET", f"/api/v2/tables/{table_id}/records?fields={urllib.parse.quote(fields_csv)}&limit={batch}&offset={offset}")
        rows = d.get("list", [])
        out.extend(rows)
        if len(rows) < batch: break
        offset += batch
    return out

def bulk_patch(table_id, updates, batch=10):
    n = 0
    for i in range(0, len(updates), batch):
        nc("PATCH", f"/api/v2/tables/{table_id}/records", json=updates[i:i+batch])
        n += len(updates[i:i+batch])
    return n

def main():
    print("=== Fetching WMATA station coords from OSM Overpass ===")
    wd = fetch_overpass()
    if not wd:
        print("! Wikidata returned nothing — bailing")
        return
    sample = list(wd.items())[:5]
    print(f"Sample: {sample}")

    print("\n=== Reading NocoDB Stations ===")
    rows = page_records(WMATA_STATIONS_TABLE, "Id,Station Name,Location")
    print(f"Stations in NocoDB: {len(rows)}")

    updates = []
    matched = unmatched = already = 0
    for r in rows:
        if r.get("Location"):
            already += 1; continue
        name = r.get("Station Name") or ""
        coord = lookup(name, wd)
        if coord:
            lat, lng = coord
            updates.append({"Id": r["Id"], "Location": f"{lat};{lng}"})
            matched += 1
        else:
            print(f"  ✗ no match for {name!r}")
            unmatched += 1
    print(f"\nmatched={matched}, unmatched={unmatched}, already_set={already}")
    if updates:
        bulk_patch(WMATA_STATIONS_TABLE, updates)
        print(f"  → patched {len(updates)} rows")

if __name__ == "__main__":
    main()
