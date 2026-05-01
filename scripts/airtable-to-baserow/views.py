#!/usr/bin/env python3
"""
View replication: pulls every Airtable view (grid/kanban/calendar/form/gallery)
across every base and recreates the matching Baserow views with:
  - same name + type (graceful fallback to grid where Baserow OSS lacks the type)
  - same visible-field set + order
  - heuristic filters for obviously-named views (Open, Today's, Active, Resolved, etc.)

Filter/sort/group config is NOT exposed by Airtable's public metadata API, so we
infer filters from view names where we can; the rest are created empty and
flagged in MIGRATION_NOTES.md for Nick to confirm/adjust.
"""
import os, sys, json, time, re, requests
from pathlib import Path

ROOT = Path("/root/anc-services/scripts/airtable-to-baserow")
sys.path.insert(0, str(ROOT))
import migrate as M  # reuse creds, helpers, state IO

state = M.load_state()

NOTES = []
def note(msg):
    NOTES.append(msg)
    print(f"  NOTE: {msg}")

# ----- Airtable -----
def at_views_for_base(base_id):
    headers = {"Authorization": f"Bearer {M.AIRTABLE_PAT}"}
    r = requests.get(f"https://api.airtable.com/v0/meta/bases/{base_id}/tables", headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()["tables"]

# ----- Baserow -----
def br_list_views(table_id):
    return M.br("GET", f"/api/database/views/table/{table_id}/")

def br_create_view(table_id, payload):
    return M.br("POST", f"/api/database/views/table/{table_id}/", json=payload)

def br_set_field_options(view_id, field_options):
    return M.br("PATCH", f"/api/database/views/{view_id}/field-options/",
                json={"field_options": field_options})

def br_create_filter(view_id, field_id, type_, value):
    return M.br("POST", f"/api/database/views/{view_id}/filters/",
                json={"field": field_id, "type": type_, "value": str(value)})

def br_list_fields(table_id):
    return M.br("GET", f"/api/database/fields/table/{table_id}/")

# ----- view-type mapping -----
TYPE_MAP = {"grid": "grid", "form": "form", "kanban": "kanban", "gallery": "gallery", "calendar": "calendar", "timeline": "grid"}

def baserow_type_for(at_type):
    return TYPE_MAP.get(at_type, "grid")

# ----- heuristic filters -----
NAME_PATTERNS = [
    (re.compile(r"\bopen\b", re.I),       [("status_like", "open"),    ("status_neq", "closed"), ("status_neq", "resolved")]),
    (re.compile(r"\bresolved\b", re.I),   [("status_eq", "resolved")]),
    (re.compile(r"\bclosed\b", re.I),     [("status_eq", "closed")]),
    (re.compile(r"\bnew\b", re.I),        [("status_eq", "new")]),
    (re.compile(r"\btoday(?:'s)?\b", re.I), [("date_today",)]),
    (re.compile(r"\bactive\b", re.I),     [("status_eq", "active"), ("active_true",)]),
    (re.compile(r"\bunassigned\b", re.I), [("assignee_empty",)]),
]

def find_field_by_predicates(fields, preds):
    """preds: list of (kind, *args). kind = name_match (regex on name) or type_eq.
    Returns first matching field or None."""
    for f in fields:
        for kind, *args in preds:
            if kind == "name_match" and re.search(args[0], f.get("name",""), re.I):
                return f
            if kind == "type_eq" and f.get("type") == args[0]:
                return f
    return None

def apply_heuristic_filters(view_id, view_name, baserow_fields):
    """Try to add filters that make sense for this view name."""
    applied = []
    for pattern, hints in NAME_PATTERNS:
        if not pattern.search(view_name):
            continue
        for hint in hints:
            kind = hint[0]
            arg = hint[1] if len(hint) > 1 else None
            if kind == "status_eq":
                f = find_field_by_predicates(baserow_fields, [("name_match", r"^status$"), ("name_match", r"status")])
                if f and f.get("type") == "single_select":
                    opt = next((o for o in (f.get("select_options") or []) if o["value"].lower() == arg.lower()), None)
                    if opt:
                        try:
                            br_create_filter(view_id, f["id"], "single_select_equal", opt["id"])
                            applied.append(f"{f['name']} = {opt['value']}")
                        except Exception as e:
                            note(f"filter create failed on view '{view_name}': {e}")
                elif f:
                    try:
                        br_create_filter(view_id, f["id"], "equal", arg)
                        applied.append(f"{f['name']} = {arg}")
                    except Exception:
                        pass
            elif kind == "status_neq":
                f = find_field_by_predicates(baserow_fields, [("name_match", r"^status$"), ("name_match", r"status")])
                if f and f.get("type") == "single_select":
                    opt = next((o for o in (f.get("select_options") or []) if o["value"].lower() == arg.lower()), None)
                    if opt:
                        try:
                            br_create_filter(view_id, f["id"], "single_select_not_equal", opt["id"])
                            applied.append(f"{f['name']} != {opt['value']}")
                        except Exception:
                            pass
            elif kind == "status_like":
                # pass-through to status_eq for the matching option
                pass
            elif kind == "date_today":
                f = find_field_by_predicates(baserow_fields, [("type_eq", "date")])
                if f:
                    try:
                        br_create_filter(view_id, f["id"], "date_is_today", "")
                        applied.append(f"{f['name']} = today")
                    except Exception:
                        pass
            elif kind == "active_true":
                f = find_field_by_predicates(baserow_fields, [("name_match", r"^active$"), ("name_match", r"active")])
                if f and f.get("type") == "boolean":
                    try:
                        br_create_filter(view_id, f["id"], "boolean", "1")
                        applied.append(f"{f['name']} = true")
                    except Exception:
                        pass
            elif kind == "assignee_empty":
                f = find_field_by_predicates(baserow_fields, [("name_match", r"assign|owner|tech")])
                if f:
                    try:
                        br_create_filter(view_id, f["id"], "empty", "")
                        applied.append(f"{f['name']} is empty")
                    except Exception:
                        pass
    return applied

# ----- main -----
def replicate_views():
    for base_id, base_state in state["bases"].items():
        bn = base_state["name"]
        print(f"\n=== {bn} ({base_id}) ===")
        try:
            at_tables = at_views_for_base(base_id)
        except Exception as e:
            note(f"{bn}: failed to fetch schema: {e}")
            continue
        # AT table id → state table info
        for at_table in at_tables:
            at_tid = at_table["id"]
            at_tname = at_table["name"]
            tstate = base_state["tables"].get(at_tid)
            if not tstate:
                note(f"{bn}/{at_tname}: no state entry, skip")
                continue
            br_table_id = tstate["table_id"]
            views = at_table.get("views", [])
            if not views:
                continue
            # AT field id → BR field id map
            at_to_br_fid = {}
            primary_meta = tstate["fields"].get("primary")
            if primary_meta:
                at_to_br_fid[primary_meta["airtable_field_id"]] = primary_meta["baserow_field_id"]
            for k, v in tstate["fields"].items():
                if k == "primary":
                    continue
                if v.get("baserow_field_id") and v.get("airtable_field_id"):
                    at_to_br_fid[v["airtable_field_id"]] = v["baserow_field_id"]

            existing_br_views = br_list_views(br_table_id)
            existing_names = {v["name"]: v for v in existing_br_views}
            br_fields = br_list_fields(br_table_id)

            print(f"  {at_tname}: {len(views)} views")
            for vw in views:
                vname = vw["name"]
                vtype_at = vw.get("type", "grid")
                vtype_br = baserow_type_for(vtype_at)
                visible = vw.get("visibleFieldIds", [])

                # Reuse if same name exists already
                target = existing_names.get(vname)
                if target:
                    if target["type"] != vtype_br:
                        note(f"{bn}/{at_tname}: '{vname}' exists as {target['type']}, expected {vtype_br}; leaving as-is")
                    view_id = target["id"]
                    print(f"    · [{vtype_at}] {vname} — reuse (view {view_id})")
                else:
                    payload = {"name": vname, "type": vtype_br}
                    # Kanban needs a single_select field; pick the first one if any
                    if vtype_br == "kanban":
                        kanban_fid = next((f["id"] for f in br_fields if f.get("type") == "single_select"), None)
                        if kanban_fid is None:
                            note(f"{bn}/{at_tname}: kanban view '{vname}' — no single_select field, falling back to grid")
                            payload["type"] = "grid"
                        else:
                            payload["single_select_field"] = kanban_fid
                    if vtype_br == "calendar":
                        date_fid = next((f["id"] for f in br_fields if f.get("type") == "date"), None)
                        if date_fid is None:
                            note(f"{bn}/{at_tname}: calendar view '{vname}' — no date field, falling back to grid")
                            payload["type"] = "grid"
                        else:
                            payload["date_field"] = date_fid
                    try:
                        created = br_create_view(br_table_id, payload)
                        view_id = created["id"]
                        print(f"    · [{vtype_at}→{payload['type']}] {vname} — created (view {view_id})")
                    except Exception as e:
                        note(f"{bn}/{at_tname}: failed to create view '{vname}' ({vtype_at}): {e}")
                        continue

                # Field visibility/order
                if visible:
                    field_options = {}
                    for idx, at_fid in enumerate(visible):
                        br_fid = at_to_br_fid.get(at_fid)
                        if br_fid:
                            field_options[str(br_fid)] = {"hidden": False, "order": idx + 1}
                    visible_set = {at_to_br_fid.get(fid) for fid in visible}
                    visible_set.discard(None)
                    for f in br_fields:
                        if f["id"] not in visible_set:
                            field_options[str(f["id"])] = {"hidden": True, "order": 32000}
                    try:
                        br_set_field_options(view_id, field_options)
                    except Exception as e:
                        note(f"{bn}/{at_tname}/{vname}: field-options failed: {e}")

                # Heuristic filters
                applied = apply_heuristic_filters(view_id, vname, br_fields)
                if applied:
                    print(f"        filters: {', '.join(applied)}")

    # Persist notes
    if NOTES:
        existing = (ROOT / "MIGRATION_NOTES.md").read_text() if (ROOT / "MIGRATION_NOTES.md").exists() else "# Migration Notes\n\n"
        (ROOT / "MIGRATION_NOTES.md").write_text(existing + "\n## Views — " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n\n" + "\n".join(f"- {n}" for n in NOTES) + "\n")
    print("\nVIEWS DONE.")

if __name__ == "__main__":
    replicate_views()
