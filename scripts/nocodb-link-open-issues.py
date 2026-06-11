import json, urllib.request, urllib.parse, sys
def cred(k,d=""):
    import os
    if os.environ.get(k): return os.environ[k]
    for ln in open("/root/.nocodb-ops-creds"):
        if ln.startswith(k+"="): return ln.split("=",1)[1].strip()
    return d
PAT=cred("NOCODB_OPS_PAT"); B=cred("NOCODB_OPS_BASE_URL","https://ops.ancsports.net")
DRY = "--apply" not in sys.argv
WT="mk2m95l6g73a35y"; ISSUES="moy7mzg7jism13q"; OPEN_VIEW="vwc54yci44qzvxd0"; PD_LINK="cu9el90bdvci9xj"
def api(method,path,body=None):
    req=urllib.request.Request(f"{B}{path}",method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"xc-token":PAT,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)
# open issues by venue name (cache)
_open={}
def open_issues_for(venue):
    if venue in _open: return _open[venue]
    w=urllib.parse.quote(f"(Venue,eq,{venue})")
    r=api("GET",f"/api/v2/tables/{ISSUES}/records?viewId={OPEN_VIEW}&limit=200&where={w}&fields=Id")
    ids=[x["Id"] for x in r.get("list",[])]; _open[venue]=ids; return ids
# walkthroughs: Open Issue Observed, venue set, Problem Detected empty
recs=api("GET",f"/api/v2/tables/{WT}/records?limit=500&where="+urllib.parse.quote("(Result,eq,Open Issue Observed)~and(Venue,isnot,null)")+"&fields="+urllib.parse.quote("Id,Venue,Problem Detected")+"").get("list",[])
todo=[]
for r in recs:
    pd=r.get("Problem Detected") or []
    if isinstance(pd,list) and len(pd)>0: continue   # already has links — leave it
    ven=(r.get("Venue") or [{}])[0].get("Venue Name")
    if not ven: continue
    ids=open_issues_for(ven)
    if ids: todo.append((r["Id"],ven,ids))
print(f"{len(todo)} visits would get open issues linked")
for rid,ven,ids in todo[:15]:
    print(f"  visit {rid} ({ven}) <- {len(ids)} open issues {ids[:5]}")
    if not DRY:
        api("POST",f"/api/v2/tables/{WT}/links/{PD_LINK}/records/{rid}",[{"Id":i} for i in ids])
if not DRY: print(f"APPLIED links to {len(todo)} visits")
