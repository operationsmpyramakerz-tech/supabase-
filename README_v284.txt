Production Receiving – Modern UI parity (v284)
Based on: supabase--main-283.zip

Apply: Copy the files under EmptyCanvas/next-frontend/ over the matching
paths in your repository. This ZIP contains changed and added files only.

Changes:
- Production Receiving summary KPI cards: black (Warehouse Received), orange
  (Production Received), yellow (Available to Receive), with clear vector icons.
- Production modal Close is now an icon button. Box Distribution's existing
  Close button remains unchanged.
- Receiving History moved to an icon button beside orange Download.
- Search uses a single-layer transparent input plus clear button.
- Filter is a centered icon and opens the existing sheet-clamped dropdown.
- Kit group icons have solid category colors; all groups start collapsed.
  Searching temporarily opens matching kit groups for discoverability.
- Component code stays searchable/exportable but is hidden in row display.
- Keeps Production receipt validations, Save/Cancel, history, exports,
  permissions, and separated Box Distribution function unchanged.

Checks:
- Node JSX parser: successful.
- All projects-preparing*.test.mjs tests: 253 passed, 0 failed.
- No SQL/database migration required.
- No full Next.js build or interactive production-server test performed.
