/**
 * Linking a staff record to the person's Slack account.
 *
 * Joe, 2026-08-18: "for the suggested events can these go to the assigned leads
 * personal slack or does it have to be in the channel?"
 *
 * A direct message needs the lead's Slack user id on their staff row, and when
 * that question was asked exactly one of 189 active staff had one — which is
 * also why the @mentions on the venue-channel notice had been rendering empty.
 * The workspace roster carries everyone's email, and so does the staff table,
 * so the two can be matched without anyone filling in a form.
 *
 * Matching is on email only. A name match would be a guess, and guessing wrong
 * here means one person's schedule notifications going to a different person.
 */
import { query } from '@/lib/db'

export interface SlackMember {
  id: string
  email: string
  name: string
}

/**
 * `users.list` is read with query parameters rather than through the shared
 * `slackApi` POST helper — that helper sends a JSON body, which is the contract
 * for the write methods, and this is the form verified against the workspace.
 */
async function usersList(cursor: string): Promise<any> {
  const token = process.env.SLACK_BOT_TOKEN || ''
  if (!token) throw new Error('SLACK_BOT_TOKEN not set')
  const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

/** Every real person in the workspace — bots, deactivated accounts and Slackbot dropped. */
export async function fetchSlackDirectory(): Promise<SlackMember[]> {
  const members: SlackMember[] = []
  let cursor = ''

  // Bounded so a cursor that stops advancing cannot spin forever.
  for (let page = 0; page < 25; page++) {
    const data = await usersList(cursor)
    if (!data.ok) throw new Error(`slack users.list failed: ${data.error}`)

    for (const member of data.members || []) {
      const email = (member.profile?.email || '').trim().toLowerCase()
      if (!email || member.deleted || member.is_bot || member.id === 'USLACKBOT') continue
      members.push({ id: member.id, email, name: member.profile?.real_name || email })
    }

    cursor = data.response_metadata?.next_cursor || ''
    if (!cursor) break
  }

  return members
}

export interface SlackLinkResult {
  staff_considered: number
  linked: number
  already_linked: number
  no_slack_account: number
  unmatched_emails: string[]
}

/**
 * Fills in `staff.slack_user_ids` from the workspace roster.
 *
 * Only ever writes to a row that has none — a hand-corrected id is never
 * overwritten by a match — so the pass is safe to re-run whenever people join.
 */
export async function linkStaffToSlack(options: { dryRun?: boolean } = {}): Promise<SlackLinkResult> {
  const directory = await fetchSlackDirectory()
  const byEmail = new Map(directory.map((m) => [m.email, m]))

  const staff = await query(
    `SELECT id, full_name, lower(COALESCE(email, '')) AS email,
            COALESCE(array_length(slack_user_ids, 1), 0) AS linked_count
     FROM staff
     WHERE COALESCE(is_active, true) = true`,
  )

  const result: SlackLinkResult = {
    staff_considered: staff.rows.length,
    linked: 0,
    already_linked: 0,
    no_slack_account: 0,
    unmatched_emails: [],
  }

  for (const person of staff.rows) {
    if (Number(person.linked_count) > 0) {
      result.already_linked += 1
      continue
    }
    const match = person.email ? byEmail.get(person.email) : undefined
    if (!match) {
      result.no_slack_account += 1
      if (person.email) result.unmatched_emails.push(person.email)
      continue
    }
    if (!options.dryRun) {
      await query(`UPDATE staff SET slack_user_ids = ARRAY[$2]::text[] WHERE id = $1`, [
        person.id,
        match.id,
      ])
    }
    result.linked += 1
  }

  return result
}
