"use strict";
/**
 * Image Statement Parser
 *
 * Processes image statements (PNG, JPEG, TIFF) through OCR:
 * 1. Image validation
 * 2. Optical Character Recognition (OCR) to extract text
 * 3. Transaction parsing from extracted text
 * 4. Metadata extraction
 *
 * Does NOT use AI to interpret data - relies on OCR output and pattern matching.
 * Security: No external API calls, local processing only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageStatementParser = void 0;
const contracts_1 = require("@house-fin/contracts");
/**
 * Validate image file format and structure
 */
function validateImageFile(buffer, mimeType) {
    // Check image signatures (magic numbers)
    const signatures = {
        "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG
        "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]), // JPEG
        "image/jpg": Buffer.from([0xff, 0xd8, 0xff]), // JPEG
        "image/tiff": Buffer.from([0x49, 0x49, 0x2a, 0x00]), // TIFF (little-endian)
    };
    const expectedSig = signatures[mimeType.toLowerCase()];
    if (!expectedSig) {
        throw new Error(`Unsupported image type: ${mimeType}`);
    }
    // For JPEG and PNG, check signature
    if (mimeType.toLowerCase().includes("jpeg") || mimeType.toLowerCase().includes("jpg")) {
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
            throw new Error("Invalid JPEG file (incorrect magic number)");
        }
    }
    else if (mimeType.toLowerCase().includes("png")) {
        for (let i = 0; i < expectedSig.length; i++) {
            if (buffer[i] !== expectedSig[i]) {
                throw new Error("Invalid PNG file (incorrect magic number)");
            }
        }
    }
    else if (mimeType.toLowerCase().includes("tiff")) {
        // TIFF can be little-endian or big-endian
        const isLittleEndian = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
        const isBigEndian = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
        if (!isLittleEndian && !isBigEndian) {
            throw new Error("Invalid TIFF file (incorrect magic number)");
        }
    }
}
/**
 * Simulate OCR text extraction (placeholder)
 * In production, would use:
 * - Tesseract.js (browser-compatible)
 * - pytesseract with system Tesseract (more accurate)
 * - Cloud Vision API (not preferred for privacy)
 */
async function extractTextFromImage(buffer, mimeType) {
    // Validate image first
    validateImageFile(buffer, mimeType);
    // Placeholder implementation
    // In production, call actual OCR library:
    // const { createWorker } = require("tesseract.js");
    // const worker = await createWorker();
    // const result = await worker.recognize(buffer);
    // await worker.terminate();
    // return result.data.text;
    // For now, return error indicating OCR needs to be configured
    throw new Error("Image OCR processing requires Tesseract.js configuration. Please run: npm install tesseract.js");
}
/**
 * Extract metadata from image (bank name from header, period, balances)
 */
function extractImageMetadata(ocrText) {
    // Use same logic as PDF parser
    const metadata = { accountHints: [] };
    // Common institution keywords
    const institutionPatterns = {
        "Bank of America": /bank\s+of\s+america|boa(?:\s|$)/i,
        Wells: /wells\s+fargo|wellsfargo/i,
        Chase: /jpmorgan\s+chase|chase\s+bank|chase|jp morgan/i,
        Citibank: /citibank|citi(?:\s|$)/i,
        "Capital One": /capital\s+one|capital\s+bank/i,
        Discover: /discover\s+bank|discover/i,
        "American Express": /american\s+express|amex/i,
    };
    for (const [bank, pattern] of Object.entries(institutionPatterns)) {
        if (pattern.test(ocrText)) {
            metadata.institution = bank;
            break;
        }
    }
    // Extract date range
    const periodPattern = /(?:statement\s+)?(?:from|for|period)[\s:]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[\s\-to]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
    const periodMatch = ocrText.match(periodPattern);
    if (periodMatch) {
        try {
            const [, startStr, endStr] = periodMatch;
            metadata.periodStart = parseImageDate(startStr);
            metadata.periodEnd = parseImageDate(endStr);
        }
        catch {
            // Continue
        }
    }
    // Extract account hints
    const accountPatterns = [
        /account\s*(?:number|#)?[\s:]+([x\d]{4,})/i,
        /(?:checking|savings|credit\s+card)\s+(?:account|acct)\s*[#:]?\s*([x\d]{4,})/i,
    ];
    accountPatterns.forEach((pattern) => {
        const matches = ocrText.match(pattern);
        if (matches && matches[1]) {
            metadata.accountHints.push(matches[1]);
        }
    });
    return metadata;
}
/**
 * Parse date from OCR'd text
 */
function parseImageDate(dateStr) {
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
    if (match) {
        const [, month, day, year] = match;
        const y = parseInt(year);
        const yearFull = y < 100 ? (y > 50 ? 1900 + y : 2000 + y) : y;
        return new Date(yearFull, parseInt(month) - 1, parseInt(day));
    }
    throw new Error(`Could not parse date: ${dateStr}`);
}
/**
 * Detect account type from OCR text
 */
function detectAccountTypeFromOcrText(text) {
    const textLower = text.toLowerCase();
    if (/credit\s+card|visa|mastercard|amex/i.test(textLower))
        return contracts_1.AccountType.CREDIT_CARD;
    if (/checking|check|draft/i.test(textLower))
        return contracts_1.AccountType.CHECKING;
    if (/savings|interest\s+earned|dividend/i.test(textLower))
        return contracts_1.AccountType.SAVINGS;
    if (/401k|ira|retirement/i.test(textLower))
        return contracts_1.AccountType.RETIREMENT;
    if (/mortgage|home\s+loan/i.test(textLower))
        return contracts_1.AccountType.MORTGAGE;
    if (/loan|personal\s+loan|auto\s+loan/i.test(textLower))
        return contracts_1.AccountType.LOAN;
    if (/investment|brokerage|stock/i.test(textLower))
        return contracts_1.AccountType.INVESTMENT;
    return undefined;
}
/**
 * Extract balance from OCR'd text
 */
function extractBalanceFromOcr(text) {
    const result = {};
    // Opening balance
    const openingPattern = /opening\s+balance[\s:]+\$?([\d,]+\.?\d*)/i;
    const openingMatch = text.match(openingPattern);
    if (openingMatch && openingMatch[1]) {
        const amount = parseFloat(openingMatch[1].replace(/,/g, ""));
        if (!isNaN(amount)) {
            result.opening = Math.round(amount * 100);
        }
    }
    // Closing balance
    const closingPattern = /(?:closing|final|ending)\s+balance[\s:]+\$?([\d,]+\.?\d*)/i;
    const closingMatch = text.match(closingPattern);
    if (closingMatch && closingMatch[1]) {
        const amount = parseFloat(closingMatch[1].replace(/,/g, ""));
        if (!isNaN(amount)) {
            result.closing = Math.round(amount * 100);
        }
    }
    return result;
}
/**
 * Image Statement Parser
 * Implements StatementParser interface for image documents (PNG, JPEG, TIFF)
 */
class ImageStatementParser {
    /**
     * Check if this parser can handle image input
     */
    async canParse(input) {
        if (input.sourceType !== contracts_1.DocumentSourceType.IMAGE) {
            return {
                matches: false,
                confidence: 0,
                reason: `Source type is ${input.sourceType}, not IMAGE`,
            };
        }
        const mimeTypeLower = input.mimeType.toLowerCase();
        const supportedTypes = ["image/png", "image/jpeg", "image/jpg", "image/tiff"];
        if (!supportedTypes.some((t) => mimeTypeLower.includes(t.split("/")[1]))) {
            return {
                matches: false,
                confidence: 0,
                reason: `MIME type ${input.mimeType} is not a supported image format`,
            };
        }
        // Validate image structure
        try {
            const imageBuffer = typeof input.fileContent === 'string'
                ? Buffer.from(input.fileContent, "base64")
                : input.fileContent;
            validateImageFile(imageBuffer, input.mimeType);
            return {
                matches: true,
                confidence: 0.9,
                reason: "Valid image file",
            };
        }
        catch (error) {
            return {
                matches: false,
                confidence: 0,
                reason: `Image validation failed: ${error instanceof Error ? error.message : "unknown error"}`,
            };
        }
    }
    /**
     * Parse image statement through OCR
     * Stages:
     * 1. Image validation
     * 2. OCR extraction
     * 3. Text parsing
     * 4. Transaction extraction
     * 5. Metadata extraction
     */
    async parse(input) {
        // Validate input
        const canParseResult = await this.canParse(input);
        if (!canParseResult.matches) {
            throw new Error(`Cannot parse: ${canParseResult.reason}`);
        }
        // Convert to buffer if needed
        const imageBuffer = typeof input.fileContent === 'string'
            ? Buffer.from(input.fileContent, "base64")
            : input.fileContent;
        // Extract text via OCR
        let extractedText;
        try {
            extractedText = await extractTextFromImage(imageBuffer, input.mimeType);
        }
        catch (error) {
            throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
        // Extract metadata
        const metadata = extractImageMetadata(extractedText);
        const accountType = detectAccountTypeFromOcrText(extractedText);
        const balances = extractBalanceFromOcr(extractedText);
        // Parse transactions from OCR'd text
        const transactions = [];
        const linePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2}|-[\d,]+\.\d{2}|[\d,]+\.\d{2}[\s\(])/gm;
        let match;
        let rowNumber = 1;
        while ((match = linePattern.exec(extractedText)) !== null) {
            try {
                const dateStr = match[1];
                const description = match[2].trim();
                const amountStr = match[3].replace(/[\s()]/g, "");
                const date = parseImageDate(dateStr);
                const amountCents = Math.round(parseFloat(amountStr.replace(/,/g, "")) * 100);
                transactions.push({
                    sourceRowNumber: rowNumber,
                    date,
                    description,
                    amountCents,
                    originalAmount: amountStr,
                    originalDate: dateStr,
                    sourceReference: {
                        pageNumber: 1,
                        extractionMethod: contracts_1.ExtractionMethod.OCR,
                        confidence: 0.6, // OCR is less reliable than direct PDF text
                    },
                });
                rowNumber++;
            }
            catch {
                // Skip malformed lines
            }
        }
        return {
            fileName: input.fileName,
            sourceType: contracts_1.DocumentSourceType.IMAGE,
            detectedFormat: {
                hasDebitCreditColumns: false,
                hasSignedAmounts: extractedText.includes("-"),
                hasRunningBalance: /balance|running\s+balance/i.test(extractedText),
                headerRowIndex: 0,
                totalRows: transactions.length,
            },
            metadata: {
                detectedAccountType: accountType,
                detectedCurrency: "USD",
                periodStart: metadata.periodStart,
                periodEnd: metadata.periodEnd,
            },
            transactions,
            extractionMethods: [contracts_1.ExtractionMethod.OCR],
            institutionDetected: metadata.institution,
            accountHints: metadata.accountHints,
            openingBalance: balances.opening
                ? {
                    amountCents: balances.opening,
                    date: metadata.periodStart || new Date(),
                    confidence: 0.6,
                }
                : undefined,
            closingBalance: balances.closing
                ? {
                    amountCents: balances.closing,
                    date: metadata.periodEnd || new Date(),
                    confidence: 0.6,
                }
                : undefined,
            pageCount: 1,
            warnings: transactions.length === 0
                ? [
                    {
                        type: "skipped_row",
                        message: "No transactions extracted from image",
                    },
                ]
                : [],
            errors: [],
        };
    }
}
exports.ImageStatementParser = ImageStatementParser;
//# sourceMappingURL=image-statement-parser.js.map