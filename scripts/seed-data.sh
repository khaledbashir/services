#!/bin/bash
# Seed script for ANC Services
# Run with: bash scripts/seed-data.sh

# This script seeds the database with test venues, staff, and events
# Requires: psql with $DB_* environment variables set

set -e

echo "🌱 Seeding ANC Services database..."

# Venues with addresses (will be geocoded)
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
-- Insert test venues if they don't exist
INSERT INTO venues (id, name, address, venue_type, requires_assignment, is_active, portal_token) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Madison Square Garden', '4 Pennsylvania Plaza, New York, NY 10001', 'sports', true, true, 'msg001'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Fenway Park', '4 Jersey St, Boston, MA 02215', 'sports', true, true, 'fenway002'),
  ('550e8400-e29b-41d4-a716-446655440003', 'SoFi Stadium', '1001 Stadium Dr, Inglewood, CA 90301', 'sports', true, true, 'sofi003'),
  ('550e8400-e29b-41d4-a716-446655440004', 'Wrigley Field', '1060 W Addison St, Chicago, IL 60613', 'sports', true, true, 'wrigley004'),
  ('550e8400-e29b-41d4-a716-446655440005', 'Yankee Stadium', '1 E 161st St, Bronx, NY 10451', 'sports', true, true, 'yankee005'),
  ('550e8400-e29b-41d4-a716-446655440006', 'AT&T Stadium', '1 AT&T Way, Arlington, TX 76011', 'sports', true, true, 'att006'),
  ('550e8400-e29b-41d4-a716-446655440007', 'Lincoln Financial Field', '1 Lincoln Financial Field Way, Philadelphia, PA 19147', 'sports', true, true, 'linc007'),
  ('550e8400-e29b-41d4-a716-446655440008', 'Lambeau Field', '1265 Lombardi Ave, Green Bay, WI 54304', 'sports', true, true, 'lambeau008'),
  ('550e8400-e29b-41d4-a716-446655440009', 'Caesars Superdome', '1500 Sugar Bowl Dr, New Orleans, LA 70112', 'sports', true, true, 'superdome009'),
  ('550e8400-e29b-41d4-a716-446655440010', 'T-Mobile Arena', '3780 S Las Vegas Blvd, Las Vegas, NV 89109', 'sports', true, true, 'tmobile010'),
  ('550e8400-e29b-41d4-a716-446655440011', 'Scotiabank Arena', '40 Bay St, Toronto, ON M5J 2X2, Canada', 'sports', true, true, 'scotia011'),
  ('550e8400-e29b-41d4-a716-446655440012', 'Crypto.com Arena', '1111 S Figueroa St, Los Angeles, CA 90015', 'sports', true, true, 'crypto012')
ON CONFLICT (id) DO NOTHING;

-- Insert test staff
INSERT INTO staff (id, full_name, email, role, is_active) VALUES
  ('650e8400-e29b-41d4-a716-446655440001', 'Mike Johnson', 'mike@anc.com', 'admin', true),
  ('650e8400-e29b-41d4-a716-446655440002', 'Sarah Chen', 'sarah@anc.com', 'manager', true),
  ('650e8400-e29b-41d4-a716-446655440003', 'Carlos Rodriguez', 'carlos@anc.com', 'technician', true),
  ('650e8400-e29b-41d4-a716-446655440004', 'Emily Watson', 'emily@anc.com', 'technician', true),
  ('650e8400-e29b-41d4-a716-446655440005', 'David Kim', 'david@anc.com', 'manager', true),
  ('650e8400-e29b-41d4-a716-446655440006', 'Jessica Brown', 'jessica@anc.com', 'technician', true)
ON CONFLICT (id) DO NOTHING;

-- Link staff to venues
INSERT INTO staff_venues (staff_id, venue_id) VALUES
  ('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001'),
  ('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002'),
  ('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001'),
  ('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440005'),
  ('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002'),
  ('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440003'),
  ('650e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440004'),
  ('650e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440006')
ON CONFLICT (staff_id, venue_id) DO NOTHING;

-- Set venue managers
UPDATE venues SET venue_manager_id = '650e8400-e29b-41d4-a716-446655440001' WHERE id = '550e8400-e29b-41d4-a716-446655440001';
UPDATE venues SET venue_manager_id = '650e8400-e29b-41d4-a716-446655440002' WHERE id = '550e8400-e29b-41d4-a716-446655440002';
UPDATE venues SET lead_field_rep_id = '650e8400-e29b-41d4-a716-446655440003' WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- Insert service types
INSERT INTO service_types (id, name, description) VALUES
  ('700e8400-e29b-41d4-a716-446655440001', 'LED Display', 'LED video board operation and maintenance'),
  ('700e8400-e29b-41d4-a716-446655440002', 'Audio', 'Sound system setup and operation'),
  ('700e8400-e29b-41d4-a716-446655440003', 'Video Production', 'Camera and video switching'),
  ('700e8400-e29b-41d4-a716-446655440004', 'Lighting', 'Event lighting design and operation'),
  ('700e8400-e29b-41d4-a716-446655440005', 'Scoring', 'Scoring system and statistics')
ON CONFLICT (id) DO NOTHING;

-- Link services to venues
INSERT INTO venue_services (venue_id, service_type_id, enabled) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', '700e8400-e29b-41d4-a716-446655440001', true),
  ('550e8400-e29b-41d4-a716-446655440001', '700e8400-e29b-41d4-a716-446655440002', true),
  ('550e8400-e29b-41d4-a716-446655440002', '700e8400-e29b-41d4-a716-446655440001', true),
  ('550e8400-e29b-41d4-a716-446655440002', '700e8400-e29b-41d4-a716-446655440003', true)
ON CONFLICT (venue_id, service_type_id) DO NOTHING;

-- Insert test events for the next 30 days
INSERT INTO events (id, venue_id, summary, league, event_date, start_time, workflow_status)
SELECT
  '800e8400-e29b-41d4-a716-44665544' || LPAD(i::text, 3, '0'),
  (ARRAY[
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440005'
  ])[1 + (i % 5)],
  (ARRAY['Knicks vs Celtics', 'Red Sox vs Yankees', 'Rams vs 49ers', 'Cubs vs Cardinals', 'Yankees vs Red Sox', 'Cowboys vs Eagles', 'Packers vs Bears', 'Saints vs Falcons', 'Golden Knights vs Kings', 'Lakers vs Celtics', 'Raptors vs 76ers', 'Clippers vs Warriors'])[1 + (i % 12)],
  (ARRAY['NBA', 'MLB', 'NFL', 'NHL', 'NCAAM', 'NCAAF'])[1 + (i % 6)],
  CURRENT_DATE + (i % 30),
  '19:00:00'::time,
  (ARRAY['pending', 'checked_in', 'game_ready', 'post_game_submitted'])[1 + (i % 4)]
FROM generate_series(1, 20) AS i
ON CONFLICT (id) DO NOTHING;

-- Assign staff to events
INSERT INTO event_assignments (event_id, staff_id)
SELECT 
  e.id,
  (ARRAY[
    '650e8400-e29b-41d4-a716-446655440003',
    '650e8400-e29b-41d4-a716-446655440004',
    '650e8400-e29b-41d4-a716-446655440006'
  ])[1 + (floor(random() * 3))::int]
FROM events e
WHERE e.event_date >= CURRENT_DATE
LIMIT 15
ON CONFLICT (event_id, staff_id) DO NOTHING;

-- Insert test tickets
INSERT INTO tickets (id, venue_id, title, description, status, priority, category, ticket_number, created_at)
VALUES
  ('900e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'LED board showing artifacts', 'Video artifacts on main scoreboard during Knicks game', 'in_progress', 'high', 'hardware', 1001, NOW() - INTERVAL '2 days'),
  ('900e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'Audio delay in suite level', '3 second audio delay reported in luxury suites', 'new', 'medium', 'hardware', 1002, NOW() - INTERVAL '1 day'),
  ('900e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', 'Camera 4 not responding', 'Camera 4 in control room not responding to commands', 'escalated', 'critical', 'hardware', 1003, NOW() - INTERVAL '4 hours')
ON CONFLICT (id) DO NOTHING;

-- Insert KB entries
INSERT INTO kb_entries (id, title, description, issue_type, suggested_fix)
VALUES
  ('a00e8400-e29b-41d4-a716-446655440001', 'LED Panel Dead Pixels', 'Common issue with LED panels showing dead or stuck pixels', 'dead_pixels', '1. Identify affected panel section\n2. Check ribbon cable connections\n3. Replace LED module if needed\n4. Run pixel mapping calibration'),
  ('a00e8400-e29b-41d4-a716-446655440002', 'Audio Sync Issues', 'Audio and video out of sync during live events', 'audio_sync', '1. Check video processor delay settings\n2. Verify audio DSP latency compensation\n3. Adjust sync offset in control software\n4. Test with known-good source')
ON CONFLICT (id) DO NOTHING;

SELECT '✅ Seed complete!' as status;
EOF

echo ""
echo "📍 Now run geocoding to add coordinates to venues:"
echo "   curl -X POST https://your-domain/api/venues/geocode -H 'Content-Type: application/json' -d '{\"limit\": 20}'"
echo ""
echo "🔐 Test user credentials:"
echo "   Email: mike@anc.com"
echo "   Password: changeme123"