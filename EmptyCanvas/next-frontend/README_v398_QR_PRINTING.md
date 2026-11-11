# v398 — Phase 4: Printable QR Labels + Public Scan-to-Contents

This patch builds on v397 and adds a PDF label template with a signed QR link for both physical **School Kit** and **School Carton** labels. Existing names, packing ledgers, packed status and permissions are not changed.

## Deployment (production)

1. **Back up Supabase** and confirm all migrations through v397 were already applied. **There is NO SQL migration for v398.**
2. Configure `PREPARING_LABEL_QR_SECRET` as a private server-only variable with **at least 32 unpredictable random characters**; for example, locally generate a 64-character hex secret using `openssl rand -hex 32`. Do **not** paste the secret into GitHub, a client-exposed variable, or chat.
3. Set `PREPARING_LABEL_PUBLIC_URL` to the externally reachable origin of your ERP, e.g. `https://your-erp-domain.example`. It must include **no `/next` suffix**, credentials, query or fragment. This value is **required** for stable QR links and must use HTTPS in production. The print API fails safely when it is absent or invalid.
4. Update the included files and run the normal dependency install; **`package.json` now includes `qrcode@^1.5.4`** (server-side). The existing archive has no package-lock. Build and deploy as normal.
5. Open **Box Distribution → Boxes Label → Kit → Download Kit Label + QR**. Also open **Project Kit Cartons → Packed Cartons → Carton → Download Carton Label + QR**. The PDF is designed as one 105×75 mm label per page.
6. Scan the QR with a phone **not signed in to ERP**. It must open `/next/label/kit/[id]?token=...` or `/next/label/carton/[id]?token=...`, show the school and physical packed items, and have no edit actions. A bogus/missing token or a legacy item must show a generic unavailable screen. Check Arabic and mobile display.

## Security model (read carefully)

- The scan page is **intentionally public to anyone with the printed QR link**, as requested. A QR code is effectively a bearer credential: anyone who photographs/copies it may view that label’s school name, Kit names, component names and quantities. It exposes **no contact details, costs, user account names, or administrative actions**. Do not print the QR on publicly distributed materials if this inventory is confidential.
- QR access uses a constant-time verified SHA-256 HMAC of the immutable label UUID + type with the server secret. IDs alone **cannot** open inventories. The secret is never sent to browsers. PDFs themselves require the existing Projects Preparing page and stage-read permissions. Old, non-school Kit records are not eligible.
- Keep `PREPARING_LABEL_QR_SECRET` stable across deployments. **Rotating it invalidates every previously printed QR**. Reprint the labels after rotation. This design avoids adding token-storage tables and supports immutable, long-lived physical labels; there is no per-label revocation in v398.
- The scan screen retrieves live physical packing contents: **Kit = actual packed component quantities**, and **Carton = its verified constituent Kits plus quantities**. A draft Kit shows only the quantities actually recorded, with a packing-in-progress notice; it does not claim that its targets have been packed.
- Optional `PREPARING_LABEL_PDF_FONT` may point to a Unicode/Arabic-capable TTF/OTF file installed **locally on your own server** for multilingual school names in the PDF. Otherwise non-ASCII school names are replaced by 'Scan QR for full name' on the sticker to avoid broken glyphs; the scan page shows their complete names in HTML. Font files are not included in this package.

## Limitations and testing

- One printable 105×75mm PDF per selected Kit/Carton, not a bulk batch. Browsers with pop-up blocking may require opening the link in the current tab.
- QR generation depends on the new `qrcode` npm module. No internet/module installation was available in this authoring runtime, so production npm install and end-to-end scanning **must** be validated after deployment. No production DB/API calls, live QR scans, or full Next build were performed during this patch.
- Security/model source tests and JSX syntax checks are included. Existing API write actions and SQL are unchanged.
