#!/usr/bin/env python3
"""
Sync Google Calendar events to ANC Services database.
Fetches events from anc.update@gmail.com for the next 60 days.

Auth: Uses a service account key. The calendar at anc.update@gmail.com
must be shared with the service account email (with "See all event details").
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build
import psycopg2
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DB_HOST = os.getenv('DB_HOST', 'anc-services_db')
DB_USER = os.getenv('DB_USER', 'ancservices')
DB_NAME = os.getenv('DB_NAME', 'anc_services')
DB_PASS = os.getenv('DB_PASS', os.getenv('DB_PASSWORD', ''))

SA_KEY_PATH = os.getenv('GOOGLE_SA_KEY_PATH', '/opt/anc-services/google-sa-key.json')
CALENDAR_ID  = os.getenv('GOOGLE_CALENDAR_ID', 'anc.update@gmail.com')

def get_db_connection():
    conn = psycopg2.connect(host=DB_HOST, user=DB_USER, database=DB_NAME, password=DB_PASS)
    return conn

def get_calendar_service():
    if not os.path.exists(SA_KEY_PATH):
        raise FileNotFoundError(f"Service account key not found at {SA_KEY_PATH}. "
                                f"Ensure the key exists AND the calendar '{CALENDAR_ID}' "
                                f"is shared with the service account email.")
    creds = service_account.Credentials.from_service_account_file(
        SA_KEY_PATH,
        scopes=['https://www.googleapis.com/auth/calendar.readonly']
    )
    return build('calendar', 'v3', credentials=creds)

def extract_league(text):
    """Extract league from event title or description."""
    if not text:
        return None
    known = ['NBA', 'NHL', 'MLB', 'MLS', 'NFL', 'NCAAM', 'NCAAW', 'NCAAF',
             'AHL', 'ECHL', 'MiLB', 'NBA G League', 'WNBA']
    upper = text.upper()
    for league in known:
        if league.upper() in upper:
            return league
    # fallback: "League: XXX"
    m = re.search(r'(?:League|league):\s*([^\n,]+)', text)
    return m.group(1).strip() if m else None

def match_venue(conn, location):
    """
    Match location string to an existing venue by:
    1. Exact google_calendar_location match
    2. Case-insensitive name match
    3. Partial name match (location contains venue name or vice versa)
    Returns venue_id or None (does NOT auto-create to avoid duplicates).
    """
    if not location:
        return None
    cur = conn.cursor()

    # 1. Exact google_calendar_location
    cur.execute("SELECT id FROM venues WHERE google_calendar_location = %s", (location,))
    row = cur.fetchone()
    if row:
        cur.close()
        return row[0]

    # 2. Case-insensitive name match
    cur.execute("SELECT id FROM venues WHERE LOWER(name) = LOWER(%s)", (location,))
    row = cur.fetchone()
    if row:
        # Cache for next time
        cur.execute("UPDATE venues SET google_calendar_location = %s WHERE id = %s", (location, row[0]))
        conn.commit()
        cur.close()
        return row[0]

    # 3. Partial match — venue name is contained in location string
    cur.execute("SELECT id, name FROM venues WHERE %s ILIKE '%%' || name || '%%' OR name ILIKE '%%' || %s || '%%'",
                (location, location))
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE venues SET google_calendar_location = %s WHERE id = %s", (location, row[0]))
        conn.commit()
        cur.close()
        return row[0]

    cur.close()
    logger.warning(f"No venue match for location: '{location}' — event will be stored without venue link")
    return None

def upsert_event(conn, event, venue_id):
    """Upsert event. Returns ('new'|'updated'|'skipped')."""
    cur = conn.cursor()
    gid     = event['id']
    summary = event.get('summary', 'Untitled Event')
    desc    = event.get('description', '') or ''
    league  = extract_league(summary) or extract_league(desc)

    start_raw = event['start'].get('dateTime') or event['start'].get('date')
    end_raw   = event['end'].get('dateTime')   or event['end'].get('date')

    # Normalize to datetime strings
    if 'T' not in start_raw: start_raw += 'T00:00:00'
    if 'T' not in end_raw:   end_raw   += 'T00:00:00'

    try:
        start_dt = datetime.fromisoformat(start_raw.replace('Z', '+00:00'))
        end_dt   = datetime.fromisoformat(end_raw.replace('Z', '+00:00'))
    except Exception as e:
        logger.warning(f"Time parse failed for {gid}: {e}")
        cur.close()
        return 'skipped'

    try:
        cur.execute("SELECT id FROM events WHERE google_event_id = %s", (gid,))
        exists = cur.fetchone()
        if exists:
            cur.execute(
                """UPDATE events SET summary=%s, league=%s, venue_id=%s,
                   event_date=%s, start_time=%s, end_time=%s, synced_at=NOW()
                   WHERE google_event_id=%s""",
                (summary, league, venue_id, start_dt.date(), start_dt, end_dt, gid)
            )
            conn.commit()
            cur.close()
            return 'updated'
        else:
            cur.execute(
                """INSERT INTO events (google_event_id, summary, league, venue_id,
                   event_date, start_time, end_time, workflow_status, synced_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',NOW())""",
                (gid, summary, league, venue_id, start_dt.date(), start_dt, end_dt)
            )
            conn.commit()
            cur.close()
            return 'new'
    except psycopg2.Error as e:
        conn.rollback()
        cur.close()
        logger.error(f"DB error for event {gid}: {e}")
        return 'skipped'

def sync_calendar():
    logger.info("Starting calendar sync...")
    errors = []

    try:
        svc = get_calendar_service()
    except Exception as e:
        msg = str(e)
        logger.error(f"Calendar service init failed: {msg}")
        print(json.dumps({'status': 'error', 'error': msg,
                          'hint': 'Check SA key path and that the calendar is shared with the service account',
                          'timestamp': datetime.utcnow().isoformat()}))
        sys.exit(1)

    conn = get_db_connection()
    now = datetime.utcnow()
    time_min = now.isoformat() + 'Z'
    time_max = (now + timedelta(days=60)).isoformat() + 'Z'

    try:
        # Verify calendar access before iterating
        try:
            svc.calendars().get(calendarId=CALENDAR_ID).execute()
        except Exception as e:
            raise Exception(f"Cannot access calendar '{CALENDAR_ID}': {e}. "
                            f"Share the calendar with the service account email.")

        page_token = None
        all_events = []
        while True:
            resp = svc.events().list(
                calendarId=CALENDAR_ID,
                timeMin=time_min, timeMax=time_max,
                maxResults=250, singleEvents=True,
                orderBy='startTime', showDeleted=False,
                pageToken=page_token
            ).execute()
            all_events.extend(resp.get('items', []))
            page_token = resp.get('nextPageToken')
            if not page_token:
                break

        logger.info(f"Fetched {len(all_events)} events from Google Calendar")

        counts = {'new': 0, 'updated': 0, 'skipped': 0, 'no_venue': 0}
        for ev in all_events:
            if ev.get('status') == 'cancelled':
                continue
            location = ev.get('location', '')
            venue_id = match_venue(conn, location)
            if location and not venue_id:
                counts['no_venue'] += 1
            result = upsert_event(conn, ev, venue_id)
            counts[result] = counts.get(result, 0) + 1

        logger.info(f"Sync complete: {counts}")
        print(json.dumps({
            'status': 'success',
            'new_events': counts['new'],
            'updated_events': counts['updated'],
            'skipped': counts['skipped'],
            'unmatched_venues': counts['no_venue'],
            'timestamp': datetime.utcnow().isoformat()
        }))

    except Exception as e:
        logger.error(f"Sync failed: {e}")
        print(json.dumps({'status': 'error', 'error': str(e),
                          'timestamp': datetime.utcnow().isoformat()}))
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    sync_calendar()
