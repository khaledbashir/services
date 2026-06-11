import json, urllib.request, urllib.parse, sys, datetime
import os
def _cred(k, d=""):
    v=os.environ.get(k)
    if v: return v
    try:
        for ln in open("/root/.nocodb-ops-creds"):
            if ln.startswith(k+"="): return ln.split("=",1)[1].strip()
    except FileNotFoundError: pass
    return d
PAT=_cred("NOCODB_OPS_PAT"); B=_cred("NOCODB_OPS_BASE_URL","https://ops.ancsports.net")
assert PAT, "NOCODB_OPS_PAT not found (env or /root/.nocodb-ops-creds)"
DRY = "--apply" not in sys.argv
# (base, walkthrough_table, venue_link_field, venue_abbr_field)
BASES = [("New York","mk2m95l6g73a35y")]
def api(method, path, body=None):
    req=urllib.request.Request(f"{B}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"xc-token":PAT,"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
for name, tbl in BASES:
    # blank Log ID with a Venue linked
    recs = api("GET", f"/api/v2/tables/{tbl}/records?limit=200&where=" +
               urllib.parse.quote("(Log ID,is,null)~and(Venue,isnot,null)") +
               "&fields=" + urllib.parse.quote("Id,Log ID,Three Letter Code,Log Date,CreatedAt,Venue")).get("list",[])
    print(f"[{name}] {len(recs)} blank records with a venue")
    updates=[]
    for r in recs:
        ven = (r.get("Venue") or [{}])[0]
        abbr = ven.get("Abbreviation")
        if not abbr:  # fetch venue abbreviation
            vid = ven.get("Id")
            vrec = api("GET", f"/api/v2/tables/m9a2n5hyxvwy5xi/records/{vid}?fields=" + urllib.parse.quote("Abbreviation"))
            abbr = vrec.get("Abbreviation")
        if not abbr: 
            print(f"  rec {r['Id']}: no venue abbreviation, skip"); continue
        created = (r.get("CreatedAt") or "")[:10]  # YYYY-MM-DD
        try: yy = datetime.date.fromisoformat(created).strftime("%y-%m-%d")
        except: yy = created
        log_id = f"{yy} [{abbr}]"
        upd = {"Id": r["Id"], "Log ID": log_id, "Three Letter Code": abbr, "Log Date": r.get("CreatedAt")}
        updates.append(upd)
        print(f"  rec {r['Id']}: Log ID='{log_id}' tri-code='{abbr}'")
    if updates and not DRY:
        api("PATCH", f"/api/v2/tables/{tbl}/records", updates)
        print(f"  APPLIED {len(updates)} updates")
    elif updates:
        print(f"  DRY-RUN ({len(updates)} would update; pass --apply to write)")
