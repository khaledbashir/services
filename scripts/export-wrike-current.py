import json, os, time, urllib.request, urllib.parse, sys
EXPORT = "/root/anc-services/wrike-export"
# token from .env.local
TOK = ""
for line in open("/root/anc-services/.env.local"):
    if line.startswith("WRIKE_PERMANENT_TOKEN="):
        TOK = line.split("=",1)[1].strip()
assert TOK, "no token"
BASE = "https://www.wrike.com/api/v4"
def get(path, params=None):
    url = f"{BASE}{path}"
    if params: url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOK}"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(10); continue
            raise
    raise RuntimeError("retries exhausted")

def dump(name, data):
    bak = f"{EXPORT}/{name}.pre-repull-bak"
    if os.path.exists(f"{EXPORT}/{name}") and not os.path.exists(bak):
        os.rename(f"{EXPORT}/{name}", bak)
    json.dump({"data": data}, open(f"{EXPORT}/{name}", "w"))
    print(f"  wrote {name}: {len(data)} records", flush=True)

# routing/reference data (fresh, small)
print("folders..."); dump("folders_tree.json", get("/folders").get("data", []))
print("customfields..."); dump("custom_fields.json", get("/customfields").get("data", []))
print("workflows..."); dump("workflows.json", get("/workflows").get("data", []))
print("contacts..."); dump("contacts.json", get("/contacts").get("data", []))

# NEW tasks since the April export — full fields, paginated
FIELDS = ["customFields","description","briefDescription","parentIds","superParentIds",
          "responsibleIds","authorIds","subTaskIds","superTaskIds","attachmentCount",
          "hasAttachments","effortAllocation","metadata","billingType","dependencyIds","sharedIds"]
tasks = []
params = {
    "fields": json.dumps(FIELDS),
    "pageSize": 1000,
    "createdDate": json.dumps({"start": "2026-04-09T00:00:00Z"}),
    "descendants": "true",
}
print("tasks (created since 2026-04-09)...", flush=True)
while True:
    r = get("/tasks", params)
    tasks.extend(r.get("data", []))
    nt = r.get("nextPageToken")
    print(f"  page: +{len(r.get('data',[]))} (total {len(tasks)})", flush=True)
    if not nt: break
    params = {"nextPageToken": nt, "pageSize": 1000}
    time.sleep(0.5)
dump("tasks.json", tasks)
print("DONE")
