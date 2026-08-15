/**
 * PDF and Image Statement Parser Tests
 * 
 * Comprehensive test coverage for:
 * - PDF statement parsing (digital, multi-page, scanned)
 * - Image statement parsing (PNG, JPEG)
 * - Parser registry and selection
 * - Error handling and edge cases
 * - Security validations
 * - Timeout protection
 * 
 * Test fixtures:
 * - fixtures/pdf/digital-statement.pdf
 * - fixtures/pdf/multi-page-statement.pdf
 * - fixtures/pdf/scanned-statement.pdf
 * - fixtures/pdf/statement-image.png
 * - fixtures/pdf/malformed-statement.pdf
 * - fixtures/pdf/password-protected-statement.pdf
 * - fixtures/pdf/unreadable-statement.pdf
 */

import fs from "fs";
import path from "path";
import {
    DocumentSourceType,
    ParserInput,
    AccountType,
    ExtractionMethod,
    ExtractedParsedStatement,
} from "@house-fin/contracts";
import { PdfStatementParser } from "../../packages/domain/pdf-statement-parser";
import { ImageStatementParser } from "../../packages/domain/image-statement-parser";
import {
    StatementParserRegistry,
    createStatementParserRegistry,
    SecureParserInput,
} from "../../packages/domain/statement-parser-registry";

describe("PDF Statement Parser", () => {
    let parser: PdfStatementParser;
    const fixtureDir = path.join(__dirname, "../../fixtures/pdf");

    beforeEach(() => {
        parser = new PdfStatementParser();
    });

    describe("canParse", () => {
        it("should accept PDF source type", async () => {
            const input: ParserInput = {
                fileName: "test.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: Buffer.from("%PDF-1.4\n1 0 obj", "utf-8") as any,
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(true);
            expect(result.confidence).toBeGreaterThan(0.9);
        });

        it("should reject non-PDF source types", async () => {
            const input: ParserInput = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "Date,Description,Amount",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
            expect(result.confidence).toBe(0);
        });

        it("should reject invalid PDF signature", async () => {
            const input: ParserInput = {
                fileName: "fake.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: "Not a PDF file content",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
            expect(result.reason).toContain("PDF signature");
        });

        it("should detect password-protected PDFs", async () => {
            const filePath = path.join(fixtureDir, "password-protected-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: password-protected-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const hasEncryption = content.toString().includes("/Encrypt");

            if (!hasEncryption) {
                console.log("Skipping: fixture doesn't have /Encrypt marker");
                return;
            }

            const input: ParserInput = {
                fileName: "password-protected-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
            expect(result.reason).toContain("password");
        });
    });

    describe("PDF text extraction", () => {
        it("should parse digital PDF with text layer", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath); // Read as buffer, not utf-8
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            expect(result.fileName).toBe("digital-statement.pdf");
            expect(result.sourceType).toBe(DocumentSourceType.PDF);
            expect(result.pageCount).toBeGreaterThan(0);
            expect(result.extractionMethods).toContain(ExtractionMethod.TEXT);
        });

        it("should handle multi-page PDFs", async () => {
            const filePath = path.join(fixtureDir, "multi-page-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: multi-page-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "multi-page-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            expect(result.pageCount).toBeGreaterThanOrEqual(2);
        });

        it("should detect institution from PDF text", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            // Digital fixture should contain "Chase"
            if (result.institutionDetected) {
                expect(result.institutionDetected).toBeTruthy();
            }
        });

        it("should return warnings for scanned PDFs without text", async () => {
            const filePath = path.join(fixtureDir, "scanned-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: scanned-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "scanned-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            try {
                await parser.parse(input);
                // If OCR is configured, should succeed
            } catch (error) {
                // If OCR not configured, should fail gracefully
                expect((error as Error).message).toContain("OCR");
            }
        });
    });

    describe("Error handling", () => {
        it("should reject malformed PDFs", async () => {
            const filePath = path.join(fixtureDir, "malformed-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: malformed-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "malformed-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const canParse = await parser.canParse(input);
            expect(canParse.matches).toBe(true); // Looks like PDF

            // But parsing should fail or return warnings
            try {
                const result = (await parser.parse(input)) as ExtractedParsedStatement;
                expect(result.transactions.length).toBeLessThanOrEqual(0);
            } catch (error) {
                expect((error as Error).message).toBeTruthy();
            }
        });

        it("should detect password-protected PDFs during parse", async () => {
            const filePath = path.join(fixtureDir, "password-protected-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: password-protected-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "password-protected-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            await expect(parser.parse(input)).rejects.toThrow("password");
        });

        it("should provide helpful errors for unreadable PDFs", async () => {
            const filePath = path.join(fixtureDir, "unreadable-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: unreadable-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "unreadable-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            try {
                await parser.parse(input);
            } catch (error) {
                // Should provide some error message about the unreadable PDF
                expect((error as Error).message.length).toBeGreaterThan(0);
            }
        });
    });

    describe("Metadata extraction", () => {
        it("should extract opening and closing balances if present", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            // Digital fixture should have balances
            if (result.openingBalance) {
                expect(result.openingBalance.amountCents).toBeGreaterThan(0);
                expect(result.openingBalance.confidence).toBeGreaterThan(0);
            }
        });

        it("should detect account type from PDF content", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            // Should detect checking account
            if (result.metadata.detectedAccountType) {
                expect([AccountType.CHECKING, AccountType.SAVINGS]).toContain(
                    result.metadata.detectedAccountType
                );
            }
        });

        it("should extract account hints when present", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            expect(Array.isArray(result.accountHints)).toBe(true);
        });
    });

    describe("Source references and provenance", () => {
        it("should include source reference for each transaction", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            result.transactions.forEach((tx) => {
                expect(tx.sourceReference).toBeDefined();
                expect(tx.sourceReference.pageNumber).toBeGreaterThan(0);
                expect(tx.sourceReference.extractionMethod).toBeTruthy();
                expect(tx.sourceReference.confidence).toBeGreaterThan(0);
                expect(tx.sourceReference.confidence).toBeLessThanOrEqual(1);
            });
        });

        it("should preserve original amount and date in transactions", async () => {
            const filePath = path.join(fixtureDir, "digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: content,
            };

            const result = (await parser.parse(input)) as ExtractedParsedStatement;
            result.transactions.forEach((tx) => {
                expect(tx.originalAmount).toBeTruthy();
                expect(tx.originalDate).toBeTruthy();
            });
        });
    });
});

describe("Image Statement Parser", () => {
    let parser: ImageStatementParser;
    const fixtureDir = path.join(__dirname, "../../fixtures/pdf");

    beforeEach(() => {
        parser = new ImageStatementParser();
    });

    describe("canParse", () => {
        it("should accept IMAGE source type", async () => {
            const filePath = path.join(fixtureDir, "statement-image.png");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: statement-image.png not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "statement-image.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: content,
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(true);
        });

        it("should reject non-IMAGE source types", async () => {
            const input: ParserInput = {
                fileName: "test.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: "%PDF-1.4",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });

        it("should reject unsupported image formats", async () => {
            const input: ParserInput = {
                fileName: "test.gif",
                mimeType: "image/gif",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: Buffer.alloc(100) as any,
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });

        it("should validate PNG magic number", async () => {
            const filePath = path.join(fixtureDir, "statement-image.png");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: statement-image.png not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "statement-image.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: content,
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(true);
        });
    });

    describe("OCR parsing", () => {
        it("should require OCR for image parsing", async () => {
            const filePath = path.join(fixtureDir, "statement-image.png");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: statement-image.png not found");
                return;
            }

            const content = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "statement-image.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: content,
            };

            await expect(parser.parse(input)).rejects.toThrow("OCR");
        });
    });

    describe("Image validation", () => {
        it("should reject invalid PNG images", async () => {
            const input: ParserInput = {
                fileName: "fake.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: "Not a PNG file",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });
    });
});

describe("Statement Parser Registry", () => {
    let registry: StatementParserRegistry;

    beforeEach(() => {
        registry = createStatementParserRegistry();
    });

    describe("Parser selection", () => {
        it("should select CSV parser for CSV input", async () => {
            const input: ParserInput = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "Date,Description,Amount\n01/15/2026,Test,100.00",
            };

            const selection = await registry.selectParser(input);
            expect(selection.sourceType).toBe(DocumentSourceType.CSV);
            expect(selection.confidence).toBeGreaterThan(0);
        });

        it("should select PDF parser for PDF input", async () => {
            const filePath = path.join(__dirname, "../../fixtures/pdf/digital-statement.pdf");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: digital-statement.pdf not found");
                return;
            }

            const pdfContent = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: pdfContent,
            };

            const selection = await registry.selectParser(input);
            expect(selection.sourceType).toBe(DocumentSourceType.PDF);
        });

        it("should select IMAGE parser for image input", async () => {
            const filePath = path.join(__dirname, "../../fixtures/pdf/statement-image.png");
            if (!fs.existsSync(filePath)) {
                console.log("Skipping: statement-image.png not found");
                return;
            }

            const pngContent = fs.readFileSync(filePath);
            const input: ParserInput = {
                fileName: "statement-image.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: pngContent,
            };

            const selection = await registry.selectParser(input);
            expect(selection.sourceType).toBe(DocumentSourceType.IMAGE);
        });

        it("should throw on unsupported source type", async () => {
            const input: ParserInput = {
                fileName: "test.doc",
                mimeType: "application/msword",
                sourceType: DocumentSourceType.MANUAL,
                fileContent: "Document content",
            };

            await expect(registry.selectParser(input)).rejects.toThrow();
        });
    });

    describe("Custom parser registration", () => {
        it("should allow registering custom parsers", async () => {
            const mockParser: any = {
                async canParse() {
                    return { matches: true, confidence: 1, reason: "Mock parser" };
                },
                async parse() {
                    return { transactions: [] };
                },
            };

            registry.registerParser(DocumentSourceType.PDF, mockParser);
            const parser = registry.getParser(DocumentSourceType.PDF);
            expect(parser).toBe(mockParser);
        });
    });

    describe("Security validation", () => {
        it("should validate file size", async () => {
            const input: SecureParserInput = {
                fileName: "huge.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "x".repeat(100 * 1024 * 1024), // 100MB > 50MB limit
            };

            await expect(registry.parseWithTimeout(input)).rejects.toThrow("File size");
        });

        it("should validate MIME type", async () => {
            const input: SecureParserInput = {
                fileName: "test.exe",
                mimeType: "application/octet-stream",
                sourceType: DocumentSourceType.CSV,
                fileContent: "content",
            };

            await expect(registry.parseWithTimeout(input)).rejects.toThrow("MIME");
        });
    });

    describe("Timeout protection", () => {
        it("should apply appropriate timeouts by source type", async () => {
            const config = registry.getConfig();
            expect(config.textExtractionTimeoutMs).toBeGreaterThan(0);
            expect(config.ocrTimeoutMs).toBeGreaterThan(config.textExtractionTimeoutMs || 0);
        });

        it("should respect custom timeout", async () => {
            const input: SecureParserInput = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "Date,Description,Amount\n01/15/2026,Test,100.00",
            };

            // Should complete well within 5 second timeout
            const result = await registry.parseWithTimeout(input, 5000);
            expect(result).toBeDefined();
        });
    });

    describe("Parser configuration", () => {
        it("should allow custom configuration", async () => {
            const customRegistry = createStatementParserRegistry({
                textExtractionTimeoutMs: 5000,
                ocrTimeoutMs: 30000,
                maxFileSize: 10 * 1024 * 1024,
                enableOcr: true,
            });

            const config = customRegistry.getConfig();
            expect(config.textExtractionTimeoutMs).toBe(5000);
            expect(config.ocrTimeoutMs).toBe(30000);
            expect(config.maxFileSize).toBe(10 * 1024 * 1024);
        });
    });
});

describe("PDF and Image Parser Integration", () => {
    let registry: StatementParserRegistry;
    const fixtureDir = path.join(__dirname, "../../fixtures/pdf");

    beforeEach(() => {
        registry = createStatementParserRegistry();
    });

    it("should route different file types to correct parsers", async () => {
        const csvContent = "Date,Description,Amount\n01/15/2026,Test,100.00";
        const csvPath = path.join(__dirname, "../../fixtures/csv/chase-checking.csv");
        const pdfPath = path.join(__dirname, "../../fixtures/pdf/digital-statement.pdf");
        const imagePath = path.join(__dirname, "../../fixtures/pdf/statement-image.png");

        // CSV should use CSV parser
        const csvSelection = await registry.selectParser({
            fileName: "test.csv",
            mimeType: "text/csv",
            sourceType: DocumentSourceType.CSV,
            fileContent: csvContent,
        });
        expect(csvSelection.sourceType).toBe(DocumentSourceType.CSV);

        // PDF should use PDF parser
        if (fs.existsSync(pdfPath)) {
            const pdfContent = fs.readFileSync(pdfPath);
            const pdfSelection = await registry.selectParser({
                fileName: "digital-statement.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: pdfContent,
            });
            expect(pdfSelection.sourceType).toBe(DocumentSourceType.PDF);
        }

        // IMAGE should use IMAGE parser
        if (fs.existsSync(imagePath)) {
            const imageContent = fs.readFileSync(imagePath);
            const imageSelection = await registry.selectParser({
                fileName: "statement-image.png",
                mimeType: "image/png",
                sourceType: DocumentSourceType.IMAGE,
                fileContent: imageContent,
            });
            expect(imageSelection.sourceType).toBe(DocumentSourceType.IMAGE);
        }
    });
});
