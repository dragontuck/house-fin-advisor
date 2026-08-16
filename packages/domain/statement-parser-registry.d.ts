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
import { ParserInput, ParsedStatement, StatementParser, DocumentSourceType, ExtractedParsedStatement } from "@house-fin/contracts";
/**
 * Configuration for statement parser
 */
export interface StatementParserConfig {
    textExtractionTimeoutMs?: number;
    ocrTimeoutMs?: number;
    maxFileSize?: number;
    enableOcr?: boolean;
    enablePdfTableExtraction?: boolean;
}
/**
 * Security-enhanced parser input wrapper
 */
export interface SecureParserInput extends ParserInput {
    checksumVerified?: boolean;
    sourceIpAddress?: string;
    uploadedByUserId?: string;
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
export declare class StatementParserRegistry {
    private parsers;
    private config;
    constructor(config?: StatementParserConfig);
    /**
     * Get parser for specific source type
     */
    getParser(sourceType: DocumentSourceType): StatementParser;
    /**
     * Register custom parser implementation
     */
    registerParser(sourceType: DocumentSourceType, parser: StatementParser): void;
    /**
     * Select appropriate parser for input
     * Returns parser and confidence score
     */
    selectParser(input: ParserInput): Promise<ParserSelection>;
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
    parseWithTimeout(input: SecureParserInput, timeoutMs?: number): Promise<ParsedStatement | ExtractedParsedStatement>;
    /**
     * Validate secure parser input
     */
    private validateSecureInput;
    /**
     * Get appropriate timeout for source type
     */
    private getTimeoutForSourceType;
    /**
     * Execute function with timeout protection
     */
    private executeWithTimeout;
    /**
     * Get configuration
     */
    getConfig(): Readonly<StatementParserConfig>;
}
/**
 * Create default parser registry with standard configuration
 */
export declare function createStatementParserRegistry(config?: StatementParserConfig): StatementParserRegistry;
export declare function parseStatement(input: SecureParserInput, timeoutMs?: number): Promise<ParsedStatement | ExtractedParsedStatement>;
//# sourceMappingURL=statement-parser-registry.d.ts.map