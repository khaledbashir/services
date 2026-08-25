-- Backfill for the Venue Reference build (2026-08-25).
--
-- Two jobs, both about not starting from zero.
--
-- 1. venue_phone_numbers. The dashboard is meant to recognise a caller and
--    offer "Go to [Venue]". Learning that from scratch means the feature is
--    useless for months — and it does not have to be: hundreds of tickets
--    already carry a real caller number AND the venue a human filed them
--    against. That mapping was written by hand, one ticket at a time, and it
--    is sitting there. Rows land as origin='backfill' so the picker ranks them
--    below a human-confirmed link and nobody mistakes an inference for a
--    decision.
--
-- 2. equipment. A shared library nobody can see into is a shelf nobody uses.
--    The display specs on file name real gear, so those models seed the
--    catalog and there is something to attach manuals to on day one. Demo rows
--    are skipped — seeding fake gear to look busy is how a reference nobody
--    trusts gets built.
--
-- Idempotent. Run it again whenever more tickets have landed.
--
--   docker exec anc-services-db-standalone \
--     psql -U ancservices -d anc_services -f /tmp/backfill-venue-reference.sql

\set ON_ERROR_STOP on

-- The same normalisation as normalizePhone() in lib/venue-reference.ts:
-- 11 digits starting with 1 loses the country code, 10 digits pass through,
-- anything else is not a usable number (the literal "Unknown" the phone system
-- sends when it has no caller ID lands here).
CREATE OR REPLACE FUNCTION anc_normalize_phone(raw TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN length(regexp_replace(raw, '\D', '', 'g')) = 11
         AND left(regexp_replace(raw, '\D', '', 'g'), 1) = '1'
      THEN right(regexp_replace(raw, '\D', '', 'g'), 10)
    WHEN length(regexp_replace(raw, '\D', '', 'g')) = 10
      THEN regexp_replace(raw, '\D', '', 'g')
    ELSE NULL
  END
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO venue_phone_numbers (phone, venue_id, caller_name, call_count, last_seen_at, origin)
SELECT phone,
       venue_id,
       (ARRAY_REMOVE(ARRAY_AGG(contact_name ORDER BY last_seen DESC), NULL))[1],
       SUM(calls)::int,
       MAX(last_seen),
       'backfill'
  FROM (
    SELECT anc_normalize_phone(t.contact_phone) AS phone,
           t.venue_id,
           NULLIF(TRIM(t.contact_name), '')     AS contact_name,
           COUNT(*)                             AS calls,
           MAX(t.created_at)                    AS last_seen
      FROM tickets t
     WHERE t.venue_id IS NOT NULL
       AND t.contact_phone IS NOT NULL
       AND t.contact_phone <> ''
     GROUP BY 1, 2, 3
  ) s
 WHERE phone IS NOT NULL
 GROUP BY phone, venue_id
-- A link a human already confirmed keeps its status. This only fills in what
-- nobody has said anything about, and never walks a count backwards.
ON CONFLICT (phone, venue_id) DO UPDATE
   SET call_count  = GREATEST(venue_phone_numbers.call_count, EXCLUDED.call_count),
       last_seen_at = GREATEST(venue_phone_numbers.last_seen_at, EXCLUDED.last_seen_at),
       caller_name = COALESCE(venue_phone_numbers.caller_name, EXCLUDED.caller_name);

INSERT INTO equipment (category, manufacturer, model, description)
SELECT DISTINCT 'led_display',
       TRIM(vs.manufacturer),
       TRIM(vs.model),
       'Seeded from display specs already on file.'
  FROM venue_screens vs
 WHERE vs.manufacturer IS NOT NULL AND TRIM(vs.manufacturer) <> ''
   AND vs.model IS NOT NULL AND TRIM(vs.model) <> ''
   AND vs.manufacturer !~* '^anc demo'
ON CONFLICT DO NOTHING;

-- What the run produced.
SELECT 'number/venue pairs'        AS metric, COUNT(*)::text AS value FROM venue_phone_numbers
UNION ALL
SELECT 'distinct caller numbers',  COUNT(DISTINCT phone)::text FROM venue_phone_numbers
UNION ALL
SELECT 'numbers covering >1 venue',
       COUNT(*)::text FROM (
         SELECT phone FROM venue_phone_numbers GROUP BY phone HAVING COUNT(*) > 1
       ) m
UNION ALL
SELECT 'venues reachable by phone', COUNT(DISTINCT venue_id)::text FROM venue_phone_numbers
UNION ALL
SELECT 'equipment models in catalog', COUNT(*)::text FROM equipment;
