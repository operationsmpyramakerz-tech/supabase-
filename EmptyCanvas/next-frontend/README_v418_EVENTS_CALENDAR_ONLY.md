# v418 — Consolidate Event Requests into Event Calendar

## Changes
- The Events secondary navigation now contains Calendar, Event Components and Event Team; the duplicate Event Requests page is no longer offered.
- The former `/next/events` page redirects to `/next/events-calendar` (and preserves the `?event=` deep link from bookmarks/notifications).
- New/Edit event wizard is preserved. After saving, cancelling or backing out it returns to Event Calendar.
- For authorized Event Requests staff, Calendar details now offer Edit Event and Cancel Event using the existing permission checks, admin password verification, short-lived action token and server-side row-scope validation.
- Legacy help and notification links to the Events list now target the calendar.

## Compatibility and access
- No database migration; no deletion or modification of event records.
- Existing permissions, access levels and request API authorization requirements are unchanged. The Events Calendar page continues to require Event Calendar access.
- The existing Event Requests permission keys are intentionally retained because creation, editing, confirmation and cancellation rely on them. In particular, accounts with only Event Requests page permission, and without Event Calendar access, should be granted Calendar access explicitly in Users Center rather than silently receiving broader calendar visibility.
- Existing own/team request scopes remain enforced by the backend. The new Calendar Edit/Cancel buttons are shown only for existing full request-view access, so narrower own/team profiles do not inadvertently gain broader visibility. If those profiles need direct edit/cancel from Calendar, a separate scope-aware UI update is needed.

## Validation
- Focused tests: 15/15 pass.
- Full tests: 1180/1217 pass. Exactly the same 37 pre-existing failures as the uploaded original (1175/1212).
- TypeScript JSX syntax parser: no diagnostics in the changed JSX/JS pages.
- No complete Next.js build or live Production validation in this environment (dependencies not installed).
