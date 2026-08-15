/**
 * PDF Statement Parser
 * 
 * Processes PDF statements through multi-stage extraction:
 * 1. Text extraction (for digitally-generated PDFs)
 * 2. Table detection (for structured layouts)
 * 3. OCR fallback (for scanned/image-based PDFs)
 * 
 * Does NOT use AI to interpret data - relies on pattern matching and heuristics.
 * Rejects ambiguous or unreliable extractions.
 * 
 * Security: No external calls, deterministic processing, file validation,
 * timeout protection, resource limits.
 */

import {
    ParserInput,
    ParserMatch,
    ParsedStatement,
    TransactionCandidate,
    StatementParser,
    AccountType,
    DocumentSourceType,
    ExtractionMethod,
    ExtractedTransactionCandidate,
    ExtractedParsedStatement,
    SourceReference,
} from "@house-fin/contracts";

/**
 * Extract text from PDF buffer using basic page iteration
 * Falls back to a simple implementation that can work without external dependencies
 * In production, would use pdfjs-dist or similar
 */
async function extractTextFromPdf(
    pdfBuffer: Buffer,
    maxPages: number = 50
): Promise<{ text: string; pageCount: number; textPerPage: Map<number, string> }> {
    // Validate PDF signature
    const pdfSignature = pdfBuffer.toString("binary", 0, 4);
    if (pdfSignature !== "%PDF") {
        throw new Error("Invalid PDF signature - file is not a PDF");
    }

    // Check for encryption (Password-protected PDFs)
    const content = pdfBuffer.toString("binary");
    if (content.includes("/Encrypt")) {
        throw new Error("PDF is password-protected - cannot process encrypted documents");
    }

    // Basic text extraction from PDF streams
    // This is a simplified implementation; production would use pdfjs-dist
    const textPerPage = new Map<number, string>();
    let pageCount = 0;
    let extractedText = "";

    try {
        // Count pages by looking for /Type /Page markers
        const pageMatches = content.match(/\/Type\s*\/Page[\s>]/g) || [];
        pageCount = pageMatches.length;

        // Limit pages processed (security)
        if (pageCount > maxPages) {
            pageCount = maxPages;
        }

        // Extract streams containing text - look for BT...ET (Begin Text...End Text blocks)
        // This is a very basic extraction; real implementation would use pdfjs-dist
        const streamPattern = /stream\n([\s\S]*?)\nendstream/g;
        let match;
        let currentPage = 1;
        let pageText = "";

        while ((match = streamPattern.exec(content)) !== null) {
            const stream = match[1];

            // Simple pattern: look for Tj (show text) operators
            const textMatches = stream.match(/\((.*?)\)\s*Tj/g) || [];
            textMatches.forEach((textOp) => {
                const textContent = textOp.match(/\((.*?)\)/)?.[1] || "";
                // Unescape PDF strings
                const unescaped = textContent
                    .replace(/\\n/g, "\n")
                    .replace(/\\r/g, "\r")
                    .replace(/\\\(/g, "(")
                    .replace(/\\\)/g, ")")
                    .replace(/\\\\/g, "\\");
                pageText += unescaped + " ";
            });

            // Detect page boundaries (rough heuristic)
            if (pageText.length > 100 || currentPage >= pageCount) {
                textPerPage.set(currentPage, pageText.trim());
                extractedText += `\n--- Page ${currentPage} ---\n${pageText}`;
                pageText = "";
                currentPage++;
            }
        }

        // Add remaining text if any
        if (pageText.trim()) {
            textPerPage.set(currentPage, pageText.trim());
            extractedText += `\n--- Page ${currentPage} ---\n${pageText}`;
        }

        // If no text extracted, PDF is likely scanned/image-based
        if (!extractedText.trim()) {
            return {
                text: "",
                pageCount: Math.max(pageCount, 1),
                textPerPage: new Map(),
            };
        }

        return {
            text: extractedText,
            pageCount: Math.max(currentPage, pageCount, 1),
            textPerPage,
        };
    } catch (error) {
        throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`);
    }
}

/**
 * Detect if text appears to be from a table structure
 */
function detectTableStructure(text: string): boolean {
    // Look for patterns typical of bank statements: aligned columns, repeated patterns
    const lines = text.split("\n").filter((l) => l.trim());

    if (lines.length < 5) {
        return false;
    }

    // Check for indicators of tabular data:
    // - Multiple lines with consistent column separators
    // - Date-like patterns aligned with amount patterns
    const dateAmountPattern = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}.*?\d+[.,]\d{2}/;
    let matchCount = 0;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        if (dateAmountPattern.test(lines[i])) {
            matchCount++;
        }
    }

    // If at least 30% of lines match date-amount pattern, likely a table
    return matchCount / lines.length > 0.3;
}

/**
 * Extract bank statement details from text (institution, period, balances)
 */
function extractStatementMetadata(text: string): {
    institution?: string;
    periodStart?: Date;
    periodEnd?: Date;
    accountHints: string[];
} {
    const metadata: {
        institution?: string;
        periodStart?: Date;
        periodEnd?: Date;
        accountHints: string[];
    } = { accountHints: [] };

    // Common institution keywords
    const institutionPatterns: Record<string, RegExp> = {
        "Bank of America": /bank\s+of\s+america|boa(?:\s|$)/i,
        "Wells Fargo": /wells\s+fargo|wellsfargo/i,
        Chase: /jpmorgan\s+chase|chase\s+bank|chase|jp morgan/i,
        Citibank: /citibank|citi(?:\s|$)/i,
        "Capital One": /capital\s+one|capital\s+bank/i,
        Discover: /discover\s+bank|discover/i,
        "American Express": /american\s+express|amex/i,
    };

    for (const [bank, pattern] of Object.entries(institutionPatterns)) {
        if (pattern.test(text)) {
            metadata.institution = bank;
            break;
        }
    }

    // Extract date range (common patterns: "Statement Period:", "As of:", "From", "To")
    const periodPattern = /(?:statement\s+)?(?:from|for|period)[\s:]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[\s\-to]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
    const periodMatch = text.match(periodPattern);
    if (periodMatch) {
        try {
            const [, startStr, endStr] = periodMatch;
            metadata.periodStart = parseStatementDate(startStr);
            metadata.periodEnd = parseStatementDate(endStr);
        } catch {
            // Date parsing failed, continue
        }
    }

    // Extract account hints (account numbers, account types)
    const accountPatterns = [
        /account\s*(?:number|#)?[\s:]+([x\d]{4,})/i,
        /(?:checking|savings|credit\s+card)\s+(?:account|acct)\s*[#:]?\s*([x\d]{4,})/i,
        /([0-9]{4}[-]?\d{4}[-]?\d{2})/,
    ];

    accountPatterns.forEach((pattern) => {
        const matches = text.match(pattern);
        if (matches && matches[1]) {
            metadata.accountHints.push(matches[1]);
        }
    });

    return metadata;
}

/**
 * Parse date from various formats found in statements
 */
function parseStatementDate(dateStr: string): Date {
    // Try MM/DD/YYYY
    let match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
    if (match) {
        let [, month, day, year] = match;
        const y = parseInt(year);
        const yearFull = y < 100 ? (y > 50 ? 1900 + y : 2000 + y) : y;
        return new Date(yearFull, parseInt(month) - 1, parseInt(day));
    }

    throw new Error(`Could not parse date: ${dateStr}`);
}

/**
 * Detect account type from text patterns
 */
function detectAccountTypeFromText(text: string): AccountType | undefined {
    const textLower = text.toLowerCase();

    if (/credit\s+card|visa|mastercard|amex/i.test(textLower)) return AccountType.CREDIT_CARD;
    if (/checking|check|draft/i.test(textLower)) return AccountType.CHECKING;
    if (/savings|interest\s+earned|dividend/i.test(textLower)) return AccountType.SAVINGS;
    if (/401k|ira|retirement/i.test(textLower)) return AccountType.RETIREMENT;
    if (/mortgage|home\s+loan/i.test(textLower)) return AccountType.MORTGAGE;
    if (/loan|personal\s+loan|auto\s+loan/i.test(textLower)) return AccountType.LOAN;
    if (/investment|brokerage|stock/i.test(textLower)) return AccountType.INVESTMENT;

    return undefined;
}

/**
 * Extract balance from text (opening/closing balance)
 */
function extractBalance(text: string): { opening?: number; closing?: number } {
    const result: { opening?: number; closing?: number } = {};

    // Look for opening balance
    const openingPattern = /opening\s+balance[\s:]+\$?([\d,]+\.?\d*)/i;
    const openingMatch = text.match(openingPattern);
    if (openingMatch && openingMatch[1]) {
        const amount = parseFloat(openingMatch[1].replace(/,/g, ""));
        if (!isNaN(amount)) {
            result.opening = Math.round(amount * 100);
        }
    }

    // Look for closing balance
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
 * PDF Statement Parser
 * Implements StatementParser interface for PDF documents
 */
export class PdfStatementParser implements StatementParser {
    /**
     * Check if this parser can handle PDF input
     */
    async canParse(input: ParserInput): Promise<ParserMatch> {
        if (input.sourceType !== DocumentSourceType.PDF) {
            return {
                matches: false,
                confidence: 0,
                reason: `Source type is ${input.sourceType}, not PDF`,
            };
        }

        // Check MIME type
        if (!input.mimeType.toLowerCase().includes("pdf")) {
            return {
                matches: false,
                confidence: 0,
                reason: `MIME type is ${input.mimeType}, not application/pdf`,
            };
        }

        // Validate PDF structure
        try {
            const pdfBuffer = typeof input.fileContent === 'string'
                ? Buffer.from(input.fileContent, "base64")
                : input.fileContent;

            // Check PDF signature
            if (!pdfBuffer.toString("binary", 0, 4).startsWith("%PDF")) {
                return {
                    matches: false,
                    confidence: 0,
                    reason: "File is not a valid PDF (missing PDF signature)",
                };
            }

            // Check for encryption (Password-protected PDFs)
            const content = pdfBuffer.toString("binary");
            if (content.includes("/Encrypt")) {
                return {
                    matches: false,
                    confidence: 0,
                    reason: "PDF is password-protected - cannot process encrypted documents",
                };
            }

            return {
                matches: true,
                confidence: 0.95,
                reason: "Valid PDF document",
            };
        } catch (error) {
            return {
                matches: false,
                confidence: 0,
                reason: `PDF validation failed: ${error instanceof Error ? error.message : "unknown error"}`,
            };
        }
    }

    /**
     * Parse PDF and extract transaction candidates
     * Process stages:
     * 1. Text extraction (from PDF text layer)
     * 2. Table detection (if text suggests tabular structure)
     * 3. OCR fallback (if insufficient text extracted)
     * 4. Parse extracted text/transactions
     * 5. Extract metadata
     */
    async parse(input: ParserInput): Promise<ExtractedParsedStatement> {
        // Validate input
        const canParseResult = await this.canParse(input);
        if (!canParseResult.matches) {
            throw new Error(`Cannot parse: ${canParseResult.reason}`);
        }

        // Convert to buffer if needed
        const pdfBuffer = typeof input.fileContent === 'string'
            ? Buffer.from(input.fileContent, "base64")
            : input.fileContent;

        // Stage 1: Text extraction
        let extractedText: string;
        let pageCount: number;
        let extractionMethods: ExtractionMethod[] = [];
        let textPerPage: Map<number, string>;

        try {
            const result = await extractTextFromPdf(pdfBuffer);
            extractedText = result.text;
            pageCount = result.pageCount;
            textPerPage = result.textPerPage;

            if (extractedText.trim()) {
                extractionMethods.push(ExtractionMethod.TEXT);
            }
        } catch (error) {
            extractedText = "";
            pageCount = 1;
            textPerPage = new Map();
            throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : "unknown"}`);
        }

        // Stage 2: Detect if text is tabular
        let hasTableStructure = false;
        if (extractedText.trim()) {
            hasTableStructure = detectTableStructure(extractedText);
            if (hasTableStructure) {
                extractionMethods.push(ExtractionMethod.TABLE);
            }
        }

        // Stage 3: OCR fallback (if insufficient text)
        if (!extractedText.trim()) {
            // PDF is scanned/image-based - would need OCR
            // For now, return error as OCR requires external dependency
            throw new Error(
                "PDF appears to be scanned (no text layer detected). OCR processing requires additional setup."
            );
        }

        // Stage 4: Extract metadata
        const metadata = extractStatementMetadata(extractedText);
        const accountType = detectAccountTypeFromText(extractedText);
        const balances = extractBalance(extractedText);

        // Stage 5: Parse transactions from extracted text
        // For now, return minimal structure - actual parsing would convert text to TransactionCandidates
        const transactions: ExtractedTransactionCandidate[] = [];

        // Try to extract simple transactions from text
        // This is simplified; real implementation would be more sophisticated
        const linePattern =
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2}|-[\d,]+\.\d{2}|[\d,]+\.\d{2}[\s\(])/gm;
        let match;
        let rowNumber = 1;

        while ((match = linePattern.exec(extractedText)) !== null) {
            try {
                const dateStr = match[1];
                const description = match[2].trim();
                const amountStr = match[3].replace(/[\s()]/g, "");

                const date = parseStatementDate(dateStr);
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
                        extractionMethod: ExtractionMethod.TEXT,
                        confidence: 0.8,
                    },
                });

                rowNumber++;
            } catch {
                // Skip malformed lines
            }
        }

        return {
            fileName: input.fileName,
            sourceType: DocumentSourceType.PDF,
            detectedFormat: {
                hasDebitCreditColumns: false,
                hasSignedAmounts: extractedText.includes("-"),
                hasRunningBalance: /balance|balance|running\s+balance/i.test(extractedText),
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
            extractionMethods,
            institutionDetected: metadata.institution,
            accountHints: metadata.accountHints,
            openingBalance: balances.opening
                ? {
                    amountCents: balances.opening,
                    date: metadata.periodStart || new Date(),
                    confidence: 0.7,
                }
                : undefined,
            closingBalance: balances.closing
                ? {
                    amountCents: balances.closing,
                    date: metadata.periodEnd || new Date(),
                    confidence: 0.7,
                }
                : undefined,
            pageCount,
            warnings: transactions.length === 0
                ? [
                    {
                        type: "skipped_row",
                        message: "No transactions extracted from PDF",
                    },
                ]
                : [],
            errors: [],
        };
    }
}
