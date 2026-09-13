# Household Onboarding Feature: Complete Product Design

## Executive Summary

The **Household Onboarding** feature is a guided workflow that walks users through establishing a financial baseline for their household. It intelligently determines what documents and data are needed to build an initial budget and understand their current financial state, then orchestrates a multi-step collection process with clear progress tracking, validation, and actionable next steps.

This feature transforms a blank slate into a functional financial household profile in 3-5 account statements worth of data, with optional manual entry for accounts that lack statements.

---

## Product Vision & Goals

### Primary Goals

1. **Reduce Time-to-Value**: Get users from signup to first actionable budget recommendation in <30 minutes
2. **Minimize Friction**: Collect only essential data; don't demand the perfect dataset
3. **Build Confidence**: Show clear progress, explain why each document is needed, celebrate milestones
4. **Establish Trust**: Be transparent about data privacy and storage
5. **Handle Diversity**: Support multiple account types, institutions, and data availability scenarios

### User Outcomes

- A complete financial household profile with accounts, balances, and transactions
- An initial budget framework based on 3 months of historical data (or manual entry)
- Clear visibility into income, essential expenses, and discretionary spending
- Initial savings goals and emergency fund status
- Identification of immediate financial attention items (high-interest debt, insufficient emergency fund, etc.)

---

## Feature Scope: What Users Will Do

### Phase 1: Setup & Declaration (5 minutes)

**User actions:**
1. Household name and primary member details (name, email)
2. Select household financial profile type:
   - **Solo**: Single income earner
   - **Couple**: Dual or joint finances
   - **Family**: Multiple members with mixed visibility
3. Declare primary financial institution(s) where accounts are held

**System actions:**
- Create household record
- Initialize settings
- Determine data collection strategy based on profile type

**Outcomes:**
- Household ID created
- Member roles defined
- Data collection requirements calculated

---

### Phase 2: Account Discovery (5 minutes)

**User actions:**
1. List all financial accounts (guided by account type):
   - **Cash Accounts**: Checking, Savings, Money Market, HSA
   - **Credit Accounts**: Credit Cards, Lines of Credit
   - **Loan Accounts**: Student Loans, Personal Loans, Auto Loans, Mortgage
   - **Investment Accounts**: Brokerage, 401(k), IRA, Retirement Accounts
   - **Utility/Subscription**: Ongoing monthly obligations

2. For each account, user provides:
   - Account nickname (e.g., "Chase Checking")
   - Account type (enum selection)
   - Current balance (manual entry or from statement)
   - Institution name and account number (optional, used for auto-matching)
   - Ownership type (Individual, Joint)

**System actions:**
- Create Account records with balances
- Categorize accounts by type
- Flag accounts requiring statement uploads
- Prioritize collection: Cash → Debt → Investments

**Outcomes:**
- 5-15 Account records created
- Account list displayed with data completeness score
- Clear indication of which accounts need statements

---

### Phase 3: Statement Collection (10 minutes per statement)

**Guided statement upload by account type. System determines required statement count and format.**

#### Collection Strategy by Account Type

| Account Type | Min Statements | Max Statements | Formats | Why Multiple |
|---|---|---|---|---|
| **Checking/Savings** | 3 months | 6 months | CSV, PDF, Manual | Verify balance trends, recurring deposits, bill payment patterns |
| **Credit Card** | 2-3 months | 6 months | CSV, PDF, Manual | Identify spending categories, minimum payments, interest rates |
| **Loan** | 1 statement | 2 statements | PDF, Manual | Verify balance, payment schedule, interest rate, payoff date |
| **Mortgage** | 1 statement | 1 statement | PDF, Manual | Property info, interest rate, remaining term, escrow |
| **Utility** | 1 month | 3 months | Manual, Image | Establish baseline recurring cost |
| **Investment/Retirement** | 1 statement | 1 statement | PDF, Manual | Holdings, allocation, growth trajectory |

#### Upload Flow for Each Account

**System guides user through this sequence:**

1. **Account Selection**
   - "Let's gather data from your checking account"
   - Show account nickname, balance, institution

2. **Statement Guidance**
   - Explain what to upload: "Most recent 3 months of statements from your bank"
   - Show example of what to look for (account number, transaction list, date range)
   - Provide download link: "Can't find it? Download from your bank here"
   - Support manual entry fallback: "Don't have statements? Enter transactions manually"

3. **Upload Methods (Priority Order)**
   - **CSV Export** (best): "Export directly from your bank's download center"
   - **PDF Statement** (good): "PDF from bank email or portal"
   - **Image/Photo** (acceptable): "Snap a photo of your statement"
   - **Manual Entry** (fallback): "Enter account info and recent transactions"

4. **Period Selection**
   - Date range picker with suggested defaults
   - Validation: "Please provide at least 3 months of consecutive statements"
   - Show what's currently available: "You've uploaded Jan-Mar 2024, now upload Apr"

5. **Upload & Processing**
   - Drag-drop or click-to-select file
   - Progress indicator during upload and processing
   - Real-time status updates:
     - "Uploading..." → "Processing..." → "Validating transactions..." → "Complete"
   - Display extracted data:
     - Detected date range, transaction count, balance amounts
     - Ask for confirmation: "Found 87 transactions from Jan 2024. Looks right?"

6. **Error Handling**
   - If statement can't be parsed: "This PDF doesn't contain transaction data. Try another file or enter manually."
   - If date range is insufficient: "Please upload 3 months of statements. You've provided 1 month."
   - Offer resolution paths: manual entry, download from bank, contact support

7. **Next Steps**
   - "Got it! We need 2 more months from your checking. Which month next?"
   - Progress bar: "3 of 3 statements collected ✓"
   - Celebration: "Perfect! Your checking account is complete."

---

### Phase 4: Financial Context & Income (5 minutes)

**Establish household income sources to calculate monthly budget baseline.**

**User actions:**

1. **Income Declaration**
   - Employment income: 
     - Employer name, role, annual salary or hourly rate
     - Pay frequency (weekly, bi-weekly, monthly)
   - Self-employment income:
     - Business type, average monthly net
   - Investment income:
     - Dividend/interest from accounts entered earlier
   - Other income:
     - Benefits, freelance, gig work
   - **System calculates**: Monthly gross, estimated taxes, net take-home

2. **Income Verification Options**
   - System auto-detects from bank statements: "We found regular deposits of $4,500 on the 1st of each month"
   - User can confirm or override
   - System flags inconsistencies: "Your stated salary doesn't match the deposits we see"

3. **Expense Baseline**
   - System analyzes statements to detect recurring expenses
   - Pre-fills categories with detected amounts:
     - Groceries: $800/month (recurring)
     - Utilities: $200/month (recurring)
     - Mortgage/Rent: $2,000/month (recurring)
   - User confirms or corrects

**System actions:**
- Parse statements for recurring patterns
- Extract transaction payees and categorize
- Cluster amounts to detect recurring obligations
- Calculate monthly surplus/deficit
- Flag budget warnings (overspending categories, missing expenses)

**Outcomes:**
- HouseholdSettings record with monthly income/expenses
- Initial FinancialSnapshot created
- Budget framework established
- First health status calculated

---

### Phase 5: Household Profile & Privacy (3 minutes)

**Complete profile and establish privacy preferences.**

**User actions:**

1. **Household Composition**
   - Add household members (if applicable for couple/family profile)
   - Assign roles (Owner, Member, Accountant)
   - Visibility settings (who can see which accounts)

2. **Privacy Acknowledgment**
   - Confirm data storage location (self-hosted, private)
   - Explain data usage (never shared, used only for recommendations)
   - Acknowledge household members have access
   - Two-factor authentication setup (recommended)

3. **Notification Preferences**
   - Email alerts for: budget overages, attention items, goal milestones
   - Frequency: Daily, Weekly, or Monthly
   - Opt-in to AI advisor notifications

**Outcomes:**
- Household member records created
- Privacy settings configured
- Notification preferences stored

---

### Phase 6: Review & Launch (2 minutes)

**Final review before financial advisor becomes active.**

**System displays:**

1. **Onboarding Summary**
   ```
   ✓ Household Created: Smith Family
   ✓ Accounts: 8 accounts added
   ✓ Data: 3 months of statements
   ✓ Income: $85,000/year identified
   ✓ Profile: Complete
   ```

2. **Financial Snapshot**
   - Net Worth: $250,000
   - Monthly Surplus: $2,500
   - Emergency Fund: 2.5 months coverage
   - Debt-to-Income Ratio: 18%
   - Financial Health: HEALTHY

3. **Initial Insights** (First use of AI advisor)
   - "You're in good financial health. Your emergency fund is below ideal—we recommend 6 months."
   - "You have high-interest credit card debt. Refinancing options worth exploring."
   - "Your savings rate of $2,500/month is healthy. Let's build a plan."

4. **Next Steps Offered**
   - Set savings goals
   - Create budget approval workflow
   - Schedule financial check-in

5. **Launch Action**
   - "Ready? Let's build your budget!" → Opens main dashboard
   - OR "Review more details first" → Stays on summary

---

## Feature Behavior & Validation Rules

### Data Completeness Requirements

**Minimum Viable Dataset for Budget Creation:**

- [ ] At least 1 household account (checking or savings)
- [ ] At least 1 month of transactions (3 months preferred)
- [ ] Either auto-detected or manually-entered income
- [ ] At least 1 expense category identified from statements

**Recommended Dataset:**

- [ ] All active accounts listed (cash, debt, investments)
- [ ] 3+ months of bank statement history
- [ ] 2+ months of credit card history
- [ ] At least 1 loan statement (mortgage, auto, etc.)
- [ ] All household members added
- [ ] Income validated across multiple deposits

### Validation Rules

| Check | Trigger | Action |
|---|---|---|
| **Insufficient Data** | <1 month of statements | Block budget creation, show progress, suggest manual entry |
| **Income Mismatch** | Stated income ≠ detected deposits | Flag for review, ask user to confirm |
| **Balance Inconsistency** | Calculated balance ≠ opening balance | Ask user to confirm statement date or re-upload |
| **Duplicate Transactions** | Same transaction appears in multiple uploads | Deduplicate, show to user, ask confirmation |
| **Missing Essential Accounts** | Has checking but no debt accounts | Warn: "You didn't add your credit cards or loans" |
| **Expired Statements** | Statement >90 days old | Alert: "Please provide recent statements for accurate budget" |
| **Single Income Source** | All income from one deposit | Flag for verification if household is couple/family |

### Recovery & Guidance

**If user gets stuck:**

1. **Can't Find Statements**
   - Link to bank's download center (auto-detected by institution)
   - Step-by-step walkthrough: "Log in → Statements → Download CSV"
   - Phone number for bank customer service
   - Offer manual entry: "I'll help you enter it manually"

2. **PDF Won't Upload**
   - Detect format: "This PDF appears to be scanned. Let me try extra hard..."
   - If still fails: "Unfortunately we can't read this PDF. Here's why..."
   - Offer alternatives: "Try exporting as CSV" or "Enter manually"

3. **Don't Know an Answer**
   - "Take a guess. You can change this later."
   - Skip button: "Not sure? We'll come back to this."
   - Bracket questions: "Around how much do you spend on groceries monthly? ($300-500)?"

4. **Too Much Information**
   - Progressive disclosure: Hide optional fields initially
   - Show "advanced options" for power users
   - Offer skips: "You can skip this and set it up later"

---

## UI/UX Principles

### Design Goals

1. **Progressive Disclosure**: Show one thing at a time. No overwhelming forms.
2. **Clear Progress**: Visual progress bar + step counter at top of every page
3. **Reassurance**: Explain why we need each piece of data
4. **Validation in Context**: Show errors immediately, with fixes
5. **Celebration**: Acknowledge milestones (account added, statement uploaded)
6. **Mobile-First**: Works on phone while user has statements in hand
7. **Accessibility**: High contrast, large tap targets, keyboard navigation

### Visual Elements

- **Progress Indicator** (top of screen)
  ```
  Step 3 of 6: Account Statements
  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 50%
  ```

- **Account Status Cards**
  ```
  Checking Account
  Status: 3 of 3 statements ✓
  Period: January - March 2024
  Transactions: 87 imported
  ```

- **Statement Upload States**
  ```
  Idle:         [Choose File] or Drag & drop
  Uploading:    ⟳ Uploading... 45%
  Processing:   ⟳ Reading transactions... 
  Success:      ✓ 87 transactions imported
  Error:        ✗ Couldn't read this PDF. Why?
  ```

### Copy Tone

- **Warm, encouraging**: "Great choice! Let's add your savings account."
- **Honest about complexity**: "This will take 15-20 minutes total."
- **Action-oriented**: "Download your checking statement" vs "Upload checking statement"
- **Avoid jargon**: Not "reconcile" → "match up with what we found"

---

## Success Metrics

### Onboarding Completion

| Metric | Target | Note |
|---|---|---|
| **Completion Rate** | 85%+ | % of users who reach Phase 6 |
| **Time-to-Complete** | <30 min | Average from start to launch |
| **Accounts Added** | 5+ | Minimum viable household profile |
| **Statements Uploaded** | 3+ months | Sufficient for budget creation |
| **Data Quality Score** | 90%+ | Validation passes, minimal rework |

### User Satisfaction

| Metric | Target | Method |
|---|---|---|
| **Clarity** | 4.5/5 | Post-onboarding survey: "Did we explain clearly?" |
| **Time Expectation** | 4/5 | "The time estimate was accurate" |
| **Confidence** | 4.5/5 | "I'm confident in my financial data" |
| **Readiness** | 9/10 | "I'm ready to build my budget" |

### Engagement Post-Onboarding

| Metric | Target | Note |
|---|---|---|
| **Budget Creation** | 80%+ | % who create budget within 7 days |
| **Re-engagement** | 70%+ | % active at 30 days post-onboarding |
| **Data Updates** | 60%+ | % who upload new statements within 90 days |
| **AI Advisor Usage** | 50%+ | % who interact with AI advisor within 7 days |

---

## Error Scenarios & Recovery

### Common Blockers & Solutions

#### 1. "I Don't Have My Statements"

**Triggers:**
- User skips statement upload step
- Statement processing fails repeatedly
- User reports "can't access bank portal"

**Recovery:**
- Provide 3 options with equal prominence:
  1. "Download from your bank" (link provided)
  2. "Enter transactions manually" (guided entry form)
  3. "Skip for now, add later" (calendar reminder)
- Follow-up nudge at +7 days with option 2 as default

#### 2. "The File Won't Upload"

**Triggers:**
- PDF is scanned/image-based
- CSV format is non-standard
- File is corrupted or password-protected

**Recovery:**
```
We couldn't read this file. Here's why:

Reason: "This appears to be a scanned PDF"
What to try:
  1. Export as CSV from your bank instead
  2. Try a different statement format
  3. Enter manually using our form

Need help? Contact your bank's support or call us.
```

#### 3. "Balance Doesn't Match"

**Triggers:**
- User enters current balance that differs from statement
- Statement balance ≠ system-calculated balance
- Date mismatch (statement date ≠ as-of date)

**Recovery:**
```
Your current balance ($5,432) doesn't match the statement 
we found ($5,201). 

Possible reasons:
  □ The statement is older than today
  □ You made deposits/withdrawals since the statement
  □ The statement shows opening balance, not closing

Let's fix this:
  [Use statement balance] [Keep my entered balance] [Upload different statement]
```

#### 4. "Income Doesn't Match"

**Triggers:**
- User enters salary, but detected deposits are different
- Multiple irregular income sources
- Spouse's income not included

**Recovery:**
```
We detected $48,000/year in deposits, but you said $65,000.

Is this right?
  [Yes, my income is lower] 
  [No, I have other income] → Add spouse, freelance, etc.
  [No, our statements are incomplete] → Upload more statements
```

---

## Out-of-Scope (Future Enhancements)

These features are explicitly deferred to post-MVP:

- **Automatic plaid/bank connection**: Currently requires manual upload
- **Recurring bill OCR**: Extracted via statement parsing, not AI vision
- **Multi-language support**: English only (Phase 2 future)
- **Employer direct API**: Manual income entry only
- **Multi-household support**: Single household only
- **Bulk member import**: Manual member addition only
- **Scheduled automation**: Manual refreshes only
- **Mobile app**: Web-only, responsive design

---

## Integration Points

### With Existing Systems

| System | Integration | Responsibility |
|---|---|---|
| **Document Upload** | Uses existing upload API | Orchestrate flow, guide file selection |
| **Statement Parser** | Uses existing CSV/PDF parsers | Validate parsed data, show results |
| **Account Repository** | Creates Account records | Validate account structure |
| **Financial Snapshot** | Triggers snapshot creation | Ensure all prerequisites met |
| **Budget Service** | Passes data to budget creation | Provide complete context |
| **AI Advisor** | Provides context for recommendations | Ensure data quality |
| **Keycloak Auth** | User identity & household access | Pre-configured by deployment |
| **Redis Cache** | Cache onboarding progress | Persist partial progress |

### Data Flow

```
User Input 
  → Validate
  → Store (Account, Document, HouseholdSettings)
  → Parse Statements (if uploaded)
  → Extract Transactions
  → Detect Recurring Patterns
  → Calculate Budget Baseline
  → Create FinancialSnapshot
  → Generate Initial Health Score
  → Launch AI Advisor
```

---

## Accessibility & Compliance

### WCAG 2.1 Level AA Compliance

- [ ] Keyboard navigation for all inputs
- [ ] Screen reader support for progress indicator
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] Focus indicators visible
- [ ] Form labels associated with inputs
- [ ] Error messages linked to fields
- [ ] No autoplay, no flashing content

### Privacy & Security

- **Data Retention**: Statements stored after processing (allow user to delete)
- **Encryption**: All uploads encrypted in transit and at rest
- **Audit Logs**: All household member actions logged
- **Right to Delete**: User can request deletion of all data
- **Data Portability**: User can export household data as JSON

### Regulatory Compliance

- **CCPA/GDPR**: Support data export and deletion requests
- **GLBA**: If hosting in US, document safeguards
- **PCI-DSS**: Only if storing card data (currently don't)
- **SOC 2**: Document controls for data security

---

## Success Stories & Expected Outcomes

### User Persona 1: Jane (Solo, Employed)

**Starting State**: Recently opened account, has basic checking/savings

**Onboarding Experience**:
1. Creates household in 2 minutes
2. Adds checking + savings accounts (5 min)
3. Downloads + uploads 3 months of checking statements (8 min)
4. Enters income from pay stubs (3 min)
5. Reviews financial snapshot (2 min)
6. Launches budget feature

**Total Time**: 20 minutes

**Outcome**: 
- Has checking account with 3 months of transactions
- Budget baseline: $3,200 monthly income, $2,000 expenses
- Emergency fund: 1.5 months (flagged as low)
- Recommendation: Build emergency fund to 6 months

---

### User Persona 2: The Martinez Family (Couple + Kids)

**Starting State**: Multiple banks, home loan, credit cards, college savings

**Onboarding Experience**:
1. Creates household as couple (3 min)
2. Adds 8 accounts across 3 institutions (10 min)
3. Uploads statements for each account (15 min per complex account)
4. Manually enters mortgage details from 1099 (3 min)
5. Combines both incomes + benefits (5 min)
6. Reviews household profile with visibility settings (5 min)

**Total Time**: 45 minutes

**Outcome**:
- Complete financial picture: $8.2M net worth, $580K mortgage, 3 college funds
- Monthly surplus: $4,200
- Financial health: HEALTHY with opportunity to optimize college savings
- Recommendations: Refinance mortgage, consolidate accounts, review insurance

---

### User Persona 3: Alex (Self-Employed, Complex)

**Starting State**: Multiple bank accounts, business income, variable cash flow

**Onboarding Experience**:
1. Creates household (2 min)
2. Adds business checking + personal checking + savings (5 min)
3. Uploads business statements + personal bank statements (15 min)
4. Manually enters self-employment income estimate (5 min) - "About $8K/month, varies"
5. System detects income pattern from statements (confirm: $7.2K/month) (2 min)
6. Reviews profile, acknowledges need for more consistent records (2 min)

**Total Time**: 31 minutes

**Outcome**:
- Business cash position clear
- Monthly cash flow baseline established
- Personal/business boundary identified
- Recommendation: Establish business savings buffer, consistent record-keeping

---

## Rollout Plan

### Phase 1: Private Beta (Week 1-2)
- Test with 5-10 friendly users
- Gather feedback on language, flow clarity
- Fix critical bugs, improve error handling
- Expected duration: 30-45 minutes per user

### Phase 2: Limited Release (Week 3-4)
- Roll out to 100 users opt-in
- Monitor completion rates, time-to-complete
- Collect satisfaction survey (4 questions)
- Adjust copy, fix flows based on feedback

### Phase 3: General Availability (Week 5+)
- Enable for all new households
- Make mandatory for first-time budget creation (skip available)
- Monitor ongoing metrics
- Iterate based on user feedback

### Feature Flags & Config

```typescript
FEATURE_FLAGS = {
  HOUSEHOLD_ONBOARDING_ENABLED: true,
  ONBOARDING_REQUIRED_FOR_BUDGET: false,
  ONBOARDING_SKIP_ALLOWED: true,
  INCOME_AUTO_DETECTION: true,
  RECURRING_PATTERN_DETECTION: true,
  AI_ADVISOR_AFTER_ONBOARDING: true,
}
```

---

## Appendix: Document Requirements by Account Type

### Checking Account Statement

**Required data:**
- Account number (last 4 digits)
- Transaction list with dates, amounts, payees
- Opening and closing balances

**Optional data:**
- Interest earned
- Fees charged

**Preferred format:** CSV (most parseable)

**Fallback:** PDF bank statement (will attempt OCR/parsing)

---

### Credit Card Statement

**Required data:**
- Account number (last 4 digits)
- Transaction list with dates, amounts, merchants
- Statement balance
- Minimum payment

**Optional data:**
- Interest rate (APR)
- Credit limit
- Available credit
- Recent fees

**Preferred format:** CSV or PDF

---

### Loan Statement (Auto, Personal, Student)

**Required data:**
- Loan amount
- Current balance
- Monthly payment
- Interest rate (APR)
- Payoff date or remaining term

**Optional data:**
- Payment history
- Late fees/penalties
- Deferment options

**Preferred format:** PDF

**Fallback:** Manual entry

---

### Mortgage Statement

**Required data:**
- Current balance
- Interest rate (APR)
- Monthly payment (P&I)
- Property address
- Remaining term

**Optional data:**
- Tax and insurance escrow amount
- PMI amount
- Refinance options

**Preferred format:** PDF (annual statement or recent payment coupon)

**Fallback:** Manual entry

---

### Utility Bill

**Required data:**
- Billing period
- Amount due
- Account number

**Optional data:**
- Usage breakdown (kWh, therms, gallons)
- Year-over-year comparison
- Budget billing option info

**Preferred format:** Image (photo of bill) or manual entry

---

### Investment Account Statement

**Required data:**
- Account type (401k, IRA, Brokerage)
- Account balance
- Account value as of date

**Optional data:**
- Holdings list and allocation %
- YTD gains/losses
- Contribution limit info (for retirement accounts)

**Preferred format:** PDF

**Fallback:** Manual entry (balance only)

---

## Questions & Decisions for Product Team

1. **Should we require onboarding or make it optional?**
   - Current design: Optional, but nudged
   - Alternative: Required gate before budget creation

2. **How many statements are truly "minimum viable"?**
   - Current design: 1 month acceptable, 3 months recommended
   - Alternative: Require 3 months minimum

3. **Should we auto-connect to banks (Plaid/etc.)?**
   - Current design: Manual upload only
   - Future: Plaid integration for auto-sync

4. **How much manual entry should we allow vs. require documents?**
   - Current design: Heavy fallback to manual entry
   - Alternative: Stricter document requirements

5. **Should AI advisor insights be shown before onboarding completes?**
   - Current design: Yes, on final review screen
   - Alternative: Wait until after launch, show only pre-configured recommendations

---

## Related Documents

- [Statement Parser Implementation](./CSV_PARSER_IMPLEMENTATION.md)
- [Document Upload Specification](../DELIVERABLES.md)
- [Financial Context Builder](./FINANCIAL_CONTEXT_BUILDER.md)
- [Budget Service Guide](../product/)
- [Privacy & Security Architecture](./PRIVACY_BOUNDARY_IMPLEMENTATION.md)
