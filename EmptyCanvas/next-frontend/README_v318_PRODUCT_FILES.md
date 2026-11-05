# v318 — Product URL / File Upload

## Install (Production, existing server)
1. **Back up your Supabase database**, and execute `sql/2026-11-05-products-attachments-v318.sql` in the self-hosted Supabase SQL Editor first.
2. Overlay the files from `ERP_Products_File_Upload_v318_Changed_Files.zip` into their corresponding repo paths (`EmptyCanvas/next-frontend/...`), then deploy the new code as usual.
3. Verify: Products → Add Product → Product URL / Files → Upload Files, attach a PDF/ZIP, save the product, then reopen it and download the saved file. Verify the existing URL-only flow and product-image upload.

## Behavior
- Product URL remains available. Choose either **URL** or **Upload Files**.
- Files are uploaded via a permission-checked server ticket directly to the existing configured **Products Supabase Storage bucket**, under `products/files/`. The bucket must be **public** so file links from the product catalog work (the same access model as existing product images). File links can be opened by anyone with the URL: do not upload confidential material.
- Up to **10 files per product**, **10 MB per file**. Allowed extensions: pdf, zip, doc, docx, xls, xlsx, ppt, pptx, csv, txt, png, jpg, jpeg, webp, stl, step, stp, dxf, obj, gcode, ino.
- Uploads are only performed when the form is saved. Existing products with a URL remain unchanged until edited and saved using a different mode.
- Files are stored in the new `products.attachments` JSONB column; legacy `products.url` remains intact for URL mode.
- When a file-only product is opened outside the Products page, the **first attachment** is exposed as its main `url` for compatibility. All attached files remain accessible in Products via Edit or the file-count button on the product card.
- Removing a file from the list and saving removes its **product association**; uploaded storage objects are not automatically deleted to prevent accidental data loss. Storage cleanup can be handled separately by an administrator.
- Image upload icon has been changed to white. Image uploads continue to use their existing API.

## Testing
- Targeted automated tests cover UI, API permissions, file validation requirements, attachment persistence, and the old image flow. Actual signed Storage upload requires verification on your server.
- If a file upload fails with a Storage limit or MIME restriction, inspect the allowed MIME types and 10 MB per-object limits configured on the existing Products Storage bucket before changing Production settings.
