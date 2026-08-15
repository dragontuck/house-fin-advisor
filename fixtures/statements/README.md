# CSV Statement Fixtures

This directory contains sample CSV files for testing the CsvStatementParser. Each fixture represents a different real-world scenario commonly encountered with financial institution exports.

## Fixtures by Category

### Standard Format Statements

#### checking-account-standard.csv
- **Bank Type:** Checking Account
- **Format:** Date, Description, Signed Amount
- **Characteristics:**
  - Standard three-column format
  - Amounts can be positive (deposits) or negative (withdrawals)
  - Contains keyword "Checking Account" for account type detection
  - 8 transactions spanning 01/15/2026 - 01/23/2026
- **Use Case:** Most common bank CSV export format

#### savings-account-standard.csv
- **Bank Type:** Savings Account
- **Format:** Date, Description, Signed Amount
- **Characteristics:**
  - Same format as checking account
  - Contains keywords "Interest Earned" and "Dividend" for account type detection
  - Fewer transactions (5 total)
  - Includes positive interest/dividend amounts
  - 01/10/2026 - 02/01/2026
- **Use Case:** Savings and money market account statements

### Alternative Amount Formats

#### credit-card-debit-credit.csv
- **Bank Type:** Credit Card
- **Format:** Date, Description, Debit, Credit, Running Balance
- **Characteristics:**
  - Separate debit (charge) and credit (payment) columns
  - Running balance column for validation
  - Contains "Credit Card" and "Statement" keywords
  - 9 transactions with running balance progression
  - 01/05/2026 - 01/28/2026
- **Use Case:** Credit card statements, mortgage statements, some loan statements

#### signed-amounts-format.csv
- **Bank Type:** Generic (Checking/Deposit)
- **Format:** Date, Memo, Posted Amount (signed)
- **Characteristics:**
  - Alternative column headers ("Memo" instead of "Description", "Posted Amount" instead of "Amount")
  - Signed amounts with negative values shown with minus sign
  - Mix of positive (deposits, refunds) and negative (purchases, withdrawals) amounts
  - 9 transactions spanning 01/05/2026 - 01/28/2026
- **Use Case:** Direct deposit accounts, savings accounts with online banking exports

#### with-running-balance.csv
- **Bank Type:** Checking with Debit/Deposit Split
- **Format:** Date, Description, Withdrawal, Deposit, Running Balance
- **Characteristics:**
  - Withdrawal and Deposit columns (instead of Debit/Credit terminology)
  - Running balance for reconciliation validation
  - Balance decreases with withdrawals, increases with deposits
  - 10 transactions with full balance tracking
  - 01/01/2026 - 01/25/2026
- **Use Case:** Traditional bank statements with detailed column breakdown

### Error/Edge Case Files

#### malformed.csv
- **Bank Type:** N/A (Malformed)
- **Format:** Intentionally broken CSV
- **Characteristics:**
  - Contains unclosed quotes
  - Has inconsistent column counts per row
  - Missing required fields in rows
  - Extra empty rows with only commas
  - Should trigger warnings and potentially fail parsing
- **Use Case:** Testing error handling and recovery
- **Expected Result:** Either graceful skipping of bad rows or informative error message

#### unsupported-structure.csv
- **Bank Type:** N/A (Unsupported)
- **Format:** Account-centric, not transaction-centric
- **Characteristics:**
  - No date column
  - No description/memo column
  - Only account number, reference number, and transaction code
  - Missing required fields for transaction parsing
  - 5 rows with minimal data
- **Use Case:** Testing rejection of fundamentally incompatible formats
- **Expected Result:** Parser should reject with "Could not identify required columns" error

## Fixture Statistics

| File | Rows | Format | Account Type | Features |
|------|------|--------|--------------|----------|
| checking-account-standard.csv | 8 | Signed | CHECKING | Standard, keywords |
| savings-account-standard.csv | 5 | Signed | SAVINGS | Interest, dividends |
| credit-card-debit-credit.csv | 9 | Debit/Credit | CREDIT_CARD | Balance tracking |
| signed-amounts-format.csv | 9 | Signed | CHECKING | Alt headers |
| with-running-balance.csv | 10 | Withdrawal/Deposit | CHECKING | Balance tracking |
| malformed.csv | 5 | Mixed | N/A | Intentionally broken |
| unsupported-structure.csv | 5 | Account-centric | N/A | No transaction fields |

## Adding New Fixtures

When adding fixtures for additional scenarios:

1. **Name the file descriptively:** `{bank-name|format-type}-{feature}.csv`
2. **Include realistic data:** Use actual anonymized amounts and descriptions
3. **Document the scenario:** Add entry to this README
4. **Create corresponding test:** Add test case in `tests/financial/csv-statement-parser.test.ts`
5. **Verify parsing:** Ensure CsvStatementParser handles the format correctly

### Fixture Checklist

- [ ] File follows CSV naming convention
- [ ] Contains 5+ transaction rows for realistic testing
- [ ] Includes appropriate header row
- [ ] Demonstrates a unique parsing challenge or feature
- [ ] Documented in this README with characteristics
- [ ] Associated test case created and passing
- [ ] Uses realistic amounts and dates
- [ ] No sensitive/personal information (real account numbers, names)

## Format Detection Patterns

The parser looks for these keywords in headers to detect format:

**Date Columns:** date, posted, trans date, transaction date
**Description:** description, desc, memo, reference, detail, transaction type
**Amount:** amount, amt, value
**Debit:** debit, dbt, withdrawal, out
**Credit:** credit, crd, deposit, in
**Balance:** balance, bal, running balance

**Account Types:** Inferred from description content
- Credit Card: "credit card", "card" (with payment context)
- Savings: "savings", "interest earned", "dividend"
- Checking: "checking", "direct deposit", "demand deposit"
- Investment: "investment", "401k", "ira"
- Mortgage/Loan: "mortgage", "loan", "principal"

## Testing Commands

```bash
# Run all CSV parser tests
npm test -- tests/financial/csv-statement-parser.test.ts

# Run specific fixture test
npm test -- tests/financial/csv-statement-parser.test.ts -t "Checking Account"

# Run with verbose output
npm test -- tests/financial/csv-statement-parser.test.ts --verbose
```
