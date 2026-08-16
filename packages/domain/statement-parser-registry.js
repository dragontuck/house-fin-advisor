"use strict";
/**
 * Statement Parser Registry & Factory
 *
 * Provides unified interface for parsing different document types:
 * - CSV (CsvStatementParser)
 * - PDF (PdfStatementParser)
 * - Image (ImageStatementParser)
 *
 * Includes:
 * - Parser selection by source type
 * - Timeout protection
 * - Resource limits
 * - Security validation
 * - Fallback strategies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatementParserRegistry = void 0;
exports.createStatementParserRegistry = createStatementParserRegistry;
exports.parseStatement = parseStatement;
const contracts_1 = require("@house-fin/contracts");
const csv_statement_parser_1 = require("./csv-statement-parser");
const pdf_statement_parser_1 = require("./pdf-statement-parser");
const image_statement_parser_1 = require("./image-statement-parser");
/**
 * Statement Parser Registry
 * Manages multiple parser implementations and routing
 */
class StatementParserRegistry {
    constructor(config = {}) {
        // Initialize parser instances
        this.parsers = new Map([
            [contracts_1.DocumentSourceType.CSV, new csv_statement_parser_1.CsvStatementParser()],
            [contracts_1.DocumentSourceType.PDF, new pdf_statement_parser_1.PdfStatementParser()],
            [contracts_1.DocumentSourceType.IMAGE, new image_statement_parser_1.ImageStatementParser()],
        ]);
        // Merge config with defaults
        this.config = {
            textExtractionTimeoutMs: config.textExtractionTimeoutMs ?? 10000,
            ocrTimeoutMs: config.ocrTimeoutMs ?? 60000,
            maxFileSize: config.maxFileSize ?? 50 * 1024 * 1024,
            enableOcr: config.enableOcr ?? true,
            enablePdfTableExtraction: config.enablePdfTableExtraction ?? true,
        };
    }
    /**
     * Get parser for specific source type
     */
    getParser(sourceType) {
        const parser = this.parsers.get(sourceType);
        if (!parser) {
            throw new Error(`No parser registered for source type: ${sourceType}`);
        }
        return parser;
    }
    /**
     * Register custom parser implementation
     */
    registerParser(sourceType, parser) {
        this.parsers.set(sourceType, parser);
    }
    /**
     * Select appropriate parser for input
     * Returns parser and confidence score
     */
    async selectParser(input) {
        const sourceType = input.sourceType;
        // Get primary parser for source type
        const primaryParser = this.getParser(sourceType);
        const canParse = await primaryParser.canParse(input);
        if (canParse.matches) {
            return {
                parser: primaryParser,
                sourceType,
                confidence: canParse.confidence,
            };
        }
        throw new Error(`Parser selection failed for ${sourceType}: ${canParse.reason}. ` +
            `Cannot find alternative parser. Check file format and try again.`);
    }
    /**
     * Parse statement with timeout protection
     *
     * Strategy:
     * 1. Validate input
     * 2. Select parser
     * 3. Apply timeout
     * 4. Execute parse
     * 5. Return result or error
     */
    async parseWithTimeout(input, timeoutMs) {
        // Security: Validate input
        this.validateSecureInput(input);
        // Select parser
        const selection = await this.selectParser(input);
        const parser = selection.parser;
        // Determine timeout
        const timeout = timeoutMs ?? this.getTimeoutForSourceType(input.sourceType);
        // Execute with timeout
        return this.executeWithTimeout(() => parser.parse(input), timeout, `${input.sourceType} parsing`);
    }
    /**
     * Validate secure parser input
     */
    validateSecureInput(input) {
        // Validate MIME type first
        const supportedMimes = [
            "text/csv",
            "application/csv",
            "text/plain",
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/tiff",
        ];
        const mimeOk = supportedMimes.some((m) => input.mimeType.toLowerCase().includes(m.split("/")[1]));
        if (!mimeOk) {
            throw new Error(`Unsupported MIME type: ${input.mimeType}`);
        }
        // Validate source type
        if (!Object.values(contracts_1.DocumentSourceType).includes(input.sourceType)) {
            throw new Error(`Invalid source type: ${input.sourceType}`);
        }
        // Validate file size
        const fileSize = input.fileContent.length;
        if (fileSize > this.config.maxFileSize) {
            throw new Error(`File size ${fileSize} exceeds maximum ${this.config.maxFileSize} bytes`);
        }
    }
    /**
     * Get appropriate timeout for source type
     */
    getTimeoutForSourceType(sourceType) {
        switch (sourceType) {
            case contracts_1.DocumentSourceType.CSV:
                return 5000; // CSV is fast
            case contracts_1.DocumentSourceType.PDF:
                return this.config.textExtractionTimeoutMs; // Text extraction timeout
            case contracts_1.DocumentSourceType.IMAGE:
                return this.config.ocrTimeoutMs; // OCR is slower
            default:
                return 10000;
        }
    }
    /**
     * Execute function with timeout protection
     */
    async executeWithTimeout(fn, timeoutMs, operationName) {
        return Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)),
        ]);
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.StatementParserRegistry = StatementParserRegistry;
/**
 * Create default parser registry with standard configuration
 */
function createStatementParserRegistry(config) {
    return new StatementParserRegistry(config);
}
/**
 * Convenience function to parse statement using default registry
 */
const defaultRegistry = new StatementParserRegistry();
async function parseStatement(input, timeoutMs) {
    return defaultRegistry.parseWithTimeout(input, timeoutMs);
}
//# sourceMappingURL=statement-parser-registry.js.map