# v401 – Production Receiving stage UX (v400 baseline)

## Included changes
- New outlined engineering icon in the title, short subtitle and responsive layout.
- Single project-receiving progress percentage and genuine Received / Required units, replacing the three summary tiles.
- Stage Sign-off displayed alongside progress in a white card, with a green Close Stage action; all existing close-stage verification and permissions remain unchanged.
- White status-tabs surface with solid-black active tab; compact icon-only download and edit controls.
- Colored, clearly separated Kit groups with independent component-row borders, no component count below the group name.
- Compact square product thumbnails sourced from actual ERP product images. Clicking an existing image opens a keyboard-accessible read-only preview (Escape to close; arrow keys when multiple photos).
- Editor avatar stacks are generated from the real intake audit ledger and ERP team-member public profile photos. Names remain in accessible labels/tooltips; initials are shown when there is no photo. The migration opening balance is not represented as a real editor.
- All quantity validations, tab-specific permissions, signed stage closure, export behavior and audit history are preserved.

## Deploy
Replace the three application files with the matching paths from this archive. The archive also includes this README and a regression test. No database migration, new dependency or environment variable is required.

## Testing
`node --test tests/projects-preparing-v401-intake-layout.test.mjs tests/projects-preparing-v388-production-intake.test.mjs tests/projects-preparing-v393-production-gated-testing.test.mjs`

**Important:** The design is data-driven: components without product photos or team members without public profile photos display fallback icons/initials. The product catalog may take longer to load when uncached. Verify visually on tablet/mobile and validate stage permissions with a non-admin account before wide rollout. No production environment was modified by these files.
