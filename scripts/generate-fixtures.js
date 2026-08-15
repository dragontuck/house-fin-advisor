#!/usr/bin/env node

/**
 * Generate test fixtures for PDF and image statement parsing
 * 
 * This script creates minimal but valid test files:
 * - Digital PDF (text-based)
 * - Multi-page PDF
 * - Scanned PDF (image-like)
 * - Image statement (PNG)
 * - Malformed PDF
 * - Password-protected PDF
 * 
 * Run: node scripts/generate-fixtures.js
 */

const fs = require("fs");
const path = require("path");

const fixtureDir = path.join(__dirname, "../fixtures/pdf");

// Ensure directory exists
if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true });
}

/**
 * Create minimal valid PDF with text content
 */
function createDigitalPdf(bank, period, transactions) {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< >>
stream
BT
/F1 12 Tf
50 750 Td
(${bank} Bank Statement) Tj
0 -20 Td
(${period}) Tj
0 -30 Td
(Account: ****1234) Tj
0 -20 Td
(Opening Balance: $5000.00) Tj
0 -40 Td
(Transactions:) Tj
0 -20 Td
(${transactions.join(") Tj\\n0 -15 Td\\n(")}) Tj
0 -30 Td
(Closing Balance: $7200.50) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
0000000133 00000 n
0000000281 00000 n
0000000601 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
700
%%EOF`;

    return pdfContent;
}

/**
 * Create minimal valid multi-page PDF
 */
function createMultiPagePdf() {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj

4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 8 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj

5 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 9 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj

6 0 obj
<< >>
stream
BT
/F1 14 Tf
50 750 Td
(Wells Fargo Quarterly Statement) Tj
0 -20 Td
(Q1 2026: January - March) Tj
ET
endstream
endobj

7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

8 0 obj
<< >>
stream
BT
/F1 12 Tf
50 750 Td
(Page 1: Checking Transactions) Tj
0 -20 Td
(1/5/2026 Direct Deposit 2500.00) Tj
0 -15 Td
(1/10/2026 Withdrawal -500.00) Tj
ET
endstream
endobj

9 0 obj
<< >>
stream
BT
/F1 12 Tf
50 750 Td
(Page 2: Savings Transactions) Tj
0 -20 Td
(2/1/2026 Interest Earned 25.50) Tj
0 -15 Td
(3/1/2026 Dividend 75.25) Tj
ET
endstream
endobj

xref
0 10
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
0000000147 00000 n
0000000295 00000 n
0000000443 00000 n
0000000591 00000 n
0000000700 00000 n
0000000800 00000 n
0000000950 00000 n
trailer
<< /Size 10 /Root 1 0 R >>
startxref
1100
%%EOF`;

    return pdfContent;
}

/**
 * Create "scanned" PDF (image-based, no text layer)
 * Just PDF header with image stream (simplified)
 */
function createScannedPdf() {
    // This is a minimal PDF that contains an image stream instead of text
    // Real scanned PDFs would have actual image data
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Image1 5 0 R >> >> >>
endobj

4 0 obj
<< >>
stream
q
200 0 0 300 50 200 cm
/Image1 Do
Q
endstream
endobj

5 0 obj
<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>
stream
x\x9c\xed\xc1\x01\r\x00\x00\x00\xc2\xa0\xf5O\xeda\r\xa0\xa0\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00
endstream
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
0000000133 00000 n
0000000281 00000 n
0000000380 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
500
%%EOF`;

    return pdfContent;
}

/**
 * Create minimal PNG image
 * PNG header + minimal IHDR chunk + IDAT chunk + IEND chunk
 */
function createPngImage() {
    // Minimal valid PNG (1x1 white pixel)
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
        Buffer.from([0x00, 0x00, 0x00, 0x0d]), // IHDR chunk size
        Buffer.from("IHDR"),
        Buffer.from([
            0x00, 0x00, 0x00, 0x01, // Width: 1
            0x00, 0x00, 0x00, 0x01, // Height: 1
            0x08, // Bit depth
            0x02, // Color type (RGB)
            0x00, // Compression method
            0x00, // Filter method
            0x00, // Interlace method
        ]),
        Buffer.from([0x90, 0x77, 0x53, 0xde]), // CRC
        Buffer.from([0x00, 0x00, 0x00, 0x0c]), // IDAT chunk size
        Buffer.from("IDAT"),
        Buffer.from([0x78, 0x9c, 0x62, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00]),
        Buffer.from([0x18, 0xdd, 0x8d, 0xb4]), // CRC
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // IEND chunk size
        Buffer.from("IEND"),
        Buffer.from([0xae, 0x42, 0x60, 0x82]), // CRC
    ]);

    return png;
}

/**
 * Create malformed PDF (invalid structure)
 */
function createMalformedPdf() {
    return `%PDF-1.4
This is not valid PDF content
No proper objects or references
Missing critical sections
Random text to simulate corruption
endobj`;
}

/**
 * Create password-protected PDF signature
 * Real encrypted PDFs are complex, this just detects the /Encrypt object
 */
function createPasswordProtectedPdf() {
    return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Encrypt 4 0 R >>
endobj

4 0 obj
<< /Type /Encrypt /Filter /Standard /V 1 /O (test) /U (test) >>
endobj

xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
0000000133 00000 n
0000000233 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
333
%%EOF`;
}

/**
 * Create unreadable PDF (corrupted)
 */
function createUnreadablePdf() {
    return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
%CORRUPTED DATA%
\x00\x01\x02\x03\x04\x05\x06\x07
xref
0 1
0000000000 65535 f
trailer
<< /Size 1 >>
%%EOF`;
}

// Generate all fixtures
console.log("Generating PDF and image statement fixtures...\n");

try {
    // 1. Digital PDF
    const digitalPdf = createDigitalPdf(
        "Chase",
        "Jan 1-31, 2026",
        [
            "1/5/2026 Direct Deposit $2500.00",
            "1/10/2026 Coffee Shop -$4.50",
            "1/15/2026 Rent -$1500.00",
            "1/20/2026 Salary $2500.00",
            "1/25/2026 Grocery -$75.30",
        ]
    );
    fs.writeFileSync(path.join(fixtureDir, "digital-statement.pdf"), digitalPdf);
    console.log("✓ Created: digital-statement.pdf");

    // 2. Multi-page PDF
    const multiPagePdf = createMultiPagePdf();
    fs.writeFileSync(path.join(fixtureDir, "multi-page-statement.pdf"), multiPagePdf);
    console.log("✓ Created: multi-page-statement.pdf");

    // 3. Scanned PDF
    const scannedPdf = createScannedPdf();
    fs.writeFileSync(path.join(fixtureDir, "scanned-statement.pdf"), scannedPdf);
    console.log("✓ Created: scanned-statement.pdf");

    // 4. PNG Image
    const pngImage = createPngImage();
    fs.writeFileSync(path.join(fixtureDir, "statement-image.png"), pngImage);
    console.log("✓ Created: statement-image.png");

    // 5. Malformed PDF
    const malformedPdf = createMalformedPdf();
    fs.writeFileSync(path.join(fixtureDir, "malformed-statement.pdf"), malformedPdf);
    console.log("✓ Created: malformed-statement.pdf");

    // 6. Password-protected PDF
    const passwordPdf = createPasswordProtectedPdf();
    fs.writeFileSync(path.join(fixtureDir, "password-protected-statement.pdf"), passwordPdf);
    console.log("✓ Created: password-protected-statement.pdf");

    // 7. Unreadable PDF
    const unreadablePdf = createUnreadablePdf();
    fs.writeFileSync(path.join(fixtureDir, "unreadable-statement.pdf"), unreadablePdf);
    console.log("✓ Created: unreadable-statement.pdf");

    console.log("\n✓ All fixtures generated successfully!");
    console.log(`Location: ${fixtureDir}`);

} catch (error) {
    console.error("✗ Error generating fixtures:", error.message);
    process.exit(1);
}
