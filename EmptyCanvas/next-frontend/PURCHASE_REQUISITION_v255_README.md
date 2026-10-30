# Purchase Requisition v255 – Production deployment notes

This changed-files package is relative to the `EmptyCanvas/next-frontend/` directory of the supplied `supabase--main-255.zip`. It is **not** a whole-project replacement.

## Install order (important)
1. Back up your production database or the affected tables.
2. Run `PURCHASE_REQUISITION_SAVE_v255.sql` **once** in your self-hosted Supabase SQL editor. This creates a new `erp_purchase_requisitions` table; it does not modify existing orders.
3. Update the files at the paths included in the ZIP and deploy the Next.js application.
4. Confirm your server has a correctly configured Supabase **service role** key (never expose it to the browser). The new table denies direct `anon` and `authenticated` table access and authorizes through the server routes.
5. Open an Operations Orders order, choose Purchase Requisition, edit the form and press **Save**. Refresh or reopen the same order; confirm the saved fields load automatically.
6. Download both PDF and Word, especially a file containing Arabic and English text. Check title, Arabic right-to-left layout, item rows and signatures.

## Behavior
- Save is manual and shows a status indicating saved versus unsaved changes.
- Saved data is shared by the *same canonical order number(s)* to authorized users of Operations Orders (not private to one individual).
- A new save replaces the saved draft for that order. Use caution when two colleagues edit the same requisition concurrently; the most recent completed save wins.
- Editing a saved requisition or downloading a file does **not** modify order quantities or statuses.
- If the SQL has not been applied, the page displays a warning and Save returns an error; export remains available.
- PDF export attempts LibreOffice conversion of the Word template first. If LibreOffice is unavailable on the server, the native PDFKit fallback uses Arabic's logical/native shaping instead of reversing it manually.

## Tests performed
- 12 Node tests passed (including key stability, scope validation presence, UI save wiring, Word format unchanged, and Arabic PDF call paths).
- Parsed changed JS / JSX with TypeScript parser without syntax errors.
- No production database migration or live server request performed here. Full Next.js build and runtime PDF rendering could not be executed in this isolated environment.
