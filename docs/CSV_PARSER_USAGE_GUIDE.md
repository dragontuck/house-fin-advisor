# CSV Statement Parser - Developer Usage Guide

## Quick Start

### Installation/Import
```typescript
import { CsvStatementParser } from "@house-fin/domain";
import { DocumentSourceType, ParserInput } from "@house-fin/contracts";
```

### Basic Usage
```typescript
// Create parser instance
const parser = new CsvStatementParser();

// Prepare input
const input: ParserInput = {
    fileName: "statement_2026_01.csv",
    mimeType: "text/csv",
    sourceType: DocumentSourceType.CSV,
    fileContent: csvFileContent, // UTF-8 string, not base64
};

// Check if parser can handle this file (optional)
const canParse = await parser.canParse(input);
if (!canParse.matches) {
    console.log(`Cannot parse: ${canParse.reason}`);
    return;
}

// Parse the file
try {
    const result = await parser.parse(input);
    console.log(`Parsed ${result.transactions.length} transactions`);
    
    // Inspect parsing results
    console.log("Format detected:", result.detectedFormat);
    console.log("Account type:", result.metadata.detectedAccountType);
    console.log("Warnings:", result.warnings);
    
    // Access parsed transactions
    result.transactions.forEach(tx => {
        console.log(`Row ${tx.sourceRowNumber}: ${tx.date.toISOString()} - ${tx.description}`);
        console.log(`  Amount: $${(tx.amountCents / 100).toFixed(2)}`);
        console.log(`  Original: "${tx.originalAmount}"`);
    });
    
} catch (error) {
    console.error("Parse failed:", error.message);
}
```

---

## API Reference

### CsvStatementParser

#### `canParse(input: ParserInput): Promise<ParserMatch>`

Checks if the parser can handle this file without fully parsing it.

**Parameters:**
- `input.sourceType` must be `DocumentSourceType.CSV`
- `input.fileContent` must be CSV text (UTF-8 string)

**Returns:**
- `matches`: boolean - Can this parser handle this format?
- `confidence`: number (0-1) - How confident is the detection?
- `reason`: string - Explanation of the result

**Example:**
```typescript
const match = await parser.canParse(input);
if (match.matches) {
    console.log(`Can parse with ${Math.round(match.confidence * 100)}% confidence`);
} else {
    console.log("Cannot parse:", match.reason);
}
```

#### `parse(input: ParserInput): Promise<ParsedStatement>`

Fully parses the CSV file and returns transaction candidates.

**Parameters:**
- `input` - ParserInput object with file data

**Returns:** ParsedStatement object with:
- `fileName`, `sourceType` - Input metadata
- `detectedFormat` - Flags and statistics
  - `hasSignedAmounts` - Amounts include +/- signs
  - `hasDebitCreditColumns` - Separate debit/credit columns
  - `hasRunningBalance` - Balance column present
  - `headerRowIndex` - Row number of header
  - `totalRows` - Total CSV rows (including header)
- `metadata` - Inferred information
  - `detectedAccountType` - CHECKING, SAVINGS, CREDIT_CARD, etc.
  - `detectedCurrency` - USD, EUR, etc. (currently defaults to USD)
  - `periodStart?`, `periodEnd?` - Date range (if detectable)
- `transactions` - Array of TransactionCandidate objects
- `warnings` - Non-fatal issues during parsing
- `errors` - Fatal parsing errors (typically empty on success)

**Throws:** Error if parsing fails
- Missing required columns
- Confidence too low
- No valid transactions found
- Other critical parsing failures

**Example:**
```typescript
const result = await parser.parse(input);

// Check if parsing was successful
if (result.errors.length > 0) {
    console.error("Parsing errors:", result.errors);
}

if (result.warnings.length > 0) {
    console.warn("Warnings:", result.warnings);
}

// Use transactions
const transactions = result.transactions;
console.log(`Successfully parsed ${transactions.length} transactions`);
```

---

## Data Types

### ParserInput
```typescript
interface ParserInput {
    fileName: string;
    mimeType: string;
    sourceType: DocumentSourceType;
    fileContent: string; // UTF-8 decoded content, not base64
}
```

### TransactionCandidate
```typescript
interface TransactionCandidate {
    sourceRowNumber: number;      // 1-indexed row in CSV
    date: Date;                   // Normalized to local date
    description: string;          // Original, unmodified
    amountCents: number;          // Cents (integer) - may be negative
    originalAmount: string;       // Original format for validation
    originalDate: string;         // Original format for validation
    balance?: number;             // Running balance in cents (if present)
}
```

### ParsedStatement
```typescript
interface ParsedStatement {
    fileName: string;
    sourceType: DocumentSourceType;
    detectedFormat: {
        hasDebitCreditColumns: boolean;
        hasSignedAmounts: boolean;
        hasRunningBalance: boolean;
        headerRowIndex: number;
        totalRows: number;
    };
    metadata: {
        periodStart?: Date;
        periodEnd?: Date;
        detectedCurrency?: string;
        detectedAccountType?: AccountType;
    };
    transactions: TransactionCandidate[];
    warnings: Array<{
        type: "ambiguous_column" | "skipped_row" | "date_format_unclear" | "amount_format_unclear";
        rowNumber?: number;
        message: string;
    }>;
    errors: Array<{
        message: string;
        rowNumber?: number;
    }>;
}
```

---

## Common Patterns

### Integration with Document Upload Endpoint

```typescript
// In your Express route handler
import { CsvStatementParser } from "@house-fin/domain";

app.post("/api/documents/upload", async (req, res) => {
    const { fileContent, fileName, sourceType } = req.body;
    
    // Update document status
    await documentRepository.updateStatus(
        documentId,
        DocumentProcessingStatus.PARSING
    );
    
    try {
        // Parse CSV
        const parser = new CsvStatementParser();
        const input: ParserInput = {
            fileName,
            mimeType: "text/csv",
            sourceType: DocumentSourceType.CSV,
            fileContent, // Must be UTF-8 string, decode from base64 if needed
        };
        
        const result = await parser.parse(input);
        
        // Store candidates for review
        await transactionCandidateRepository.createBatch({
            documentId,
            householdId,
            candidates: result.transactions,
            format: result.detectedFormat,
        });
        
        // Move to review stage
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.REVIEW_REQUIRED
        );
        
        res.json({ status: "success", count: result.transactions.length });
        
    } catch (error) {
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.PARSE_FAILED,
            "CSV_PARSE_ERROR",
            error.message
        );
        res.status(400).json({ error: error.message });
    }
});
```

### Handling File Uploads (Base64 to UTF-8)

```typescript
// When receiving file from frontend as base64
const fileBase64 = req.body.fileContent; // base64 encoded
const fileBuffer = Buffer.from(fileBase64, "base64");
const fileContent = fileBuffer.toString("utf-8"); // Now it's UTF-8 string

const input: ParserInput = {
    fileName: req.body.fileName,
    mimeType: "text/csv",
    sourceType: DocumentSourceType.CSV,
    fileContent, // Pass UTF-8 string
};
```

### Error Handling Pattern

```typescript
const parser = new CsvStatementParser();

try {
    const result = await parser.parse(input);
    
    if (result.warnings.length > 0) {
        console.warn("Non-fatal issues:", result.warnings);
        // Continue processing, user can review warnings
    }
    
    return {
        success: true,
        transactions: result.transactions,
        accountType: result.metadata.detectedAccountType,
        warnings: result.warnings,
    };
    
} catch (error) {
    // Fatal parsing error
    return {
        success: false,
        error: error.message,
        suggestions: [
            "Check file format matches bank statement",
            "Verify required columns exist",
            "Try another account format",
        ],
    };
}
```

### Storing Candidates for Review

```typescript
const result = await parser.parse(input);

// Store candidates with full audit trail
const candidates = result.transactions.map(tx => ({
    id: generateId(),
    documentId,
    householdId,
    sourceRowNumber: tx.sourceRowNumber,
    date: tx.date,
    description: tx.description,
    amountCents: tx.amountCents,
    originalAmount: tx.originalAmount,
    originalDate: tx.originalDate,
    balance: tx.balance,
    status: "pending_review", // Not posted yet
    createdAt: new Date(),
}));

await transactionCandidateRepository.createBatch(candidates);
```

---

## Format Examples

### Supported Formats

#### Format 1: Standard (Signed Amounts)
```
Date,Description,Amount
01/15/2026,Deposit,1000.00
01/16/2026,Purchase,-50.00
```

#### Format 2: Debit/Credit Columns
```
Date,Description,Debit,Credit
01/15/2026,Purchase,50.00,
01/16/2026,Refund,,50.00
```

#### Format 3: With Running Balance
```
Date,Description,Withdrawal,Deposit,Balance
01/15/2026,Opening,,,1000.00
01/16/2026,Purchase,50.00,,950.00
01/17/2026,Deposit,,100.00,1050.00
```

#### Format 4: Alternative Headers
```
Transaction Date,Memo,Posted Amount
01/15/2026,Test,-50.00
01/16/2026,Deposit,100.00
```

---

## Testing

### Unit Tests in Code

```typescript
import { CsvStatementParser } from "@house-fin/domain";
import { DocumentSourceType } from "@house-fin/contracts";

describe("CsvStatementParser", () => {
    let parser: CsvStatementParser;
    
    beforeEach(() => {
        parser = new CsvStatementParser();
    });
    
    it("should parse valid CSV", async () => {
        const input = {
            fileName: "test.csv",
            mimeType: "text/csv",
            sourceType: DocumentSourceType.CSV,
            fileContent: "Date,Description,Amount\n01/15/2026,Test,100.00",
        };
        
        const result = await parser.parse(input);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].amountCents).toBe(10000);
    });
});
```

### Testing with Real Fixtures

```typescript
import fs from "fs";
import path from "path";

// Load fixture file
const fixturePath = path.join(__dirname, "../../fixtures/statements/checking-account-standard.csv");
const fileContent = fs.readFileSync(fixturePath, "utf-8");

const result = await parser.parse({
    fileName: "checking-account-standard.csv",
    mimeType: "text/csv",
    sourceType: DocumentSourceType.CSV,
    fileContent,
});
```

---

## Troubleshooting

### Issue: "Could not identify date column"

**Cause:** Date column doesn't match any recognized format

**Solution:**
- Check date format: Does it match one of these?
  - MM/DD/YYYY
  - YYYY-MM-DD
  - MM-DD-YYYY
  - MM/DD/YY
  - Text (Jan 15, 2026)

**Example Fix:**
```
❌ Bad: 15-01-2026   (ambiguous - could be day or month first)
✅ Good: 01/15/2026   (clear - US format)
```

### Issue: "Could not identify amount columns"

**Cause:** Amounts aren't in a recognized format

**Solution:**
- Check for one of these formats:
  - Single "Amount" column with ±values
  - Separate "Debit" and "Credit" columns
  - "Withdrawal" and "Deposit" columns

**Example Fix:**
```
❌ Bad: "Amount" column with values like "1000 USD"
✅ Good: "Amount" column with values like "1000.00" or "-50.00"
```

### Issue: "Could not identify description column"

**Cause:** Column headers don't match expected keywords

**Solution:**
- Rename column header to one of these:
  - description
  - desc
  - memo
  - reference
  - detail

### Issue: Too many warnings about skipped rows

**Cause:** Some rows are missing required fields

**Solution:**
- Review the CSV for:
  - Missing date values
  - Missing descriptions
  - Missing amounts
- Remove or fix invalid rows before uploading

### Issue: Wrong account type detected

**Cause:** Keywords in descriptions don't clearly indicate account type

**Solution:**
- Add keywords to descriptions:
  - Credit Card: "Credit Card", "Payment"
  - Savings: "Interest Earned", "Dividend"
  - Checking: "Direct Deposit", "Check"

---

## Performance Notes

- **CSV Parsing:** O(n) where n = number of rows
- **Column Detection:** O(m) where m = number of columns
- **Typical Statement:** <100ms for 1000 transactions
- **Memory:** ~1MB per 10,000 rows

### Optimization Tips

1. For large files (>10K rows):
   - Process in batches
   - Stream large files instead of loading all at once

2. For many files:
   - Reuse parser instance
   - Consider worker threads for parallel processing

3. For real-time parsing:
   - Cache detected format if same bank repeatedly uploads
   - Skip `canParse()` if you know the format will parse

---

## Production Checklist

Before deploying to production:

- [ ] All 43 tests passing
- [ ] Error messages are user-friendly
- [ ] CSV encoding is UTF-8 (not Latin-1 or others)
- [ ] Logging is configured for parsing issues
- [ ] Database schema ready for TransactionCandidates
- [ ] Review UI component ready for users
- [ ] Rate limiting on upload endpoint (e.g., 10 files/min)
- [ ] File size limits enforced (<50MB)
- [ ] MIME type validation in place
- [ ] Privacy review complete (no external calls)

---

## FAQ

**Q: Can the parser handle PDF or image statements?**  
A: No, this parser is CSV-only. Extend with OCR for images/PDFs.

**Q: Can it directly post transactions?**  
A: No, it outputs candidates for human review first.

**Q: Does it support multiple currencies?**  
A: It normalizes all to a single currency (defaults to USD).

**Q: How does it handle duplicate transactions?**  
A: It doesn't. That's handled by the reconciliation layer after review.

**Q: Can I modify the parsed descriptions?**  
A: Only after review. The parser preserves originals for audit trails.

**Q: What if two columns could be "amount"?**  
A: The parser rejects the CSV and asks for clarification (fails safely).

---

## See Also

- [CSV_PARSER_IMPLEMENTATION.md](./CSV_PARSER_IMPLEMENTATION.md) - Architecture & design
- [CSV_PARSER_CHECKLIST.md](./CSV_PARSER_CHECKLIST.md) - Completion tracking
- [fixtures/statements/README.md](./fixtures/statements/README.md) - Fixture reference
