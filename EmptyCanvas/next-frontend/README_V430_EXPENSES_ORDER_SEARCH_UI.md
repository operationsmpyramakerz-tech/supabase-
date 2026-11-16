# ERP Expenses — Order Search UI Fix V430

## Files to replace
Copy the included files to the *same relative paths* under your Next.js project root:

### Production changes
- `components/expenses/ExpensesDialogs.jsx`
  - Removes `autoFocus` from the multi-order search input, so opening the dropdown does not automatically summon the Android keyboard.
  - Uses a search-type field, disables HTML autocomplete/spelling/autocorrection, and adds password-manager ignore hints (best effort; Android keyboard toolbars are controlled by the device and cannot be guaranteed suppressed by web code).
  - Rebuilds the Other reason icon as a 37×37px tile with a 19px pencil icon, aligned with the order cards, and corrects the copy alignment.
- `public/css/expenses-classic-inline.css`
  - Removes orange/native focus decoration and styles focused search input with a neutral parent border, while retaining a visible subtle focus indicator.
  - Aligns manual reason icon/text to the other cards, including small screens.
- `app/expenses/page.jsx`
  - Bumps the CSS cache key to `v430-order-search-ui` to avoid old styles after deployment.

### Regression tests (optional to deploy)
- `tests/expenses-order-search-ui-v430.test.mjs` — new V430 assertions.
- `tests/expenses-order-picker-upward-v429.test.mjs` — cache key assertion update.
- `tests/expenses-choose-order-bottom-sheet-v428.test.mjs` — cache key assertion update.

## Apply
1. Back up the three existing production files.
2. Merge/replace them in the exact paths listed above, keeping other parallel changes if those files were updated separately after the supplied ZIP.
3. Deploy and hard-refresh the Expenses page.
4. On a phone, open Expenses → Cash out → Choose Order → Orders:
   - Dropdown should open upwards **without** focusing the search field or opening the keyboard.
   - Tap the search field to search; there should be no orange rectangle around the input.
   - Other reason should align vertically with ORD cards (same icon tile width and same text indentation).
   - Multi-select, Done and manual reason must still work.

**Browser limitation:** Android/Gboard may show its own autofill or suggestions toolbar after the user *manually taps* the field. Web applications cannot completely turn off OS keyboard controls. `autocomplete="off"`, `autocorrect="off"`, and autofill ignore hints are included as best-effort mitigations.

No database migration and no changes to expense calculations or order persistence.

## Validation
- `node --test tests/expenses-*.test.mjs` — 28/28 passed.
- `ExpensesDialogs.jsx` — TypeScript JSX parser reports 0 syntax diagnostics.
- CSS — PostCSS parse successful.
- Visual/keyboard behavior still requires checking on a physical Android device.
