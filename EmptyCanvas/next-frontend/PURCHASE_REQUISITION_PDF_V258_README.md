# Purchase Requisition – PDF layout hotfix (based on supabase--main-258)

## Scope
- Uses the existing Word-template conversion when LibreOffice is available.
- Rebuilds the native PDFKit fallback for servers without LibreOffice.
- Draws Arabic word by word in explicit right-to-left positions. Mixed English/Arabic labels and Arabic parentheses no longer rely on reversing the entire sentence.
- Uses consistent company header, orange sections, shaded form labels, alternating component rows, table headers on continuation pages, signature grid, footer and page numbers.
- Wraps text in cells, clips overflow, and calculates component row height dynamically. Long notes can extend across pages without being discarded.
- Preserves the source order, all saved fields, the Word download, and all authorization checks.

## Deploy
1. Merge the files at their existing paths in the Next.js project.
2. Deploy the production app using your normal pipeline.
3. Download a Purchase Requisition PDF for ORD-123, and compare the Arabic labels, English parentheses, and page breaks with the saved form.
4. Try an order with longer model/description values and longer notes.

No SQL or schema changes are required. The runtime already depends on `pdfkit`.

## Verification limits
- Relevant unit/static tests and JavaScript syntax checks pass.
- The native PDFKit output has **not** been rendered in the production server environment. Verify the actual PDF visually after deployment.
