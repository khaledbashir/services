#!/usr/bin/env python3
"""
Map views: add GeoData column to Venues / Stations tables, geocode each row via
Nominatim (free OSM service), backfill, then create a NocoDB Map view.

Read-only against Airtable. Writes only to NocoDB. Uses Nominatim for geocoding
(free, no API key, 1 req/sec rate limit per their terms).
"""
import json, sys, time, urllib.parse, requests
from pathlib import Path

NCC = dict(l.strip().split("=", 1) for l in open("/root/.nocodb-creds") if "=" in l and not l.strip().startswith("#"))
NCURL = NCC["NOCODB_URL"].rstrip("/")
NCH = {"xc-token": NCC["NOCODB_PAT"], "Content-Type": "application/json"}
UA  = {"User-Agent": "ANC-Sports-Ops-Geocoder/1.0 (admin@ancsports.com)"}

CACHE_FILE = Path("/root/anc-services/scripts/geocode-cache.json")
CACHE = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}

def nc(method, path, **kw):
    r = requests.request(method, f"{NCURL}{path}", headers=NCH, timeout=60, **kw)
    if not r.ok:
        sys.stderr.write(f"\n{method} {path} → {r.status_code}\n{r.text[:300]}\n")
        r.raise_for_status()
    return r.json() if r.text else None

def list_fields(t): return nc("GET", f"/api/v2/meta/tables/{t}").get("columns", [])
def fid(fs, name):
    for f in fs:
        if f.get("title") == name: return f["id"]
    return None

def has_view(t, title):
    views = nc("GET", f"/api/v2/meta/tables/{t}/views").get("list", [])
    return title in {v["title"] for v in views}

def ensure_geodata_field(table_id, field_name="Location"):
    fields = list_fields(table_id)
    f = fid(fields, field_name)
    if f:
        col = nc("GET", f"/api/v2/meta/columns/{f}")
        if col.get("uidt") == "GeoData":
            return f, False
        raise RuntimeError(f"field {field_name!r} exists with uidt={col.get('uidt')}, not GeoData")
    print(f"    + creating GeoData field {field_name!r}")
    r = nc("POST", f"/api/v2/meta/tables/{table_id}/columns",
           json={"title": field_name, "uidt": "GeoData", "column_name": field_name})
    return r["id"], True

def geocode(query):
    if query in CACHE: return CACHE[query]
    time.sleep(1.1)  # Nominatim TOS: max 1 req/sec
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search",
                         params={"q": query, "format": "json", "limit": 1},
                         headers=UA, timeout=30)
        r.raise_for_status()
        d = r.json()
        if d:
            lat, lng = d[0]["lat"], d[0]["lon"]
            CACHE[query] = (lat, lng)
            CACHE_FILE.write_text(json.dumps(CACHE, indent=2))
            return (lat, lng)
    except Exception as e:
        sys.stderr.write(f"  geocode err {query!r}: {e}\n")
    CACHE[query] = None
    CACHE_FILE.write_text(json.dumps(CACHE, indent=2))
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
    for i in range(0, len(updates), batch):
        chunk = updates[i:i+batch]
        nc("PATCH", f"/api/v2/tables/{table_id}/records", json=chunk)
    return len(updates)

def make_map_view(table_id, title, geo_field_id):
    if has_view(table_id, title):
        print(f"    [skip] {title}"); return
    body = {"title": title, "fk_geo_data_col_id": geo_field_id}
    v = nc("POST", f"/api/v2/meta/tables/{table_id}/maps", json=body)
    print(f"    [new ] {title} (map) → {v['id']}")

# (label, table_id, name field, suffix to append for geocoder, map view title)
TARGETS = [
    ("NY Venues",      "m9a2n5hyxvwy5xi", "Venue Name",  ", New York, NY",      "Venues Map"),
    ("South Venues",   "mzk0vbqz0ee67ze", "Venue Name",  ", USA",               "Venues Map"),
    ("WMATA Stations", "mpbbzczmreskpu7", "Station Name", " station, Washington DC Metro", "Stations Map"),
]

def process(label, table_id, name_field, geo_suffix, map_view_title):
    print(f"\n=== {label} ===")
    geo_id, _ = ensure_geodata_field(table_id, "Location")
    rows = page_records(table_id, f"Id,{name_field},Location")
    print(f"  rows total: {len(rows)}")
    updates = []
    for r in rows:
        if r.get("Location"):  # already geocoded
            continue
        name = r.get(name_field)
        if not name or name == "?": continue
        q = f"{name}{geo_suffix}"
        result = geocode(q)
        if not result:
            print(f"    ✗ no geocode for {q!r}")
            continue
        lat, lng = result
        updates.append({"Id": r["Id"], "Location": f"{lat};{lng}"})
        print(f"    ✓ {name:35s} → {lat},{lng}")
    if updates:
        bulk_patch(table_id, updates)
        print(f"  patched {len(updates)} rows")
    make_map_view(table_id, map_view_title, geo_id)

for spec in TARGETS:
    try: process(*spec)
    except Exception as e: print(f"  ! ERR {spec[0]}: {e}")
