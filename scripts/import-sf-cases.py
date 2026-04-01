#!/usr/bin/env python3
"""Import Salesforce Cases into ANC Service Dashboard tickets table."""

import json
import psycopg2
from datetime import datetime

# DB connection
conn = psycopg2.connect(
    host="95.217.76.248",
    port=5432,
    dbname="anc_services",
    user="ancservices",
    password="AncSvc2026SecureDB"
)

# Load SF cases
with open("/tmp/sf_all_cases.json") as f:
    cases = json.load(f)

print(f"Loaded {len(cases)} SF cases")

cur = conn.cursor()

# Get venue mapping: SF Account Name -> venue_id
cur.execute("SELECT id, name FROM venues")
venues = {row[1].lower().strip(): row[0] for row in cur.fetchall()}
print(f"Loaded {len(venues)} venues for matching")

# Get staff mapping: name -> id (for case owner)
cur.execute("SELECT id, full_name FROM staff WHERE is_active = true")
staff = {row[1].lower().strip(): row[0] for row in cur.fetchall()}
print(f"Loaded {len(staff)} staff for matching")

# Get Claw staff ID for unmapped owners
CLAW_ID = "7fb556c3-5d2d-430a-b3dc-42f58d79be33"

# Status mapping
STATUS_MAP = {
    "New": "new",
    "On Hold": "on_hold",
    "In Progress": "in_progress",
    "in_progress": "in_progress",
    "Escalated": "escalated",
    "Closed": "closed",
    "Merged": "closed",
    "Done": "closed",
}

# Origin mapping
ORIGIN_MAP = {
    "Email": "email",
    "Web": "web",
    "Phone": "phone",
}

def match_venue(account_name):
    """Fuzzy match SF Account Name to dashboard venue."""
    if not account_name:
        return None
    name_lower = account_name.lower().strip()
    # Exact match
    if name_lower in venues:
        return venues[name_lower]
    # Partial match
    for vname, vid in venues.items():
        if vname in name_lower or name_lower in vname:
            return vid
    # Word match - check if key words overlap
    acct_words = set(name_lower.split())
    for vname, vid in venues.items():
        venue_words = set(vname.split())
        overlap = acct_words & venue_words
        if len(overlap) >= 2:  # At least 2 words match
            return vid
    return None

def match_staff(owner_name):
    """Match SF Case Owner to dashboard staff."""
    if not owner_name:
        return CLAW_ID
    name_lower = owner_name.lower().strip()
    if name_lower in staff:
        return staff[name_lower]
    # Partial match
    for sname, sid in staff.items():
        if sname in name_lower or name_lower in sname:
            return sid
    return CLAW_ID

imported = 0
skipped = 0
errors = 0
no_venue = 0

for case in cases:
    try:
        sf_id = case["Id"]
        case_number = case["CaseNumber"]
        subject = case.get("Subject") or f"Case {case_number}"
        description = case.get("Description") or ""
        status = STATUS_MAP.get(case.get("Status", "New"), "new")
        priority = (case.get("Priority") or "Medium").lower()
        if priority not in ("low", "medium", "high", "critical"):
            priority = "medium"
        origin = ORIGIN_MAP.get(case.get("Origin"), "web")
        case_type = (case.get("Type") or "support").lower()
        if case_type not in ("support", "dev_ticket"):
            case_type = "support"
        reason = case.get("Reason") or "general"

        # Map category from reason
        category = "general"
        reason_lower = reason.lower()
        if "hardware" in reason_lower:
            category = "hardware"
        elif "software" in reason_lower:
            category = "software"
        elif "content" in reason_lower:
            category = "content"

        # Account -> Venue
        account = case.get("Account") or {}
        account_name = account.get("Name")
        venue_id = match_venue(account_name)

        if not venue_id:
            no_venue += 1
            skipped += 1
            continue

        # Owner -> Staff
        owner = case.get("Owner") or {}
        owner_name = owner.get("Name")
        assigned_to = match_staff(owner_name)

        # Contact info
        contact = case.get("Contact") or {}
        contact_name = contact.get("Name")
        contact_email = contact.get("Email")
        contact_phone = contact.get("Phone")

        # Dates
        created_at = case.get("CreatedDate")
        closed_at = case.get("ClosedDate")
        updated_at = case.get("LastModifiedDate")

        # Check for duplicate (by sf_case_number)
        cur.execute("SELECT id FROM tickets WHERE sf_case_number = %s", (case_number,))
        if cur.fetchone():
            skipped += 1
            continue

        # Insert
        cur.execute("""
            INSERT INTO tickets (
                venue_id, created_by, assigned_to, title, description,
                priority, status, category, source, ticket_type,
                contact_name, contact_email, contact_phone,
                sf_case_number, created_at, updated_at, resolved_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            )
        """, (
            venue_id, CLAW_ID, assigned_to, subject, description,
            priority, status, category, origin, case_type,
            contact_name, contact_email, contact_phone,
            case_number, created_at, updated_at, closed_at
        ))

        imported += 1
        if imported % 100 == 0:
            print(f"  Imported {imported}...")
            conn.commit()

    except Exception as e:
        errors += 1
        if errors <= 5:
            print(f"  Error on case {case.get('CaseNumber', '?')}: {e}")

conn.commit()
cur.close()
conn.close()

print(f"\nDone!")
print(f"  Imported: {imported}")
print(f"  Skipped: {skipped} (of which {no_venue} had no venue match)")
print(f"  Errors: {errors}")
