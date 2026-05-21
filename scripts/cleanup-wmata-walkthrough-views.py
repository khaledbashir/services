#!/usr/bin/env python3
"""
Clean up WMATA Walkthrough Log views/forms in NocoDB.

This keeps the WMATA table in NocoDB, but makes the visible fields match the
operator workflow Nick described: pick station/location, set result, add notes
and attachments. It also hides raw system/join/calculation columns from the
main walkthrough grids and sorts by the real DateTime mirror column.
"""
import sys
import requests

CREDS = dict(
    line.strip().split("=", 1)
    for line in open("/root/.nocodb-creds")
    if "=" in line and not line.strip().startswith("#")
)
BASE = CREDS["NOCODB_URL"].rstrip("/")
HEADERS = {"xc-token": CREDS["NOCODB_PAT"], "Content-Type": "application/json"}

TABLE_ID = "mga4koaws5ynfmf"  # WMATA / Walkthrough Log

GRID_VIEWS = {
    "Walkthrough Log",
    "Recent Walkthroughs",
    "All Walkthroughs",
    "Today's Walkthroughs",
    "This Week's Walkthroughs",
    "Walkthrough Calendar",
}

GRID_COLUMNS = [
    "Log ID",
    "Created At",
    "Technician",
    "Auto Fill from Stations",
    "Locations Visited",
    "Display Locations (from Auto Fill from Stations)",
    "Type",
    "Result",
    "Problem Detected",
    "Notes",
    "Attachments",
    "Three Letter Code",
]

ADD_VISIT_COLUMNS = [
    "Auto Fill from Stations",
    "Locations Visited",
    "Technician",
    "Type",
    "Result",
    "Problem Detected",
    "Notes",
    "Attachments",
]


def nc(method: str, path: str, **kwargs):
    res = requests.request(method, f"{BASE}{path}", headers=HEADERS, timeout=60, **kwargs)
    if not res.ok:
        sys.stderr.write(f"\n{method} {path} -> {res.status_code}\n{res.text[:500]}\n")
        res.raise_for_status()
    return res.json() if res.text else None


def list_views():
    return nc("GET", f"/api/v2/meta/tables/{TABLE_ID}/views").get("list", [])


def list_fields():
    return nc("GET", f"/api/v2/meta/tables/{TABLE_ID}").get("columns", [])


def set_columns(view_id: str, desired_titles: list[str], field_titles: dict[str, str]):
    desired = {title: idx + 1 for idx, title in enumerate(desired_titles)}
    view_cols = nc("GET", f"/api/v2/meta/views/{view_id}/columns").get("list", [])
    for view_col in view_cols:
        title = field_titles.get(view_col["fk_column_id"], view_col["fk_column_id"])
        show = title in desired
        order = desired.get(title, 999)
        payload = {"show": show, "order": order}
        if view_col.get("show") != show or view_col.get("order") != order:
            nc("PATCH", f"/api/v2/meta/views/{view_id}/columns/{view_col['id']}", json=payload)


def reset_sort_to_created_at(view_id: str, created_at_col_id: str):
    for sort in nc("GET", f"/api/v2/meta/views/{view_id}/sorts").get("list", []):
        nc("DELETE", f"/api/v2/meta/sorts/{sort['id']}")
    nc(
        "POST",
        f"/api/v2/meta/views/{view_id}/sorts",
        json={"fk_column_id": created_at_col_id, "direction": "desc"},
    )


def main():
    fields = list_fields()
    field_ids_by_title = {field["title"]: field["id"] for field in fields}
    field_titles_by_id = {field["id"]: field["title"] for field in fields}
    created_at_col_id = field_ids_by_title.get("Created At")
    if not created_at_col_id:
        raise RuntimeError("WMATA Walkthrough Log is missing the Created At DateTime field")

    changed = []
    for view in list_views():
        title = view["title"]
        view_id = view["id"]
        if title in GRID_VIEWS:
            set_columns(view_id, GRID_COLUMNS, field_titles_by_id)
            reset_sort_to_created_at(view_id, created_at_col_id)
            changed.append(f"{title}: grid columns + Created At sort")
        elif title == "Add Visit":
            set_columns(view_id, ADD_VISIT_COLUMNS, field_titles_by_id)
            changed.append("Add Visit: form columns")

    print("WMATA walkthrough cleanup complete")
    for item in changed:
        print(f"- {item}")


if __name__ == "__main__":
    main()
