#!/usr/bin/env python3
"""
Sync Google Calendar events to ANC Services database.
Fetches events from anc.update@gmail.com for the next 60 days.
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import psycopg2
from psycopg2.extras import execute_values
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
DB_HOST = os.getenv('DB_HOST', 'anc-services_db')
DB_USER = os.getenv('DB_USER', 'ancservices')
DB_NAME = os.getenv('DB_NAME', 'anc_services')
DB_PASS = os.getenv('DB_PASS', 'dP6ofKviiFUPKX3i9QW9S9Jm')

# Google Service Account
SA_KEY_PATH = os.getenv('GOOGLE_SA_KEY_PATH', '/opt/anc-services/google-sa-key.json')

def get_db_connection():
    """Create and return a database connection."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            user=DB_USER,
            database=DB_NAME,
            password=DB_PASS
        )
        return conn
    except psycopg2.Error as e:
        logger.error(f"Failed to connect to database: {e}")
        sys.exit(1)

def get_calendar_service():
    """Build and return the Google Calendar service."""
    if not os.path.exists(SA_KEY_PATH):
        logger.error(f"Service account key not found at {SA_KEY_PATH}")
        sys.exit(1)
    
    credentials = service_account.Credentials.from_service_account_file(
        SA_KEY_PATH,
        scopes=['https://www.googleapis.com/auth/calendar.readonly']
    )
    
    return build('calendar', 'v3', credentials=credentials)

def extract_league_from_description(description):
    """Extract league name from event description."""
    if not description:
        return None
    
    # Look for patterns like "League: XXX" or common league names
    patterns = [
        r'(?:League|league):\s*([^\n]+)',
        r'^([A-Z][A-Za-z\s]+)\s*(?:League|league)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, description)
        if match:
            return match.group(1).strip()
    
    return None

def get_or_create_venue(conn, location):
    """Get venue by google_calendar_location or create it. Returns venue_id."""
    if not location:
        return None
    
    cur = conn.cursor()
    
    # Try to find existing venue
    cur.execute(
        "SELECT id FROM venues WHERE google_calendar_location = %s",
        (location,)
    )
    result = cur.fetchone()
    
    if result:
        cur.close()
        return result[0]
    
    # Create new venue
    try:
        cur.execute(
            """INSERT INTO venues (name, google_calendar_location)
               VALUES (%s, %s)
               RETURNING id""",
            (location, location)
        )
        venue_id = cur.fetchone()[0]
        conn.commit()
        logger.info(f"Created new venue: {location} (ID: {venue_id})")
        cur.close()
        return venue_id
    except psycopg2.Error as e:
        conn.rollback()
        cur.close()
        logger.warning(f"Failed to create venue for {location}: {e}")
        return None

def upsert_event(conn, event, venue_id):
    """Upsert event into database. Returns (is_new, updated)."""
    cur = conn.cursor()
    
    google_event_id = event['id']
    summary = event.get('summary', 'Untitled Event')
    description = event.get('description', '')
    location = event.get('location', '')
    league = extract_league_from_description(description)
    
    # Parse start/end times
    start_dt = event['start'].get('dateTime') or event['start'].get('date')
    end_dt = event['end'].get('dateTime') or event['end'].get('date')
    
    # Handle all-day events
    if 'dateTime' not in event['start']:
        # All-day event, convert date to datetime
        start_dt = f"{start_dt}T00:00:00Z"
    if 'dateTime' not in event['end']:
        end_dt = f"{end_dt}T00:00:00Z"
    
    # Parse ISO format datetime strings
    try:
        if 'T' in start_dt:
            start_time = datetime.fromisoformat(start_dt.replace('Z', '+00:00'))
        else:
            start_time = datetime.fromisoformat(start_dt)
        
        if 'T' in end_dt:
            end_time = datetime.fromisoformat(end_dt.replace('Z', '+00:00'))
        else:
            end_time = datetime.fromisoformat(end_dt)
    except Exception as e:
        logger.warning(f"Failed to parse times for event {google_event_id}: {e}")
        return False, False
    
    event_date = start_time.date()
    
    try:
        # Check if event exists
        cur.execute(
            "SELECT id FROM events WHERE google_event_id = %s",
            (google_event_id,)
        )
        exists = cur.fetchone() is not None
        
        if exists:
            # Update existing event
            cur.execute(
                """UPDATE events 
                   SET summary = %s, league = %s, venue_id = %s, 
                       event_date = %s, start_time = %s, end_time = %s,
                       synced_at = NOW()
                   WHERE google_event_id = %s""",
                (summary, league, venue_id, event_date, start_time, end_time, google_event_id)
            )
            conn.commit()
            cur.close()
            return False, True
        else:
            # Insert new event
            cur.execute(
                """INSERT INTO events 
                   (google_event_id, summary, league, venue_id, event_date, start_time, end_time, synced_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())""",
                (google_event_id, summary, league, venue_id, event_date, start_time, end_time)
            )
            conn.commit()
            cur.close()
            return True, False
    except psycopg2.Error as e:
        conn.rollback()
        cur.close()
        logger.error(f"Failed to upsert event {google_event_id}: {e}")
        return False, False

def sync_calendar():
    """Main sync function."""
    logger.info("Starting calendar sync...")
    
    # Connect to Google Calendar and database
    calendar_service = get_calendar_service()
    db_conn = get_db_connection()
    
    # Calculate date range: today to 60 days from now
    now = datetime.utcnow()
    time_min = now.isoformat() + 'Z'
    time_max = (now + timedelta(days=60)).isoformat() + 'Z'
    
    logger.info(f"Fetching events from {time_min} to {time_max}")
    
    try:
        # Fetch events from calendar
        events_result = calendar_service.events().list(
            calendarId='anc.update@gmail.com',
            timeMin=time_min,
            timeMax=time_max,
            maxResults=250,
            singleEvents=True,
            orderBy='startTime',
            showDeleted=False
        ).execute()
        
        events = events_result.get('items', [])
        logger.info(f"Fetched {len(events)} events from Google Calendar")
        
        new_count = 0
        updated_count = 0
        new_venues = 0
        
        for event in events:
            # Skip cancelled events
            if event.get('status') == 'cancelled':
                continue
            
            # Get or create venue
            location = event.get('location', '')
            venue_id = None
            if location:
                venue_id = get_or_create_venue(db_conn, location)
                # Note: venue creation is already counted in get_or_create_venue
            
            # Upsert event
            is_new, is_updated = upsert_event(db_conn, event, venue_id)
            if is_new:
                new_count += 1
            elif is_updated:
                updated_count += 1
        
        # Log results
        logger.info(f"Sync complete: {new_count} new events, {updated_count} updated events")
        print(json.dumps({
            'status': 'success',
            'new_events': new_count,
            'updated_events': updated_count,
            'timestamp': datetime.utcnow().isoformat()
        }))
        
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        print(json.dumps({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }))
        sys.exit(1)
    finally:
        db_conn.close()

if __name__ == '__main__':
    sync_calendar()
