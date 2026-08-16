"use strict";
/**
 * CSV Statement Parser
 *
 * Detects and parses CSV statements from various financial institutions.
 * Handles multiple formats:
 * - Standard columns: Date, Description, Amount
 * - Debit/Credit columns
 * - Signed amounts (positive/negative)
 * - Running balance
 * - Various date formats
 *
 * Does NOT use AI to interpret data - relies on column detection heuristics
 * and explicit validation. Rejects ambiguous mappings rather than guessing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CsvStatementParser = void 0;
const contracts_1 = require("@house-fin/contracts");
/**
 * Parse CSV content into rows
 * Handles standard CSV format with quoted fields containing commas/newlines
 */
function parseCsvContent(content) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let insideQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Escaped quote
                currentField += '"';
                i++;
            }
            else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        }
        else if (char === "," && !insideQuotes) {
            // Field separator
            currentRow.push(currentField.trim());
            currentField = "";
        }
        else if ((char === "\n" || char === "\r") && !insideQuotes) {
            // Row separator
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField.trim());
                if (currentRow.some((f) => f)) {
                    // Only add non-empty rows
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = "";
            }
            // Skip \r\n pairs
            if (char === "\r" && nextChar === "\n") {
                i++;
            }
        }
        else {
            currentField += char;
        }
    }
    // Add final row
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f)) {
            rows.push(currentRow);
        }
    }
    return rows;
}
/**
 * Detect likely date columns by examining values
 */
function identifyDateColumn(rows, minSampleSize = 3) {
    if (rows.length < 2)
        return null;
    // Check each column
    for (let colIndex = 0; colIndex < rows[0].length; colIndex++) {
        let dateMatches = 0;
        const sampleSize = Math.min(minSampleSize, rows.length - 1); // Skip header
        for (let rowIndex = 1; rowIndex <= sampleSize; rowIndex++) {
            const value = rows[rowIndex]?.[colIndex]?.trim() || "";
            if (value && isValidDate(value)) {
                dateMatches++;
            }
        }
        // If all sampled values look like dates, this is likely the date column
        if (dateMatches === sampleSize) {
            return colIndex;
        }
    }
    return null;
}
/**
 * Check if a string looks like a date
 * Supports common formats: MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY, DD/MM/YYYY, MMM DD, YYYY, etc.
 */
function isValidDate(str) {
    if (!str || str.length < 4)
        return false;
    // Common date patterns
    const datePatterns = [
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YYYY or M/D/YY
        /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
        /^\d{1,2}-\d{1,2}-\d{2,4}$/, // MM-DD-YYYY or DD-MM-YYYY
        /^\d{1,2}\/\d{1,2}\/\d{1,2}$/, // M/D/YY
        /^[A-Z][a-z]{2}\s+\d{1,2}$/, // Jan 15
        /^[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}$/, // Jan 15, 2024
        /^\d{4}$/, // Year only
        /^20\d{2}(-\d{2})?(-\d{2})?$/, // ISO date
    ];
    return datePatterns.some((pattern) => pattern.test(str));
}
/**
 * Parse a date string in various formats
 */
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    // Try parsing with common formats
    const trimmed = dateStr.trim();
    // ISO format: YYYY-MM-DD - parse manually to avoid timezone issues
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        const parts = trimmed.split("T")[0].split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime()))
            return date;
    }
    // Try common patterns
    const patterns = [
        {
            regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4}|(?:\d{2}))$/,
            parse: (m) => {
                let year = parseInt(m[3], 10);
                if (year < 100) {
                    year += year < 30 ? 2000 : 1900; // Common heuristic for 2-digit years
                }
                return new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
            },
        },
        {
            regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
            parse: (m) => {
                return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
            },
        },
        {
            regex: /^([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})$/,
            parse: (m) => {
                const date = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
                return isNaN(date.getTime()) ? null : date;
            },
        },
    ];
    for (const { regex, parse } of patterns) {
        const match = trimmed.match(regex);
        if (match) {
            const parsed = parse(match);
            if (parsed && !isNaN(parsed.getTime())) {
                return parsed;
            }
        }
    }
    // Try JavaScript date parser as last resort
    const jsDate = new Date(trimmed);
    if (!isNaN(jsDate.getTime())) {
        return jsDate;
    }
    return null;
}
/**
 * Parse amount string to cents (integer)
 * Handles: $1,234.56, 1234.56, -1234.56, (1234.56), etc.
 */
function parseAmount(amountStr) {
    if (!amountStr)
        return null;
    const trimmed = amountStr.trim();
    // Handle parentheses as negative indicator (accounting format)
    const isNegative = trimmed.includes("(") &&
        trimmed.includes(")") &&
        !trimmed.includes("(") === false;
    // Remove currency symbols and whitespace
    let cleaned = trimmed
        .replace(/[$€£¥₹₽]/g, "") // Currency symbols
        .replace(/[()]/g, "") // Parentheses
        .replace(/\s/g, ""); // Whitespace
    // Handle negative sign
    const startsNegative = cleaned.startsWith("-");
    cleaned = cleaned.replace(/^-/, "");
    // Extract numeric part (allow one decimal point and commas)
    const match = cleaned.match(/^[\d,]+\.?\d*$/);
    if (!match)
        return null;
    // Remove commas and parse
    const numberStr = cleaned.replace(/,/g, "");
    const numberValue = parseFloat(numberStr);
    if (isNaN(numberValue))
        return null;
    // Convert to cents, round to nearest cent
    let cents = Math.round(numberValue * 100);
    // Apply negative indicators
    if (startsNegative || isNegative) {
        cents = -Math.abs(cents);
    }
    return cents;
}
/**
 * Detect amount representation: signed or debit/credit columns
 */
function detectAmountRepresentation(rows) {
    let hasSignedAmounts = false;
    let hasDebitCredit = false;
    let signedAmountColumn;
    let debitColumn;
    let creditColumn;
    // Look for patterns in numeric columns
    for (let colIndex = 0; colIndex < (rows[0]?.length || 0); colIndex++) {
        const values = rows.slice(1, Math.min(6, rows.length)).map((r) => r[colIndex]?.trim() || "");
        const numericValues = values.filter((v) => v && /^[\d,.\-()$€£¥]*\.?\d+/.test(v));
        if (numericValues.length >= 2) {
            // Check for signed amounts (both positive and negative)
            const parsed = numericValues.map(parseAmount).filter((v) => v !== null);
            if (parsed.length === numericValues.length &&
                parsed.some((v) => v > 0) &&
                parsed.some((v) => v < 0)) {
                hasSignedAmounts = true;
                signedAmountColumn = colIndex;
            }
            // Check for debit/credit pattern (all positive or mostly positive in column)
            if (parsed.length === numericValues.length && parsed.every((v) => v >= 0)) {
                // Could be debit or credit column - check header
                const headerVal = rows[0]?.[colIndex]?.toUpperCase() || "";
                if (headerVal.includes("DEBIT") ||
                    headerVal.includes("DBT") ||
                    headerVal.includes("WITHDRAWAL") ||
                    headerVal.includes("OUT")) {
                    debitColumn = colIndex;
                    hasDebitCredit = true;
                }
                else if (headerVal.includes("CREDIT") ||
                    headerVal.includes("CRD") ||
                    headerVal.includes("DEPOSIT") ||
                    headerVal.includes("IN")) {
                    creditColumn = colIndex;
                    hasDebitCredit = true;
                }
            }
        }
    }
    return {
        hasSignedAmounts,
        hasDebitCredit,
        signedAmountColumn,
        debitColumn,
        creditColumn,
    };
}
/**
 * Detect header row by looking for common keywords
 */
function detectHeaderRow(rows) {
    const keywords = [
        "date",
        "description",
        "amount",
        "debit",
        "credit",
        "balance",
        "transaction",
        "time",
    ];
    for (let rowIndex = 0; rowIndex < Math.min(5, rows.length); rowIndex++) {
        const headerCandidates = rows[rowIndex]
            .map((cell) => cell.toLowerCase())
            .filter((cell) => keywords.some((kw) => cell.includes(kw)));
        if (headerCandidates.length >= 2) {
            return rowIndex;
        }
    }
    return 0; // Default to first row
}
/**
 * Map columns by matching header keywords
 */
function mapColumns(rows, headerRowIndex) {
    const ambiguities = [];
    const mapping = {
        dateColumnIndex: null,
        descriptionColumnIndex: null,
        amountColumnIndex: null,
        debitColumnIndex: null,
        creditColumnIndex: null,
        balanceColumnIndex: null,
        confidence: 0,
        ambiguities,
    };
    if (headerRowIndex >= rows.length) {
        mapping.ambiguities.push("Header row index out of bounds");
        return mapping;
    }
    const headerRow = rows[headerRowIndex];
    const dataRows = rows.slice(headerRowIndex + 1);
    // Keyword patterns for each column type
    const patterns = {
        date: {
            keywords: ["date", "posted", "trans date", "transaction date"],
            key: "dateColumnIndex",
        },
        description: {
            keywords: [
                "description",
                "desc",
                "memo",
                "reference",
                "detail",
                "transaction type",
            ],
            key: "descriptionColumnIndex",
        },
        amount: { keywords: ["amount", "amt", "value"], key: "amountColumnIndex" },
        debit: {
            keywords: ["debit", "dbt", "withdrawal", "out"],
            key: "debitColumnIndex",
        },
        credit: {
            keywords: ["credit", "crd", "deposit", "in"],
            key: "creditColumnIndex",
        },
        balance: {
            keywords: ["balance", "bal", "running balance"],
            key: "balanceColumnIndex",
        },
    };
    // Match headers to patterns
    for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
        const headerCell = headerRow[colIndex].toLowerCase().trim();
        for (const [, { keywords, key }] of Object.entries(patterns)) {
            if (keywords.some((kw) => headerCell.includes(kw))) {
                const currentValue = mapping[key];
                if (currentValue !== null) {
                    ambiguities.push(`Multiple ${key} candidates found`);
                }
                else {
                    mapping[key] = colIndex;
                }
            }
        }
    }
    // Fallback: detect by column content if headers are unclear
    if (!mapping.dateColumnIndex) {
        const detected = identifyDateColumn(rows, 3);
        if (detected !== null) {
            mapping.dateColumnIndex = detected;
        }
    }
    // Calculate confidence based on required fields
    const requiredFound = [
        mapping.dateColumnIndex !== null,
        mapping.descriptionColumnIndex !== null,
        mapping.amountColumnIndex !== null || (mapping.debitColumnIndex !== null && mapping.creditColumnIndex !== null),
    ];
    mapping.confidence = requiredFound.filter(Boolean).length / requiredFound.length;
    return mapping;
}
/**
 * Detect account type from statement content
 */
function detectAccountType(rows, mapping) {
    // Look for keywords in descriptions and headers
    const allText = rows
        .flatMap((r) => r)
        .join(" ")
        .toLowerCase();
    // Check credit card first (more specific)
    if (allText.includes("credit card") ||
        (allText.includes("card") && (allText.includes("payment") || allText.includes("charge")))) {
        return contracts_1.AccountType.CREDIT_CARD;
    }
    // Then check savings
    if (allText.includes("savings") ||
        allText.includes("interest earned") ||
        allText.includes("dividend")) {
        return contracts_1.AccountType.SAVINGS;
    }
    // Check for loan/mortgage
    if (allText.includes("loan") ||
        allText.includes("mortgage") ||
        allText.includes("principal")) {
        // Determine which
        if (allText.includes("mortgage")) {
            return contracts_1.AccountType.MORTGAGE;
        }
        return contracts_1.AccountType.LOAN;
    }
    // Check for investment/retirement
    if (allText.includes("investment") ||
        allText.includes("401k") ||
        allText.includes("ira") ||
        allText.includes("retirement")) {
        return contracts_1.AccountType.INVESTMENT;
    }
    // Default to checking (most common)
    if (allText.includes("checking") ||
        allText.includes("demand deposit") ||
        allText.includes("cheque") ||
        allText.includes("direct deposit")) {
        return contracts_1.AccountType.CHECKING;
    }
    return undefined;
}
/**
 * Parse transactions from mapped columns
 */
function parseTransactions(rows, mapping, input) {
    const transactions = [];
    const warnings = [];
    const dataRows = rows.slice((rows[0] === rows[0] ? 1 : 0)); // Skip header row
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
        const row = dataRows[rowIndex];
        const sourceRowNumber = rowIndex + 1; // 1-indexed for user display
        // Extract date
        let date = null;
        let originalDate = "";
        if (mapping.dateColumnIndex !== null && mapping.dateColumnIndex < row.length) {
            originalDate = row[mapping.dateColumnIndex];
            date = parseDate(originalDate);
            if (!date) {
                warnings.push({
                    type: "date_format_unclear",
                    rowNumber: sourceRowNumber,
                    message: `Could not parse date: "${originalDate}"`,
                });
                continue;
            }
        }
        else {
            warnings.push({
                type: "skipped_row",
                rowNumber: sourceRowNumber,
                message: "No date column found",
            });
            continue;
        }
        // Extract description
        let description = "";
        if (mapping.descriptionColumnIndex !== null &&
            mapping.descriptionColumnIndex < row.length) {
            description = row[mapping.descriptionColumnIndex].trim();
        }
        if (!description) {
            warnings.push({
                type: "skipped_row",
                rowNumber: sourceRowNumber,
                message: "Empty description",
            });
            continue;
        }
        // Extract amount
        let amountCents = null;
        let originalAmount = "";
        if (mapping.amountColumnIndex !== null && mapping.amountColumnIndex < row.length) {
            originalAmount = row[mapping.amountColumnIndex];
            amountCents = parseAmount(originalAmount);
            if (amountCents === null) {
                warnings.push({
                    type: "amount_format_unclear",
                    rowNumber: sourceRowNumber,
                    message: `Could not parse amount: "${originalAmount}"`,
                });
                continue;
            }
        }
        else if (mapping.debitColumnIndex !== null &&
            mapping.creditColumnIndex !== null) {
            // Extract from debit/credit columns
            const debitStr = mapping.debitColumnIndex < row.length ? row[mapping.debitColumnIndex] : "";
            const creditStr = mapping.creditColumnIndex < row.length ? row[mapping.creditColumnIndex] : "";
            const debitAmount = debitStr ? parseAmount(debitStr) : null;
            const creditAmount = creditStr ? parseAmount(creditStr) : null;
            if (debitAmount !== null && debitAmount > 0) {
                amountCents = -Math.abs(debitAmount); // Debits are negative
                originalAmount = debitStr;
            }
            else if (creditAmount !== null && creditAmount > 0) {
                amountCents = creditAmount;
                originalAmount = creditStr;
            }
            else {
                warnings.push({
                    type: "skipped_row",
                    rowNumber: sourceRowNumber,
                    message: "Could not extract debit/credit amounts",
                });
                continue;
            }
        }
        else {
            warnings.push({
                type: "skipped_row",
                rowNumber: sourceRowNumber,
                message: "No amount column found",
            });
            continue;
        }
        // Extract optional balance
        let balance;
        if (mapping.balanceColumnIndex !== null && mapping.balanceColumnIndex < row.length) {
            const balanceStr = row[mapping.balanceColumnIndex];
            const balanceAmount = parseAmount(balanceStr);
            if (balanceAmount !== null) {
                balance = balanceAmount;
            }
        }
        transactions.push({
            sourceRowNumber,
            date,
            description,
            amountCents,
            originalAmount,
            originalDate,
            balance,
        });
    }
    return { transactions, warnings };
}
class CsvStatementParser {
    async canParse(input) {
        if (input.sourceType !== contracts_1.DocumentSourceType.CSV) {
            return {
                matches: false,
                confidence: 0,
                reason: "Source type is not CSV",
            };
        }
        try {
            const csvContent = typeof input.fileContent === 'string'
                ? input.fileContent
                : input.fileContent.toString('utf-8');
            const rows = parseCsvContent(csvContent);
            if (rows.length < 2) {
                return {
                    matches: false,
                    confidence: 0,
                    reason: "CSV has fewer than 2 rows (header + data)",
                };
            }
            // Try to detect structure
            const headerRowIndex = detectHeaderRow(rows);
            const mapping = mapColumns(rows, headerRowIndex);
            // Check for required fields
            if (mapping.dateColumnIndex === null ||
                mapping.descriptionColumnIndex === null ||
                (mapping.amountColumnIndex === null &&
                    (mapping.debitColumnIndex === null || mapping.creditColumnIndex === null))) {
                return {
                    matches: false,
                    confidence: mapping.confidence,
                    reason: "Could not identify required columns (date, description, amount or debit/credit)",
                };
            }
            return {
                matches: true,
                confidence: mapping.confidence,
                reason: `Detected CSV statement with ${mapping.confidence * 100}% confidence`,
            };
        }
        catch (error) {
            return {
                matches: false,
                confidence: 0,
                reason: `Error parsing CSV: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
        }
    }
    async parse(input) {
        try {
            const csvContent = typeof input.fileContent === 'string'
                ? input.fileContent
                : input.fileContent.toString('utf-8');
            const rows = parseCsvContent(csvContent);
            if (rows.length < 2) {
                throw new Error("CSV must contain at least header and one data row");
            }
            const headerRowIndex = detectHeaderRow(rows);
            const mapping = mapColumns(rows, headerRowIndex);
            // Validate that we found required fields
            if (mapping.confidence < 0.6) {
                const missingFields = [];
                if (mapping.dateColumnIndex === null)
                    missingFields.push("date");
                if (mapping.descriptionColumnIndex === null)
                    missingFields.push("description");
                if (mapping.amountColumnIndex === null &&
                    (mapping.debitColumnIndex === null || mapping.creditColumnIndex === null)) {
                    missingFields.push("amount");
                }
                throw new Error(`Unable to detect statement structure with confidence (${mapping.confidence}). Missing/ambiguous required fields: ${missingFields.join(", ")}. Issues: ${mapping.ambiguities.join("; ")}`);
            }
            if (mapping.dateColumnIndex === null) {
                throw new Error("Could not identify date column. Rejected ambiguous mapping rather than guessing.");
            }
            if (mapping.descriptionColumnIndex === null) {
                throw new Error("Could not identify description column. Rejected ambiguous mapping rather than guessing.");
            }
            if (mapping.amountColumnIndex === null &&
                (mapping.debitColumnIndex === null || mapping.creditColumnIndex === null)) {
                throw new Error("Could not identify amount columns (need either 'Amount' or both 'Debit' and 'Credit' columns). Rejected ambiguous mapping rather than guessing.");
            }
            const amountRepresentation = detectAmountRepresentation(rows);
            const { transactions, warnings } = parseTransactions(rows, mapping, input);
            if (transactions.length === 0) {
                throw new Error("No valid transactions could be parsed from CSV. Check file format and column structure.");
            }
            const accountType = detectAccountType(rows, mapping);
            return {
                fileName: input.fileName,
                sourceType: input.sourceType,
                detectedFormat: {
                    hasDebitCreditColumns: amountRepresentation.hasDebitCredit,
                    hasSignedAmounts: amountRepresentation.hasSignedAmounts,
                    hasRunningBalance: mapping.balanceColumnIndex !== null,
                    headerRowIndex,
                    totalRows: rows.length,
                },
                metadata: {
                    detectedAccountType: accountType,
                    detectedCurrency: "USD", // Default - could enhance to detect currency
                },
                transactions,
                warnings,
                errors: [],
            };
        }
        catch (error) {
            throw new Error(`Failed to parse CSV statement: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}
exports.CsvStatementParser = CsvStatementParser;
//# sourceMappingURL=csv-statement-parser.js.map