# ERP Pyramakerz v419 — Secondary Sidebar Auto-fit

Source: user-uploaded `supabase--main.zip` on 15 Nov 2026.

## Changes
- Events, Task Management, and Shopping Cart secondary flyouts now calculate their mobile grid column count from the pages actually visible after permission filtering.
- Opening a group with two visible pages produces two equally sized slots; three visible pages produce three; no empty reserved slot is left when a destination is removed or hidden.
- Desktop flyouts remain vertical, and the primary navigation dock is unchanged.
- Updated the `unified-white-workspace.css` URL cache key in both AppShell render paths.

## Files
- `components/events/EventsSidebarFlyout.jsx`
- `components/task-management/TaskManagementSidebarFlyout.jsx`
- `components/orders/ShoppingCartSidebarFlyout.jsx`
- `components/AppShell.jsx`
- `public/css/unified-white-workspace.css`
- `tests/secondary-sidebar-autofit-v419.test.mjs`

## Verification
- Added five node assertions for filtered page counts, mobile grid, and CSS version.
- Event Calendar route regression tests passed.
- Browser smoke tested 2/3/4 links on viewport widths 320, 360, 390, 430, 768 and 1024 pixels.
- All test suite: 1185 / 1222 passed, 37 failed. Same original source: 1179 / 1217 passed, 38 failed; no new failing test names.
- No database or SQL change. No production build or live production testing was performed.
