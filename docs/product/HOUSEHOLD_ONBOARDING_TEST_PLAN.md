HOUSEHOLD ONBOARDING - TEST PLAN
================================

Document Date: 2026-09-13
Version: 1.0
Status: DRAFT

PROJECT OVERVIEW
================

Product: Household Onboarding Feature
Scope: Full end-to-end onboarding workflow across 6 phases
Timeline: 4-6 weeks development + 2 weeks testing
Testing Period: Weeks 4-5 of development
Target Launch: Week 6-7

Phase 1: Setup
Phase 2: Account Declaration
Phase 3: Statement Collection
Phase 4: Financial Context
Phase 5: Household Profile
Phase 6: Launch & Review


TEST STRATEGY
=============

Testing Approach: Layered pyramid model
- Unit Tests: 40% of testing effort
- Integration Tests: 35% of testing effort
- End-to-End Tests: 15% of testing effort
- Manual QA: 10% of testing effort

Testing Phases:
- Phase A: Component/Unit testing (parallel with development)
- Phase B: Integration testing (midway through development)
- Phase C: System testing (upon backend completion)
- Phase D: User acceptance testing (final 1 week)
- Phase E: Beta testing (pre-launch)

Quality Gates:
- Unit test coverage must be 90% or higher
- Integration tests must pass at 100%
- E2E critical path tests must pass at 100%
- No critical or high-severity bugs remaining
- User acceptance testing satisfaction 4/5 or higher


UNIT TEST PLAN
==============

Test Scope:
- Backend service layer (OnboardingService, IncomeDetectionService, ExpenseDetectionService)
- Frontend hooks and validators
- Domain models and value objects
- Repository layer query methods
- Utility functions and helpers

Unit Tests by Component:

1. OnboardingService Tests
   - startOnboarding: creates new progress record, initializes Phase 1
   - getCurrentProgress: retrieves current state, handles not found
   - getPhaseRequirements: returns correct requirements per phase
   - completePhase1: validates setup data, marks phase complete
   - completePhase2: creates accounts from declarations
   - onStatementCompleted: updates statement collection status
   - areStatementsComplete: checks minimum requirements
   - detectIncome: analyzes transactions for patterns
   - detectExpenses: analyzes transactions by category
   - completePhase4: stores user confirmations
   - completePhase5: creates household members
   - canLaunch: validates minimum dataset
   - launch: triggers snapshot and redirects
   - completePhase6: finalizes progress
   - skipPhase: advances to next phase (when allowed)
   - restart: resets progress to Phase 1

   Test Cases per Method: 3-5
   Total OnboardingService Tests: 60+

2. IncomeDetectionService Tests
   - analyzeDeposits: identifies recurring deposit patterns
   - calculateConfidence: determines HIGH/MEDIUM/LOW confidence levels
   - formatOutput: returns properly structured IncomeDetectionResult
   - handleEdgeCases: no transactions, all random deposits, single large deposit
   - frequencyDetection: identifies biweekly, monthly, variable income
   - amountCalculation: converts to annual and monthly figures
   - dateRangeHandling: uses correct transaction window

   Test Cases: 25+

3. ExpenseDetectionService Tests
   - categorizeTransactions: assigns transactions to categories
   - aggregateByCategory: sums amounts per category
   - identifyRecurring: finds patterns (monthly, weekly)
   - calculateConfidence: HIGH/MEDIUM/LOW per category
   - handleOutliers: ignores one-time large transactions
   - minTransactionThreshold: ignores categories with <3 occurrences
   - excludeInternalTransfers: filters transfer-to-self transactions

   Test Cases: 25+

4. Validation Functions Tests
   - validatePhase1Setup: household name required, profile type valid
   - validatePhase2Accounts: at least 1 account, valid account types
   - validatePhase3Statements: minimum months per account type
   - validatePhase4Context: income and expense data completeness
   - validatePhase5Profile: required fields present
   - validatePhase6Launch: minimum dataset check
   - validateEmail: valid format
   - validatePhoneNumber: valid format (optional)
   - validateAccountNumberSuffix: last 4 digits only

   Test Cases: 35+

5. Repository Layer Tests
   - OnboardingProgressRepository.create: inserts record, returns ID
   - OnboardingProgressRepository.getByHouseholdId: retrieves correct record
   - OnboardingProgressRepository.update: updates fields
   - OnboardingProgressRepository.completePhase: marks phase complete with timestamp
   - OnboardingCheckpointRepository.save: stores checkpoint
   - OnboardingCheckpointRepository.getLatest: retrieves most recent
   - IncomeDetectionRepository.create: inserts detection record
   - ExpenseDetectionRepository.create: inserts detection record
   - Query performance: indexes used correctly

   Test Cases: 40+

6. Hooks Tests (React)
   - useOnboarding: returns progress state
   - useOnboarding: completePhase calls API and updates state
   - useOnboarding: error handling and retry
   - useStatementGuidance: fetches correct guidance per account type
   - useIncomeDetection: triggers detection, shows results
   - useExpenseDetection: triggers detection, shows results
   - useFormProgress: auto-saves to checkpoint on change
   - useFormProgress: debounce prevents excessive saves

   Test Cases: 30+

TOTAL UNIT TESTS: 215+
Target Coverage: 90% of all methods and branches


INTEGRATION TEST PLAN
====================

Test Scope:
- API endpoint interactions
- Database state changes
- Service layer orchestration
- Cross-service communication
- Third-party integrations (document parser, statement processor)

Integration Test Suites:

1. Onboarding Flow Integration Tests

   Test: Full Phase 1 Completion
   Preconditions:
     - Fresh household record exists
     - User authenticated and authorized
   Steps:
     1. POST /onboarding/start
     2. Verify OnboardingProgress created in database
     3. Verify currentPhase = 1, currentState = IN_PROGRESS
     4. POST /onboarding/phase/1/complete with setup data
     5. Verify phase_1_completed_at is set
     6. Verify currentPhase advanced to 2
   Expected Result: Phase 1 complete, Phase 2 accessible
   Data Verification:
     - onboarding_progress.phase_1_data matches input
     - households table updated with name

   Test: Phase 2 Account Creation
   Preconditions:
     - Household at Phase 2
     - 3 accounts declared in AccountsPhaseData
   Steps:
     1. POST /onboarding/phase/2/complete with account declarations
     2. Verify 3 Account records created
     3. Verify accounts linked to household
     4. Verify Phase 2 completion flag set
   Expected Result: Accounts created, ready for statement upload
   Database Verification:
     - accounts table has 3 new rows
     - onboarding_declaration_id set on each
     - account.account_type matches declared type

   Test: Phase 3 Statement Upload & Processing
   Preconditions:
     - Household at Phase 3
     - 2 accounts created (Checking, Savings)
     - Checking requires 3 months, Savings requires 2 months
   Steps:
     1. POST /onboarding/accounts/:id/upload with CSV file
     2. Document parser processes file asynchronously
     3. Verify financial_documents created
     4. Verify transactions extracted
     5. GET /onboarding/accounts/collection-status
     6. Verify month showing as collected
     7. Repeat until all months complete
     8. Verify Phase 3 auto-completion when done
   Expected Result: All statements uploaded, transactions available for detection
   Database Verification:
     - financial_documents count matches uploads
     - transaction count matches extracted data
     - onboarding_progress.phase_3_completed_at set after final upload

   Test: Phase 4 Income Detection
   Preconditions:
     - Phase 3 complete with 3 months statements
     - Checking account has regular deposits
   Steps:
     1. POST /onboarding/detect-income
     2. IncomeDetectionService analyzes transactions
     3. Verify detections stored in onboarding_income_detection table
     4. Verify confidence level assigned
     5. Return results to frontend
   Expected Result: Income patterns identified, user can confirm
   Database Verification:
     - onboarding_income_detection has records
     - monthly_gross_cents calculated
     - confidence set to HIGH/MEDIUM/LOW
     - user_confirmed = false initially

   Test: Phase 4 Expense Detection
   Preconditions:
     - Phase 3 complete with 3 months statements
     - Multiple accounts with various transactions
   Steps:
     1. POST /onboarding/detect-expenses
     2. ExpenseDetectionService categorizes and aggregates
     3. Verify detections stored in onboarding_expense_detection table
     4. Verify confidence levels assigned
     5. Verify monthly_amount_cents calculated
   Expected Result: Expense patterns identified, user can review
   Database Verification:
     - onboarding_expense_detection has records per category
     - Categories match standard list (Groceries, Utilities, Dining, etc.)
     - confidence levels reasonable for category

   Test: Phase 5 Household Member Creation
   Preconditions:
     - Phase 4 complete
     - 2 household members to add
   Steps:
     1. POST /onboarding/phase/5/complete with member data
     2. Verify household_members created
     3. Verify roles assigned correctly
     4. Verify privacy confirmation stored
   Expected Result: Members added, Phase 5 complete
   Database Verification:
     - household_members count increased
     - visibility settings match input
     - phase_5_completed_at set

   Test: Phase 6 Launch
   Preconditions:
     - All previous phases complete
     - Minimum dataset present (income, expenses, accounts)
   Steps:
     1. POST /onboarding/launch
     2. Verify financial_snapshot created
     3. Verify FinancialHealthStatus calculated
     4. Verify initial insights generated
     5. Response includes snapshotId and dashboardUrl
   Expected Result: Snapshot created, user redirected to dashboard
   Database Verification:
     - financial_snapshots table has new record
     - onboarding_progress.completed_at set
     - household marked as active

2. Account & Document Integration Tests

   Test: Account Creation Triggers Cleanup of Old Data
   Preconditions:
     - Previous onboarding attempt exists with stale data
   Steps:
     1. Create new household
     2. Start fresh onboarding
     3. Verify old documents not visible
   Expected Result: Clean slate for new onboarding
   Data Integrity:
     - No orphaned financial_documents
     - No orphaned transactions

   Test: Document Upload Triggers Parser Integration
   Preconditions:
     - Account created for Chase Checking
     - CSV file prepared with 10 sample transactions
   Steps:
     1. Upload CSV to /onboarding/accounts/:id/upload
     2. Document handler queues parsing job
     3. Parser processes asynchronously
     4. Verify transactions in database
     5. Verify onboarding_phaseId set on document
   Expected Result: Transactions available for analysis
   Performance:
     - Parser completes within 5 seconds
     - 10-100 transaction parsing: <500ms per transaction

   Test: Multiple Document Uploads for Same Account
   Preconditions:
     - Account requires 3 months of statements
   Steps:
     1. Upload January CSV (30 transactions)
     2. Wait for completion
     3. Upload February CSV (28 transactions)
     4. Upload March CSV (31 transactions)
     5. Verify collection status shows all 3 months
   Expected Result: Cumulative transactions available for analysis
   Database Verification:
     - financial_documents count = 3
     - total transactions = 89
     - No duplicate transactions from overlapping uploads

3. Cross-Service Integration Tests

   Test: Onboarding Service → Financial Snapshot Service
   Preconditions:
     - Income and expense data confirmed
   Steps:
     1. Call OnboardingService.launch()
     2. Verify FinancialSnapshotService.create() called
     3. Verify snapshot persisted
     4. Verify onboarding references snapshot ID
   Expected Result: Snapshot linked to onboarding
   Database Verification:
     - financial_snapshots.id matches onboarding_progress.financial_snapshot_id

   Test: Income Detection → Budget Service (Optional)
   Preconditions:
     - Income detection confirmed
   Steps:
     1. Phase 4 complete with confirmed income
     2. Onboarding launch triggers budget creation
     3. Budget service receives income as constraint
     4. Verify budget created with correct income baseline
   Expected Result: Budget aligned with detected income
   Database Verification:
     - budgets table has new record
     - budget.monthly_income_cents = confirmed_income

   Test: Household Profile → Keycloak Sync
   Preconditions:
     - Phase 5 creates household members
   Steps:
     1. Add member "spouse@email.com"
     2. Verify OAuth/OIDC integration queue
     3. Verify invitation email queued
   Expected Result: Household member can access account
   External Verification:
     - Email delivery (test Mailgun/SendGrid)
     - OAuth realm updated (test Keycloak)

TOTAL INTEGRATION TESTS: 25+
Target Coverage: All critical user paths end-to-end


END-TO-END TEST PLAN
====================

Test Scope:
- Full onboarding journey through all 6 phases
- Real browser automation using Playwright
- Real API calls and database changes
- Real file uploads (CSV, PDF)
- Cross-browser compatibility

E2E Test Environment:
- Frontend: http://localhost:3000/onboarding
- API: http://localhost:3001/api
- Database: PostgreSQL on localhost:5434
- Test data: Seeded households with sample accounts

E2E Test Cases:

Test 1: Complete Happy Path (Desktop)
Description: User completes full onboarding in one session
Environment: Chrome on Windows 1920x1080
Expected Duration: 25-35 minutes
Steps:
  1. Navigate to /onboarding
  2. Verify Phase 1 screen displays
  3. Enter household name "Smith Family"
  4. Select profile type "Family"
  5. Select 2 banks (Chase, Bank of America)
  6. Click Next
  7. Verify Phase 2 screen displays
  8. Select Checking account type
  9. Enter account details (last 4 digits)
  10. Click Add Account
  11. Add Savings account
  12. Add Credit Card account
  13. Click Next
  14. Verify Phase 3 screen for Checking
  15. Drag & drop January CSV file
  16. Verify upload completes
  17. Repeat for February and March
  18. Click Next Account
  19. Repeat Phase 3 for Savings (2 months)
  20. Click Next
  21. Verify Phase 4 screen displays
  22. Verify income detection shows $9,750/month
  23. Confirm income (click Yes or edit)
  24. Verify expense detection shows categories
  25. Confirm expenses
  26. Click Next
  27. Verify Phase 5 screen displays
  28. Verify household member is you
  29. Check privacy confirmation
  30. Select notification preferences
  31. Click Next
  32. Verify Phase 6 screen displays
  33. Review financial snapshot
  34. Review initial insights
  35. Click "Continue to Dashboard"
  36. Verify redirected to /dashboard
  37. Verify household data persisted in database
Assertions:
  - All pages load within 2 seconds
  - Forms validate immediately on blur
  - File upload shows progress indicator
  - No JavaScript errors in console
  - Database reflects all entered data
  - household.onboarded_at is set
  - financial_snapshots created
  - Initial budget created with detected income

Test 2: Partial Completion & Resume (Desktop)
Description: User completes phases 1-3, leaves, returns and completes phases 4-6
Environment: Chrome on Windows 1920x1080
Expected Duration: Split session testing
Steps:
  Session 1 (15 minutes):
    1. Start onboarding
    2. Complete Phase 1 (setup)
    3. Complete Phase 2 (accounts)
    4. Upload statements for 2 months only
    5. Close browser without completing
  Session 2 (5 minutes later):
    1. Navigate to /onboarding again
    2. Verify last checkpoint restored
    3. Verify Phase 3 resume point shown
    4. Verify uploaded statements still visible
    5. Upload remaining month
    6. Click Next
    7. Complete Phase 4 (income/expenses)
    8. Complete Phase 5 (profile)
    9. Complete Phase 6 (launch)
Assertions:
  - Session data persisted in onboarding_checkpoints table
  - Resume seamlessly without re-entering Phase 1-2 data
  - Uploaded files retained across sessions
  - No data loss on browser close

Test 3: Error Recovery - Invalid File Upload (Desktop)
Description: User attempts invalid file, gets error, recovers with valid file
Environment: Chrome on Windows 1920x1080
Steps:
  1. Reach Phase 3 (statements)
  2. Attempt to upload Excel file (not supported)
  3. Verify error message appears: "Supported formats: CSV, PDF, PNG"
  4. Verify "Try Again" button present
  5. Click "Try Again"
  6. Upload valid CSV file
  7. Verify upload completes successfully
Assertions:
  - Error message is clear and actionable
  - No broken state after error
  - User can retry immediately without losing progress
  - Error tracking in logs includes session ID

Test 4: Data Validation - Invalid Inputs (Desktop)
Description: Test all form validation rules
Environment: Chrome on Windows
Steps:
  Phase 1:
    1. Try to proceed without entering household name
    2. Verify error: "Household name required"
    3. Try to proceed without selecting profile type
    4. Verify error: "Please select household type"
    5. Try to proceed without selecting bank
    6. Verify error: "Select at least one institution"
  Phase 2:
    1. Try to add account without account type
    2. Verify form prevents submission
    3. Try to add duplicate account type
    4. Verify warning or error
  Phase 4:
    1. Try to set income to 0
    2. Verify validation requires positive amount
    3. Try to set expense category to blank
    4. Verify validation error
Assertions:
  - All validation messages clear and actionable
  - No form submission when validation fails
  - Error messages appear near problematic field
  - Error messages disappear when fixed

Test 5: Cross-Browser Compatibility (Desktop)
Description: Verify onboarding works on major browsers
Browsers to Test:
  1. Chrome 120+ (Windows)
  2. Safari 17+ (macOS - if available)
Steps (abbreviated):
  - Run Test 1 (happy path) on each browser
  - Verify visually identical rendering
  - Verify no console errors
  - Verify file upload works
  - Verify form validation works
Assertions:
  - Consistent functionality across all browsers
  - No CSS layout issues
  - File APIs work on all browsers
  - Forms submit correctly

Test 6 (POSTSPONE): Session Expiration & Reauthentication
Description: Verify session handling and re-login flow
Environment: Chrome on Windows
Steps:
  1. Start onboarding (Phase 2 completion)
  2. Wait for session to expire (or manually expire token)
  3. Attempt to proceed to Phase 3
  4. Verify redirect to login
  5. Log in again
  6. Verify checkpoint restored to Phase 3
  7. Verify continue normally
Assertions:
  - Session expiration handled gracefully
  - No data loss on re-authentication
  - User informed about session expiration
  - Clear path to resume onboarding

TOTAL E2E TESTS: 10 scenarios with multiple assertions each
Target Coverage: All critical user journeys
Execution Time: Approximately 2-3 hours for full suite


MANUAL QA TEST PLAN
===================

Manual Testing Scope:
- Usability and UX clarity
- Copy/microcopy review
- Visual design consistency
- Error message clarity
- Edge cases and unusual data patterns
- Accessibility compliance
- Cross-device responsiveness

Manual Test Phases:

Phase A: Functional Testing

Test Group 1: Phase 1 Setup Screen
Tester Actions:
  1. View initial screen state
  2. Verify all fields visible and functional
  3. Test household name field:
     - Max length (verify if capped)
     - Special characters allowed?
     - Copy/paste functionality
  4. Test profile type radio buttons:
     - Visual state changes on select
     - Only one option selectable
     - Can change selection
  5. Test institution selection:
     - Can add multiple (checkbox behavior)
     - Can remove selection
     - Search/filter if >5 banks
  6. Test Next button:
     - Disabled until required fields filled
     - Verifies input on click
     - Shows loading state during submission
  7. Test error states:
     - Try without household name
     - Try without profile type
     - Verify error messages clear
     - Verify errors clear on correction

Expected Outcomes:
  - All form elements responsive and interactive
  - Error messages appear in real-time or on blur
  - No javascript errors
  - Form submits only when valid

Test Group 2: Phase 2 Account Declaration Screen
Tester Actions:
  1. View account types (Checking, Savings, Credit Card, etc.)
  2. Test adding accounts:
     - Click each account type
     - Verify account form opens
     - Enter account nickname and last 4 digits
     - Test save functionality
     - Verify account appears in list
  3. Test editing accounts:
     - Click edit on existing account
     - Modify nickname
     - Verify changes saved
  4. Test removing accounts:
     - Click remove on account
     - Verify confirmation dialog
     - Verify removal from list
  5. Test add account multiple times:
     - Verify can add 5+ accounts
     - Verify list scrolls if needed
  6. Test Next button:
     - Verify requires minimum 1 account
     - Submit with various account combinations

Expected Outcomes:
  - Account form clear and intuitive
  - Nickname and suffix validation working
  - Add/edit/remove flows smooth
  - Error handling for duplicate accounts (if applicable)
  - Can proceed with 1 to 10+ accounts

Test Group 3: Phase 3 Statement Upload Screen
Tester Actions:
  1. View account selector (dropdown or tabs)
  2. Verify institution guidance displays:
     - Correct institution name
     - Clickable link to bank website
     - Sample screenshot if available
  3. Test date range selector:
     - Verify month selector shows correct months
     - Verify can select date range
  4. Test file upload:
     - Drag & drop CSV file
     - Click to browse and select
     - Verify file name shows after selection
     - Verify upload starts automatically
     - Monitor progress bar
  5. Test upload completion:
     - Verify checkmark appears
     - Verify transaction count displayed
  6. Test multiple uploads:
     - Upload month 1
     - Upload month 2
     - Verify progress toward requirement
  7. Test invalid file upload:
     - Try to upload Excel file (.xlsx)
     - Verify error message
     - Verify can retry
  8. Test file too large:
     - Create large file >50MB
     - Attempt upload
     - Verify size validation

Expected Outcomes:
  - Upload UX is clear and progress visible
  - File validation working correctly
  - Multiple uploads accumulate properly
  - Guidance appropriate for institution
  - Can complete all required uploads

Test Group 4: Phase 4 Financial Context Screen
Tester Actions:
  1. View income detection results:
     - Verify amount displayed ($X/month)
     - Verify confidence level shown
     - Verify "Is this right?" options visible
  2. Test confirming income:
     - Click "Yes" if correct
     - Verify confirmation recorded
  3. Test manual income entry:
     - Click "Not quite" or "Enter manually"
     - Input income amount
     - Verify saved
  4. View expense detection results:
     - Verify categories listed (Groceries, Utilities, etc.)
     - Verify amounts per category
     - Verify confidence levels
  5. Test confirming expenses:
     - Review automatically detected amounts
     - Click confirm on category
     - Verify marked confirmed
  6. Test editing expenses:
     - Click edit on category
     - Modify amount
     - Verify saved
  7. Test adding missing category:
     - Click "Add Category"
     - Select category
     - Enter amount
     - Verify added to list
  8. Test removing category:
     - Click remove on category
     - Verify removed

Expected Outcomes:
  - Detection results presented clearly
  - User can easily confirm or override
  - Can add/remove expense categories
  - All entries saved correctly
  - Totals calculate correctly

Test Group 5: Phase 5 Household Profile Screen
Tester Actions:
  1. View current household member:
     - Verify "You" displayed as owner
     - Verify email shown
  2. Test adding member:
     - Click "Add Member"
     - Enter email or name
     - Verify member added to list
  3. Test privacy acknowledgment:
     - Read privacy statement
     - Click checkbox to acknowledge
     - Verify cannot proceed without acknowledgment
  4. Test notification preferences:
     - Toggle each notification type
     - Select frequency (Daily/Weekly/Monthly)
     - Verify preferences saved
  5. Test member management:
     - Edit member role/permissions
     - Remove member
     - Verify changes apply

Expected Outcomes:
  - Member management UX clear
  - Privacy policy easily readable
  - Notification preferences intuitive
  - Changes save correctly
  - Permissions applied immediately

Test Group 6: Phase 6 Review & Launch Screen
Tester Actions:
  1. View financial snapshot summary:
     - Net worth displayed
     - Monthly surplus calculated
     - Emergency fund months shown
  2. Review initial insights:
     - Read all insight cards
     - Verify appropriate tone and clarity
     - Verify recommendations actionable
  3. Test continue button:
     - Click "Continue to Dashboard"
     - Verify redirect to /dashboard
     - Verify snapshot persisted
  4. Test cancel option:
     - Can user go back and edit?
     - Verify checkpoint saved if so

Expected Outcomes:
  - Summary clearly shows household financial state
  - Insights are relevant and clear
  - Launch button works
  - Redirect to dashboard successful
  - Data persisted in database

Phase B: Usability & UX Review

Tester Actions (Observational):
  1. Clear language and terminology:
     - Are financial terms explained?
     - Can non-technical user understand?
     - Are errors messages clear?
  2. Visual hierarchy:
     - Is important information prominent?
     - Are buttons clearly clickable?
     - Is progress obvious?
  3. Feedback and response:
     - Does loading happen visibly?
     - Are success states clear?
     - Are errors obvious?
  4. Consistency:
     - Do all phases follow same pattern?
     - Button labels consistent?
     - Color scheme consistent?
  5. Scannability:
     - Can user scan page quickly?
     - Headings clear?
     - Key information highlighted?

Expected Outcomes:
  - No user confusion observed
  - Task completion time reasonable (25-35 min)
  - User confidence high
  - No critical usability issues

Phase C: Accessibility Compliance Testing

Tester Actions:
  1. Keyboard Navigation:
     - Tab through entire flow
     - Verify all controls reachable
     - Verify logical tab order
     - Verify escape closes dropdowns
  2. Screen Reader Testing (NVDA or JAWS):
     - Verify form labels announced
     - Verify buttons announced
     - Verify required fields indicated
     - Verify error messages announced
     - Verify link purposes clear
  3. Color Contrast:
     - Use contrast checker tool (WebAIM)
     - Verify text contrast ratio >= 4.5:1
     - Verify icon contrast
  4. Focus Indicators:
     - Verify focus outline visible on all controls
     - Verify outline has sufficient contrast
     - Verify outline not hidden by design
  5. Forms:
     - Verify field labels associated
     - Verify required fields indicated
     - Verify error messages linked to fields
  6. Media:
     - If images present, verify alt text
     - If videos present, verify captions

Expected Outcomes:
  - WCAG 2.1 AA compliance achieved
  - Keyboard navigation complete
  - Screen reader navigation complete
  - No accessibility barriers

Phase D: Visual Design Review

Tester Actions:
  1. View each phase on multiple devices:
     - Desktop (1920x1080)
     - Tablet (768x1024)
     - Mobile (375x667)
  2. Check for visual issues:
     - Text cutoff or wrapped unexpectedly
     - Images distorted
     - Buttons misaligned
     - Colors correct
     - Spacing consistent
  3. Form field presentation:
     - Input fields clearly defined
     - Placeholders visible but don't disappear too early
     - Focus states obvious
     - Disabled states clear
  4. Typography:
     - Font sizes appropriate
     - Line spacing readable
     - Hierarchy clear
  5. Responsive behavior:
     - Navigation adapts for mobile (hamburger menu?)
     - Forms stack properly on narrow screens
     - No horizontal scrolling required
     - Touch targets adequate (44x44px minimum)

Expected Outcomes:
  - Consistent visual design across phases
  - Mobile-first design working well
  - No layout issues on tested devices
  - Professional appearance

Phase E: Copy & Content Review

Tester Actions:
  1. Read all UI text:
     - Check spelling and grammar
     - Check for consistent terminology
     - Check for consistency of voice/tone
  2. Review error messages:
     - Are they helpful?
     - Do they explain what went wrong?
     - Do they suggest how to fix?
     - Professional tone?
  3. Review placeholder text:
     - Clear examples provided?
     - Placeholders not confused with labels?
  4. Review guidance text:
     - Is guidance adequate?
     - Is guidance clear?
     - Are links functional?
  5. Review microcopy (buttons, labels):
     - Button labels action-oriented?
     - Labels clear about what field is for?
     - Consistent terminology across UI?

Expected Outcomes:
  - No spelling errors
  - No grammatical errors
  - Consistent voice and tone
  - Clear, helpful messaging
  - Professional appearance

TOTAL MANUAL QA TESTS: 50+ test scenarios
Expected Duration: 30-40 hours of manual testing


TEST DATA REQUIREMENTS
=====================

Sample Households for Testing:
  1. Solo household (single person, 3 accounts)
     - Checking account (3 months)
     - Savings account (2 months)
     - Credit card (2 months)
  2. Couple household (2 people, 5 accounts)
     - Joint checking (3 months)
     - His savings (2 months)
     - Her savings (2 months)
     - Joint mortgage tracker (1 month)
     - Joint credit card (2 months)
  3. Family household (4 people, 8 accounts)
     - Multiple checking accounts
     - Multiple savings accounts
     - Mortgage account
     - Auto loan account
     - Student loan accounts
     - Multiple credit cards

Sample Financial Data Files:
  CSV Files:
    - Sample checking account statement (100 transactions, 3 months)
    - Sample savings account statement (20 transactions, 3 months)
    - Sample credit card statement (80 transactions, 3 months)
    - Sample with various transaction types (transfers, purchases, deposits)
    - Sample with edge cases (duplicate entries, future dates, missing data)
  
  PDF Files:
    - Downloadable statement from Chase
    - Downloadable statement from Bank of America
    - Downloadable statement from Capital One
  
  Invalid Files (for testing error handling):
    - .xlsx Excel file
    - .txt text file
    - Image file (.jpg, .png)
    - Empty CSV
    - CSV with wrong headers
    - CSV with >100MB size

Transaction Patterns in Sample Data:
  Income patterns:
    - Biweekly deposits of $2,250 (gross $4,500/month salary)
    - Monthly freelance deposits ($1,500-$2,500 variable)
    - Occasional bonus deposits
  
  Expense patterns:
    - Groceries: $800/month (weekly pattern ~$200)
    - Utilities: $150-250/month (monthly pattern)
    - Insurance: $200/month (on 15th)
    - Dining out: $300-500/month (scattered)
    - Subscriptions: $80/month (recurring on various dates)
    - Rent/Mortgage: $1,500/month (1st of month)


TEST ENVIRONMENT SETUP
=====================

Environment Requirements:
  - PostgreSQL 14+ with test database
  - Redis for session caching (optional for testing)
  - Node.js 18+ runtime
  - npm or yarn package manager
  - Playwright for E2E testing
  - Jest for unit/integration tests

Database Setup:
  1. Create test database: house_financial_test
  2. Run migrations: npm run migrate:up
  3. Seed test data: npm run db:seed:onboarding
  4. Verify schema: 
     - onboarding_progress table exists
     - onboarding_checkpoints table exists
     - onboarding_income_detection table exists
     - onboarding_expense_detection table exists

Environment Variables for Testing:
  NODE_ENV=test
  DATABASE_URL=postgresql://user:pass@localhost:5434/house_financial_test
  API_URL=http://localhost:3001/api
  FRONTEND_URL=http://localhost:3000
  ENABLE_ONBOARDING=true
  SKIP_EMAIL_SENDS=true
  LOG_LEVEL=debug
  SESSION_TIMEOUT_MINUTES=30

Test Execution:
  Unit Tests:
    npm run test:unit
  Integration Tests:
    npm run test:integration
  E2E Tests:
    npm run test:e2e
  All Tests:
    npm run test:all
  Coverage Report:
    npm run test:coverage


TEST EXECUTION SCHEDULE
=======================

Week 4 (Development Phase 3 Weeks 2-4):
  Days 1-2: Unit tests written and running in parallel
  Days 3-4: Integration tests written and running
  Days 5: Component/hook tests for React
  
Week 5 (Development Phase 4):
  Days 1-2: E2E test suite running and passing
  Days 3-5: Manual QA testing (30+ scenarios)
  
Week 6 (Pre-Launch):
  Days 1-2: Accessibility testing and fixes
  Days 3-4: Performance testing under load
  Days 5: Bug triage and critical fixes
  
Week 7 (Launch Prep):
  Days 1-2: Final regression testing
  Days 3-4: Beta user acceptance testing
  Days 5: Go/No-Go decision


TEST RESULT REPORTING
====================

Test Result Tracking:
  - Test case ID and name
  - Status (Pass, Fail, Blocked, Skipped)
  - Date executed
  - Environment (browser, OS, screen size)
  - Notes and evidence (screenshots/logs)
  - Defect ID if failed

Defect Severity Levels:
  Critical:
    - Data loss or corruption
    - Authentication/authorization bypass
    - Complete feature non-functional
    - User cannot complete onboarding
    - Fix required before any release
  
  High:
    - Major feature broken or unusable
    - Significant UX degradation
    - Performance severely impacted
    - Fix required before general release
  
  Medium:
    - Minor feature broken or workaround exists
    - UX issue but usable
    - Performance acceptable but suboptimal
    - Should fix before launch
  
  Low:
    - Cosmetic issue
    - Text typo
    - Minor UI glitch that doesn't block use
    - Can defer if time-constrained

Daily Test Report:
  - Number of tests passed
  - Number of tests failed
  - Number of tests blocked
  - Critical defects identified
  - Trend (improving/stable/declining)
  - Blockers or risks

Weekly Test Summary:
  - Cumulative test results
  - Test coverage percentage
  - Defect count by severity
  - Critical path status
  - Sign-off status per phase

Go/No-Go Report (Pre-Launch):
  - Final test coverage metrics
  - All critical defects resolved
  - Manual QA sign-off
  - Accessibility compliance verified
  - Performance targets met
  - Security audit passed
  - Rollback plan tested


RISK-BASED TESTING APPROACH
===========================

High-Risk Areas Requiring Extra Testing:

1. Statement Parsing Integration
   Risk: Parser fails on new bank formats, user data lost
   Mitigation:
     - Test with real statements from 10+ banks
     - Test with various CSV encodings (UTF-8, Latin-1)
     - Test with PDF statements from 3+ banks
     - Test graceful fallback for unparseable files
     - Verify no data loss on parse failure

2. Income/Expense Detection Accuracy
   Risk: Detection incorrect, user loses confidence in tool
   Mitigation:
     - Test with 20+ realistic financial profiles
     - Test edge cases (no regular income, all expenses)
     - Validate confidence levels match accuracy
     - Test with users and measure satisfaction
     - Require user confirmation before using data

3. Data Privacy & Security
   Risk: User financial data exposed or leaked
   Mitigation:
     - Security audit of all endpoints
     - Verify data encryption at rest and in transit
     - Verify auth checks on all endpoints
     - Test SQL injection on all inputs
     - Verify no PII in logs or error messages
     - Test GDPR compliance (data export, deletion)

4. Multi-User Household Coordination
   Risk: Spouse data gets mixed up or permission issues
   Mitigation:
     - Test adding multiple household members
     - Test member permission scopes
     - Test data visibility per member
     - Test concurrent access from multiple members
     - Verify OAuth/OIDC integration works

5. Session & Checkpoint Persistence
   Risk: User loses progress on browser close or network failure
   Mitigation:
     - Test checkpoint save on every phase change
     - Test network disconnection and reconnection
     - Test browser tab close without clean logout
     - Test long session duration (>1 hour)
     - Verify checkpoint cleanup after 30 days

6. File Upload Handling
   Risk: Large file uploads timeout, virus scan fails, storage issues
   Mitigation:
     - Test file uploads from various network conditions
     - Test upload progress display
     - Test cancellation mid-upload
     - Test 50MB+ file uploads
     - Test upload from slow network (2G throttle)
     - Verify antivirus scanning integration

7. Mobile & Accessibility
   Risk: Mobile users cannot complete, accessibility features break
   Mitigation:
     - Full E2E test on mobile viewport
     - Full keyboard navigation test
     - Screen reader testing (NVDA, JAWS)
     - Color contrast verification
     - Touch target sizing verification
     - Form accessibility compliance

8. Database Constraint Violations
   Risk: Concurrent updates cause deadlocks or constraint errors
   Mitigation:
     - Load test with 10+ concurrent onboardings
     - Test concurrent phase completions
     - Verify no deadlocks in transaction logs
     - Test rollback on constraint violation
     - Monitor database locks during testing


ACCEPTANCE CRITERIA
==================

Unit Test Coverage:
  - 90% or higher line coverage
  - 85% or higher branch coverage
  - All critical paths covered
  - Pass rate 100%

Integration Test Coverage:
  - All 6 phase transitions tested
  - Cross-service integrations tested
  - Database state changes verified
  - Pass rate 100%

E2E Test Coverage:
  - Happy path complete
  - Resume from checkpoint
  - Error recovery flows
  - Mobile functionality
  - Keyboard navigation
  - Pass rate 100%

Manual QA Coverage:
  - All 50+ scenarios tested
  - No critical usability issues
  - Accessibility compliance verified
  - No spelling or grammar errors
  - User satisfaction 4/5 or higher

Performance:
  - Page load time < 2 seconds (cached) / < 5 seconds (first load)
  - File upload < 5 seconds for 10MB file
  - Income/expense detection < 3 seconds
  - Database response time < 500ms for queries
  - No UI blocking during async operations

Security:
  - OWASP Top 10 vulnerabilities addressed
  - SQL injection tests passed
  - XSS protection verified
  - CSRF protection in place
  - Rate limiting on sensitive endpoints
  - Security audit signed off

Accessibility:
  - WCAG 2.1 AA compliance verified
  - Keyboard navigation tested
  - Screen reader compatibility confirmed
  - Color contrast ratios verified (4.5:1 minimum)
  - Focus indicators visible
  - No accessibility barriers

Data Integrity:
  - No orphaned records
  - No duplicate data
  - Constraints enforced
  - Referential integrity maintained
  - Checkpoint data correctly restored
  - No data loss on error

Browser Compatibility:
  - Chrome 120+ passes all tests
  - Firefox 121+ passes all tests
  - Safari 17+ passes all tests
  - Edge 120+ passes all tests

Mobile Compatibility:
  - iPhone 12 (390x844) fully functional
  - Android device (375x667) fully functional
  - No horizontal scrolling required
  - Touch targets adequate


SIGN-OFF REQUIREMENTS
====================

Unit & Integration Test Sign-Off:
  - QA Lead: All tests passing, coverage >90%
  - Tech Lead: Code review of test implementations
  - Date: ________

E2E Test Sign-Off:
  - QA Lead: All E2E tests passing
  - Dev Lead: No critical regressions
  - Date: ________

Manual QA Sign-Off:
  - QA Team: All scenarios tested and documented
  - Product Manager: User acceptance verified
  - UX Designer: Visual design approved
  - Date: ________

Accessibility Sign-Off:
  - Accessibility Specialist: WCAG 2.1 AA compliance verified
  - QA Lead: Keyboard and screen reader testing passed
  - Date: ________

Security Sign-Off:
  - Security Engineer: Security audit completed
  - No critical vulnerabilities remaining
  - Date: ________

Launch Readiness Sign-Off:
  - QA Lead: All test criteria met
  - Product Manager: Feature ready for users
  - Dev Lead: Code review and deployment ready
  - Date: ________


APPENDIX: TEST UTILITIES & TOOLS
================================

Testing Tools:
  - Jest: Unit and integration testing framework
  - Playwright: E2E browser automation
  - PostgreSQL: Test database
  - Postman: API testing (optional)
  - WebAIM: Accessibility contrast checker
  - NVDA: Screen reader testing
  - Chrome DevTools: Performance and accessibility audit

Test Data Fixtures:
  - fixtures/sample-households.json (3 test households)
  - fixtures/sample-statements.csv (100 test transactions)
  - fixtures/sample-statements.pdf (downloadable statements)
  - fixtures/invalid-files/* (error testing)
  - fixtures/edge-cases.json (boundary conditions)

Test Scripts:
  - scripts/db:seed:onboarding (populate test data)
  - scripts/test:unit (run unit tests)
  - scripts/test:integration (run integration tests)
  - scripts/test:e2e (run E2E tests)
  - scripts/test:coverage (generate coverage report)
  - scripts/test:accessibility (run accessibility audit)

Test Reports Location:
  - coverage/ (test coverage reports)
  - test-results/ (test execution results)
  - screenshots/ (E2E failure screenshots)
  - logs/ (detailed test logs)


END OF TEST PLAN
===============

Document Approvals:
  QA Lead: ________________________  Date: ________
  Tech Lead: ________________________  Date: ________
  Product Manager: ________________________  Date: ________
  Project Manager: ________________________  Date: ________

Document History:
  Version 1.0 - 2026-09-13 - Initial draft
