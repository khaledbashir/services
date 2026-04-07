# Client Overview: AI Discovery Hint Feature

## What This Feature Is

The AI Discovery Hint feature adds an optional guidance field to ANC's event discovery workflow.

It allows an admin to give the discovery engine a short instruction before running a search, such as:

- "focus on MLB and concerts"
- "search for Bruins, Celtics, and major concerts"
- "ignore minor league games"
- "focus on weekend events only"

This helps discovery become more targeted without removing the existing safety controls.

## Where It Appears

The hint field is available in two places:

1. On the main **Events** page, next to the **Discover Active Venues** button
2. On an individual **Venue** page, inside the **Events** tab next to **Discover Events**

In both places, the field is optional.

If left blank, discovery runs normally.

## What Happens When A Hint Is Used

When a user enters a hint and runs discovery:

1. The hint is sent to the backend discovery API
2. The search engine expands the search set with a hint-aware query
3. The AI discovery prompt includes the hint as a search focus instruction
4. The returned results are still validated, deduplicated, grouped, and reviewed the same way as before

The hint influences what discovery focuses on.

It does **not** override:

- duplicate protection
- official source checks
- trust scoring
- confidence scoring
- manual review/import controls

## Important Guardrail

This is not a raw unrestricted prompt box.

It is a controlled discovery guidance field.

That means:

- the user can guide what the AI should focus on
- the AI still has to find evidence
- the system still prefers trusted sources like Ticketmaster, venue calendars, league schedules, and team sites
- the AI cannot simply invent events because the user typed them

## What The User Sees After Discovery

Once discovery finishes:

- the completion summary card shows the result count
- the Discovery Center opens with grouped venue results
- the active hint is shown in the summary/modal so the user can see what instruction was used

This creates a clear audit trail for why a particular run may have focused on certain event types, leagues, or teams.

## Why This Is Useful

This feature is helpful when the client wants discovery to focus on a particular business need, for example:

- finding sports events before staffing meetings
- focusing on concerts for premium event support planning
- looking for one team, league, or category during busy periods
- quickly re-running discovery with a narrower instruction when the first pass is too broad

## Example Use Cases

### Example 1

Hint:

`focus on MLB and concerts`

Expected behavior:

- discovery prioritizes baseball and concert-related search evidence
- results may still include other relevant events if evidence is strong

### Example 2

Hint:

`search for Red Sox, Bruins, and major concerts`

Expected behavior:

- discovery gives more attention to those teams and event types
- duplicate checks and trust scoring still apply

### Example 3

Hint:

`ignore minor league games`

Expected behavior:

- discovery should deprioritize minor league matches during search and normalization
- if strong evidence still exists for a relevant major event, it can still return it

## What This Means For The Client

The client now has a lightweight way to "steer" the AI search without needing engineering help for every custom search pass.

This makes the system more flexible while keeping the workflow safe, reviewable, and operationally controlled.

## Summary

The AI Discovery Hint feature gives the user a simple way to tell discovery what to focus on.

It improves flexibility, keeps trust controls intact, and makes discovery more useful for real operational scenarios without turning the system into an unsafe free-form prompt workflow.
