# Projects Preparing v239 — Testing Remaining, Kit Tags & Print Exports

Base: `supabase--main-238.zip`.

## Changes

1. **Remaining** in Project Testing is now `max(0, Testing Received − Passed)`. Failed quantities therefore remain outstanding until they pass retesting. The historical *Required − Testing Received* formula is no longer used in this screen. The project requirement itself is unchanged.
2. **Group by Kit Tag**: Project Testing now fetches the authoritative `source_kits` snapshots and ordered Kit groups from the project's existing Master BOM, grouping its components just like Project Components. Where a product belongs to multiple Kits, its planned Required quantity is split per Kit; the stored test results are *shared at product level* and the project summary never counts them twice. No database copy of the test results is created.
3. **Export dialog**: select columns individually or all at once, optionally narrow to one or more Kits, then download:
   - CSV — actual saved values
   - CSV — blank testing fields
   - PDF — actual saved values
   - PDF — blank physical form
   
   A blank physical sheet keeps the component name, code, Kit grouping and Required quantity, but leaves Testing Received, Passed, Failed, Remaining, Tested By and Signature blank for manual completion and signing.
4. Print-ready landscape A4 PDFs are generated server-side with feature-gated access and authenticated data queries. Exports do not change quantities or testing history.
5. Tests updated for the new Remaining formula and stylesheet cache-busting (`v=239`).

## How to deploy

1. Back up the currently deployed source. This release **does not require SQL** (v230+ Kit metadata already exists).
2. Upload the changed-files ZIP with its directory structure intact. Do not replace unrelated files.
3. Deploy normally to the existing production server. Hard-refresh Projects Preparing.
4. Open Project Testing. Confirm a component with Testing Received 4, Passed 2, Failed 1 now shows Remaining **2**, not 0.
5. Check the Kit groups match Project Components. Click Export, select columns, download **PDF · Blank sheet**, and check page breaks and handwriting/signature space on a printout before distributing to technicians.
6. Test that access is restricted to users with `preparing.view`, especially for PDF exports.

## Safety and limitations

- **No migration, no SQL execution, no live Supabase updates**, no deployment has been performed here.
- Existing `erp_preparing_project_testing_overview` SQL returns an older `remaining` field; the v239 application endpoint recalculates it server-side from `received - passed`, and the UI uses the same pure helper. Other modules are untouched.
- The PDF route requires the `pdfkit` dependency already listed in `package.json`. A full Next.js build and live PDF generation were not executed in this environment (the project archive does not contain installed runtime dependencies).
- The Kit-group view may show a product in more than one Kit. Physical test results still live in one unique project-level product ledger, **not** separately per Kit; PDF blank rows are divided by the planned Kit requirement.
- The **upload of the completed/signed physical testing document** is *not* implemented in v239. This release delivers the printable blank form. Storing signed copies securely requires a dedicated permissioned upload-and-attachment workflow and is a follow-up.
