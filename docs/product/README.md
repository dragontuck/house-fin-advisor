# Product Documentation Index

This folder contains product-focused documentation including feature specifications, user flows, implementation plans, and business logic.

## Features

### Household Onboarding ⭐ NEW

**What is it?** A guided workflow that walks users through establishing a financial baseline for their household. Intelligently determines what documents and data are needed, orchestrates a multi-step collection process, and validates data quality.

**Why is it important?** Reduces time-to-value from signup to first actionable budget recommendation, builds user confidence, and ensures sufficient historical data for accurate financial analysis.

**Documents:**

1. **[HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md)** — Product Design & Specification
   - Vision & goals
   - 6-phase workflow (Setup → Accounts → Statements → Financial Context → Profile → Launch)
   - Document requirements by account type
   - UX/UI principles and design
   - Success metrics and user personas
   - Error scenarios and recovery flows
   - Accessibility & privacy compliance
   - **Read this first** if you're a product manager or designer

2. **[HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md](./HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md)** — Technical Implementation Plan
   - Detailed technical specification (data models, API contracts, state machine)
   - 6-phase implementation roadmap (4-6 weeks)
   - Backend implementation (database schema, repositories, services, endpoints)
   - Frontend implementation (components, hooks, validation, error handling)
   - Testing strategy (unit, integration, E2E, manual QA, beta testing)
   - Launch preparation and rollout plan
   - Monitoring, metrics, and post-launch iteration
   - Risk mitigation and success criteria
   - **Read this** if you're an engineer or architect

---

## Product Features by Status

| Feature | Status | Documents | Lead |
|---------|--------|-----------|------|
| **Household Onboarding** | 📋 DESIGNED | Design + Plan | Product |
| **Financial Pulse** | ✅ COMPLETE | [Implementation docs](../IMPLEMENTATION_COMPLETE.md) | Engineering |
| **Budget Planning** | ✅ COMPLETE | Implementation docs | Engineering |
| **Debt Intelligence** | ✅ COMPLETE | Implementation docs | Engineering |
| **AI Advisor** | ✅ COMPLETE | [AI Architecture](../AI_TOOL_LAYER_ARCHITECTURE.md) | Engineering |

---

## Using This Documentation

### For Product Managers

**Start here:**
1. Read the [Executive Summary](#executive-summary) below
2. Review [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md)
   - Focus on Sections: Vision/Goals, Feature Scope, UI/UX Principles, Success Metrics
   - Review user personas and success stories
   - Check error scenarios

**Then share with:**
- Design team → They build mockups based on UI/UX section
- Engineering lead → They review implementation plan feasibility
- Customer success → They prepare support documentation

---

### For Designers

**Start here:**
1. Review [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md)
   - Section: "Feature Scope: What Users Will Do" (describes 6 phases)
   - Section: "UI/UX Principles" (design guidelines)
   - Subsections: "Phase 1-6" (visual wireframe examples)

**You will need:**
- Component inventory list (in Implementation Plan, Section 3.1)
- Accessibility checklist (WCAG 2.1 AA requirements)
- Responsive breakpoints: Mobile (375px), Tablet (768px), Desktop (1920px)

---

### For Engineers

**Start here:**
1. Review [HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md](./HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md)
   - Section 1: Foundation & Planning (data models, API contracts)
   - Section 2: Backend Implementation (database schema, repositories, services)
   - Section 3: Frontend Implementation (components, hooks, validation)

**Critical sections:**
- Data Modeling (Section 1.1) — Defines OnboardingProgress state machine
- Database Schema (Section 2.1) — SQL migrations to implement
- Repository Layer (Section 2.2) — CRUD operations needed
- Business Logic Layer (Section 2.3) — Orchestration services
- API Endpoints (Section 2.4) — 13 endpoints to implement

---

### For QA/Testing

**Start here:**
1. Read [HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md](./HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md)
   - Section 4: Testing & QA

**You will need:**
- Test data fixtures (account types, statements, transactions)
- Test scenarios (happy path, error recovery, resume, mobile, accessibility)
- Acceptance criteria for each phase

---

### For Customer Support

**Start here:**
1. Read the [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md)
   - Section: "Feature Behavior & Validation Rules"
   - Section: "Recovery & Guidance" (common blockers and solutions)

**Common Questions You'll Get:**
- "How long does onboarding take?" → Answer: 20-30 minutes typically
- "Do I need all my statements?" → Answer: 3 months minimum for checking, 2 for credit cards, 1 for loans
- "What if I don't have statements?" → Answer: Manual entry option available
- "Will my data be safe?" → Answer: Yes, self-hosted, never shared (see Privacy section)

---

## Executive Summary

### What Problem Does Household Onboarding Solve?

**Current state:** New households land in the app with no financial data. Building a budget requires manual account setup + statement uploads with no guidance. Users don't know what's needed or why. Time-to-value is high (days/weeks).

**Desired state:** Users complete a guided 6-phase onboarding workflow in 20-30 minutes, providing all essential data needed to build an accurate budget. The system validates data quality and explains what's missing and why.

### Key Features

| Phase | What User Does | Time | Why | Outcome |
|-------|---|---|---|---|
| **1. Setup** | Create household, select profile type | 5 min | Initialize app with household context | HouseholdId, ProfileType |
| **2. Accounts** | Add checking, savings, credit cards, loans | 5 min | Know what accounts to analyze | 5-15 Account records |
| **3. Statements** | Upload 3+ months of bank/credit card statements | 10 min | Get transaction history for pattern detection | 250+ transactions extracted |
| **4. Context** | Confirm income + recurring expenses (system-detected) | 5 min | Establish budget baseline | HouseholdSettings (income, expenses) |
| **5. Profile** | Add household members, privacy settings | 3 min | Configure access control and notifications | Household member roles |
| **6. Launch** | Review snapshot, launch to dashboard | 2 min | Validate data quality, create initial snapshot | FinancialSnapshot, Budget ready |

### Data Collection Requirements

**Minimum Viable Dataset:**
- ≥1 checking/savings account with 3 months of statements
- Income data (auto-detected or manual)
- At least 1 expense category identified

**Recommended Dataset:**
- All active accounts (checking, savings, credit cards, loans, investments)
- 3+ months of bank history
- 2+ months of credit card history
- At least 1 loan statement
- All household members added
- Income validated across multiple deposits

### Success Metrics (Post-Launch)

| Metric | Target | Why |
|--------|--------|-----|
| **Completion Rate** | 85%+ | % of users reaching Phase 6 |
| **Time-to-Complete** | <30 min | Goal: quick value realization |
| **Data Quality** | 90%+ validation passes | Ensures budget accuracy |
| **User Satisfaction** | 4.5/5 | Post-onboarding survey |
| **Budget Creation** | 80% within 7 days | Engagement after onboarding |

---

## Statement Requirements by Account Type

### Checking Account
- **Min Statements:** 3 months (recommended 6)
- **Why:** Identify salary deposits, recurring payments, bill patterns
- **What We Extract:** Transaction payees, amounts, dates, recurring deposits/withdrawals

### Savings Account
- **Min Statements:** 2 months (can be combined with checking)
- **Why:** Verify balance stability, identify transfers from checking
- **What We Extract:** Interest earned, balance trend

### Credit Card
- **Min Statements:** 2-3 months
- **Why:** Categorize spending, identify credit utilization, APR
- **What We Extract:** Merchants/payees, spending categories, interest charges, minimum payment

### Loan (Auto, Personal, Student)
- **Min Statements:** 1 statement
- **Why:** Verify balance, payment schedule, interest rate
- **What We Extract:** Current balance, remaining term, monthly payment, APR

### Mortgage
- **Min Statements:** 1 statement
- **Why:** Property info, interest rate, remaining term, escrow analysis
- **What We Extract:** Monthly payment, interest rate, tax/insurance escrow, remaining balance

### Investment/Retirement Account
- **Min Statements:** 1 statement (annual or recent)
- **Why:** Holdings, allocation, growth trajectory
- **What We Extract:** Account value, holdings, allocation percentages

---

## Document Upload Guidance

### Supported Formats

| Format | Supported | Best For | Notes |
|--------|-----------|----------|-------|
| **CSV** | ✅ Yes | Bank exports, statements | Best option - most reliable parsing |
| **PDF** | ✅ Yes | Official bank statements | May require OCR if scanned |
| **Image** | ✅ Yes | Photos of statements | Mobile-friendly, manual review may be needed |
| **Manual Entry** | ✅ Yes | Missing statements, alternative | Form-based transaction entry |

### File Size Limits
- **Max File Size:** 50 MB
- **Typical Sizes:** CSV (1-5 MB), PDF (2-10 MB), Image (1-3 MB)

---

## Integration with Existing Features

| Feature | Integration Point | Notes |
|---------|---|---|
| **Document Upload API** | Uses existing upload endpoint | Orchestrates file upload → parsing → transaction extraction |
| **Statement Parser** | CSV/PDF parsing via existing service | System calls parser on uploaded documents |
| **Account Repository** | Creates accounts, fetches statements | Onboarding creates accounts; links to statements |
| **Financial Snapshot** | Creates snapshot at Phase 6 completion | Triggered automatically after launch |
| **Budget Service** | Optional "Create Budget" post-onboarding | Guided link to budget feature after data loaded |
| **AI Advisor** | Provides initial insights at launch | Grounded in onboarding data |

---

## Privacy & Security

### Data Handled by Onboarding
- Household name and member names
- Account names, types, balances
- Financial statements (CSV/PDF files)
- Bank transaction data (extracted from statements)
- Income and expense amounts
- User settings and preferences

### Privacy Guarantees
- ✅ All data stored on self-hosted instance (not sent to cloud)
- ✅ Statements analyzed locally, not sent to external services
- ✅ AI advisor queries restricted to allowlisted public sources (not household data)
- ✅ Data never sold or shared
- ✅ User can request deletion of all data

### Compliance
- WCAG 2.1 Level AA accessibility
- CCPA/GDPR data export and deletion support
- Audit logging for all household member actions
- Encryption in transit and at rest

---

## Related Documentation

**Core Architecture:**
- [README.md](../README.md) — Project overview and vision
- [AGENTS.md](../../AGENTS.md) — Privacy and architectural rules

**Existing Features:**
- [Financial Context Builder](../FINANCIAL_CONTEXT_BUILDER.md) — Context generation for AI advisor
- [Statement Parser](../CSV_PARSER_IMPLEMENTATION.md) — CSV/PDF parsing logic
- [AI Tool Layer Architecture](../AI_TOOL_LAYER_ARCHITECTURE.md) — AI advisor framework

**Infrastructure:**
- [Privacy Boundary Implementation](../PRIVACY_BOUNDARY_IMPLEMENTATION.md) — Privacy architecture
- [Database Schema](../SCHEMA_MIGRATION_OVERVIEW.md) — PostgreSQL schema

---

## Quick Links

### Documents
- [Household Onboarding - Feature Design](./HOUSEHOLD_ONBOARDING_FEATURE.md)
- [Household Onboarding - Implementation Plan](./HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md)

### APIs
- POST `/onboarding/start` — Initiate onboarding session
- GET `/onboarding/progress` — Get current phase and data
- POST `/onboarding/phase/:phaseNumber/complete` — Complete a phase
- POST `/onboarding/detect-income` — Analyze for income patterns
- POST `/onboarding/detect-expenses` — Analyze for recurring expenses
- POST `/onboarding/launch` — Finalize and create snapshot

### Database Tables
- `onboarding_progress` — Main onboarding state per household
- `onboarding_checkpoints` — Resume checkpoints
- `onboarding_income_detection` — Detected income records
- `onboarding_expense_detection` — Detected expense records

---

## Questions?

**Product Questions:** → Contact Product Lead
**Technical Questions:** → Contact Engineering Lead
**Design Questions:** → Contact Design Lead
**Timeline/Scope:** → Contact Project Manager
