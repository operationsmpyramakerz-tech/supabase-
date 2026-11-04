# ERP v312 — Shopping Cart & Purchase Requisition metadata link

Source baseline: `supabase--main-311.zip`. The patch includes **only new or changed files** and keeps paths relative to the Git repository root (`EmptyCanvas/next-frontend/...`).

## Changes
1. Withdrawal Summary Total and component-line Total use red text and subtle red backgrounds; Request Products remains green.
2. Subtle label icons added for Reason, Priority Level and Delivery Date in Request Products / Withdraw Products.
3. Purchase Requisition pre-fills its EXISTING fields **درجة الأولوية** (`priority`) and **تاريخ التوريد المطلوب** (`requiredDate`) from the verified current order rows. No form field names or PR radio choices were changed:
    - Low / Normal -> عادي
    - High -> عاجل
    - Urgent -> طارئ
    - Delivery Date -> same YYYY-MM-DD day (no timezone conversion)
4. On reopening an already saved PR, changes in the source order's metadata update the PR fields while unrelated PR-only fields, signatures and items are preserved. If an older PR already contains manually entered priority/date and lacks a source metadata snapshot, those manually entered values are preserved to avoid data loss; missing fields are backfilled. Conflicting metadata among selected rows is not silently picked arbitrarily.
5. The standard PR Save button still persists the document in the existing `erp_purchase_requisitions` table. The metadata is auto-filled when opening PR, not a silent database write just from visiting the PR page. PDF/Word exports already refresh the latest order values.

## Deploy
- Replace/merge the files at their exact relative paths in GitHub, then deploy.
- No SQL or Supabase schema change needed. Existing PR data is JSONB; internal source metadata is stored in that JSON document only when saving.
- Does not connect to a live production database and has not been tested in a production browser.

## Verification
- `node --test tests/purchase-requisition*.test.mjs tests/shopping-cart*.test.mjs` -> **80 passed, 0 failed**.
- Parsed changed JSX using TypeScript JSX parser -> no syntax errors.
- Manual browser smoke-check: Withdrawal Total red, metadata icons, request PR from ORD with High/Urgent priority and date, reopen saved PR after editing order metadata, then export PDF/Word.
