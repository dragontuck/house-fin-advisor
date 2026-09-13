# Household Onboarding: Detailed Implementation Plan

## Document Overview

This plan outlines the technical and organizational approach to implementing the Household Onboarding feature as designed in [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md).

**Scope**: Full end-to-end onboarding workflow  
**Estimated Effort**: 120-180 engineer-hours (4-6 weeks for small team)  
**High-Level Timeline**: Design week 1, Core implementation weeks 2-4, Refinement weeks 5-6  
**Teams Involved**: Backend (API), Frontend (Web UI), QA/Testing  

---

## Phase 1: Foundation & Planning (Week 1)

### 1.1 Requirements Finalization & Data Modeling

**Objectives:**
- Validate product design against technical constraints
- Finalize data models and API contracts
- Identify integration points with existing systems
- Create technical specifications for each component

**Deliverables:**

#### Onboarding State Machine
```
Design the state machine that tracks user progress through 6 phases:

States: 
  - NOT_STARTED
  - SETUP_COMPLETE (Phase 1)
  - ACCOUNTS_DECLARED (Phase 2)
  - STATEMENTS_COLLECTING (Phase 3)
  - STATEMENTS_COMPLETE
  - FINANCIAL_CONTEXT_ENTERED (Phase 4)
  - PROFILE_COMPLETE (Phase 5)
  - LAUNCHED (Phase 6)
  
Transitions:
  - Can skip forward (e.g., to Phase 6 with minimum data)
  - Can go backward to edit
  - Can save progress and resume later
  
Storage:
  - OnboardingProgress table tracks current state + timestamp
  - Each phase has its own validation rules
```

#### Data Model Additions

```typescript
// New types needed

interface OnboardingProgress {
  id: EntityId;
  householdId: EntityId;
  currentPhase: OnboardingPhase; // 1-6
  currentState: OnboardingState; // NOT_STARTED, IN_PROGRESS, COMPLETE, etc.
  
  // Phase completion tracking
  phases: {
    1: { completed: boolean; completedAt: Date | null; data: SetupPhaseData }
    2: { completed: boolean; completedAt: Date | null; data: AccountsPhaseData }
    3: { completed: boolean; completedAt: Date | null; data: StatementsPhaseData }
    4: { completed: boolean; completedAt: Date | null; data: FinancialContextPhaseData }
    5: { completed: boolean; completedAt: Date | null; data: ProfilePhaseData }
    6: { completed: boolean; completedAt: Date | null; data: LaunchPhaseData }
  };
  
  // Timing & engagement metrics
  startedAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
  totalTimeMinutes: number; // Calculated: (completedAt - startedAt) / 60000
  
  // Checkpoints for resume
  lastCheckpoint: {
    phase: OnboardingPhase;
    timestamp: Date;
    sessionId: string; // Resume session tracking
  };
}

interface OnboardingSessionCheckpoint {
  id: EntityId;
  householdId: EntityId;
  phase: OnboardingPhase;
  data: object; // JSON serialization of phase data
  createdAt: Date;
}

// Phase-specific data structures

interface SetupPhaseData {
  householdName: string;
  profileType: "SOLO" | "COUPLE" | "FAMILY";
  primaryMemberId: EntityId;
  initialInstitutions: string[]; // User-entered institution names
  completedAt?: Date;
}

interface AccountsPhaseData {
  declaredAccounts: Array<{
    tempId: string; // Client-side ID for matching to created Account
    type: AccountType;
    nickname: string;
    balance: Money;
    ownership: AccountOwnership;
    institutionName?: string;
    accountNumberSuffix?: string; // Last 4 digits only
  }>;
  completedAt?: Date;
}

interface StatementsPhaseData {
  accountStatementCollectionStatus: Record<EntityId, {
    accountId: EntityId;
    accountType: AccountType;
    minStatementsNeeded: number;
    maxStatementsDesired: number;
    uploadedStatementCount: number;
    periodsCovered: Array<{
      startDate: Date;
      endDate: Date;
      documentId: EntityId;
      status: DocumentProcessingStatus;
    }>;
    isComplete: boolean;
    lastError?: string;
  }>;
  completedAt?: Date;
}

interface FinancialContextPhaseData {
  detectedIncome: {
    source: "AUTO_DETECTED" | "MANUAL_ENTRY";
    amount: Money;
    monthlyGross: Money;
    monthlyNet: Money;
    frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "ANNUAL";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    detectionDetails?: string; // e.g., "Regular deposits of $4,500"
  };
  detectedExpenses: Array<{
    category: string; // e.g., "Groceries", "Utilities"
    monthlyAmount: Money;
    source: "AUTO_DETECTED" | "MANUAL_ENTRY";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }>;
  userConfirmed: boolean;
  completedAt?: Date;
}

interface ProfilePhaseData {
  householdMembers: Array<{
    id: EntityId;
    role: HouseholdMemberRole;
    visibility: HouseholdMemberVisibility;
  }>;
  privacyConfirmed: boolean;
  notificationPreferences: {
    budgetAlerts: boolean;
    attentionItems: boolean;
    goalMilestones: boolean;
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  };
  twoFactorEnabled: boolean;
  completedAt?: Date;
}

interface LaunchPhaseData {
  financialSnapshotId: EntityId;
  initialHealthStatus: FinancialHealthStatus;
  budgetReadiness: {
    hasIncomeData: boolean;
    hasExpenseData: boolean;
    hasAccountData: boolean;
    monthsOfData: number;
    canCreateBudget: boolean;
  };
  initialInsights: Array<{
    type: "OPPORTUNITY" | "WARNING" | "INFO";
    title: string;
    description: string;
  }>;
  completedAt?: Date;
}
```

#### API Contract Updates

```typescript
// New endpoints to implement

// Onboarding session management
POST /onboarding/start
  → OnboardingProgress (initialized in Phase 1, State: IN_PROGRESS)
  
GET /onboarding/progress
  → OnboardingProgress (current state and data)
  
POST /onboarding/phase/:phaseNumber/complete
  Body: OnboardingPhaseData
  → { status: "OK" | "VALIDATION_ERROR", errors?: ValidationError[] }
  
POST /onboarding/phase/:phaseNumber/skip
  → OnboardingProgress (advance to next phase)
  
POST /onboarding/restart
  → OnboardingProgress (reset to Phase 1)
  
GET /onboarding/progress/checkpoint
  → OnboardingSessionCheckpoint (for resume)
  
POST /onboarding/progress/checkpoint
  Body: { phase, data }
  → OnboardingSessionCheckpoint (save progress)

// Account management during onboarding
POST /onboarding/accounts
  Body: AccountsPhaseData
  → { createdAccountIds: EntityId[] }
  
GET /onboarding/accounts/collection-status
  → Record<EntityId, CollectionStatus>
  
PATCH /onboarding/accounts/:accountId
  Body: { nickname, balance, etc. }
  → Account

// Statement guidance
GET /onboarding/accounts/:accountId/guidance
  → {
      accountType: AccountType;
      minMonthsRequired: number;
      preferredFormats: string[];
      institutionDownloadUrl: string;
      exampleStatementUrl: string;
      supportPhone: string;
    }

// Financial context detection
POST /onboarding/detect-income
  Body: { householdId }
  → { detectedIncome: IncomeDetection[], confidence: "HIGH"|"MEDIUM"|"LOW" }
  
POST /onboarding/detect-expenses
  Body: { householdId, accountIds: EntityId[] }
  → { detectedExpenses: ExpenseDetection[], monthlyTotal: Money }
  
POST /onboarding/financial-context/confirm
  Body: FinancialContextPhaseData
  → { snapshotId: EntityId, statusId: FinancialHealthStatus }

// Onboarding launch
POST /onboarding/launch
  Body: { confirmationPhrase: "ready" }
  → {
      status: "OK" | "DATA_INCOMPLETE";
      snapshotId?: EntityId;
      budgetId?: EntityId;
      redirectUrl: string;
    }
  
// Validation helper
GET /onboarding/validate/:phaseNumber
  Query: { data: JSON }
  → { valid: boolean; errors: ValidationError[] }

// Analytics/insights
GET /onboarding/initial-insights
  → InitialInsight[]
```

**Acceptance Criteria:**
- [ ] State machine diagram approved by team
- [ ] Data model reviewed for consistency with existing schema
- [ ] API contracts finalized and documented
- [ ] Database migration plan created (see Section 3.1)
- [ ] Error handling strategy defined for each endpoint

---

### 1.2 Integration Audit

**Objectives:**
- Map dependencies on existing systems
- Identify potential conflicts or version incompatibilities
- Plan phased rollout to avoid disruption
- Document external service interactions

**Integration Points to Audit:**

| System | Current Usage | Onboarding Usage | Coordination Needed |
|---|---|---|---|
| **Document Upload** | Manual statement upload | Core to Phase 3 | None - uses existing API |
| **Statement Parser** | Parses CSV/PDF statements | Extract transactions for income/expense detection | Add parser callback hook for onboarding phase |
| **Account Repository** | CRUD on Account records | Create accounts in batch during Phase 2 | Add transaction counts for completion status |
| **Financial Snapshot** | Manual snapshot creation | Triggered at Phase 4 completion | Auto-create snapshot with onboarding flag |
| **Budget Service** | Creates budgets from snapshots | Suggest budget after launch | Call budget service as optional "next step" |
| **Recurring Detector** | Analyzes transactions | Detect recurring expenses in Phase 4 | Reuse detection logic in onboarding |
| **Health Engine** | Calculates health score | Display in Phase 6 review | Provide pre-calculated score |
| **Keycloak** | User authentication | Household member auth for Phase 5 | No changes needed |
| **Redis Cache** | Session state | Cache onboarding progress for resume | New cache key pattern: `onboarding:{householdId}` |
| **Email Service** | Transactional emails | Send onboarding progress checkpoints | Provide email templates |

**Deliverables:**
- Integration compatibility matrix
- Dependency version requirements
- Conflict resolution strategies
- Rollback plan if integration breaks

---

### 1.3 UI/UX Component Inventory

**Objectives:**
- Inventory reusable components vs. new builds
- Plan component library updates
- Design responsive layouts for mobile-first
- Specification of accessibility requirements

**Component Breakdown:**

**Existing (Reuse):**
- [ ] ProgressBar (multi-step)
- [ ] FileUpload (with drag-drop)
- [ ] FormInput/FormSelect (with validation)
- [ ] Modal/Dialog (for confirmations)
- [ ] ErrorBoundary (error handling)
- [ ] LoadingSpinner (async operations)
- [ ] Card/Panel (data display)
- [ ] Button (primary/secondary/tertiary)

**New Components (Build):**
- [ ] OnboardingLayout (6-phase container)
- [ ] PhaseIndicator (step counter + visual progress)
- [ ] AccountTypeSelector (radio/button grid)
- [ ] StatementGuidance (institution-specific instructions)
- [ ] IncomeDetectionResult (show detected vs. entered)
- [ ] ExpenseDetectionResult (show recurring patterns)
- [ ] OnboardingReview (final summary before launch)
- [ ] MilestoneCard (celebration/progress display)

**Deliverables:**
- Component inventory and design specs
- Responsive wireframes for 3 breakpoints (mobile, tablet, desktop)
- Accessibility checklist for each component
- Copy/microcopy standards document

---

### 1.4 Testing Strategy

**Objectives:**
- Define test scope and coverage targets
- Plan test data and fixtures
- Identify manual test scenarios
- Set up CI/CD integration

**Test Coverage Plan:**

```
Unit Tests:
  - Phase validation logic (each phase's rules)
  - State transitions (valid/invalid paths)
  - Income detection algorithm
  - Expense detection algorithm
  - Data model serialization
  
Integration Tests:
  - Phase completion → next phase unlock
  - Account creation → statement uploads → transaction extraction
  - Income detection → expense detection
  - Financial snapshot creation
  - Budget service integration
  
End-to-End Tests (Playwright/Cypress):
  - Full happy path: 6 phases in sequence
  - Partial completion: start Phase 3, skip to Phase 6
  - Resume: leave at Phase 2, return later and complete
  - Error recovery: upload invalid file, retry successfully
  - Multi-browser: Chrome, Firefox, Safari
  - Responsive: Mobile (375px), Tablet (768px), Desktop (1920px)
  
Accessibility Tests:
  - Keyboard navigation (tab, enter, escape)
  - Screen reader compatibility (NVDA, JAWS)
  - Color contrast (automated + manual)
  - Focus indicators visible
  
Performance Tests:
  - Page load time < 2s (cached) / < 5s (first load)
  - File upload < 3s for 10MB file
  - Phase transition < 500ms
  - Income/expense detection < 2s
  
Security Tests:
  - SQL injection in manual entry fields
  - XSS in file upload (file name handling)
  - Authorization: can only see own household
  - Rate limiting on upload endpoint
```

**Test Data Fixtures:**
- Sample CSV/PDF statements for each account type
- Mock household with 8 accounts (various types)
- Sample transaction data for pattern detection
- Edge cases: empty accounts, invalid data, duplicates

**Deliverables:**
- Test plan document
- Test data fixtures (CSV, PDF, JSON)
- Automated test suite structure (Jest, Playwright)
- CI/CD pipeline configuration

---

## Phase 2: Backend Implementation (Weeks 2-3)

### 2.1 Database Schema & Migrations

**Objectives:**
- Extend PostgreSQL schema to support onboarding state tracking
- Ensure data integrity and proper foreign keys
- Plan for historical auditing (who completed what, when)

**Schema Changes:**

```sql
-- New table: onboarding_progress
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- State tracking
  current_phase SMALLINT NOT NULL DEFAULT 1,
  current_state VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
  
  -- Completion status per phase
  phase_1_completed_at TIMESTAMP,
  phase_2_completed_at TIMESTAMP,
  phase_3_completed_at TIMESTAMP,
  phase_4_completed_at TIMESTAMP,
  phase_5_completed_at TIMESTAMP,
  phase_6_completed_at TIMESTAMP,
  
  -- Timing metrics
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  total_time_seconds INTEGER,
  
  -- Data storage (JSONB for flexibility)
  phase_1_data JSONB, -- SetupPhaseData
  phase_2_data JSONB, -- AccountsPhaseData
  phase_3_data JSONB, -- StatementsPhaseData
  phase_4_data JSONB, -- FinancialContextPhaseData
  phase_5_data JSONB, -- ProfilePhaseData
  phase_6_data JSONB, -- LaunchPhaseData
  
  -- Audit trail
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(household_id),
  CONSTRAINT valid_phase CHECK (current_phase BETWEEN 1 AND 6),
  INDEX idx_household_phase (household_id, current_phase),
  INDEX idx_started_at (started_at DESC)
);

-- New table: onboarding_checkpoints (for resume functionality)
CREATE TABLE onboarding_checkpoints (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL,
  phase SMALLINT NOT NULL,
  
  -- Checkpoint data
  checkpoint_data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_household_session (household_id, session_id),
  INDEX idx_created_at (created_at DESC)
);

-- Extend existing account table
ALTER TABLE accounts ADD COLUMN onboarding_declaration_id VARCHAR(255);
-- Tracks temporary client-side account ID during Phase 2

-- Extend existing financial_document table
ALTER TABLE financial_documents ADD COLUMN onboarding_phaseId SMALLINT;
ALTER TABLE financial_documents ADD COLUMN onboarding_order INTEGER;
-- Tracks which documents are part of onboarding collection

-- New table: onboarding_income_detection (for Phase 4 analysis)
CREATE TABLE onboarding_income_detection (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id),
  
  -- Detection metadata
  detection_source VARCHAR(50) NOT NULL, -- 'BANK_DEPOSITS' | 'MANUAL_ENTRY'
  confidence VARCHAR(20) NOT NULL, -- 'HIGH' | 'MEDIUM' | 'LOW'
  monthly_gross_cents BIGINT NOT NULL,
  monthly_net_cents BIGINT,
  annual_gross_cents BIGINT,
  
  -- Detection details
  detection_details JSONB,
  user_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMP,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_household_onboarding (household_id, onboarding_id)
);

-- New table: onboarding_expense_detection (for Phase 4 analysis)
CREATE TABLE onboarding_expense_detection (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES onboarding_progress(id),
  
  -- Detected category
  expense_category VARCHAR(100) NOT NULL,
  monthly_amount_cents BIGINT NOT NULL,
  confidence VARCHAR(20) NOT NULL, -- 'HIGH' | 'MEDIUM' | 'LOW'
  
  -- Detection source
  detection_source VARCHAR(50) NOT NULL, -- 'AUTO_DETECTED' | 'MANUAL_ENTRY'
  detected_from_transaction_count INTEGER,
  
  -- User confirmation
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_amount_cents BIGINT, -- If user overrides
  confirmed_at TIMESTAMP,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_household_category (household_id, expense_category)
);

-- View: onboarding_completion_status (for analytics)
CREATE VIEW onboarding_completion_status AS
SELECT
  household_id,
  current_phase,
  (phase_1_completed_at IS NOT NULL) as phase_1_complete,
  (phase_2_completed_at IS NOT NULL) as phase_2_complete,
  (phase_3_completed_at IS NOT NULL) as phase_3_complete,
  (phase_4_completed_at IS NOT NULL) as phase_4_complete,
  (phase_5_completed_at IS NOT NULL) as phase_5_complete,
  (phase_6_completed_at IS NOT NULL) as phase_6_complete,
  (completed_at IS NOT NULL) as fully_complete,
  total_time_seconds,
  started_at,
  completed_at
FROM onboarding_progress;
```

**Migration Script:**
```bash
npm run migrate:create add-onboarding-schema
# Generates migration file with schema above
npm run migrate:up
```

**Deliverables:**
- [ ] Migration SQL files
- [ ] Schema validation (foreign keys, constraints)
- [ ] Rollback plan
- [ ] Data seeding for test households

---

### 2.2 Repository Layer Implementation

**Objectives:**
- Implement OnboardingProgressRepository for CRUD
- Implement OnboardingCheckpointRepository for resume
- Implement IncomeDetectionRepository for Phase 4 data
- Implement ExpenseDetectionRepository for Phase 4 data
- Ensure type safety and data consistency

**Repository Classes to Implement:**

```typescript
// packages/db/repositories/onboarding-progress.ts
export class OnboardingProgressRepository {
  // Create new onboarding session
  async start(householdId: EntityId): Promise<OnboardingProgress>;
  
  // Get current progress
  async getByHouseholdId(householdId: EntityId): Promise<OnboardingProgress | null>;
  
  // Advance to next phase
  async completePhase(
    householdId: EntityId,
    phaseNumber: number,
    data: object
  ): Promise<OnboardingProgress>;
  
  // Skip phase
  async skipPhase(householdId: EntityId, phaseNumber: number): Promise<OnboardingProgress>;
  
  // Update progress data (mid-phase saves)
  async savePhaseData(
    householdId: EntityId,
    phaseNumber: number,
    data: object
  ): Promise<OnboardingProgress>;
  
  // Launch (complete all phases)
  async launch(
    householdId: EntityId,
    launchData: LaunchPhaseData
  ): Promise<OnboardingProgress>;
  
  // Reset/restart
  async restart(householdId: EntityId): Promise<OnboardingProgress>;
  
  // Get all for analytics
  async getByStatus(status: OnboardingState, limit: number): Promise<OnboardingProgress[]>;
  
  // Metrics queries
  async getAverageTimeToComplete(): Promise<number>; // minutes
  async getCompletionRate(): Promise<number>; // percentage 0-100
  async getPhaseDropoffRates(): Promise<Record<number, number>>; // % who drop off at each phase
}

// packages/db/repositories/onboarding-checkpoint.ts
export class OnboardingCheckpointRepository {
  // Save progress checkpoint
  async saveCheckpoint(
    householdId: EntityId,
    sessionId: string,
    phase: number,
    data: object
  ): Promise<OnboardingSessionCheckpoint>;
  
  // Restore from checkpoint
  async getLatestCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingSessionCheckpoint | null>;
  
  // Clean up old checkpoints
  async cleanupOlderThan(days: number): Promise<number>; // Returns count deleted
}

// packages/db/repositories/income-detection.ts
export class IncomeDetectionRepository {
  // Record detected income
  async create(
    householdId: EntityId,
    onboardingId: EntityId,
    detection: IncomeDetection
  ): Promise<IncomeDetectionRecord>;
  
  // Get detections for household
  async getByHouseholdId(householdId: EntityId): Promise<IncomeDetectionRecord[]>;
  
  // Mark as confirmed
  async confirm(recordId: EntityId, confirmedAmount: Money): Promise<IncomeDetectionRecord>;
  
  // Get latest detection
  async getLatest(householdId: EntityId): Promise<IncomeDetectionRecord | null>;
}

// packages/db/repositories/expense-detection.ts
export class ExpenseDetectionRepository {
  // Record detected expense
  async create(
    householdId: EntityId,
    onboardingId: EntityId,
    detection: ExpenseDetection
  ): Promise<ExpenseDetectionRecord>;
  
  // Get detections for household
  async getByHouseholdId(householdId: EntityId): Promise<ExpenseDetectionRecord[]>;
  
  // Get by category
  async getByCategory(
    householdId: EntityId,
    category: string
  ): Promise<ExpenseDetectionRecord[]>;
  
  // Mark as confirmed
  async confirm(recordId: EntityId, confirmedAmount: Money): Promise<ExpenseDetectionRecord>;
  
  // Get summary for household
  async getMonthlyExpenseSummary(householdId: EntityId): Promise<Record<string, Money>>;
}
```

**Deliverables:**
- [ ] Repository implementations with full CRUD
- [ ] Query performance optimization (indexes)
- [ ] Error handling for constraint violations
- [ ] Unit tests for each repository class

---

### 2.3 Business Logic Layer: Onboarding Service

**Objectives:**
- Implement OnboardingService orchestrating all 6 phases
- Implement phase validation and state transitions
- Implement income and expense detection logic
- Implement integration with existing services (accounts, documents, snapshots)

**Service Classes to Implement:**

```typescript
// packages/domain/services/onboarding-service.ts
export class OnboardingService {
  constructor(
    private onboardingRepo: OnboardingProgressRepository,
    private accountRepo: AccountRepository,
    private documentRepo: FinancialDocumentRepository,
    private snapshotService: FinancialSnapshotService,
    private incomeDetector: IncomeDetectionService,
    private expenseDetector: ExpenseDetectionService,
    private budgetService: BudgetService,
    private healthEngine: HealthEngine
  ) {}
  
  // ===== Core Orchestration =====
  
  async startOnboarding(householdId: EntityId, householdName: string): Promise<OnboardingProgress> {
    // Create OnboardingProgress in Phase 1
    // Return initialized state
  }
  
  async getCurrentProgress(householdId: EntityId): Promise<OnboardingProgress> {
    // Get current state, check for expiration
    // If >30 days without activity, optionally reset
  }
  
  async getPhaseRequirements(
    householdId: EntityId,
    phaseNumber: number
  ): Promise<PhaseRequirements> {
    // Return what's needed to complete this phase
    // E.g., Phase 3: "Need 3 statements for your checking account"
  }
  
  // ===== Phase 1: Setup =====
  
  async completePhase1(
    householdId: EntityId,
    data: SetupPhaseData
  ): Promise<OnboardingProgress> {
    // Validate setup data
    // Update HouseholdSettings if needed
    // Transition to Phase 2
    // Return updated progress
  }
  
  // ===== Phase 2: Account Declaration =====
  
  async completePhase2(
    householdId: EntityId,
    data: AccountsPhaseData
  ): Promise<OnboardingProgress> {
    // For each declared account:
    //   1. Create Account record
    //   2. Store client ID mapping for later reference
    //   3. Determine statement requirements
    // Calculate total statements needed
    // Transition to Phase 3
  }
  
  async getStatementCollectionStatus(
    householdId: EntityId
  ): Promise<CollectionStatusMap> {
    // For each account with statements pending:
    //   - How many statements needed
    //   - Which months/periods covered
    //   - Current processing status
    //   - Which months still needed
  }
  
  // ===== Phase 3: Statement Collection =====
  
  async onStatementCompleted(
    householdId: EntityId,
    documentId: EntityId,
    statementInfo: StatementInfo
  ): Promise<void> {
    // Called when document processing completes
    // 1. Extract transactions from document
    // 2. Match to account
    // 3. Check if statement requirements satisfied
    // 4. If all statements collected: advance progress
  }
  
  async areStatementsComplete(householdId: EntityId): Promise<boolean> {
    // Check: do all accounts have minimum required statements?
    // Account minimum varies by type (see Phase 3 requirements table)
  }
  
  // ===== Phase 4: Financial Context =====
  
  async detectIncome(householdId: EntityId): Promise<IncomeDetectionResult> {
    // 1. Analyze bank deposits for recurring patterns
    // 2. Group by amount, frequency, date-of-month
    // 3. Return highest-confidence income detection
    // 4. Store in IncomeDetectionRepository
  }
  
  async detectExpenses(householdId: EntityId): Promise<ExpenseDetectionResult> {
    // 1. Analyze all transactions for recurring patterns
    // 2. Categorize by payee/merchant
    // 3. Return monthly expense by category
    // 4. Store in ExpenseDetectionRepository
  }
  
  async completePhase4(
    householdId: EntityId,
    data: FinancialContextPhaseData
  ): Promise<OnboardingProgress> {
    // 1. Store user confirmations of income/expenses
    // 2. Create/update HouseholdSettings with confirmed values
    // 3. Validate income + expense data quality
    // 4. Transition to Phase 5
  }
  
  // ===== Phase 5: Household Profile =====
  
  async completePhase5(
    householdId: EntityId,
    data: ProfilePhaseData
  ): Promise<OnboardingProgress> {
    // 1. Create/update household members with roles
    // 2. Store privacy preferences
    // 3. Store notification preferences
    // 4. Transition to Phase 6
  }
  
  // ===== Phase 6: Launch =====
  
  async canLaunch(householdId: EntityId): Promise<CanLaunchResult> {
    // Check minimum viable dataset:
    // - At least 1 account
    // - At least 1 month of transactions OR manual entry
    // - Income data (auto or manual)
    // - Expense data (auto or manual)
    // Return: { canLaunch: boolean; reason: string; blockers: string[] }
  }
  
  async launch(householdId: EntityId): Promise<LaunchResult> {
    // 1. Validate minimum dataset
    // 2. Create FinancialSnapshot from all data
    // 3. Calculate initial HealthStatus
    // 4. Generate initial AI insights
    // 5. Optionally create initial Budget
    // 6. Mark Phase 6 complete + overall complete
    // 7. Return snapshot + redirectUrl
  }
  
  async completePhase6(
    householdId: EntityId,
    data: LaunchPhaseData
  ): Promise<OnboardingProgress> {
    // Mark Phase 6 complete
    // Mark onboarding fully complete
    // Store completion timestamp and total time
  }
  
  // ===== Utilities =====
  
  async skipPhase(householdId: EntityId, phaseNumber: number): Promise<OnboardingProgress> {
    // Mark phase skipped, advance to next
    // (Some phases may not be skippable depending on data)
  }
  
  async restart(householdId: EntityId): Promise<OnboardingProgress> {
    // Reset to Phase 1, preserve household but clear onboarding state
  }
  
  async saveCheckpoint(
    householdId: EntityId,
    sessionId: string,
    currentPhase: number,
    currentData: object
  ): Promise<void> {
    // For resume functionality: save current state
  }
  
  async resumeFromCheckpoint(
    householdId: EntityId,
    sessionId: string
  ): Promise<OnboardingProgress> {
    // Restore from checkpoint, validate current state
  }
}
```

**Subsidiary Services:**

```typescript
// packages/domain/services/income-detection-service.ts
export class IncomeDetectionService {
  // Analyze bank transactions for income patterns
  
  async detectFromBankTransactions(
    householdId: EntityId,
    accountIds: EntityId[],
    monthsToAnalyze: number = 3
  ): Promise<IncomeDetection[]> {
    // 1. Load all transactions for accounts
    // 2. Filter POSITIVE transactions (deposits)
    // 3. Group by:
    //    a) Amount (within $100 tolerance)
    //    b) Frequency (weekly, bi-weekly, monthly)
    //    c) Day-of-month (1st, 15th, etc.)
    // 4. Rank by confidence (regular deposits higher than sporadic)
    // 5. Return top 3 candidates
    
    // Example output:
    // [
    //   {
    //     type: "BANK_DEPOSIT",
    //     amount: Money(450000), // $4,500
    //     frequency: "BIWEEKLY",
    //     dayOfMonth: 1 and 15,
    //     occurrences: 6,
    //     confidence: "HIGH",
    //     details: "Regular deposits every other Friday"
    //   }
    // ]
  }
  
  private groupByAmount(transactions: PostedTransaction[]): Map<Money, PostedTransaction[]>;
  private groupByFrequency(grouped: Map<Money, PostedTransaction[]>): Map<string, PostedTransaction[]>;
  private calculateConfidence(frequency: string, consistency: number): ConfidenceLevel;
}

// packages/domain/services/expense-detection-service.ts
export class ExpenseDetectionService {
  // Analyze transactions for recurring expenses
  
  async detectRecurringExpenses(
    householdId: EntityId,
    accountIds: EntityId[],
    monthsToAnalyze: number = 3
  ): Promise<ExpenseDetection[]> {
    // 1. Load all transactions for accounts
    // 2. Filter NEGATIVE transactions (expenses)
    // 3. Categorize by payee/merchant (e.g., "Whole Foods", "Verizon")
    // 4. For each category:
    //    a) Calculate average monthly spend
    //    b) Determine if recurring (appears in 2+ months)
    //    c) Calculate consistency
    // 5. Build expense categories (Groceries, Utilities, Subscriptions, etc.)
    // 6. Return sorted by monthly impact (highest first)
    
    // Example output:
    // [
    //   {
    //     category: "Groceries",
    //     monthlyAmount: Money(100000), // $1,000
    //     merchants: ["Whole Foods", "Trader Joe's", "Kroger"],
    //     occurrences: 8,
    //     confidence: "HIGH"
    //   }
    // ]
  }
  
  private categorizeMerchants(merchants: string[]): Map<string, string[]>;
  private calculateRecurrence(transactions: PostedTransaction[]): RecurrencePattern;
  private aggregateByCategory(categorized: Map<string, PostedTransaction[]>): ExpenseDetection[];
}
```

**Deliverables:**
- [ ] OnboardingService implementation
- [ ] Income and expense detection services
- [ ] Phase validation logic
- [ ] Integration tests with existing services
- [ ] Service documentation

---

### 2.4 API Endpoints Implementation

**Objectives:**
- Implement all 13 endpoints defined in Section 1.1
- Add request/response validation
- Add proper error handling
- Add correlation ID logging for debugging

**Express Route Handler Implementation:**

```typescript
// apps/api/src/routes/onboarding.ts

export const registerOnboardingRoutes = (context: RouteContext) => {
  const { app, onboardingService, documentRepo, accountRepo } = context;

  // ===== Session Management =====

  app.post("/onboarding/start", async (req: Request, res: Response) => {
    // Route: POST /onboarding/start
    // Body: { householdName: string }
    // Response: OnboardingProgress
    // Errors: HOUSEHOLD_ALREADY_ONBOARDING, INVALID_INPUT
  });

  app.get("/onboarding/progress", async (req: Request, res: Response) => {
    // Route: GET /onboarding/progress
    // Query: none
    // Response: OnboardingProgress
    // Errors: NOT_STARTED, NOT_FOUND
  });

  app.post("/onboarding/phase/:phaseNumber/complete", async (req: Request, res: Response) => {
    // Route: POST /onboarding/phase/2/complete
    // Body: PhaseData (type varies by phase)
    // Response: { status: "OK"|"VALIDATION_ERROR"; errors?: [] }
    // Errors: INVALID_PHASE_NUMBER, VALIDATION_ERROR, OUT_OF_SEQUENCE
  });

  app.post("/onboarding/phase/:phaseNumber/skip", async (req: Request, res: Response) => {
    // Skip to next phase
    // Some phases non-skippable (e.g., Phase 1, 2)
  });

  app.post("/onboarding/restart", async (req: Request, res: Response) => {
    // Reset to Phase 1
  });

  // ===== Statement Collection =====

  app.get("/onboarding/accounts/:accountId/guidance", async (req: Request, res: Response) => {
    // Get institution-specific guidance for uploading statements
    // Response includes:
    // - minMonthsRequired, maxMonthsDesired
    // - preferredFormats
    // - institutionDownloadUrl
    // - exampleStatementUrl
    // - supportPhone
  });

  app.get("/onboarding/accounts/collection-status", async (req: Request, res: Response) => {
    // Get progress on statement collection for all accounts
    // Response: {
    //   [accountId]: {
    //     accountType, accountName,
    //     minNeeded, maxDesired, uploadedCount,
    //     periodsCovered: [{ startDate, endDate, documentId, status }],
    //     isComplete,
    //     nextStepMessage
    //   }
    // }
  });

  // ===== Financial Context =====

  app.post("/onboarding/detect-income", async (req: Request, res: Response) => {
    // Analyze bank deposits for income patterns
    // Response: {
    //   detections: [ { amount, frequency, confidence, details } ],
    //   recommendation: "Regular biweekly deposits of $4,500",
    //   confidence: "HIGH" | "MEDIUM" | "LOW"
    // }
  });

  app.post("/onboarding/detect-expenses", async (req: Request, res: Response) => {
    // Analyze transactions for recurring expenses
    // Response: {
    //   detections: [
    //     { category, monthlyAmount, confidence, merchants },
    //     ...
    //   ],
    //   totalMonthly: Money,
    //   essentialVsDiscretionary: { essential: Money, discretionary: Money }
    // }
  });

  app.post("/onboarding/financial-context/confirm", async (req: Request, res: Response) => {
    // User confirms income/expense detections or provides manual overrides
    // Body: FinancialContextPhaseData
    // Response: { snapshotId, healthStatus }
  });

  // ===== Launch =====

  app.post("/onboarding/launch", async (req: Request, res: Response) => {
    // Launch onboarding, create snapshot, initial budget (optional)
    // Body: { confirmationPhrase: "ready" }
    // Response: {
    //   status: "OK" | "DATA_INCOMPLETE",
    //   snapshotId?: EntityId,
    //   budgetId?: EntityId,
    //   redirectUrl: string,
    //   initialInsights: [{ type, title, description }, ...]
    // }
  });

  // ===== Checkpoint/Resume =====

  app.post("/onboarding/progress/checkpoint", async (req: Request, res: Response) => {
    // Save progress checkpoint for resume
    // Body: { phase, data }
    // Response: { checkpointId, resumeUrl }
  });

  app.get("/onboarding/progress/checkpoint", async (req: Request, res: Response) => {
    // Get latest checkpoint
    // Response: OnboardingSessionCheckpoint | null
  });

  // ===== Validation Helper =====

  app.post("/onboarding/validate/:phaseNumber", async (req: Request, res: Response) => {
    // Validate phase data before submission
    // Body: { phaseData }
    // Response: { valid: boolean; errors?: string[] }
    // (Helpful for form-level validation on frontend)
  });

  // ===== Analytics/Insights =====

  app.get("/onboarding/initial-insights", async (req: Request, res: Response) => {
    // Get AI-generated insights after onboarding
    // Response: [
    //   {
    //     type: "OPPORTUNITY" | "WARNING" | "INFO",
    //     title: "You're in good financial health",
    //     description: "Your debt-to-income ratio is 18%, well below the 43% threshold",
    //     icon: "success"
    //   },
    //   ...
    // ]
  });
};
```

**Deliverables:**
- [ ] All 13 endpoints implemented
- [ ] Request/response validation with Zod or similar
- [ ] Comprehensive error handling
- [ ] Logging and correlation IDs
- [ ] Rate limiting on sensitive endpoints

---

## Phase 3: Frontend Implementation (Weeks 2-4, parallel with backend)

### 3.1 Component Architecture

**Objectives:**
- Design reusable component hierarchy
- Plan state management approach
- Create shared hooks for common patterns
- Specification of prop interfaces

**Component Hierarchy:**

```
OnboardingFlow (Container)
├── OnboardingLayout (Wrapper)
│   ├── ProgressIndicator
│   │   ├── StepCounter (3 of 6)
│   │   └── ProgressBar (50% visual)
│   ├── PhaseContent (Dynamic per phase)
│   │   ├── Phase1Setup
│   │   │   ├── HouseholdNameInput
│   │   │   ├── ProfileTypeSelector
│   │   │   └── InstitutionDiscovery
│   │   ├── Phase2Accounts
│   │   │   ├── AccountTypeSelector
│   │   │   ├── AccountForm (declarative)
│   │   │   └── AccountList
│   │   ├── Phase3Statements
│   │   │   ├── AccountSelector
│   │   │   ├── StatementGuidance
│   │   │   ├── FileUploadZone
│   │   │   ├── StatementPreview
│   │   │   └── PeriodSelector
│   │   ├── Phase4Context
│   │   │   ├── IncomeDetectionResult
│   │   │   ├── ExpenseDetectionResult
│   │   │   └── ManualOverrideForm
│   │   ├── Phase5Profile
│   │   │   ├── HouseholdMemberList
│   │   │   ├── PrivacyAcknowledgment
│   │   │   └── NotificationPreferences
│   │   └── Phase6Review
│   │       ├── OnboardingSummary
│   │       ├── FinancialSnapshot
│   │       ├── InitialInsights
│   │       └── LaunchButton
│   └── ActionBar
│       ├── BackButton
│       ├── SkipButton (conditional)
│       ├── SaveCheckpointButton
│       └── NextButton
└── ErrorBoundary (Wraps entire flow)
```

**Custom Hooks:**

```typescript
// packages/ui/hooks/useOnboarding.ts
// Provides: currentPhase, phaseData, moveToPhase, completePhase, skipPhase, errors
export const useOnboarding = (householdId: EntityId) => {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  
  // Fetch current progress on mount
  useEffect(() => { /* ... */ }, [householdId]);
  
  // Provide methods for phase transitions
  const completePhase = async (phaseNumber, data) => { /* ... */ };
  const skipPhase = async (phaseNumber) => { /* ... */ };
  const saveCheckpoint = async (sessionId, phaseData) => { /* ... */ };
  
  return {
    progress,
    currentPhase: progress?.currentPhase,
    phaseData: progress?.phases[progress.currentPhase],
    completePhase,
    skipPhase,
    saveCheckpoint,
    loading,
    errors
  };
};

// packages/ui/hooks/useStatementGuidance.ts
// Fetch guidance for statement upload (institution-specific)
export const useStatementGuidance = (accountId: EntityId) => {
  // Returns: minMonths, maxMonths, formats, institutionUrl, exampleUrl
};

// packages/ui/hooks/useIncomeDetection.ts
// Trigger income detection, show results, allow confirmation
export const useIncomeDetection = (householdId: EntityId) => {
  const [detections, setDetections] = useState<IncomeDetection[]>([]);
  const [loading, setLoading] = useState(false);
  
  const detect = async () => { /* API call */ };
  const confirm = async (amount: Money) => { /* API call */ };
  
  return { detections, loading, detect, confirm };
};

// packages/ui/hooks/useExpenseDetection.ts
// Trigger expense detection, show results, allow confirmation
export const useExpenseDetection = (householdId: EntityId) => {
  // Similar to useIncomeDetection
};

// packages/ui/hooks/useFormProgress.ts
// Auto-save form data to checkpoint on changes
export const useFormProgress = (phaseNumber: number, initialData: object) => {
  const [data, setData] = useState(initialData);
  const checkpointRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // Debounce: save to checkpoint after 1 second of inactivity
    checkpointRef.current = setTimeout(() => {
      saveCheckpoint(phaseNumber, data);
    }, 1000);
    
    return () => clearTimeout(checkpointRef.current);
  }, [data]);
  
  return { data, setData };
};
```

**Deliverables:**
- [ ] Component specifications and prop types
- [ ] Custom hooks implementation
- [ ] State management strategy (Context vs Redux)
- [ ] Component library updates

---

### 3.2 UI/UX Implementation per Phase

**For each of the 6 phases, implement UI with:**
- Form validation (client + server feedback)
- Progress indication
- Error messaging with recovery paths
- Mobile responsiveness
- Accessibility (keyboard nav, screen reader)

**Phase 1: Setup Screen (5 min)**

```
┌─────────────────────────────────────────┐
│  Step 1 of 6: Let's Get Started         │
│  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│  Let's set up your household            │
│  We'll help you build a budget in       │
│  about 20 minutes.                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Household Name                  │   │
│  │ [____________________________]   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  How would you describe your finances?  │
│  ○ Solo (I manage finances alone)      │
│  ○ Couple (Joint accounts)             │
│  ○ Family (Multiple members)           │
│                                         │
│  Where do you bank? (select all)        │
│  ☑ Chase         □ Wells Fargo         │
│  □ Bank of Ameri  ☑ Local Credit Union  │
│  [+ Add Bank]                           │
│                                         │
│         [< Back]  [Next >]              │
└─────────────────────────────────────────┘
```

**Phase 2: Account Discovery (5 min)**

```
┌─────────────────────────────────────────┐
│  Step 2 of 6: Your Accounts             │
│  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│  Let's add your financial accounts      │
│  We need at least one to get started.   │
│                                         │
│  ┌─ Cash Accounts ───────────────────┐  │
│  │ ☑ Checking                        │  │
│  │ □ Savings                         │  │
│  │ □ Money Market                    │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Debt ─────────────────────────────┐ │
│  │ □ Credit Card                     │ │
│  │ □ Auto Loan                       │ │
│  │ □ Student Loan                    │ │
│  │ □ Mortgage                        │ │
│  └───────────────────────────────────┘  │
│                                         │
│  [+ Add Account]                        │
│                                         │
│  Your Accounts (3 added)                │
│  ┌─────────────────────────────────┐   │
│  │ Chase Checking          $5,432  │   │
│  │ Ally Savings            $12,000 │   │
│  │ Capital One 360 Card    $3,200  │   │
│  │ [Edit] [Remove]         [Add]   │   │
│  └─────────────────────────────────┘   │
│                                         │
│         [< Back]  [Next >]              │
└─────────────────────────────────────────┘
```

**Phase 3: Statement Upload (10+ min)**

```
┌─────────────────────────────────────────┐
│  Step 3 of 6: Your Statements           │
│  █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│  Current Account: Chase Checking        │
│  ├─ Need 3 months of statements        │
│  └─ Currently have: January - March ✓  │
│                                         │
│  📋 Guidance:                           │
│  Most banks let you download CSV.       │
│  Here's how for your bank:             │
│  [Chase: Download Statements]           │
│                                         │
│  ┌─ Upload Statements ─────────────────┐│
│  │ Select date range:                 ││
│  │ From: [Jan 2024 ▼]  To: [Mar 2024]││
│  │                                    ││
│  │ [+] Drag & drop files here         ││
│  │        or [Choose File]            ││
│  │                                    ││
│  │ Formats: CSV, PDF, PNG, JPEG, TIFF││
│  └────────────────────────────────────┘│
│                                         │
│  ✓ January 2024 (87 transactions)      │
│  ✓ February 2024 (92 transactions)     │
│  ✓ March 2024 (88 transactions)        │
│                                         │
│  [< Back]  [Next Account >]             │
└─────────────────────────────────────────┘
```

**Phase 4: Financial Context (5 min)**

```
┌─────────────────────────────────────────┐
│  Step 4 of 6: Your Finances             │
│  ██████████████░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│  ✓ We analyzed your statements!        │
│                                         │
│  Monthly Income                         │
│  ┌─────────────────────────────────┐   │
│  │ We found: $4,500 every 2 weeks  │   │
│  │ That's ~$9,750 / month gross    │   │
│  │                                 │   │
│  │ Is this right?                  │   │
│  │ ○ Yes    ○ Not quite           │   │
│  │                                 │   │
│  │ [Enter my income manually]      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Monthly Expenses                       │
│  ┌─────────────────────────────────┐   │
│  │ Groceries: $800/mo   (High)     │   │
│  │ Utilities: $200/mo   (✓)        │   │
│  │ Subscriptions: $85/mo (✓)       │   │
│  │ Dining Out: $350/mo (? Medium)  │   │
│  │ Total: $1,435/mo                │   │
│  │                                 │   │
│  │ [+ Add missing category]        │   │
│  │ [- Remove category]             │   │
│  │ [Edit amounts]                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│         [< Back]  [Next >]              │
└─────────────────────────────────────────┘
```

**Phase 5: Household Profile (3 min)**

```
┌─────────────────────────────────────────┐
│  Step 5 of 6: Your Profile              │
│  █████████████████░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│  👥 Household Members                   │
│  ┌─────────────────────────────────┐   │
│  │ You (Owner)  jane@email.com     │   │
│  │                                 │   │
│  │ [+ Add Member]                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🔒 Privacy                             │
│  ✓ Your data stays on your device      │
│  ✓ Never sold or shared               │
│  ✓ AI only uses approved sources       │
│  ☐ I've read the privacy policy       │
│                                         │
│  🔔 Notifications                       │
│  ☑ Budget alerts                       │
│  ☑ Financial milestones               │
│  □ Weekly digest                       │
│  Frequency: [Weekly ▼]                 │
│                                         │
│         [< Back]  [Next >]              │
└─────────────────────────────────────────┘
```

**Phase 6: Review & Launch (2 min)**

```
┌─────────────────────────────────────────┐
│  Step 6 of 6: Ready to Launch           │
│  ████████████████████████████████████░ │
├─────────────────────────────────────────┤
│                                         │
│  📊 Your Financial Snapshot             │
│  Net Worth:        $250,000             │
│  Monthly Surplus:  $2,500               │
│  Emergency Fund:   2.5 months           │
│  Financial Health: ✓ HEALTHY            │
│                                         │
│  💡 Initial Insights                    │
│  ✓ You're in good financial health     │
│  ⚠ Emergency fund below target (6 mo)  │
│  💰 Strong savings rate - well done!   │
│  🎯 Consider student loan refinancing  │
│                                         │
│  Ready to explore your finances?        │
│  [Cancel]  [Continue to Dashboard]     │
│                                         │
└─────────────────────────────────────────┘
```

**Deliverables:**
- [ ] Complete UI for all 6 phases
- [ ] Responsive CSS (mobile-first)
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Error states and recovery flows

---

### 3.3 Form Validation & Error Handling

**Objective:**
- Client-side validation for quick feedback
- Server-side validation for data integrity
- Clear error messages with recovery paths

**Validation Strategy:**

```typescript
// packages/ui/validators/onboarding-validators.ts

export const validatePhase1 = (data: SetupPhaseData): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!data.householdName || data.householdName.trim().length === 0) {
    errors.push({
      field: "householdName",
      message: "Household name is required",
      code: "REQUIRED"
    });
  }
  
  if (!data.profileType) {
    errors.push({
      field: "profileType",
      message: "Please select a profile type",
      code: "REQUIRED"
    });
  }
  
  if (!data.initialInstitutions || data.initialInstitutions.length === 0) {
    errors.push({
      field: "initialInstitutions",
      message: "Please select at least one institution",
      code: "REQUIRED"
    });
  }
  
  return errors;
};

export const validatePhase2 = (data: AccountsPhaseData): ValidationError[] => {
  // Validate account declarations
};

// etc. for other phases...

// Error display component
<FormError 
  error={{
    field: "householdName",
    message: "Household name is required",
    code: "REQUIRED",
    help: "Enter a name to identify your household (e.g., 'The Smiths')"
  }}
/>
```

**Deliverables:**
- [ ] Validation logic for all 6 phases
- [ ] Client-side validation (React)
- [ ] Error message component
- [ ] Recovery guidance for each error

---

## Phase 4: Testing & QA (Weeks 4-5)

### 4.1 Automated Testing

**Unit Tests:**
- Phase validation logic (each validator)
- State transitions (valid/invalid paths)
- Income detection algorithm
- Expense detection algorithm

**Integration Tests:**
- Backend: Account → Document → Transaction extraction flow
- Backend: Phase completion → database update → progress advance
- Frontend: Form submit → API call → state update
- End-to-end: Full 6-phase flow with real data

**E2E Tests (Playwright/Cypress):**
- Happy path: Complete all 6 phases (15 min)
- Partial: Complete 3 phases, skip to 6 (10 min)
- Resume: Save at phase 3, refresh, resume at phase 3
- Error recovery: Upload invalid file, retry, succeed
- Mobile: Test on iPhone 12 (375px width)

**Test Coverage Target:**
- Unit: 90%+ coverage
- Integration: 80%+ of workflows
- E2E: 5+ critical user journeys

**Deliverables:**
- [ ] Jest unit test suite (packages/domain)
- [ ] Integration tests (apps/api)
- [ ] E2E test suite (apps/web)
- [ ] Test fixtures and seed data

---

### 4.2 Manual QA Testing

**Scenarios to Test:**

1. **Happy Path**
   - Start onboarding
   - Complete all 6 phases sequentially
   - Launch successfully
   - Verify snapshot created
   - Verify redirected to dashboard

2. **Error Recovery**
   - Upload invalid PDF
   - See error message with guidance
   - Upload correct CSV
   - Continue successfully

3. **Resume Functionality**
   - Start onboarding, reach phase 3
   - Close browser / navigate away
   - Return to onboarding 8 hours later
   - Resume at phase 3 with data intact

4. **Mobile Experience**
   - Complete onboarding on iPhone
   - File upload on mobile (camera, photos app)
   - Touch targets ≥48px
   - No horizontal scroll

5. **Accessibility**
   - Navigate using keyboard only (tab, shift+tab, enter)
   - Use screen reader (NVDA on Windows)
   - Color contrast check with Axe tool
   - Focus indicators visible

6. **Performance**
   - Page load time < 2s (on 4G throttling)
   - File upload <3s for 10MB file
   - Income detection completes <2s
   - No UI freezing during async operations

**Deliverables:**
- [ ] Test case checklist
- [ ] Screenshot evidence for critical paths
- [ ] Browser compatibility matrix (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing on real devices (iPhone, Android)

---

### 4.3 Beta Testing with Users

**Objectives:**
- Validate product design with real users
- Identify UI/copy clarity issues
- Measure time-to-complete and completion rates
- Gather satisfaction feedback

**Recruitment:**
- 5-10 friendly users (ideally current customers)
- Mix of profiles: Solo + Couple + Family
- Mix of tech comfort levels

**Testing Protocol:**
- Observer provides minimal instruction ("Start here, tell me what you're thinking")
- Allow user to struggle briefly before helping
- Collect: completion time, errors encountered, satisfaction survey
- Ask: What was confusing? What would help?

**Success Criteria:**
- ≥80% completion rate
- Average time-to-complete: 25-35 minutes
- Satisfaction 4/5+ on clarity, time expectation, confidence
- 0 critical usability issues

**Feedback Loop:**
- Summarize findings after each user test
- Prioritize fixes (critical → high → medium)
- Roll forward fixes for next user tests
- Iterate 2-3 times before general release

**Deliverables:**
- [ ] Recruitment plan
- [ ] Testing script and consent forms
- [ ] Feedback summary (themes + quotes)
- [ ] Prioritized fix list

---

## Phase 5: Documentation & Launch Prep (Week 5)

### 5.1 Technical Documentation

**Create:**
- [ ] Onboarding Architecture overview diagram
- [ ] Data flow diagrams (Phase 1-6)
- [ ] API reference with examples (Swagger/OpenAPI)
- [ ] State machine diagram (all valid transitions)
- [ ] Database schema documentation
- [ ] Deployment checklist

---

### 5.2 User Documentation

**Create:**
- [ ] Getting Started guide (for users: what is onboarding?)
- [ ] FAQ: Common questions (How long does it take? Do I need all accounts?)
- [ ] Troubleshooting guide: "Statement won't upload" →  solutions
- [ ] Video walkthrough (3-5 min, YouTube embed)
- [ ] Accessibility guide (for users with screen readers, keyboard nav)

---

### 5.3 Launch Plan

**Pre-Launch:**
- [ ] Feature flags enabled in staging
- [ ] Smoke test: Can create household → complete onboarding
- [ ] Performance test: 100 concurrent onboardings
- [ ] Security audit: Auth, data privacy, input validation
- [ ] Rollback plan if launch fails

**Launch Phases:**
1. **Private Beta** (Days 1-7): 5-10 opt-in users
2. **Limited Release** (Days 8-14): 100 opt-in users
3. **General Availability** (Day 15+): All new households

**Monitoring:**
- [ ] Error rate dashboard (< 1% target)
- [ ] Time-to-complete tracking
- [ ] Completion rate by phase
- [ ] User satisfaction survey (post-onboarding)
- [ ] Support ticket volume (for common issues)

**Rollback Triggers:**
- Error rate > 5%
- Completion rate < 50%
- Critical data loss
- Security vulnerability discovered

---

## Phase 6: Post-Launch Iteration (Weeks 6+)

### 6.1 Metrics & Analytics

**Track:**
- Completion rate (target 85%+)
- Average time-to-complete (target 25-35 min)
- Drop-off rate by phase (which phases lose users?)
- Account types added (checking/savings vs. complex)
- Statement upload methods (PDF vs. CSV vs. manual)
- Income detection confidence (HIGH vs. MEDIUM vs. LOW)
- Budget creation rate within 7 days (target 80%+)
- Re-engagement at 30 days (target 70%+)

**Dashboards:**
- Real-time completion funnel
- Time-to-complete distribution
- User satisfaction by phase
- Error rate by endpoint

### 6.2 User Feedback Loop

**Collect:**
- Post-onboarding survey (4 questions, 2 min)
- Support tickets (categorize issues)
- Session recordings (Hotjar/LogRocket, with consent)
- Quarterly user interviews (5 users, 30 min each)

**Respond:**
- Weekly review of feedback
- Monthly prioritization meeting
- Biweekly sprint refinement based on feedback
- Quarterly major iteration (if needed)

### 6.3 Feature Expansions (Future)

**Phase 2 Ideas (MVP+ features, post-launch):**
- Plaid integration (auto-connect banks)
- Automated statement download and refresh
- Multi-language support (Spanish, Mandarin)
- Bulk member import (CSV upload)
- Mobile app version

---

## Risk Mitigation

### Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Statement parsing fails for new formats** | Users can't upload data, onboarding blocks | Fallback to manual entry, support ticket escalation |
| **Income/expense detection has high false positives** | Users lose confidence, abandon onboarding | Conservative confidence thresholds, require user confirmation |
| **Database migration corruption** | Data loss, rollback required | Test migrations on staging, dual-write validation |
| **Performance issues at scale (1000 concurrent onboardings)** | Slow page loads, timeouts | Load testing at 200+ concurrent, async processing for heavy operations |
| **Users get stuck on Phase 3 (statement upload)** | High drop-off rate | Provide fallback (manual entry), clear error messages, support link |
| **Incomplete dataset at launch** | Budget can't be created, confusing error | Validate minimum data before allowing launch, guide user to complete missing pieces |

---

## Success Criteria & Rollout Decision

### Go/No-Go Checklist (Pre-General Availability)

- [ ] Completion rate in beta ≥ 75% (target 85%)
- [ ] Average time-to-complete 25-40 minutes (target range)
- [ ] No critical bugs found in testing
- [ ] User satisfaction survey ≥ 4/5 on all 4 questions
- [ ] All endpoints passing automated tests
- [ ] Mobile responsive on iPhone, Android
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Performance metrics met (load time < 3s, file upload < 3s)
- [ ] Security audit passed
- [ ] Documentation complete and reviewed
- [ ] Monitoring dashboards live and validated
- [ ] Support team trained on common issues
- [ ] Rollback plan tested

### Decision Framework

**GO to General Availability if:**
- 10+ of 12 criteria above are met
- No critical security or data loss risks
- Team confidence is high (3/3 leads agree)

**DELAY if:**
- Critical issues found (e.g., data loss, auth bypass)
- Completion rate < 50% (indicates fundamental UX problem)
- Performance fails under load test

**PIVOT if:**
- Income/expense detection unreliable (consider disabling feature)
- File upload format coverage too limited (relax requirements)
- User needs more manual entry support (reduce form fields)

---

## Appendix: Configuration & Deployment

### Environment Variables

```bash
# Feature flags
FEATURE_HOUSEHOLD_ONBOARDING_ENABLED=true
FEATURE_ONBOARDING_REQUIRED_FOR_BUDGET=false
FEATURE_ONBOARDING_SKIP_ALLOWED=true

# AI features
FEATURE_INCOME_AUTO_DETECTION=true
FEATURE_EXPENSE_AUTO_DETECTION=true
FEATURE_AI_ADVISOR_POST_LAUNCH=true

# Thresholds
ONBOARDING_MIN_ACCOUNTS=1
ONBOARDING_MIN_STATEMENTS_CHECKING=3
ONBOARDING_MIN_STATEMENTS_CREDIT_CARD=2
ONBOARDING_MIN_STATEMENTS_LOAN=1
ONBOARDING_INCOME_CONFIDENCE_THRESHOLD=MEDIUM # HIGH | MEDIUM | LOW
ONBOARDING_EXPENSE_CONFIDENCE_THRESHOLD=MEDIUM

# Limits
ONBOARDING_MAX_UPLOAD_SIZE_MB=50
ONBOARDING_SESSION_TIMEOUT_MINUTES=30
ONBOARDING_CHECKPOINT_RETENTION_DAYS=30

# Timeouts
ONBOARDING_DETECTION_TIMEOUT_SECONDS=10
ONBOARDING_API_TIMEOUT_SECONDS=30

# Email
ONBOARDING_SEND_CHECKPOINT_REMINDERS=true
ONBOARDING_REMINDER_AFTER_DAYS=7
```

### Deployment Checklist

- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Feature flags enabled (in order: Phase 1→ Phase 3→ GA)
- [ ] API endpoints tested against staging
- [ ] Frontend built with correct API URLs
- [ ] Monitoring/alerting configured
- [ ] Email templates deployed
- [ ] Support documentation updated
- [ ] Help desk trained
- [ ] Rollback plan tested

---

## Document Version & Approval

| Version | Date | Author | Status |
|---|---|---|---|
| 1.0 | 2026-09-13 | Product Team | DRAFT |
| | | | (Awaiting approval for Phase 1) |

---

## Questions for Stakeholders

1. **Onboarding Timeline**: Is 4-6 weeks realistic given team size and other priorities?
2. **AI Advisor Launch**: Should we delay AI advisor insights until onboarding is complete?
3. **Data Completeness**: What's the minimum viable dataset? 1 month or 3 months of statements?
4. **Manual Entry Fallback**: How much support should we provide for users without statements?
5. **Mobile Priority**: Is the mobile experience critical for launch?
6. **Plaid Integration**: Should we plan for this in Phase 1, or defer to Phase 2?
7. **Multi-Language**: English-only for MVP?

---

## Related Documentation

- [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md) — Product design and UX specification
- [FINANCIAL_CONTEXT_BUILDER.md](./FINANCIAL_CONTEXT_BUILDER.md) — Context generation architecture
- [CSV_PARSER_IMPLEMENTATION.md](./CSV_PARSER_IMPLEMENTATION.md) — Statement parsing
- [PRIVACY_BOUNDARY_IMPLEMENTATION.md](./PRIVACY_BOUNDARY_IMPLEMENTATION.md) — Data privacy model
