# Alison Media & Partnerships Build Checklist

Updated: 2026-05-22

Goal: track what is actually ready for the HubSpot retirement and Alison's marketing workflow, without overstating what still needs build/configuration.

## Current Readiness Snapshot

- [x] CRM is live at `https://crm.ancsports.net`
- [x] ANC Forms is live at `https://forms.ancsports.net`
- [x] Postiz is live at `https://abc-postiz.izcgmb.easypanel.host`
- [x] Postiz Slack publishing is connected as `ANC Postiz Test`
- [x] Marketing Hub is deployed at `https://services.ancsports.net/marketing-hub`
- [x] Newsletter audience/campaign/reporting tables are live
- [x] Newsletter builder, test-send, scheduling, open tracking, click tracking, unsubscribe endpoint, and cron runner exist
- [x] Form routing rule management exists inside Marketing Hub
- [x] Social draft/status surface exists inside Marketing Hub
- [x] HubSpot private app access is configured locally
- [x] Full HubSpot export/audit is complete
- [x] HubSpot Marketing Hub import is complete for contacts, audiences, suppression lists, form routes, and recent newsletter references
- [ ] LinkedIn account connected in Postiz
- [ ] X account connected in Postiz
- [ ] Instagram account connected in Postiz
- [x] Website form division-lead notification sender wired into the Forms app
- [x] Salesforce/new CRM automatic marketing eligibility sync implemented locally
- [x] Bounce webhook/provider suppression tracking implemented locally
- [x] Forms app division-lead notification helper implemented locally
- [x] Reusable Alison newsletter/social template library implemented locally
- [x] Formal newsletter/social approval workflow implemented locally
- [x] HubSpot form submission history import/timeline archive implemented locally
- [x] Dashboard imported-bucket patch is committed on `codex/option-b-client-model`
- [x] Marketing eligibility sync deployed and dry-run verified in production
- [ ] Marketing eligibility sync scheduled in production
- [x] Bounce webhook endpoint deployed and protected in production
- [ ] Bounce webhook endpoint configured in provider and verified with a live provider event
- [ ] Forms app division-lead notifications verified with live submissions
- [x] Template library/approval workflow/form history deployed and API-smoke-verified in production

## HubSpot Backup And Import

Audit folder:

`/root/anc-hubspot-audit/2026-05-21T21-02-35-968Z-full-export`

Checked:

- [x] Contacts exported: 22,575 complete records in `crm-contacts-batch.jsonl`
- [x] Companies exported: 15,780 complete records
- [x] Deals exported: 7,365 complete records
- [x] Owners exported: 154
- [x] Subscription definitions exported: 2
- [x] Lists exported: 69
- [x] Key list memberships exported: 98,184 rows
- [x] Forms exported: 16
- [x] Corrected form submissions exported: 750
- [x] Marketing emails exported: 58
- [x] Detailed email assets saved: 31
- [x] Campaigns exported: 20
- [x] Legacy social channels exported: 5
- [x] Legacy broadcasts exported: 28
- [x] CMS/file manager assets exported: 1,201
- [x] Landing pages exported: 24
- [x] Site pages exported: 8
- [x] Blog posts exported: 14
- [x] Automation v4 flows exported: 38
- [x] Automation v3 workflows exported: 36
- [x] Migration summary, import status, and crosswalk docs created
- [x] Pre-import DB backup created: `pre-import-marketinghub-backup-20260521T213635Z.sql`
- [x] Pre-form-submission import DB backup created: `pre-form-submission-import-20260521T224740Z.sql`

Do not use:

- [ ] `crm-contacts.jsonl` as the final contact backup. It is partial from an early search attempt; use `crm-contacts-batch.jsonl`.

## Alison Requirement 1: Newsletter Contact List

Alison ask: new Salesforce leads should automatically be added to the monthly newsletter list, with a way to mark contacts as marketing or non-marketing.

Checked:

- [x] Normalized HubSpot marketing contact file created: `normalized-marketing-contacts.jsonl`
- [x] Unique marketing-relevant emails normalized: 22,552
- [x] HubSpot-migrated marketing contacts imported into ANC Marketing Hub: 22,552
- [x] Total `marketing_contacts`: 22,554 including 2 existing test contacts
- [x] HubSpot source/list provenance is preserved in contact metadata
- [x] `Media & Partnerships Newsletter` audience exists
- [x] `Media & Partnerships Newsletter` is live-send-safe with 3,884 active members
- [x] Full HubSpot audit audiences were preserved as separate `HubSpot - ...` audiences
- [x] Do-not-market, unsubscribe, hard-bounce, and non-marketing states were imported

Not done:

- [x] New CRM/Twenty eligibility sync route is deployed at `/api/cron/marketing-eligibility-sync`
- [x] New CRM/Twenty eligibility sync dry run returned `200` in production
- [ ] New CRM/Twenty eligibility sync is not scheduled yet
- [ ] Person/contact-level marketing status field in CRM UI is not verified as a first-class operator control
- [ ] Candidate review workflow for contacts that can become marketing is not built yet

Demo-safe claim:

"The HubSpot newsletter audiences and suppression lists are backed up and imported. The main Media & Partnerships newsletter audience is filtered for safe sending."

Do not claim yet:

"New Salesforce leads automatically enter the new newsletter list."

## Alison Requirement 2: Newsletter Reporting

Alison ask: opens, clicks, unsubscribes, bounces, and the reporting they used in HubSpot.

Checked:

- [x] Newsletter campaign/reporting tables are live
- [x] Send/test/schedule flow exists
- [x] Open tracking exists
- [x] Click tracking exists
- [x] Unsubscribe endpoint exists
- [x] Scheduled-send cron exists
- [x] 6 recent HubSpot newsletter/email references imported with status `hubspot_imported_reference`
- [x] Imported HubSpot newsletter references will not be sent by cron

Not done:

- [x] Bounce/complaint/unsubscribe webhook handler is deployed at `/api/webhooks/marketing-email-events`
- [x] Bounce webhook rejects unauthenticated events with `401` in production
- [ ] Bounce webhook is not configured in the provider dashboard yet
- [ ] Bounce webhook is not verified with a live provider event yet
- [x] Alison-facing reusable template library is implemented locally
- [ ] Imported historical HubSpot email performance metrics are not fully recreated in the new dashboard yet
- [x] Local dashboard patch for imported/suppressed/non-marketing/candidate buckets is committed
- [x] Dashboard patch is deployed and authenticated API smoke test returned `200`

Demo-safe claim:

"Marketing Hub can create, test, schedule, and track newsletters. HubSpot's recent newsletter assets are imported as references, not live sends."

## Alison Requirement 3: Website Forms

Alison ask: list current ANC website forms, who each form should notify, and rebuild/reroute forms into the new CRM workflow.

Checked:

- [x] Forms app is live
- [x] HubSpot form definitions exported: 16
- [x] HubSpot form submissions exported: 750
- [x] `Contact Form 2026` identified as the current main form with 621 submissions
- [x] HubSpot form routes imported into `marketing_form_routing_rules`
- [x] `Contact Form 2026` route is active and assigned to Alison as the holding owner
- [x] Older/archive HubSpot forms imported inactive for review
- [x] Forms app supports CRM targets and public `/f/{id}` URLs

Not done:

- [ ] Website embed inventory is not fully mapped against current ANC site pages
- [x] Shared form notification helper is deployed into design request, print request, and parts order submissions
- [ ] Live form submission notification test is not verified yet
- [ ] Division lead owner map is not finalized
- [ ] Salesforce write-back from form submission is not verified
- [x] HubSpot submission history import route and Marketing Hub timeline/archive are deployed
- [x] HubSpot form submission history imported into Marketing Hub archive: 668 submissions with usable email; 82 submissions skipped because HubSpot did not provide usable email
- [x] Existing Twenty CRM people matched by email and received HubSpot form timeline notes: 96 notes linked
- [x] Orphan notes from failed attach attempts were soft-deleted; active orphan HubSpot form notes: 0

Demo-safe claim:

"The HubSpot forms and submissions are backed up, and the form routing map is imported for rebuild."

Do not claim yet:

"Forms already notify the right division lead."

## Alison Requirement 4: Social Media Accounts

Alison ask: connect official X, Instagram, LinkedIn, and Slack for posting/scheduling.

Checked:

- [x] Postiz is live
- [x] Slack integration is connected
- [x] Slack publishing/scheduling flow has worked
- [x] HubSpot legacy social channels exported: 5
- [x] HubSpot legacy broadcasts exported: 28
- [x] Marketing Hub social draft/status table exists

Not done:

- [ ] LinkedIn is not connected in Postiz
- [x] LinkedIn OAuth credentials are installed on the running Postiz service; connect flow no longer sends `client_id=undefined`
- [ ] LinkedIn account/page authorization in Postiz is still pending
- [ ] LinkedIn Community Management API access is requested but not approved yet
- [ ] X is not connected in Postiz
- [ ] Instagram is not connected in Postiz
- [ ] One scheduled draft per official platform is not verified
- [ ] CRM campaign to Postiz status write-back is not built

Demo-safe claim:

"Slack is connected in Postiz. LinkedIn, X, and Instagram still need official authorization."

Technical note:

Postiz expects `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. The LinkedIn app must allow `https://abc-postiz.izcgmb.easypanel.host/integrations/social/linkedin` and `https://abc-postiz.izcgmb.easypanel.host/integrations/social/linkedin-page` as redirect URLs.

## Alison Requirement 5: Approval Process

Alison ask: internal test approval before newsletters, and Slack/email approval for social.

Checked:

- [x] Current approval pattern captured: newsletter test goes to Jerry, Kirsten, Joe, Jireh, and John
- [x] Current social approval pattern captured: Slack or email approval in advance
- [x] Newsletter test-send capability exists

Not done:

- [x] Formal approval step is implemented locally in Marketing Hub
- [x] Social approval queue/status workflow is implemented locally
- [x] Default approver group is stored on approval requests: Jerry, Kirsten, Joe, Jireh, John
- [x] Approval workflow is deployed and authenticated API smoke test returned `200`

Demo-safe claim:

"The current approval process is documented and can be rebuilt around test sends and draft approval."

## Alison Requirement 6: Branding/Templates

Alison ask: preserve HubSpot templates, logos, colors, example campaigns, and set up reusable newsletter/social templates.

Checked:

- [x] HubSpot marketing emails exported
- [x] 31 detailed email assets saved
- [x] Priority recent newsletter assets saved:
  - May 2026 published
  - June 2026 draft
  - April 2026 published
  - March 2026 announcement
- [x] HubSpot file manager assets exported: 1,201
- [x] CMS landing pages, site pages, and blog posts exported
- [x] Postiz image generation/design tooling exists

Not done:

- [x] Reusable native newsletter templates are deployed
- [x] Reusable social templates are deployed
- [ ] Brand asset library is not curated into the new UI yet
- [ ] Alison has not reviewed/approved updated template direction

Demo-safe claim:

"The source HubSpot assets are backed up and can be used as the reference set for new templates."

## Workflow/Automation Rebuild

Checked:

- [x] HubSpot automation exported through v4 flows and v3 workflows
- [x] Key rebuild targets identified:
  - `Set New SFDC Contacts as Marketing Contacts`
  - `Set as Marketing Contact`
  - `Unengaged, Disqualified, or Unsubscribed Contacts - Mark as Non-Marketing`
  - `New Contact Assignment and Form Notification`
  - `Send to Salesforce Update Contact Status`
  - `Set Lifecycle Stage from Contact Status`
  - `When Send to Salesforce = No, Contact Status = Disqualified`
  - `Assign Contact Values to Company after Form Submissions and Assignment`

Not done:

- [x] CRM/Twenty eligibility sync job route is built locally
- [x] Suppression/non-marketing handling is built locally for CRM sync and email-provider webhook events
- [x] Form notification routing is built locally for Forms app submissions
- [ ] CRM/Twenty eligibility sync job is not scheduled in production yet
- [ ] Provider bounce webhook is not configured in production yet
- [ ] Form notification routing is not live-verified yet
- [ ] Contact status/lifecycle normalization is not rebuilt

## What To Keep

- [x] Full audit folder
- [x] `AUDIT-SUMMARY.md`
- [x] `MIGRATION-MAP.md`
- [x] `IMPORT-STATUS.md`
- [x] Complete batch CRM backups
- [x] Owners, schemas, lists, forms, email, campaign, social, CMS, and automation exports
- [x] Normalized working files
- [x] Import SQL/CSV files
- [x] Pre-import DB backup

## What To Trash Or Ignore For Now

- [ ] Do not delete any audit/export data yet
- [ ] Treat `crm-contacts.jsonl` as partial/ignore for final backup purposes
- [ ] Treat archived HubSpot forms as inactive reference until ANC confirms current use
- [ ] Treat HubSpot legacy social data as archive only, not proof Postiz platforms are connected
- [ ] Do not clean the 713 VS Code source-control files blindly; separate real source changes from untracked nested projects, screenshots, recordings, PDFs, and generated artifacts first

## Next Systematic Steps

1. Deploy the Marketing Hub commits to the production branch/service.
2. Add production cron for `/api/cron/marketing-eligibility-sync`.
3. Configure provider webhook to call `/api/webhooks/marketing-email-events`.
4. Run HubSpot submission import from Marketing Hub or `/api/marketing/forms/submissions/import-hubspot`.
5. Live-test Forms app notifications with one design/print/parts submission.
6. Verify template create/use, approval request/approve, and approved newsletter scheduling in production.
7. Rebuild active website forms from HubSpot definitions.
8. Connect LinkedIn, X, and Instagram in Postiz.
9. Verify one scheduled draft per social platform.
