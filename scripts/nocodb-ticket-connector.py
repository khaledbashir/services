import json, subprocess, urllib.request, urllib.parse, sys
def cred(k,d=""):
    import os
    if os.environ.get(k): return os.environ[k]
    for ln in open("/root/.nocodb-ops-creds"):
        if ln.startswith(k+"="): return ln.split("=",1)[1].strip()
    return d
PAT=cred("NOCODB_OPS_PAT"); B=cred("NOCODB_OPS_BASE_URL","https://ops.ancsports.net")
DRY = "--apply" not in sys.argv
WT="mk2m95l6g73a35y"
DASH="https://services.ancsports.net"
BOT_STAFF_ID="7fb556c3-5d2d-430a-b3dc-42f58d79be33"  # ANC Bot (system author)
def api(method,path,body=None):
    req=urllib.request.Request(f"{B}{path}",method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"xc-token":PAT,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)
def psql(sql):
    out=subprocess.run(["docker","exec","anc-services-db-standalone","psql","-U","ancservices","-d","anc_services","-tAF","|","-c",sql],capture_output=True,text=True,timeout=30)
    return [l for l in out.stdout.strip().split("\n") if l]
recs=api("GET",f"/api/v2/tables/{WT}/records?limit=200&where="+urllib.parse.quote("(Support Ticket #,notblank)~and(Support Ticket Link,blank)")+"&fields="+urllib.parse.quote("Id,Support Ticket #,Log ID")).get("list",[])
print(f"{len(recs)} visits with a ticket # awaiting linking")
for r in recs:
    num=int(r["Support Ticket #"])
    rows=psql(f"SELECT id, title FROM tickets WHERE ticket_number={num}")
    if not rows:
        print(f"  visit {r['Id']}: ticket #{num} NOT FOUND in dashboard — skipped"); continue
    tid,title=rows[0].split("|",1)
    url=f"{DASH}/tickets/{tid}"
    print(f"  visit {r['Id']}: #{num} '{title[:30]}' -> {url}")
    if not DRY:
        api("PATCH",f"/api/v2/tables/{WT}/records",[{"Id":r["Id"],"Support Ticket Link":url}])
        log_id=(r.get("Log ID") or f"ops record {r['Id']}").replace("'","''")
        psql(f"INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at) VALUES ('{tid}','{BOT_STAFF_ID}','Linked walkthrough visit: {log_id} (operations board record {r['Id']})', true, NOW())")
if not DRY: print("APPLIED")
