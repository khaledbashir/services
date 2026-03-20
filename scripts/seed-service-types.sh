#!/bin/bash
# Seed service types into the database
# Usage: When Joe sends his list of contracted services, just add them below and run:
#   bash scripts/seed-service-types.sh
#
# Format: One service per line as "Name|Description"
# The script will skip any that already exist (ON CONFLICT DO NOTHING)

DB_CONTAINER=$(docker ps -q -f name=abc_ancdb)

SERVICES=(
  "Full Service|Complete on-site technical support for all events"
  "On-Call Support|Remote/on-call support only — no on-site assignment required"
  "LED Maintenance|Scheduled LED display maintenance and monitoring"
  "Content Management|Digital signage and content updates"
  "Hardware Support|Hardware installation and repair"
  # ADD JOE'S SERVICES BELOW THIS LINE
  # "New Service Name|Description of what it covers"
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
