PROJECTS PREPARING — PROJECT COMPONENTS FOUNDATION / v270 → v271

Apply the files relative to EmptyCanvas/next-frontend. These are CHANGED/NEW files only.

UI:
• Project Components has been moved from the Project Steps timeline to a standalone card above Schools on the left.
• The card opens the existing Master BOM editor and shows eligible ERP Users Center members (without any percentage or progress bar).
• Project Steps now contains Project Testing, Warehouse Receiving, Production Receiving, and Project Kit Cartons, numbered 1–4.
• Their KPI bars, access avatars and Reports button remain functional.
• The top banner is a Project Overview (school, delivery and closing counts), not a BOM completion gauge.
• Responsive layout maintains the left column above the step timeline on small screens.

Data logic:
• The arithmetic mean for project preparation uses only the four operational stages; Project Components / source proposal is not a measured stage.
• School-specific nine-stage workflow and permission checks are unchanged.

Verification:
• node --test tests/projects-preparing-*.test.mjs
• Result: 203 passed / 203 total.
• No database changes and no SQL required.
• A full Next.js build and live Production browser session were not performed here.
