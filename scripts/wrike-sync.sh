#!/bin/bash
# Nightly Wrike -> dashboard sync (until the team fully cuts over from Wrike).
# Exports tasks created since the last sync window, then runs the idempotent
# importer (routes to design/cg/print/scheduling, dedups by external id).
set -e
cd /root/anc-services
echo "=== wrike-sync $(date -u +%FT%TZ) ==="
/usr/bin/python3 scripts/export-wrike-current.py
npx tsx scripts/import-wrike-airtable.ts 2>&1 | tail -15
echo "=== done $(date -u +%FT%TZ) ==="
