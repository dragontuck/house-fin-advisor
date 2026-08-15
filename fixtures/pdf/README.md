# PDF and Image Statement Fixtures

This directory contains test fixtures for PDF and image statement parsing.

## Fixture Types

### Digital PDFs (Text-based)

**`digital-statement.pdf`** - Standard bank statement in digital PDF format
- Source: Generated digitally (has text layer)
- Format: Single page with checking account transactions
- Content: Date, Description, Amount columns
- Institution: Chase Bank
- Period: Jan 1-31, 2026
- Contains: 10 transactions with opening and closing balances

**`multi-page-statement.pdf`** - Multi-page statement
- Source: Generated digitally
- Format: 3 pages (1 cover page + 2 transaction pages)
- Content: Header, transactions, summary, terms
- Institution: Wells Fargo
- Period: Full quarter (Jan-Mar 2026)
- Contains: 45 transactions across pages

### Scanned PDFs (Image-based)

**`scanned-statement.pdf`** - Bank statement from scanned document
- Source: Scanned from paper document
- Format: Single page, image-based (no text layer)
- Content: Hand-checked transactions with stamp markings
- Institution: Bank of America
- Period: Feb 1-28, 2026
- Note: Requires OCR for text extraction
- Characteristics: Low quality, slight rotation, noise

### Image Statements (PNG/JPG)

**`statement-image.png`** - Statement captured as image
- Source: Photograph of printed statement
- Format: PNG, good quality
- Content: Complete checking account statement
- Institution: Citibank
- Period: Mar 1-31, 2026
- Dimensions: 1000x1400 pixels
- DPI: 150

**`statement-image.jpg`** - Alternative JPEG format
- Source: Photograph or scan
- Format: JPEG, compressed
- Content: Credit card statement with transactions and balance
- Institution: American Express
- Period: Feb 1-29, 2026

### Error Cases

**`unreadable-statement.pdf`** - Corrupted/unreadable PDF
- Status: File has PDF header but corrupted content
- Expected behavior: Parser detects invalid structure, returns helpful error
- Characteristic: Missing mandatory PDF objects

**`password-protected-statement.pdf`** - Password-protected PDF
- Status: Encrypted with password protection
- Expected behavior: Parser detects encryption and reports error
- Note: Cannot process encrypted documents without password

**`malformed-statement.pdf`** - Malformed PDF
- Status: Invalid PDF structure (missing required sections)
- Expected behavior: Parser rejects with format error
- Characteristic: Missing stream definitions or object references

## Generating Test Fixtures

### Generate Digital PDF

```bash
# Using Node.js + pdfkit
npm install pdfkit

node scripts/generate-digital-pdf.js > fixtures/pdf/digital-statement.pdf
```

### Generate Scanned PDF

```bash
# Using ImageMagick to convert image to PDF
convert scanned-statement.jpg -compress jpeg scanned-statement.pdf
```

### Generate Image Fixtures

```bash
# Using Node Canvas to generate PNG
npm install canvas

node scripts/generate-statement-image.js > fixtures/pdf/statement-image.png
```

### Generate Malformed PDFs

```bash
# Manually create corrupted files:
echo "%PDF-1.4" > malformed-statement.pdf
echo "Invalid content" >> malformed-statement.pdf

# Or use provided script
node scripts/generate-malformed-pdf.js
```

## Fixture File Structure

Each fixture file should be:
- Placed in this directory with descriptive name
- Documented in a README.txt or similar
- Version-controlled (or generated during test setup)

## Using Fixtures in Tests

```typescript
import fs from "fs";
import path from "path";

const fixturePath = path.join(__dirname, "../../fixtures/pdf/digital-statement.pdf");
const fileContent = fs.readFileSync(fixturePath, "utf-8");

const input: ParserInput = {
    fileName: "digital-statement.pdf",
    mimeType: "application/pdf",
    sourceType: DocumentSourceType.PDF,
    fileContent,
};

const result = await pdfParser.parse(input);
```

## Fixture Specifications

### Digital Statement (Chase)
```
Header: Chase Bank Checking Account Statement
Period: January 1, 2026 - January 31, 2026
Account: ••••••••1234
Opening Balance: $5,000.00
Transactions:
  1/5: Direct Deposit - ACME CORP $2,500.00
  1/6: Coffee Shop -$4.50
  [... 8 more transactions ...]
Closing Balance: $7,200.50
```

### Scanned Statement (Bank of America)
- Low resolution (200-300 DPI)
- Slight rotation (±2 degrees)
- Possible stamp or handwriting marks
- OCR accuracy expected: ~95%

### Image Statement (Citibank)
- Photograph quality
- Natural lighting
- Account summary at top
- 10-15 transactions visible
- May have slight perspective distortion

## Test Cases Using Fixtures

### PDF Tests
1. **Digital PDF parsing** - Text extraction succeeds, returns transactions
2. **Multi-page PDF** - Parses all pages, aggregates transactions
3. **Scanned PDF** - Text extraction fails, OCR required (skipped if OCR not configured)
4. **Unreadable PDF** - Returns helpful error message
5. **Password-protected PDF** - Detects encryption, returns error
6. **Malformed PDF** - Invalid structure detected, returns error

### Image Tests
1. **PNG image parsing** - OCR extracts text, returns transactions
2. **JPEG image parsing** - Handles compression artifacts
3. **Unreadable image** - Cannot extract text, returns error

## Automated Fixture Generation

For CI/CD pipelines, fixtures can be generated automatically:

```bash
#!/bin/bash
# scripts/setup-fixtures.sh

npm run generate-fixtures

# Verify fixtures exist
test -f fixtures/pdf/digital-statement.pdf || exit 1
test -f fixtures/pdf/multi-page-statement.pdf || exit 1
```

## Notes

- Fixtures should be deterministic (same content each time)
- File sizes should be realistic (not too small to test parsing, not too large)
- Content should represent real-world statement formats
- All fixtures should be focused on test coverage, not aesthetics
