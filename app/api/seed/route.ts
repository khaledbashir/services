import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// POST /api/seed - Seed test data (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { confirm } = await request.json().catch(() => ({}))
    
    if (confirm !== 'SEED_DATA') {
      return NextResponse.json({ 
        error: 'Please send { "confirm": "SEED_DATA" } to confirm seeding',
        hint: 'This will add test venues, staff, events, and tickets'
      }, { status: 400 })
    }

    let venuesCreated = 0
    let staffCreated = 0
    let eventsCreated = 0
    let ticketsCreated = 0

    // Seed venues
    const venues = [
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Madison Square Garden', address: '4 Pennsylvania Plaza, New York, NY 10001', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Fenway Park', address: '4 Jersey St, Boston, MA 02215', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'SoFi Stadium', address: '1001 Stadium Dr, Inglewood, CA 90301', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440004', name: 'Wrigley Field', address: '1060 W Addison St, Chicago, IL 60613', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440005', name: 'Yankee Stadium', address: '1 E 161st St, Bronx, NY 10451', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440006', name: 'AT&T Stadium', address: '1 AT&T Way, Arlington, TX 76011', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440007', name: 'Lincoln Financial Field', address: '1 Lincoln Financial Field Way, Philadelphia, PA 19147', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440008', name: 'Lambeau Field', address: '1265 Lombardi Ave, Green Bay, WI 54304', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440009', name: 'Caesars Superdome', address: '1500 Sugar Bowl Dr, New Orleans, LA 70112', type: 'sports' },
      { id: '550e8400-e29b-41d4-a716-446655440010', name: 'T-Mobile Arena', address: '3780 S Las Vegas Blvd, Las Vegas, NV 89109', type: 'sports' },
    ]

    for (const v of venues) {
      const result = await query(
        `INSERT INTO venues (id, name, address, venue_type, requires_assignment, is_active, portal_token)
         VALUES ($1, $2, $3, $4, true, true, encode(gen_random_bytes(8), 'hex'))
         ON CONFLICT (id) DO UPDATE SET address = $3
         RETURNING id`,
        [v.id, v.name, v.address, v.type]
      )
      if (result.rows[0]) venuesCreated++
    }

    // Seed staff
    const staff = [
      { id: '650e8400-e29b-41d4-a716-446655440001', name: 'Mike Johnson', email: 'mike@anc.com', role: 'admin' },
      { id: '650e8400-e29b-41d4-a716-446655440002', name: 'Sarah Chen', email: 'sarah@anc.com', role: 'manager' },
      { id: '650e8400-e29b-41d4-a716-446655440003', name: 'Carlos Rodriguez', email: 'carlos@anc.com', role: 'technician' },
      { id: '650e8400-e29b-41d4-a716-446655440004', name: 'Emily Watson', email: 'emily@anc.com', role: 'technician' },
      { id: '650e8400-e29b-41d4-a716-446655440005', name: 'David Kim', email: 'david@anc.com', role: 'manager' },
      { id: '650e8400-e29b-41d4-a716-446655440006', name: 'Jessica Brown', email: 'jessica@anc.com', role: 'technician' },
    ]

    for (const s of staff) {
      const result = await query(
        `INSERT INTO staff (id, full_name, email, role, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (id) DO UPDATE SET full_name = $2, email = $3
         RETURNING id`,
        [s.id, s.name, s.email, s.role]
      )
      if (result.rows[0]) staffCreated++
    }

    // Link staff to venues
    await query(`
      INSERT INTO staff_venues (staff_id, venue_id) VALUES
        ('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001'),
        ('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002'),
        ('650e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001'),
        ('650e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002'),
        ('650e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440003'),
        ('650e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440004')
      ON CONFLICT (staff_id, venue_id) DO NOTHING
    `)

    // Seed events for next 30 days
    const eventNames = ['Knicks vs Celtics', 'Red Sox vs Yankees', 'Rams vs 49ers', 'Cubs vs Cardinals', 'Yankees vs Red Sox', 'Cowboys vs Eagles', 'Packers vs Bears', 'Saints vs Falcons', 'Golden Knights vs Kings', 'Lakers vs Celtics']
    const leagues = ['NBA', 'MLB', 'NFL', 'NHL', 'NCAAM']
    const statuses = ['pending', 'checked_in', 'game_ready', 'post_game_submitted']

    for (let i = 0; i < 15; i++) {
      const venueId = venues[i % venues.length].id
      const eventName = eventNames[i % eventNames.length]
      const league = leagues[i % leagues.length]
      const eventDate = new Date()
      eventDate.setDate(eventDate.getDate() + (i % 30))
      const status = statuses[i % statuses.length]

      const result = await query(
        `INSERT INTO events (id, venue_id, summary, league, event_date, start_time, workflow_status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '19:00:00', $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [venueId, eventName, league, eventDate.toISOString().split('T')[0], status]
      )
      if (result.rows[0]) eventsCreated++
    }

    // Seed tickets
    const tickets = [
      { venue: '550e8400-e29b-41d4-a716-446655440001', title: 'LED board showing artifacts', priority: 'high', status: 'in_progress' },
      { venue: '550e8400-e29b-41d4-a716-446655440002', title: 'Audio delay in suite level', priority: 'medium', status: 'new' },
      { venue: '550e8400-e29b-41d4-a716-446655440003', title: 'Camera 4 not responding', priority: 'critical', status: 'escalated' },
    ]

    for (const t of tickets) {
      const result = await query(
        `INSERT INTO tickets (id, venue_id, title, description, status, priority, category, ticket_number, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'hardware', nextval('ticket_number_seq'), NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [t.venue, t.title, 'Test ticket for demonstration', t.status, t.priority]
      )
      if (result.rows[0]) ticketsCreated++
    }

    return NextResponse.json({
      success: true,
      message: 'Test data seeded successfully',
      created: {
        venues: venuesCreated,
        staff: staffCreated,
        events: eventsCreated,
        tickets: ticketsCreated,
      },
      note: 'Run POST /api/venues/geocode to add coordinates to venues',
    })
  } catch (err) {
    console.error('Error seeding data:', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}