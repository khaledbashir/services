#!/bin/bash
# Seed service types into the database
# Usage: When Joe sends his list of contracted services, just add them below and run:
#   bash scripts/seed-service-types.sh
#
# Format: One service per line as "Name|Description"
# The script will skip any that already exist (ON CONFLICT DO NOTHING)

DB_CONTAINER=$(docker ps -q -f name=abc_ancdb)

SERVICES=(
  "White Glove Maintenance|Proactive scheduled maintenance with premium response SLA"
  "Break/Fix Maintenance|Reactive repair dispatch when something breaks"
  "Event Support|On-site technical support during events — events at this venue must be assigned to staff"
  "Walkthroughs|Scheduled venue walkthroughs and inspections"
  "Operations|Day-to-day operational support and coordination"
  "Scheduling|Shift scheduling and staff dispatch for this venue"
  "Tech Support|Remote / on-call technical support"
  "LiveSync|LiveSync product — live content / scoreboard sync"
  "VisionStats|VisionStats product — statistics integration for displays"
  "Parts|Parts inventory and fulfillment for this venue"
)

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name desc <<< "$entry"
  docker exec "$DB_CONTAINER" psql -U ancdb ancdb -c \
    "INSERT INTO service_types (name, description) VALUES ('$name', '$desc') ON CONFLICT (name) DO NOTHING;" \
    2>/dev/null
  echo "  ✓ $name"
done

echo ""
echo "Done. Service types seeded."
