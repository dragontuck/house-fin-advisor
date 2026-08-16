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
import { ParserInput, ParserMatch, ParsedStatement, StatementParser } from "@house-fin/contracts";
export declare class CsvStatementParser implements StatementParser {
    canParse(input: ParserInput): Promise<ParserMatch>;
    parse(input: ParserInput): Promise<ParsedStatement>;
}
//# sourceMappingURL=csv-statement-parser.d.ts.map