#!/usr/bin/env python3
"""
Import "Report of Actives for Gianni 4.20.26" staff and venue assignments.
Joe sign-off (4/27 9:53 PM) applied: typo fixes, ambiguous resolutions, missing-venue mappings.

Usage:
  python3 import-actives.py            # dry run (default)
  python3 import-actives.py --live     # apply
"""
import sys, os, re, subprocess, json, hashlib
import openpyxl

LIVE = '--live' in sys.argv
FILE = '/root/anc-services/Report of Actives for Gianni 4.20.26 (2).xlsx'
CONTAINER = 'anc-services-db-standalone'
DEFAULT_PASSWORD = 'anc123'

# Joe-approved canonical venue mappings.
VENUE_MAP = {
    # Typos / formatting
    'Crypto Arena': 'Crypto.com Arena',
    'Levi Stadium': "Levi's Stadium",
    'MetLife Stadium': 'Met Life Stadium',
    'Capitol One Arena': 'Capital One Arena',
    'Superdome': 'Super Dome',
    'Rock n Roll Hall of Fame': 'Rock and Roll Hall of Fame',
    'WMATA': 'Washington Metro Area Transportation Authority (WMATA)',
    'Yum Center': 'KFC Yum! Center',
    'Razorback Stadium': 'University of Arkansas (Razorback Stadium - Football)',
    'California Memorial Stadium':
        'University of California, Berkeley (California Memorial Stadium - Football and Lax)',
    'QU Soccer and Lacrosse Stadium': 'Quinnipiac University',
    'SHI Stadium': 'Rutgers University (SHI Stadium - Football and Lax)',
    '1604 Broadway': 'NTM - 1604 Broadway',
    'Moynihan Train Hall': 'Moynihan Station',
    'NBCU 30 Rock': 'NBC Universal 30 Rock',
    'PGA Omni Frisco': 'Omni PGA Frisco',
    'Miami Childrens Museum': "NTM - Miami Children's Museum",
    'Amerant Arena': 'Amerant Bank Arena',
    # Ambiguous (Joe picked)
    'MGM Boston': 'MGM Music Hall at Fenway',
    'MGM Harbor': 'MGM National Harbor',
    'M&T Bank Arena': 'Quinnipiac University',
    'Dodger Stadium': 'Uniqlo Field at Dodger Stadium',
    'Bogata Savings Bank Center':
        'Fairleigh Dickinson University (FDU Bogota Saving Bank Center - Basketball, Volleyball)',
    # Missing-from-DB → existing alias
    'Fulton Station': 'Westfield Fulton Center',
    'Notre Dame Stadium': 'University of Notre Dame',
    'Choctaw Stadium': 'OBM - Arlington Choctaw',
    'Washington-Grizzely Stadium': 'University of Montana',
    'L&N Federal Credit Union Stadium': 'University of Louisville',
    'Jim Patterson Field': 'University of Louisville',
    'Ulmer Stadium': 'University of Louisville',
    'Bass-Rud Tennis Center': 'University of Louisville',
    'Lacrosse Stadium': 'University of Louisville',
    'Hynes Athletic Center': 'Iona University',
    'Valley Childrens Stadium': 'Fresno State University',
    'Brush Street': 'NTM - Brush St. Detroit Garage',
    # Unambiguous substring fixes (close existing names — auto-applied)
    'Camping World Stadium': 'Camping World Stadium (Orlando)',
    'Cleveland Public Hall': 'Cleveland Public Auditorium',
    'Galveston Cruise Terminal': 'Galveston Terminal Pier 16',
    'HEB Center': 'H-E-B Center at Cedar Park',
    'JP Morgan': 'JP Morgan Chase',
    'World Trade Center': 'Westfield World Trade Center',
    # Net-new venues we'll add below — also map the raw name to canonical
    '1674 Broadway': 'NTM - 1674 Broadway',
}

NEW_VENUES = [
    ('390 Madison Ave', 'ooh'),
    ('NTM - 1674 Broadway', 'ooh'),
    ('UCLA Health Training Center', 'sports'),
]

TECH_SUPPORT_NAMES = {'Saint Louis, Steve'}
SKIP_AS_VENUE = {'Tech Support'}


def psql(sql, capture=True):
    """Run SQL inside the Postgres container; returns stdout (string)."""
    cmd = ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'ancservices', '-d', 'anc_services',
           '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|']
    res = subprocess.run(cmd, input=sql, text=True, capture_output=capture)
    if res.returncode != 0:
        raise RuntimeError(f'psql failed: {res.stderr}')
    return res.stdout


def email_for(first, last, taken):
    norm = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())
    base = f'{norm(first)}.{norm(last)}@anc.com'
    if base not in taken:
        taken.add(base); return base
    for i in range(2, 50):
        cand = f'{norm(first)}.{norm(last)}{i}@anc.com'
        if cand not in taken:
            taken.add(cand); return cand
    raise RuntimeError(f'No unique email for {first} {last}')


def bcrypt_hash(pw):
    """Generate bcrypt hash via the running anc-services Node container."""
    res = subprocess.run(
        ['docker', 'exec', '-i', 'abc_anc-services.1.x7kdbm0n1lbwm15zncmi4muhg',
         'node', '-e', f'const b=require("bcryptjs");process.stdout.write(b.hashSync(process.argv[1],10))', pw],
        capture_output=True, text=True
    )
    if res.returncode != 0:
        raise RuntimeError(f'bcrypt failed: {res.stderr}')
    return res.stdout.strip()


def sql_str(s):
    if s is None:
        return 'NULL'
    return "'" + s.replace("'", "''") + "'"


def main():
    print(f'Mode: {"LIVE" if LIVE else "DRY RUN"}')
    wb = openpyxl.load_workbook(FILE, data_only=True)
    ws = wb['Data']
    rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]
    print(f'Spreadsheet rows: {len(rows)}')

    # Load existing staff & venues from DB.
    # Build a name index keyed on a normalized "first lastinitial-or-last" tuple
    # so we can match Excel's "Last, First M" against DB's free-form "First Last".
    def name_key(s):
        # → list of candidate keys for this string
        # Excel: "Athanasopoulos, Andreas"  →  "andreas athanasopoulos"
        # DB:    "Andreas Athanasopoulos"    →  "andreas athanasopoulos"
        s = (s or '').strip().lower()
        if ',' in s:
            last, _, rest = s.partition(',')
            parts = rest.strip().split()
            first = parts[0] if parts else ''
            return [f'{first} {last.strip()}']
        toks = s.split()
        if len(toks) >= 2:
            return [f'{toks[0]} {toks[-1]}']
        return [s]

    existing_staff = {}  # normalized name -> (id, email, role, is_active, db_full_name)
    out = psql("SELECT id, full_name, email, role, is_active FROM staff")
    for line in out.strip().splitlines():
        if not line:
            continue
        sid, fn, em, rl, act = line.split('|')
        for k in name_key(fn):
            existing_staff[k] = (sid, em, rl, act == 't', fn.strip())
    print(f'Existing staff in DB: {len(set(v[0] for v in existing_staff.values()))}')

    existing_emails = set(v[1] for v in existing_staff.values())

    db_venues = {}  # name -> id
    out = psql("SELECT id, name FROM venues")
    for line in out.strip().splitlines():
        if not line:
            continue
        vid, name = line.split('|', 1)
        db_venues[name.strip()] = vid

    # Plan: per-row decisions
    new_staff = []
    matched_staff = []
    # Each link carries the *canonical DB display name* (existing or to-be-inserted) so the
    # final join works without translating between "Last, First M" and "First Last".
    venue_links = []  # list of (db_display_name, venue_name)
    unresolved_venues = set()

    for r in rows:
        full = str(r[0]).strip()
        nick = (r[1] or '').strip() or None
        city = (r[2] or '').strip() or None
        state = (r[3] or '').strip() or None
        venues_raw = (r[4] or '').strip()
        # Parse name
        last, _, rest = full.partition(',')
        last = last.strip()
        first_parts = rest.strip().split()
        first = first_parts[0] if first_parts else ''
        display_first = nick or first

        # Venues for this staff
        items = [v.strip() for v in venues_raw.split(',') if v.strip()] if venues_raw else []
        items = [v for v in items if v not in SKIP_AS_VENUE]
        canonical = [VENUE_MAP.get(v, v) for v in items]

        for cn in canonical:
            if cn not in db_venues and cn not in {nv[0] for nv in NEW_VENUES}:
                unresolved_venues.add(cn)

        role = 'tech_support' if full in TECH_SUPPORT_NAMES else 'technician'

        # Build candidate keys from sheet row (use nick if present)
        sheet_keys = name_key(full)
        if nick:
            sheet_keys.append(f'{nick.lower()} {last.lower()}')
        match = None
        for k in sheet_keys:
            if k in existing_staff:
                match = existing_staff[k]
                break

        # Compute the canonical DB display name we'll use for venue link lookup.
        if match:
            db_display = match[4]
            matched_staff.append((full, db_display, role, canonical))
        else:
            db_display = f"{display_first} {last}".strip()
            new_staff.append({
                'full_name': full,
                'first': display_first, 'last': last,
                'city': city, 'state': state,
                'role': role,
                'venues': canonical,
                'db_display': db_display,
            })

        for cn in canonical:
            venue_links.append((db_display, cn))

    # Stats
    print(f'\n--- PLAN ---')
    print(f'Net new staff:       {len(new_staff)}')
    print(f'Existing staff:      {len(matched_staff)}  (will refresh venue links)')
    print(f'Total venue links:   {len(venue_links)}')
    print(f'New venues to add:   {len(NEW_VENUES)}')
    print(f'Unresolved venues:   {len(unresolved_venues)}  {sorted(unresolved_venues) if unresolved_venues else ""}')

    if unresolved_venues:
        print('\n!! Unresolved venue names — fix VENUE_MAP before --live')
        sys.exit(1)

    # Show first few to be created
    print('\nMatched-existing staff (will only refresh venue links, no new account):')
    for full, db_full, role, vs in matched_staff:
        print(f'  sheet={full!r:40s}  db={db_full!r:30s}  venues={len(vs)}')

    print('\nFirst 10 new staff (would be inserted):')
    for s in new_staff[:10]:
        print(f"  {s['full_name']:35s}  role={s['role']:11s}  city={s['city'] or '?':18s}  venues={len(s['venues'])}")

    if not LIVE:
        print('\n(dry run — no changes written. Re-run with --live to apply.)')
        return

    # ---- LIVE PATH ----
    print('\nApplying live changes...')

    # 1. Insert new venues (no unique constraint on name; pre-check)
    venue_ids_added = {}
    for vname, vtype in NEW_VENUES:
        if vname in db_venues:
            print(f"  venue exists: {vname}")
            continue
        sql = f"""
        INSERT INTO venues (name, venue_type)
        VALUES ({sql_str(vname)}, {sql_str(vtype)})
        RETURNING id;"""
        rid = psql(sql).strip()
        if rid:
            venue_ids_added[vname] = rid
            db_venues[vname] = rid
            print(f"  + added venue: {vname}  ({rid})")

    # Refresh venues map
    out = psql("SELECT id, name FROM venues")
    db_venues = {}
    for line in out.strip().splitlines():
        if not line: continue
        vid, name = line.split('|', 1)
        db_venues[name.strip()] = vid

    # 2. Insert new staff
    pw_hash = bcrypt_hash(DEFAULT_PASSWORD)
    print(f'  using bcrypt hash for default password')

    inserted_staff_ids = {}  # db_display_name -> id
    taken = set(existing_emails)
    for s in new_staff:
        em = email_for(s['first'], s['last'], taken)
        sql = f"""
        INSERT INTO staff (full_name, email, role, password_hash, city, is_active)
        VALUES ({sql_str(s['db_display'])}, {sql_str(em)}, {sql_str(s['role'])},
                {sql_str(pw_hash)}, {sql_str(s['city'])}, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id;"""
        rid = psql(sql).strip()
        if rid:
            inserted_staff_ids[s['db_display']] = rid

    print(f'  + inserted {len(inserted_staff_ids)} new staff records')

    # 3. Build full staff name->id map (existing + new)
    out = psql("SELECT id, full_name FROM staff")
    name_to_id = {}
    for line in out.strip().splitlines():
        if not line: continue
        sid, fn = line.split('|', 1)
        name_to_id[fn.strip()] = sid

    # 4. Insert venue links (idempotent via UNIQUE constraint on (staff_id, venue_id))
    link_count = 0
    skipped = 0
    for staff_disp, venue_name in venue_links:
        sid = name_to_id.get(staff_disp)
        vid = db_venues.get(venue_name)
        if not sid or not vid:
            skipped += 1
            print(f'  ! skipping link: staff={staff_disp!r} sid={sid} venue={venue_name!r} vid={vid}')
            continue
        sql = f"""
        INSERT INTO staff_venues (staff_id, venue_id)
        VALUES ('{sid}'::uuid, '{vid}'::uuid)
        ON CONFLICT (staff_id, venue_id) DO NOTHING;"""
        psql(sql)
        link_count += 1
    print(f'  + processed {link_count} venue links (idempotent), skipped {skipped}')

    # 5. Final counts
    final_staff = psql("SELECT count(*) FROM staff").strip()
    final_links = psql("SELECT count(*) FROM staff_venues").strip()
    print(f'\nDONE. staff={final_staff}, staff_venues={final_links}')


if __name__ == '__main__':
    main()
