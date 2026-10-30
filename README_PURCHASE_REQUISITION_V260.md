Purchase Requisition – v260 PDF table & product reference update

Base: supabase--main-260.zip

Changed files:
EmptyCanvas/next-frontend/lib/purchase-requisition-render.js
EmptyCanvas/next-frontend/lib/purchase-requisition-data.mjs
EmptyCanvas/next-frontend/app/operations-orders/purchase-requisition/page.jsx
EmptyCanvas/next-frontend/components/orders/PurchaseRequisitionClient.jsx
EmptyCanvas/next-frontend/components/orders/purchase-requisition.css
EmptyCanvas/next-frontend/tests/purchase-requisition-v260-products-links-compact.test.mjs
EmptyCanvas/next-frontend/public/templates/purchase-requisition-template.docx

Changes:
- Product ID Code is read from the products catalog's id_code/displayId, not the order's editable customize_id.
- Product URL is supplied by Products and retained in the saved Purchase Requisition (no database migration needed: saved form_data is JSON).
- Component names are clickable links in PDF and Word (when a valid http/https URL exists). The editor includes an Open product link next to the editable description.
- Smaller heights for PDF AND Word table rows and headers; adjusted separator and RTL positioning for Arabic headings / parentheses.
- Existing Save, Word, PDF routes, and document access checks are unchanged.

Deploy: overlay the included EmptyCanvas/next-frontend paths on the same repository paths, install/build/restart as usual. No SQL required. Validate ORD-123 on Production. The Word template was rendered locally with 12 example items; PDF links were verified on the converted document. PDFKit fallback still needs visual verification on Production because this environment lacks the app's installed node_modules.
