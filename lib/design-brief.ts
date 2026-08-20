/**
 * Is a design brief good enough for a designer to actually start work?
 *
 * Charlie, 2026-08-19, reading real tickets: "how do you create something that
 * says courtside and backstage things should be static? ... I can't create
 * anything with no detail." Daniel Croci asked for the same control in April —
 * "forced-brief gating, block save until the brief is filled" — and it was
 * parked. Two people arrived at the same problem from opposite ends of the
 * business, so this is the fix for both.
 *
 * The cost is real and one-directional: a vague brief does not fail loudly, it
 * turns into two or three revision rounds, and graphics is already work ANC
 * does at a loss. Catching it at intake is the only cheap moment.
 *
 * Grounded in the actual corpus (20,506 tickets): the 2026 average brief runs
 * 879 characters and the useless tail is at or under 60. The thresholds below
 * sit well beneath the average on purpose — this rejects "Create courtside",
 * not a terse but genuine instruction.
 *
 * Deliberately free of imports so the rule is a pure function that can be
 * pinned by a test without booting the database.
 */

export type DesignBriefInput = {
  /** The creative direction — what to make and how. */
  notes?: string | null
  /**
   * The client's own words, kept verbatim — normally the request email pasted
   * in whole. Counts as direction in its own right: when an account manager
   * summarises, detail is lost between the inbox and the ticket, and the
   * summary is the only thing a designer ever sees.
   */
  clientBrief?: string | null
  /** Which boards / screens the work is for. */
  boardsRequested?: string | null
  /** Board dimensions or pixel specs. */
  sizesRequested?: string | null
  /** Where the supplied assets live. */
  projectFileLocation?: string | null
}

export type DesignBriefAssessment = {
  complete: boolean
  /** Human-readable, each naming the missing thing in the requester's words. */
  missing: string[]
  /** Characters of real direction left after links are stripped. */
  directionLength: number
}

/**
 * Shortest creative direction that can still tell a designer what to do.
 * "Swap the Kia logo on the courtside table, keep everything else" is 61.
 * "Create courtside" is 16. The line sits between them.
 */
export const MIN_DIRECTION_CHARS = 40

/**
 * Text left beside a link that is still just a label, not direction — the old
 * tracker's rows read `Wrike: <url>`, leaving six characters behind.
 */
export const LABEL_RESIDUE_CHARS = 15

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi
/** Windows/Mac asset paths pasted in place of an actual brief. */
const PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\|\/Volumes\/)\S+/g

/** Does the text carry a link or a file path at all? Stateless by construction. */
function hasReference(raw: string | null | undefined): boolean {
  const text = String(raw || '')
  return new RegExp(URL_PATTERN.source, 'i').test(text) || new RegExp(PATH_PATTERN.source).test(text)
}

/** The brief text with links and bare file paths removed. */
export function stripReferences(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(URL_PATTERN, ' ')
    .replace(PATH_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Every place a designer could read direction from, as one string.
 *
 * The pasted client email and the account manager's notes are both direction;
 * either alone can carry the whole brief, and a thin summary sitting beside a
 * full pasted email is complete even though the summary is not.
 */
function directionSources(input: DesignBriefInput): string {
  return [input.clientBrief, input.notes]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n\n')
}

export function assessDesignBrief(input: DesignBriefInput): DesignBriefAssessment {
  const missing: string[] = []

  // A ticket carrying only a link is the single most common empty brief — it is
  // exactly what the old tracker's sync leaves behind, and a designer opening it
  // learns nothing. Such a ticket usually keeps a short label ("Wrike:",
  // "Assets:"), so anything under LABEL_RESIDUE_CHARS beside a reference is
  // still just a link, and saying so is more useful than "too short".
  const briefText = directionSources(input)
  const direction = stripReferences(briefText)
  const carriesReference = hasReference(briefText)
  if (direction.length === 0 && !present(briefText)) {
    missing.push('Creative direction — what should be designed, and how.')
  } else if (carriesReference && direction.length < LABEL_RESIDUE_CHARS) {
    missing.push('Creative direction — this brief is only a link. Say what should be made.')
  } else if (direction.length === 0) {
    missing.push('Creative direction — what should be designed, and how.')
  } else if (direction.length < MIN_DIRECTION_CHARS) {
    missing.push(
      'Creative direction — too short to work from. Describe the treatment, not just the subject.',
    )
  }

  // Boards and their dimensions: either field answers "what am I building for",
  // so one is enough. Demanding both would reject legitimate tickets.
  if (!present(input.boardsRequested) && !present(input.sizesRequested)) {
    missing.push('Board specs — which boards this is for, or their sizes.')
  }

  // Assets can be named in the direction itself ("assets are located here") or
  // recorded in the location field. Only complain when neither exists.
  const mentionsAssets = /asset|artwork|logo|supplied|provided|attach|footage|photo|image/i.test(
    briefText,
  )
  if (!present(input.projectFileLocation) && !mentionsAssets && !carriesReference) {
    missing.push('Assets — where the supplied files are, or a note that none are needed.')
  }

  return { complete: missing.length === 0, missing, directionLength: direction.length }
}
