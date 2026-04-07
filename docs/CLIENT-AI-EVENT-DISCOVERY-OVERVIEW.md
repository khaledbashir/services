# Client Overview: AI Event Discovery

## What This Feature Is

AI Event Discovery is ANC's workflow for finding upcoming events automatically instead of relying only on manual entry.

The system searches public event sources, turns what it finds into structured event rows, flags likely duplicates, and gives the team a review screen before import.

This helps ANC:

- reduce manual event entry
- catch missing events earlier
- focus staffing attention on real upcoming work
- review discovery results from one dashboard instead of checking many websites manually

## What Problem It Solves

Before this feature, event creation depended heavily on manual input and inconsistent external sync behavior.

That created a few common problems:

- events could be missed
- staffing planning could start too late
- admins had to search multiple sites manually
- there was no clean review workflow for imported event candidates

AI Event Discovery addresses that by combining search, normalization, trust scoring, duplicate detection, and human review.

## Where It Lives

The feature appears in two main places:

1. **Events page**
   This is the master discovery workflow. It can search across all active venues and open the Discovery Center for review.

2. **Venue page**
   This is the focused single-venue workflow. It lets an admin search only one venue and review the results there.

## How Discovery Works

At a high level, the system works like this:

1. The user starts discovery from the Events page or a Venue page
2. The system identifies which venue or venues should be searched
3. It searches public event sources such as:
   - Ticketmaster
   - official venue calendars
   - team websites
   - league schedules
4. AI converts those search findings into structured event candidates
5. The system scores the trust level of each result
6. It checks the new candidates against existing events to flag duplicates
7. The user reviews the results in a dashboard/modal
8. The user imports selected rows into the event system

## Discovery Window

The current discovery window is:

- **today through the next 60 days**

That means discovery is not trying to find events indefinitely into the future.

It is focused on the near-term operating window where scheduling and staffing matter most.

## What Gets Searched

The system searches across multiple public source types rather than relying on one single feed.

Examples include:

- Ticketmaster event listings
- venue calendar pages
- team schedule pages
- league schedule pages

This multi-source approach improves coverage and gives the system more than one way to find the same event.

## Discovery Hint

The feature also supports an optional **Discovery Hint** field.

This lets an admin guide the search with a simple instruction, for example:

- `focus on MLB and concerts`
- `search for Bruins, Celtics, and major concerts`
- `ignore minor league games`

The hint helps focus the search, but it does not override the trust and review safeguards.

## What The User Sees While Discovery Runs

While discovery is in progress, the user sees a live loading state with a polished transparent loader.

This makes the wait state clearer and shows that discovery is actively working rather than frozen.

## What The User Sees When Discovery Finishes

When discovery is complete, the user sees a completion summary with counts such as:

- how many venues were searched
- how many results were found
- how many rows are importable
- how many are high confidence
- how many were flagged as duplicates

This gives the user immediate visibility into what happened before opening the review modal.

## Discovery Center

The Events page includes a bulk review interface called the **Discovery Center**.

This is the main review dashboard for discovery across multiple venues.

It includes:

- grouped results by venue
- counts per venue
- batch selection controls
- filters
- duplicate visibility
- high-confidence visibility
- source evidence
- import actions

This turns discovery into a controlled review workflow instead of a blind import.

## Trust and Evidence Layer

One of the most important parts of the feature is that it does not treat every AI result equally.

Each result now includes a trust layer built around:

- **match type**
  - `official_source`
  - `ai_inferred`
- **source URL**
- **source domain**
- **matched query**
- **evidence snippet**
- **trust score**
- **trust reasons**

This makes it possible to distinguish between:

- a result that came from a strong official source
- a result that the AI inferred from weaker or less direct evidence

## Official Source vs AI Inferred

This distinction is the foundation of the trust model.

### Official Source

An event is treated as official-source-backed when the system can tie it to a real recognized source such as:

- Ticketmaster
- a league schedule domain
- a venue calendar
- a team website

### AI Inferred

An event is treated as AI-inferred when the model believes the event is likely real, but the source evidence is weaker or not tied to a clear official source URL.

These results can still be useful for review, but they should be treated more cautiously.

## High Confidence and Auto-Import Logic

The system marks some rows as **high confidence** based on trust and evidence.

Importantly:

- high confidence is not just an AI opinion
- it is based on evidence, source type, and trust scoring

Auto-import behavior is intentionally stricter:

- only official-source-backed matches are eligible
- duplicate checks still apply
- confidence and trust thresholds still apply

This keeps automation useful without making it reckless.

## Duplicate Protection

Before a discovered event is imported, the system checks it against events already in the database.

It looks for things like:

- same date and start time
- same normalized summary
- strong similarity to an existing event on the same date

Rows that look like duplicates are flagged for review and are not treated as normal import candidates.

## AI Imported Visibility

Once events are imported, the main Events page gives visibility into which events came from AI discovery.

This includes:

- an **AI Imported** filter
- AI badges in the event UI

That makes it easier for admins to review or isolate discovery-created events later.

## What Happens During Import

When an event is imported from discovery:

- it becomes a real event record in the system
- it keeps its event type and discovery source information
- it enters the workflow with a normal operational status
- the events list refreshes so the user can see the imported result

The goal is for imported events to feel like normal events in the system, but still remain visible as discovery-originated items when needed.

## Why This Feature Matters To The Client

This feature gives the client a much more practical operating workflow.

Instead of asking someone to constantly monitor venue calendars and ticket sites manually, the system now:

- searches proactively
- surfaces likely real events
- shows evidence
- flags duplicates
- lets the user review before import
- keeps visibility after import

That improves both speed and confidence.

## What Makes This Different From A Simple AI Search Box

This is not just a chatbot guessing what events might exist.

It is a structured operational system with:

- source-aware discovery
- AI normalization
- trust scoring
- duplicate checks
- review controls
- import controls
- post-import visibility

That difference is important because it means the feature is designed for operational use, not just experimentation.

## Summary

AI Event Discovery is a reviewed, evidence-aware workflow for finding, evaluating, and importing upcoming events.

It helps ANC discover missing events earlier, gives staff a better review experience, improves visibility into what was found and imported, and adds trust signals so the client can understand why a result appeared and how strongly it should be trusted.
