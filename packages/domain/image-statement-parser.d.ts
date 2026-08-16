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
import { ParserInput, ParserMatch, StatementParser, ExtractedParsedStatement } from "@house-fin/contracts";
/**
 * Image Statement Parser
 * Implements StatementParser interface for image documents (PNG, JPEG, TIFF)
 */
export declare class ImageStatementParser implements StatementParser {
    /**
     * Check if this parser can handle image input
     */
    canParse(input: ParserInput): Promise<ParserMatch>;
    /**
     * Parse image statement through OCR
     * Stages:
     * 1. Image validation
     * 2. OCR extraction
     * 3. Text parsing
     * 4. Transaction extraction
     * 5. Metadata extraction
     */
    parse(input: ParserInput): Promise<ExtractedParsedStatement>;
}
//# sourceMappingURL=image-statement-parser.d.ts.map