Project Preparing – Box Distribution Modern UI v285
Based on uploaded supabase--main-284.zip

Changes:
- Solid KPI cards: Production Received black; Packed orange; Available to Pack yellow.
- Close is icon-only, Box History is an icon-only toggle near labeled orange Download.
- Search uses a single transparent input with clear button; filter is icon-only and uses the existing sheet-clamped modern select.
- Kit group headings use solid colored white SVG icons and start collapsed, with smooth expand animation.
- Item code is hidden from rows but retained in state, server records, search, and exports.
- Box creation, long-press rename/delete, packing saves, history, and PDF/CSV exports are unchanged.
- CSS cache revision updated in Projects Preparing page.

Deploy: copy these files into the matching paths at the project root. Do not delete other files.
No SQL migration needed. No production deploy or live browser test was run.
Validation: 258/258 Projects Preparing tests passed, and CSS delimiters are balanced.
