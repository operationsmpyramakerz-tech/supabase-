# v412 — Operations Orders: mixed Arabic/English Reason in Delivery Receipt PDF

## Problem

The `Reason` field in an Operations Order can contain Arabic and English in the same sentence. The legacy PDFKit Arabic conversion reshuffled the text and produced an unreadable Arabic/English sequence in the exported Delivery Receipt PDF, even when the web page stored the text correctly.

## Change

- `lib/pdfMixedArabicReason.js` (new): visual word-order helper for **mixed** Arabic/Latin reason values. Detects the first strong direction, keeps full English phrases (for example, `Theme Two`) and numeric segments in their original order, reorders the Arabic words per visual line, and preserves explicit newlines/parentheses.
- `lib/deliveryReceiptPdf.js`: applies that helper **only for mixed-language Reason values** in the summary Reason card, grouped Reason heading, and the optional Reason table column. Uses `withNativeArabicPdfText` for shaping, bypassing the older legacy Arabic character conversion for these fields. Plain English and plain Arabic values retain their previous rendering path.
- The Reason summary card keeps its single-line height; long values are truncated rather than overflowing into adjacent fields.

## Not changed

No Order data, quantities, statuses, PDF tables apart from the Reason text rendering, APIs, or database schema were changed. No SQL migration is required. Operations Orders and any other exports sharing `deliveryReceiptPdf.js` remain on the existing logic except when their Reason field contains both Arabic and Latin characters.

## Verification

Run:

```sh
node --test tests/operations-orders-pdf-mixed-reason-v412.test.mjs
node --check lib/deliveryReceiptPdf.js
node --check lib/pdfMixedArabicReason.js
```

The targeted tests cover Arabic-first and English-first mixed reasons, English phrases containing spaces, numeric runs, parentheses, explicit line breaks, wrapping, and a PDF rendering-path mock that exercises the actual receipt generator without a PDFKit runtime.

For deployment, test an existing order with a mixed-language Reason using the **Download > PDF** action and visually inspect the resulting PDF in Adobe Acrobat/mobile viewer. Production rendering requires the project's existing Arabic font setup; the test environment used for this patch does not have the project's `pdfkit` dependency installed, so a real PDF export and end-to-end production build could not be run here.
