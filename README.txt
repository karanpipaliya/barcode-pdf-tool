# Barcode PDF Tool - FIXED

This version fixes the PDF upload/initialization issue in the previous package.

Changes:
- No ES-module import in app.js
- Uses classic PDF.js browser build
- Explicit Choose PDF button
- Drag & drop supported
- File selection immediately shows filename and enables Process PDF
- Clear error if a CDN library fails to load

IMPORTANT:
Because PDF.js, PDF-Lib and BWIP-JS are loaded from CDNs, the browser needs internet access.

For local testing, opening index.html directly should still allow file selection. If your browser blocks processing, run:
  python -m http.server 8000
and open:
  http://localhost:8000/

For hosting, GitHub Pages / Netlify / Vercel / Cloudflare Pages are suitable.

FIX V2:
- Fixed "Failed to parse PDF document / No PDF header found".
- PDF.js and pdf-lib now receive separate copies of the uploaded PDF bytes, preventing ArrayBuffer detachment.

FINAL V3 changes:
- Left margin and Right margin are now separate controls.
- Tracking number text below barcode is larger and bold-looking via larger font size.
- Default tracking-number text size is 16 px (~12 pt), about 5 px larger than the previous default.
- Text size is configurable.

FINAL V4 QR changes:
- Added a 35 x 35 mm QR code on the bottom-right.
- QR has a 5 mm right margin.
- QR uses this Meesho URL:
  https://www.meesho.com/RAMAGLOBALVENTURES?ms=2
- "FOLLOW PLEASE" is printed directly below the QR.
- Barcode automatically becomes narrower to reserve space for the QR, so the QR does not overlap the barcode.
- QR can be turned off from the QR code setting.

FINAL V5 QR FIX:
- Fixed "The input is not a PNG file!".
- qrcode-generator creates a GIF data URL, while PDF-Lib embedPng requires PNG.
- The QR is now converted from GIF to a real PNG through an off-screen canvas before embedding.

FINAL V6:
- QR destination changed from:
  https://www.meesho.com/RAMAGLOBALVENTURES?ms=2
  to:
  https://www.meesho.com/RAMAGLOBALVENTURES

FINAL V7:
- Added Preview PDF button: generated PDF opens inside the page without downloading.
- Added Print PDF button: opens generated PDF in a new browser tab for direct browser printing.
- Download PDF remains available.
- If popup blocking prevents the print tab, the page automatically shows the PDF preview and tells the user to use Ctrl+P.

FINAL V8 SKU + COURIER SUMMARY:
- Replaced the page-by-page tracking-number results list with two side-by-side tables.
- SKU Wise table groups labels by the SKU text under the PDF's SKU heading.
- Courier Partner Wise table groups labels by courier detected from the shipping-label text.
- The barcode/QR processing and Preview, Print, Download features are retained.
- SKU extraction uses the text item positioned below the SKU heading and includes a fallback for common label text ordering.
- If the PDF layout/text extraction differs, a row may appear as "SKU not detected" or "Other / Unknown".

V9 fixes:
- Added Total Orders count at the top of the summary (one PDF page = one order).
- Added Tracking Numbers Found count.
- Fixed incorrectly double-escaped JavaScript regular expressions. This affected tracking number, SKU fallback and courier detection.
- Courier detection reads carrier names printed on the label: Valmo/ValmoPlus, Shadowfax, Delhivery, Xpress Bees, Ecom Express and DTDC.
- Summary tables show order counts by SKU and courier partner.


V10 UPDATE — SKU + COURIER PRINTED ON EVERY LABEL
- Every output PDF page now prints a bold "SKU: ..." field on the left and "Courier Partner: ..." on the right, directly below the invoice disclaimer text.
- Courier partner names are detected from the shipping-label carrier heading (Valmo/ValmoPlus, Shadowfax, Delhivery, Xpress Bees, Ecom Express, DTDC).
- The SKU/courier row is added even if a page's tracking number cannot be detected; barcode/QR creation still requires a detected tracking number as before.
- Existing barcode, QR, FOLLOW PLEASE, preview, print, download, total orders, and summary features remain.

V11 format changes:
- Printed line is now left-aligned as: SKU_VALUE   |   COURIER_NAME
- Removed the "SKU:" and "Courier Partner:" headings from the printed label.
- The line uses bold font by default.
- Added "SKU | Courier font size (px)" setting (default 16 px) to adjust printed text size.
