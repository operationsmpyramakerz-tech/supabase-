# v402 — Production Receiving: compact inline Edit (v401 baseline)

## Changes

- `All Components` is now a read-only overview; the Edit action is absent there.
- Editing is available in `Remaining to Receive` and `Received` only when the existing stage and tab-specific permissions allow it. The server audit and authorization remain unchanged.
- Edit pencil is a compact, consistent icon-only button. On activation, **only the Received quantity cell** changes to a small input; Required, Remaining, product photo and editor avatars remain in their original row.
- Save (check) and Cancel (X) are small icon-only actions beside the quantity, with accessible labels, keyboard Enter/Escape handling and disabled states while saving.
- For narrow mobile screens, component rows scroll horizontally within the expanded Kit group rather than putting the edit form on a new line.
- Existing validation, optimistic status messages, after-save reload, and History remain unchanged; this release has no SQL or dependency changes.

## Deploy

Replace `components/preparing/ProjectProductionIntake.jsx` and `public/css/projects-preparing.css` within the Next.js app. Tests and this README are optional to deploy.

## Validate

1. Open Production Receiving → All Components: no Edit buttons.
2. Open Remaining to Receive or Received with editing access and tap the pencil. The small Received input, Save and Cancel buttons should stay on the same row.
3. Cancel, then edit and save a quantity. Verify updated counters and audit history.
4. Verify a user denied edit permission on a given tab sees no Edit action there.
5. Test on desktop, tablet and a narrow phone viewport before production rollout.

Run: `node --test tests/projects-preparing-v402-intake-inline-edit.test.mjs tests/projects-preparing-v401-intake-layout.test.mjs tests/projects-preparing-v392-stage-tab-edit.test.mjs`

No production build or deployment was performed by this package.
