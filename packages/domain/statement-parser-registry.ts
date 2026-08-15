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

import {
    ParserInput,
    ParserMatch,
    ParsedStatement,
    StatementParser,
    DocumentSourceType,
    ExtractedParsedStatement,
} from "@house-fin/contracts";
import { CsvStatementParser } from "./csv-statement-parser";
import { PdfStatementParser } from "./pdf-statement-parser";
import { ImageStatementParser } from "./image-statement-parser";

/**
 * Configuration for statement parser
 */
export interface StatementParserConfig {
    textExtractionTimeoutMs?: number;  // Timeout for text extraction (10s default)
    ocrTimeoutMs?: number;             // Timeout for OCR (60s default)
    maxFileSize?: number;              // Max file size in bytes (50MB default)
    enableOcr?: boolean;               // Enable OCR fallback (true by default)
    enablePdfTableExtraction?: boolean; // Enable PDF table extraction (true default)
}

/**
 * Security-enhanced parser input wrapper
 */
export interface SecureParserInput extends ParserInput {
    checksumVerified?: boolean;  // Checksum was validated
    sourceIpAddress?: string;    // Origin IP (for audit trail)
    uploadedByUserId?: string;   // User who uploaded (for audit trail)
}

/**
 * Parser selection result
 */
export interface ParserSelection {
    parser: StatementParser;
    sourceType: DocumentSourceType;
    confidence: number;
}

/**
 * Statement Parser Registry
 * Manages multiple parser implementations and routing
 */
export class StatementParserRegistry {
    private parsers: Map<DocumentSourceType, StatementParser>;
    private config: Required<StatementParserConfig>;

    constructor(config: StatementParserConfig = {}) {
        // Initialize parser instances
        this.parsers = new Map([
            [DocumentSourceType.CSV, new CsvStatementParser()],
            [DocumentSourceType.PDF, new PdfStatementParser()],
            [DocumentSourceType.IMAGE, new ImageStatementParser()],
        ]);

        // Merge config with defaults
        this.config = {
            textExtractionTimeoutMs: config.textExtractionTimeoutMs ?? 10_000,
            ocrTimeoutMs: config.ocrTimeoutMs ?? 60_000,
            maxFileSize: config.maxFileSize ?? 50 * 1024 * 1024,
            enableOcr: config.enableOcr ?? true,
            enablePdfTableExtraction: config.enablePdfTableExtraction ?? true,
        };
    }

    /**
     * Get parser for specific source type
     */
    getParser(sourceType: DocumentSourceType): StatementParser {
        const parser = this.parsers.get(sourceType);
        if (!parser) {
            throw new Error(`No parser registered for source type: ${sourceType}`);
        }
        return parser;
    }

    /**
     * Register custom parser implementation
     */
    registerParser(sourceType: DocumentSourceType, parser: StatementParser): void {
        this.parsers.set(sourceType, parser);
    }

    /**
     * Select appropriate parser for input
     * Returns parser and confidence score
     */
    async selectParser(input: ParserInput): Promise<ParserSelection> {
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

        throw new Error(
            `Parser selection failed for ${sourceType}: ${canParse.reason}. ` +
            `Cannot find alternative parser. Check file format and try again.`
        );
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
    async parseWithTimeout(
        input: SecureParserInput,
        timeoutMs?: number
    ): Promise<ParsedStatement | ExtractedParsedStatement> {
        // Security: Validate input
        this.validateSecureInput(input);

        // Select parser
        const selection = await this.selectParser(input);
        const parser = selection.parser;

        // Determine timeout
        const timeout = timeoutMs ?? this.getTimeoutForSourceType(input.sourceType);

        // Execute with timeout
        return this.executeWithTimeout(
            () => parser.parse(input),
            timeout,
            `${input.sourceType} parsing`
        );
    }

    /**
     * Validate secure parser input
     */
    private validateSecureInput(input: SecureParserInput): void {
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

        const mimeOk = supportedMimes.some((m) =>
            input.mimeType.toLowerCase().includes(m.split("/")[1])
        );

        if (!mimeOk) {
            throw new Error(`Unsupported MIME type: ${input.mimeType}`);
        }

        // Validate source type
        if (!Object.values(DocumentSourceType).includes(input.sourceType)) {
            throw new Error(`Invalid source type: ${input.sourceType}`);
        }

        // Validate file size
        const fileSize = input.fileContent.length;
        if (fileSize > this.config.maxFileSize) {
            throw new Error(
                `File size ${fileSize} exceeds maximum ${this.config.maxFileSize} bytes`
            );
        }
    }

    /**
     * Get appropriate timeout for source type
     */
    private getTimeoutForSourceType(sourceType: DocumentSourceType): number {
        switch (sourceType) {
            case DocumentSourceType.CSV:
                return 5000; // CSV is fast
            case DocumentSourceType.PDF:
                return this.config.textExtractionTimeoutMs; // Text extraction timeout
            case DocumentSourceType.IMAGE:
                return this.config.ocrTimeoutMs; // OCR is slower
            default:
                return 10000;
        }
    }

    /**
     * Execute function with timeout protection
     */
    private async executeWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number,
        operationName: string
    ): Promise<T> {
        return Promise.race([
            fn(),
            new Promise<T>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
                    timeoutMs
                )
            ),
        ]);
    }

    /**
     * Get configuration
     */
    getConfig(): Readonly<StatementParserConfig> {
        return { ...this.config };
    }
}

/**
 * Create default parser registry with standard configuration
 */
export function createStatementParserRegistry(
    config?: StatementParserConfig
): StatementParserRegistry {
    return new StatementParserRegistry(config);
}

/**
 * Convenience function to parse statement using default registry
 */
const defaultRegistry = new StatementParserRegistry();

export async function parseStatement(
    input: SecureParserInput,
    timeoutMs?: number
): Promise<ParsedStatement | ExtractedParsedStatement> {
    return defaultRegistry.parseWithTimeout(input, timeoutMs);
}
