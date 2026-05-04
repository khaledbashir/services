// NocoDB IDs for the Walkthrough Log build (Joe 2026-05-04, NocoDB chosen
// as canonical for walkthroughs on top of the Airtable retirement migration).
//
// Hard-coded because the IDs are stable in the New York base; refactor to
// env vars only if we ever spin up a second base.

export const NY_BASE_ID = 'pcyjvsvwvhf0tpo'

export const TABLES = {
  walkthroughLog: 'mk2m95l6g73a35y',
  venues: 'm9a2n5hyxvwy5xi',
  displayLocations: 'mlc6f71gnnrqtyf',
  displays: 'mh1566n5k578cbf',
  issues: 'moy7mzg7jism13q',
} as const

// Walkthrough Log columns — see lib/nocodb-ops.ts for the API used to write.
export const WALK_COLS = {
  logId: 'cnni0vbz6rgkyrh',
  technician: 'cvyn3siudf90amj',
  logDate: 'ckel797kvk24ff9',                  // legacy LongText (ISO string)
  logDateDt: 'clbmntxbh739jv7',                // proper DateTime — what views filter on
  type: 'ckn5x9l9r3h66se',                     // SingleSelect: In-Person | Remote
  result: 'cqrkfue0w6m2pbb',                   // SingleSelect: Open Issue Observed | No Action Required | New Issue Detected
  comments: 'cww2pmepjheu4z4',                 // LongText
  threeLetterCode: 'cnkv7wxmumdnmh2',
  attachments: 'cspmptg6ke5h97r',
  venueLink: 'c6ro61sdnhxirgv',                // LinkToAnotherRecord → Venues
  locationsVisitedLink: 'c345a0hqw1shjae',     // LinkToAnotherRecord → Display Locations
  problemDetectedLink: 'cu9el90bdvci9xj',      // LinkToAnotherRecord → Issues
} as const

export const VENUE_COLS = {
  venueName: 'ccd7gsensutxy8m',
  abbreviation: 'c5wzj9nctaolq3r',
  displayLocationsLink: 'ct0q4ld2byjkhvz',
} as const

export const DISPLAY_LOC_COLS = {
  name: 'c3w2dmnl05wmuqb',
  threeLetterCode: 'cne166nprqhri35',
  venueLink: 'cvxlfixy3j5f3en',
  displaysLink: 'c7v82ayvct8fskh',
} as const

export const RESULT_OPTIONS = [
  'Open Issue Observed',
  'No Action Required',
  'New Issue Detected',
] as const
export type WalkthroughResult = typeof RESULT_OPTIONS[number]

export const TYPE_OPTIONS = ['In-Person', 'Remote'] as const
export type WalkthroughType = typeof TYPE_OPTIONS[number]
