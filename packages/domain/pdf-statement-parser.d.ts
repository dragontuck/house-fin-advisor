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
import { ParserInput, ParserMatch, StatementParser, ExtractedParsedStatement } from "@house-fin/contracts";
/**
 * PDF Statement Parser
 * Implements StatementParser interface for PDF documents
 */
export declare class PdfStatementParser implements StatementParser {
    /**
     * Check if this parser can handle PDF input
     */
    canParse(input: ParserInput): Promise<ParserMatch>;
    /**
     * Parse PDF and extract transaction candidates
     * Process stages:
     * 1. Text extraction (from PDF text layer)
     * 2. Table detection (if text suggests tabular structure)
     * 3. OCR fallback (if insufficient text extracted)
     * 4. Parse extracted text/transactions
     * 5. Extract metadata
     */
    parse(input: ParserInput): Promise<ExtractedParsedStatement>;
}
//# sourceMappingURL=pdf-statement-parser.d.ts.map