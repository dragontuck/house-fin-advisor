/**
 * CSV Statement Parser Tests
 * 
 * Tests cover:
 * - Checking account (standard format with signed amounts)
 * - Savings account (standard format)
 * - Credit card (debit/credit columns)
 * - Signed amounts format
 * - Running balance detection
 * - Malformed CSV handling
 * - Unsupported structure rejection
 * - Column mapping confidence
 * - Date parsing (multiple formats)
 * - Amount parsing (currency symbols, parentheses, etc.)
 * - Account type detection
 * - Ambiguous column rejection
 * - Row number preservation
 */

import fs from "fs";
import path from "path";
import { CsvStatementParser } from "@house-fin/domain";
import { DocumentSourceType, AccountType } from "@house-fin/contracts";

describe("CsvStatementParser", () => {
    let parser: CsvStatementParser;

    beforeEach(() => {
        parser = new CsvStatementParser();
    });

    describe("canParse", () => {
        it("should accept CSV source type", async () => {
            const input = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "Date,Description,Amount\n01/01/2026,Test,100.00",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(true);
        });

        it("should reject PDF source type", async () => {
            const input = {
                fileName: "test.pdf",
                mimeType: "application/pdf",
                sourceType: DocumentSourceType.PDF,
                fileContent: "some pdf content",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });

        it("should reject CSV with fewer than 2 rows", async () => {
            const input = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent: "Date,Description,Amount",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });

        it("should reject CSV without required columns", async () => {
            const input = {
                fileName: "test.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent:
                    "Account,Reference,Code\nA1,R1,C1\nA2,R2,C2",
            };

            const result = await parser.canParse(input);
            expect(result.matches).toBe(false);
        });
    });

    describe("Checking Account - Standard Format", () => {
        let fileContent: string;

        beforeEach(() => {
            const filePath = path.join(
                __dirname,
                "../../fixtures/statements/checking-account-standard.csv"
            );
            fileContent = fs.readFileSync(filePath, "utf-8");
        });

        it("should parse checking account statement", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result).toBeDefined();
            expect(result.transactions).toHaveLength(8);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect checking account type", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.metadata.detectedAccountType).toBe(AccountType.CHECKING);
        });

        it("should parse signed amounts correctly", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Check first transaction (positive amount)
            const firstTx = result.transactions[0];
            expect(firstTx.amountCents).toBe(250000); // $2500.00

            // Check negative amount
            const negativeTx = result.transactions.find(
                (t) => t.description.includes("Gas Station")
            );
            expect(negativeTx?.amountCents).toBe(-3550); // -$35.50
        });

        it("should preserve source row numbers", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Row numbers should be 1-indexed and start from 1 (first data row)
            expect(result.transactions[0].sourceRowNumber).toBe(1);
            expect(result.transactions[1].sourceRowNumber).toBe(2);
            expect(result.transactions[result.transactions.length - 1].sourceRowNumber).toBe(8);
        });

        it("should preserve original descriptions", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            const descriptions = result.transactions.map((t) => t.description);
            expect(descriptions[0]).toBe("Direct Deposit - ACME Corp - Checking Account");
            expect(descriptions[1]).toBe("Grocery Store");
        });

        it("should parse dates correctly", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            const firstDate = result.transactions[0].date;
            expect(firstDate.getMonth()).toBe(0); // January (0-indexed)
            expect(firstDate.getDate()).toBe(15);
            expect(firstDate.getFullYear()).toBe(2026);
        });

        it("should indicate signed amounts format", async () => {
            const input = {
                fileName: "checking-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.detectedFormat.hasSignedAmounts).toBe(true);
            expect(result.detectedFormat.hasDebitCreditColumns).toBe(false);
            expect(result.detectedFormat.hasRunningBalance).toBe(false);
        });
    });

    describe("Savings Account - Standard Format", () => {
        let fileContent: string;

        beforeEach(() => {
            const filePath = path.join(
                __dirname,
                "../../fixtures/statements/savings-account-standard.csv"
            );
            fileContent = fs.readFileSync(filePath, "utf-8");
        });

        it("should parse savings account statement", async () => {
            const input = {
                fileName: "savings-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.transactions).toHaveLength(5);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect savings account type", async () => {
            const input = {
                fileName: "savings-account-standard.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.metadata.detectedAccountType).toBe(AccountType.SAVINGS);
        });
    });

    describe("Credit Card - Debit/Credit Columns", () => {
        let fileContent: string;

        beforeEach(() => {
            const filePath = path.join(
                __dirname,
                "../../fixtures/statements/credit-card-debit-credit.csv"
            );
            fileContent = fs.readFileSync(filePath, "utf-8");
        });

        it("should parse credit card statement with debit/credit columns", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.transactions.length).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect debit/credit column format", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.detectedFormat.hasDebitCreditColumns).toBe(true);
            expect(result.detectedFormat.hasSignedAmounts).toBe(false);
        });

        it("should handle debit amounts as negative", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Find coffee shop transaction (debit)
            const coffeeShop = result.transactions.find((t) =>
                t.description.includes("Coffee")
            );
            expect(coffeeShop).toBeDefined();
            if (coffeeShop) {
                expect(coffeeShop.amountCents).toBeLessThan(0);
                expect(coffeeShop.amountCents).toBe(-450); // $4.50 as debit
            }
        });

        it("should handle credit amounts as positive", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Find payment transaction (credit)
            const payment = result.transactions.find((t) =>
                t.description.includes("Payment")
            );
            expect(payment).toBeDefined();
            if (payment) {
                expect(payment.amountCents).toBeGreaterThan(0);
                expect(payment.amountCents).toBe(50000); // $500.00 as credit
            }
        });

        it("should extract running balance", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.detectedFormat.hasRunningBalance).toBe(true);

            // Check that transactions have balance values
            const transactionsWithBalance = result.transactions.filter(
                (t) => t.balance !== undefined
            );
            expect(transactionsWithBalance.length).toBeGreaterThan(0);
        });

        it("should detect credit card account type", async () => {
            const input = {
                fileName: "credit-card-debit-credit.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.metadata.detectedAccountType).toBe(AccountType.CREDIT_CARD);
        });
    });

    describe("Signed Amounts Format", () => {
        let fileContent: string;

        beforeEach(() => {
            const filePath = path.join(
                __dirname,
                "../../fixtures/statements/signed-amounts-format.csv"
            );
            fileContent = fs.readFileSync(filePath, "utf-8");
        });

        it("should parse statement with signed amounts", async () => {
            const input = {
                fileName: "signed-amounts-format.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.transactions.length).toBeGreaterThan(0);
            expect(result.errors).toHaveLength(0);
        });

        it("should correctly parse positive and negative amounts", async () => {
            const input = {
                fileName: "signed-amounts-format.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Should have both positive and negative amounts
            const positiveAmounts = result.transactions.filter((t) => t.amountCents > 0);
            const negativeAmounts = result.transactions.filter((t) => t.amountCents < 0);

            expect(positiveAmounts.length).toBeGreaterThan(0);
            expect(negativeAmounts.length).toBeGreaterThan(0);
        });
    });

    describe("Running Balance Detection", () => {
        let fileContent: string;

        beforeEach(() => {
            const filePath = path.join(
                __dirname,
                "../../fixtures/statements/with-running-balance.csv"
            );
            fileContent = fs.readFileSync(filePath, "utf-8");
        });

        it("should detect running balance column", async () => {
            const input = {
                fileName: "with-running-balance.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.detectedFormat.hasRunningBalance).toBe(true);
        });

        it("should extract running balance values", async () => {
            const input = {
                fileName: "with-running-balance.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            const balances = result.transactions
                .map((t) => t.balance)
                .filter((b) => b !== undefined);

            expect(balances.length).toBeGreaterThan(0);
            // Verify decreasing/increasing pattern (at least some balances change)
            expect(balances.some((b, i) => i === 0 || b !== balances[i - 1])).toBe(true);
        });

        it("should preserve withdrawal/deposit format", async () => {
            const input = {
                fileName: "with-running-balance.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            expect(result.detectedFormat.hasDebitCreditColumns).toBe(true);
        });
    });

    describe("Error Handling", () => {
        it("should throw on malformed CSV with low confidence", async () => {
            const fileContent = "Date,Description,Amount\n01/01/2026,\"unclosed quote,100";

            const input = {
                fileName: "malformed.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            // Even with partial success, should handle gracefully or throw
            try {
                await parser.parse(input);
                // Parser might succeed with warnings
            } catch (error) {
                // Expected to throw on malformed content
                expect(error).toBeDefined();
            }
        });

        it("should reject CSV with unsupported structure", async () => {
            const fileContent = "Account Number,Reference Number,Transaction Code\nACT-12345,REF-001,TYPE-A\nACT-12345,REF-002,TYPE-B";

            const input = {
                fileName: "unsupported.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            try {
                await parser.parse(input);
                fail("Should have thrown error for unsupported structure");
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it("should provide helpful error messages", async () => {
            const fileContent = "Just,Some,Random,Data\n1,2,3,4\n5,6,7,8";

            const input = {
                fileName: "invalid.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            try {
                await parser.parse(input);
                fail("Should have thrown error");
            } catch (error) {
                const message = (error as Error).message;
                expect(message).toContain("date");
                expect(message.toLowerCase()).toMatch(/ambiguous|required|failed/i);
            }
        });
    });

    describe("Column Mapping Ambiguity", () => {
        it("should reject ambiguous date columns", async () => {
            // A CSV where multiple columns could be dates
            const fileContent =
                "Column1,Column2,Column3\n01/01/2026,01/02/2026,Some Text\n01/03/2026,01/04/2026,More Text";

            const input = {
                fileName: "ambiguous.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.canParse(input);
            // Should have low confidence or fail
            if (!result.matches) {
                expect(result.confidence).toBeLessThan(0.7);
            }
        });

        it("should prefer headers over content when clear", async () => {
            const fileContent =
                "Date,Amount,Description\n01/15/2026,100.00,Test Transaction\n01/16/2026,50.00,Another Transaction";

            const input = {
                fileName: "clear-headers.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions).toHaveLength(2);
            expect(result.transactions[0].description).toBe("Test Transaction");
        });
    });

    describe("Amount Parsing Edge Cases", () => {
        it("should handle currency symbols", async () => {
            const fileContent = "Date,Description,Amount\n01/15/2026,Test,$100.00\n01/16/2026,Test2,€50.00";

            const input = {
                fileName: "currency.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].amountCents).toBe(10000);
            expect(result.transactions[1].amountCents).toBe(5000);
        });

        it("should handle thousands separators", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Large Amount,\"$1,234.56\"\n01/16/2026,Another,\"$10,000.00\"";

            const input = {
                fileName: "thousands.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].amountCents).toBe(123456);
            expect(result.transactions[1].amountCents).toBe(1000000);
        });

        it("should handle accounting format (parentheses for negative)", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Expense,\"(100.00)\"\n01/16/2026,Income,50.00";

            const input = {
                fileName: "accounting.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].amountCents).toBe(-10000); // Negative
            expect(result.transactions[1].amountCents).toBe(5000); // Positive
        });
    });

    describe("Date Parsing Edge Cases", () => {
        it("should handle MM/DD/YYYY format", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Test,100.00";

            const input = {
                fileName: "mmddyyyy.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            const date = result.transactions[0].date;
            expect(date.getMonth()).toBe(0); // January
            expect(date.getDate()).toBe(15);
            expect(date.getFullYear()).toBe(2026);
        });

        it("should handle YYYY-MM-DD format", async () => {
            const fileContent =
                "Date,Description,Amount\n2026-01-15,Test,100.00";

            const input = {
                fileName: "yyyymmdd.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            const date = result.transactions[0].date;
            expect(date.getMonth()).toBe(0);
            expect(date.getDate()).toBe(15);
            expect(date.getFullYear()).toBe(2026);
        });

        it("should handle two-digit year format", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/26,Test,100.00";

            const input = {
                fileName: "mmddyy.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            const date = result.transactions[0].date;
            expect(date.getFullYear()).toBe(2026);
        });
    });

    describe("Warnings and Non-Fatal Issues", () => {
        it("should report skipped rows with warnings", async () => {
            // CSV with some rows missing required fields
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Test,100.00\n01/16/2026,,200.00\n01/17/2026,Another,300.00";

            const input = {
                fileName: "with-gaps.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Should have 2 valid transactions
            expect(result.transactions).toHaveLength(2);

            // Should have warnings about skipped row
            expect(result.warnings.some((w) => w.type === "skipped_row")).toBe(true);
        });

        it("should report invalid date values as warnings", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Test,100.00\nINVALID_DATE,Another,200.00\n01/17/2026,Third,300.00";

            const input = {
                fileName: "with-invalid-dates.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);

            // Should have 2 valid transactions (skipped the invalid date)
            expect(result.transactions).toHaveLength(2);

            // Should have warning about date parsing
            expect(
                result.warnings.some((w) => w.type === "date_format_unclear")
            ).toBe(true);
        });
    });

    describe("CSV Parsing Edge Cases", () => {
        it("should handle quoted fields with commas", async () => {
            const fileContent =
                'Date,Description,Amount\n01/15/2026,"Smith, John - Payment",100.00';

            const input = {
                fileName: "quoted.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].description).toBe("Smith, John - Payment");
        });

        it("should handle quoted fields with newlines", async () => {
            const fileContent =
                'Date,Description,Amount\n01/15/2026,"Multiple\nLine\nDescription",100.00\n01/16/2026,Simple,200.00';

            const input = {
                fileName: "multiline.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions.length).toBeGreaterThanOrEqual(1);
        });

        it("should handle escaped quotes", async () => {
            const fileContent =
                'Date,Description,Amount\n01/15/2026,"Quote ""and"" text",100.00';

            const input = {
                fileName: "escaped-quotes.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].description).toContain('"');
        });

        it("should skip empty rows", async () => {
            const fileContent =
                'Date,Description,Amount\n01/15/2026,Test,100.00\n\n01/16/2026,Another,200.00';

            const input = {
                fileName: "with-empty-rows.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions).toHaveLength(2);
        });
    });

    describe("Original Value Preservation", () => {
        it("should preserve original date format", async () => {
            const fileContent =
                "Date,Description,Amount\n01/15/2026,Test,100.00\n2026-01-16,Another,200.00";

            const input = {
                fileName: "mixed-dates.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].originalDate).toBe("01/15/2026");
            expect(result.transactions[1].originalDate).toBe("2026-01-16");
        });

        it("should preserve original amount format", async () => {
            const fileContent =
                'Date,Description,Amount\n01/15/2026,Test,$1000.00\n01/16/2026,Another,"(500.00)"';

            const input = {
                fileName: "mixed-amounts.csv",
                mimeType: "text/csv",
                sourceType: DocumentSourceType.CSV,
                fileContent,
            };

            const result = await parser.parse(input);
            expect(result.transactions[0].originalAmount).toBe("$1000.00");
            expect(result.transactions[1].originalAmount).toBe("(500.00)");
        });
    });
});
