# Projects Preparing — v225 folder design & Products access compatibility

Base: `supabase--main-224.zip`.

## What changed
1. Project folders and school folders now share the Proposals orange/black file-folder design: layered paper artwork, compact 218×204 px desktop cards, responsive mobile cards, truncation and hover/focus effects.
2. Matching folder interaction: click to enter, long press (550ms) or right-click / Shift+F10 / context-menu key to open an actions menu; explicit three-dots button for touch/keyboard accessibility. Touch movement cancels long-press to keep scrolling usable. Menu closes on Escape or tapping outside.
3. Project actions: Open Project, Edit Project (only if `preparing.manage`), Project Dashboard and Kit Cartons. School actions: Open School, Components & QC, Delivery, Technical Follow-up, Returns & Replacements and Final Closing. The existing feature and API guards remain unchanged. Delete/Copy are not added because Project APIs do not support safe equivalents yet.
4. Fixed Users Center Advanced Permissions initialization: a previously enabled Advanced profile must not *automatically* migrate Products and Operations Orders solely because `enabled === true`. This could produce unwanted `products.view=false` when saving other modules. The controls now initialize based on actual stored grants and explicit legacy-mode markers.
5. Bumped Preparing stylesheet query to `?v=225`.

## Important: Products versus Podcast
The provided code **does contain** `Products` at `/next/products` and in both classic and module navigation configurations, but **no** Podcast page/module or route. This patch addresses the existing **Products** page, assuming that is what the spoken request refers to. It does NOT invent a Podcast page.

## Existing accounts that already lost Products
This is **not** an unconditional permission bypass. If `Products` is still hidden after deploying:
- Open Users Center for that account; verify `Products` is selected in Page Access.
- Under Advanced Permissions, either grant `products.view` with Products enabled, or explicitly opt out of the Products feature migration to use its original Page Access rules. Save.
- An explicit deny remains denied until an authorized admin changes it. No database migration or direct permission edits are included in this release.

## Verification
- Node tests: 75 passed across Projects Preparing phases, sidebar and Products permission regression.
- Both changed JSX files parse with TypeScript's JSX parser.
- Folder mock rendering inspected at desktop (1280 px) and mobile (390 px) Chromium viewports, confirming 218×204 and responsive cards.
- Next.js full build not run: the uploaded source contains no `node_modules` or installed `next` package here.
- No live integration, real account permission data access, or Production deployment was performed.

## Deploy
1. Back up deployed code and retain the rollback point; the current ERP is Production-only.
2. Merge the ZIP under the repository root, preserving `EmptyCanvas/next-frontend/...` paths.
3. Deploy normally. **No SQL is needed.**
4. Reload `/next/projects-preparing` (hard refresh if cached). Test folder open, long press, contextual menus, Back, school tools on phone/tablet/desktop.
5. Confirm that Products shows for an account with both Page Access and `products.view` (or the enabled legacy opt-out), and remains hidden for an explicitly denied account. Test an unrelated Advanced Permissions edit to ensure it does not silently turn off Products.

No deletion/copy APIs, warehouse records, delivery amounts, reconciliation rules or closing conditions have been changed.
