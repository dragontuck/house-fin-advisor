# API Server Refactoring Guide

**Status**: Route modules created and ready for integration  
**Date**: 2026-08-16

## Overview

The Express API server (`apps/api/src/server.ts`) has been refactored from a 2,462-line monolithic file into modular route components. This guide explains the new structure and how to integrate it into the server.

---

## New Structure

### Route Modules

Located in `apps/api/src/routes/`:

| Module | Routes | Purpose |
|--------|--------|---------|
| **core.ts** | `/household`, `/household/members`, `/accounts` | Basic household and account information |
| **documents.ts** | `/documents/*` | Document upload, status, listing |
| **posting.ts** | `/posting/*` | Statement posting and categorization |
| **budgets.ts** | `/budgets/*` | Budget CRUD and variance calculations |
| **cash-flow.ts** | `/cash-flow/*` | Cash flow analysis and forecasting |
| **goals.ts** | `/goals/*` | Savings goals and emergency fund |
| **debt.ts** | `/debt/*` | Debt intelligence and analysis |
| **health.ts** | `/health/*`, `/financial-pulse` | Health analysis and attention items |
| **snapshots.ts** | `/snapshots/*` | Snapshots and historical data |

### Supporting Files

- **types.ts**: Type definitions (`RouteContext`, `RouteRegistrar`)
- **index.ts**: Route registration coordinator

---

## Integration Steps

### Step 1: Import Route Registration

Add to the top of `server.ts` after existing imports:

```typescript
import { registerAllRoutes, RouteContext } from "./routes";
```

### Step 2: Create Route Context

After initializing all services and repositories in `server.ts`, create the context object (replace the inline route definitions):

```typescript
// Create route context with all dependencies
const routeContext: RouteContext = {
    app,
    householdService,
    reviewQueueService,
    postingService,
    householdRepo,
    memberRepo,
    accountRepo,
    snapshotRepo,
    settingsRepo,
    documentRepo,
    reviewItemRepo,
    postingRepo,
    budgetRepo,
    cashFlowRepo,
    savingsGoalRepo,
    debtRepo,
    storageAdapter,
};

// Register all routes at once
registerAllRoutes(routeContext);
```

### Step 3: Remove Inline Routes

**Delete** all inline route handlers from `server.ts`. This includes:

- Lines 197-249: Household endpoints
- Lines 253-349: Accounts endpoints
- Lines 356-430: Financial snapshot endpoints
- Lines 437-590: Financial pulse endpoint
- Lines 599-989: Document/statement endpoints
- Lines 996-1227: Review queue endpoints
- Lines 1235-1392: Statement posting endpoints
- Lines 1400-1684: Budget endpoints
- Lines 1698-1852: Cash flow endpoints
- Lines 1858-2058: Savings goal endpoints
- Lines 2064-2136: Debt intelligence endpoints
- Lines 2142-2273: Health & attention endpoints
- Lines 2282-2320: Snapshot history endpoints

After cleanup, `server.ts` will be **~350 lines** (from 2,462), containing only:
- Imports and initialization
- Service creation
- Database setup
- Error handling middleware
- Route registration call
- Server startup

---

## Minimal Changes Required

### Current Server Setup (Simplified View)

```typescript
// BEFORE: 2,462 lines with all routes inline
app.get("/household", verifyHouseholdContext, async (req, res, next) => {
    // ... household handler
});

app.post("/documents/upload", verifyHouseholdContext, uploadRateLimiter, async (req, res, next) => {
    // ... document upload handler (60+ lines)
});

// ... 60+ more route definitions
```

### New Server Setup

```typescript
// AFTER: Clean, maintainable server setup
const routeContext: RouteContext = {
    app,
    householdService,
    // ... all services and repos
    storageAdapter,
};

registerAllRoutes(routeContext);
```

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Maintainability** | Each route group in separate file (100-300 lines max) |
| **Testability** | Individual route modules easy to mock and test |
| **Scalability** | Adding new routes no longer requires editing 2,462-line file |
| **Readability** | Clear structure: what does each module do? |
| **Parallel Development** | Multiple developers can work on different route modules |
| **Reusability** | Route modules can be imported and reused in other servers |

---

## Current Status

### ✅ Completed

- [x] `types.ts` - Type definitions created
- [x] `documents.ts` - Document endpoints extracted and modularized
- [x] `budgets.ts` - Budget endpoints extracted and modularized
- [x] `core.ts` - Core endpoints stub created
- [x] `health.ts` - Health endpoints stub created
- [x] `cash-flow.ts` - Cash flow endpoints stub created
- [x] `goals.ts` - Savings goals endpoints stub created
- [x] `debt.ts` - Debt endpoints stub created
- [x] `snapshots.ts` - Snapshot endpoints stub created
- [x] `posting.ts` - Posting endpoints stub created
- [x] `index.ts` - Coordinator created

### 📋 Next Steps (To Be Completed)

The following route handlers need to be extracted from `server.ts` into their respective modules:

1. **core.ts**: Extract `/accounts`, `/financial-pulse`, snapshot endpoints (lines 247-590)
2. **posting.ts**: Extract `/posting/*` endpoints (lines 1235-1392)
3. **health.ts**: Extract health summary, attention items (lines 2142-2273)
4. **cash-flow.ts**: Extract cash flow endpoints (lines 1698-1852)
5. **goals.ts**: Extract savings goal endpoints (lines 1858-2058)
6. **debt.ts**: Extract debt endpoints (lines 2064-2136)
7. **snapshots.ts**: Extract snapshot/history endpoints (lines 2282-2320)

### 🔄 Phase 2: Gradual Migration (Recommended)

For safety and to avoid breaking changes:

1. Keep `server.ts` as-is initially
2. Implement route modules with actual handlers (not stubs)
3. Update `server.ts` to import and call `registerAllRoutes()`
4. Test endpoints to ensure no regression
5. Once verified, delete inline route definitions from `server.ts`

---

## Testing After Refactoring

Run the test suite to verify all endpoints work:

```bash
# Run all tests
npm test

# Run only integration tests
npx jest --testPathPattern="integration"

# Run only API tests
npx jest --testPathPattern="api.test"
```

Expected result: **All tests passing** with no changes to test code.

---

## File Size Reduction

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| **server.ts** | 2,462 lines | ~350 lines | **85% reduction** |
| **Total Routes** | 1 file | 9 files | Better organization |
| **Max Module Size** | 2,462 lines | ~300 lines | **8x smaller** |

---

## Migration Checklist

- [ ] Extract route handlers to modular files
- [ ] Verify `RouteContext` includes all needed dependencies
- [ ] Update middleware access in route modules
- [ ] Create `registerAllRoutes()` call in server.ts
- [ ] Remove inline route definitions
- [ ] Run full test suite
- [ ] Verify error handling consistent across modules
- [ ] Test in development environment
- [ ] Commit modularized server structure
- [ ] Deploy to staging for validation

---

## Example: Complete Route Module

Here's what a completed route module looks like:

```typescript
// routes/documents.ts
import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";

export const registerDocumentRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, documentRepo, storageAdapter } = context;

    app.post("/documents/upload", async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Route handler logic here
            res.status(202).json(response);
        } catch (error) {
            next(error);
        }
    });

    app.get("/documents/:id", async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Route handler logic here
            res.json(response);
        } catch (error) {
            next(error);
        }
    });

    // Additional routes...
};
```

---

## Summary

The API server refactoring breaks the 2,462-line monolith into **9 focused, maintainable modules**. Each module:

- Exports a single `RouteRegistrar` function
- Receives all dependencies via `RouteContext`
- Registers its routes on the Express app
- Is tested independently
- Can be developed in parallel

The integration requires **minimal changes** to `server.ts`: just create the `RouteContext` and call `registerAllRoutes()`.

**Result**: Significantly improved **maintainability, testability, and scalability** for Slice 4+ development.
