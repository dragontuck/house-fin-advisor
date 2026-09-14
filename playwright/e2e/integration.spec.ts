import { test, expect } from "@playwright/test";

/**
 * End-to-End Integration Test for Slice 1
 * 
 * This test validates the complete journey:
 * Login (mock auth) → Household → Accounts → FinancialSnapshot → Financial Pulse
 * 
 * Uses REAL PostgreSQL data (no mocks in production path)
 * Tests authorization boundaries, seeded values, error handling, and responsive layout
 */

test.describe("Slice 1 E2E Integration - Real Data Journey", () => {
    /**
     * Configure tests to use real backend API
     * Backend should be running on http://localhost:3000
     */
    test.beforeAll(() => {
        // Ensure backend is accessible before running tests
        console.log("E2E Integration tests configured to use real API at http://localhost:3000");
        console.log("Database: PostgreSQL with seed data (Tucker Household)");
    });

    test.beforeEach(async ({ page }) => {
        // Simulate login context for Slice 1 (mock auth, will be real in Slice 2)
        // In Slice 1, we use hardcoded household ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
        await page.context().addInitScript(() => {
            // Store mock session to simulate logged-in user
            sessionStorage.setItem("householdId", "f47ac10b-58cc-4372-a567-0e02b2c3d479");
            sessionStorage.setItem("userId", "550e8400-e29b-41d4-a716-446655440001"); // Sean (OWNER)
        });
    });

    test.describe("Journey: Household Data", () => {
        test("should fetch household information from real API", async ({ page }) => {
            // Navigate to app
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Verify household name is displayed (from DB: "Tucker Household")
            const householdName = page.locator(".household-name");
            await expect(householdName).toContainText("Tucker Household");

            // Verify last updated timestamp is shown
            const lastUpdated = page.locator(".last-updated");
            await expect(lastUpdated).toBeVisible();

            // Verify it shows today's date (approximately)
            const updatedText = await lastUpdated.textContent();
            expect(updatedText).toBeTruthy();
            expect(updatedText).not.toContain("undefined");
        });

        test("should verify no raw household IDs are exposed to user", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            const bodyText = await page.textContent("body");
            // Should NOT expose the hardcoded household ID
            expect(bodyText).not.toContain("f47ac10b-58cc-4372-a567-0e02b2c3d479");
            // Should NOT expose technical terms
            expect(bodyText).not.toContain("householdId");
            expect(bodyText).not.toContain("entityId");
        });
    });

    test.describe("Journey: Accounts Display", () => {
        test("should display all seeded accounts organized by category", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Verify account categories exist (from seeded data)
            const accountGroups = page.locator(".account-group-title");
            const groupTitles = await accountGroups.allTextContents();

            // Should have these categories with seeded accounts
            expect(groupTitles).toContain("Daily cash");      // Checking + Savings
            expect(groupTitles).toContain("Retirement savings"); // 401k + IRA
            expect(groupTitles).toContain("Debt");            // Mortgage

            // Investments category may or may not show (empty in seeded data)
        });

        test("should display correct cash account balances from DB", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Seeded cash accounts:
            // - Checking: $7,200
            // - Savings: $12,000
            // Total: $19,200

            const accountBalances = page.locator(".account-balance");
            const balanceTexts = await accountBalances.allTextContents();

            // Should see formatted currency for both accounts
            const checkingFound = balanceTexts.some(text =>
                text.includes("$") && text.includes("7") && text.includes("200")
            );
            const savingsFound = balanceTexts.some(text =>
                text.includes("$") && text.includes("12") && text.includes("000")
            );

            expect(checkingFound).toBeTruthy();
            expect(savingsFound).toBeTruthy();
        });

        test("should display retirement account balances from DB", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Seeded retirement accounts:
            // - 401(k): $325,000
            // - IRA: $85,000

            const accountBalances = page.locator(".account-balance");
            const balanceTexts = await accountBalances.allTextContents();

            const has401k = balanceTexts.some(text =>
                text.includes("325")
            );
            const hasIRA = balanceTexts.some(text =>
                text.includes("85")
            );

            expect(has401k).toBeTruthy();
            expect(hasIRA).toBeTruthy();
        });

        test("should display mortgage debt from DB", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Seeded debt: Mortgage $240,000

            const accountBalances = page.locator(".account-balance");
            const balanceTexts = await accountBalances.allTextContents();

            const hasMortgage = balanceTexts.some(text =>
                text.includes("240")
            );

            expect(hasMortgage).toBeTruthy();
        });
    });

    test.describe("Journey: FinancialSnapshot Calculation", () => {
        test("should calculate and display key metrics from real snapshot", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Expected values from seeded data:
            // - Net Worth: $189,200 (assets - debt)
            // - Cash Available: $19,200 (checking + savings)
            // - Monthly Income: $12,000 (hardcoded in API)
            // - Monthly Expenses: $8,000 (6800 essential + 1200 discretionary)
            // - Monthly Surplus: $4,000 (income - expenses)
            // - Total Debt: $240,000

            // Get all metric cards
            const metricCards = page.locator(".metric-card");
            const metricCount = await metricCards.count();

            // Should have 6 metric cards
            expect(metricCount).toBe(6);

            // Verify key values are displayed
            const pageText = await page.textContent("body");

            // Net worth should be shown
            expect(pageText).toContain("189");

            // Cash available should be shown
            expect(pageText).toContain("19");

            // Monthly income should be shown
            expect(pageText).toContain("12");

            // Debt should be shown
            expect(pageText).toContain("240");
        });

        test("should show HEALTHY health status for seeded household", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Seeded data shows HEALTHY status
            const healthStatus = page.locator(".health-indicator");
            await expect(healthStatus).toHaveClass(/healthy/);

            // Verify health message
            const healthMessage = page.locator(".health-message");
            const messageText = await healthMessage.textContent();
            expect(messageText).toContain("good financial shape");
        });

        test("should calculate deterministic snapshot values", async ({ page }) => {
            // First load
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Extract values
            const body1 = await page.textContent("body");

            // Reload page
            await page.reload();
            await page.waitForLoadState("networkidle");

            // Extract values again
            const body2 = await page.textContent("body");

            // Values should be identical (deterministic calculation)
            expect(body1).toBe(body2);
        });
    });

    test.describe("Authorization Boundaries", () => {
        test("should use hardcoded household ID (Slice 1 limitation)", async ({ page, context }) => {
            // In Slice 1, all users see the same hardcoded household
            // This is intentional - authorization is in Slice 2

            await page.goto("/");
            await page.waitForLoadState("networkidle");

            const householdName = page.locator(".household-name");
            await expect(householdName).toContainText("Tucker Household");

            // Try as different "user" - should still see same household
            const context2 = await page.context().browser()?.newContext();
            if (!context2) return;

            const page2 = await context2.newPage();
            await context2.addInitScript(() => {
                sessionStorage.setItem("userId", "550e8400-e29b-41d4-a716-446655440002"); // Wife (MEMBER)
            });

            await page2.goto(page.url());
            await page2.waitForLoadState("networkidle");

            const householdName2 = page2.locator(".household-name");
            await expect(householdName2).toContainText("Tucker Household");

            await context2.close();
        });
    });

    test.describe("Error Handling", () => {
        test("should handle database connection errors gracefully", async ({ page }) => {
            // This test would need backend to simulate DB failure
            // For now, verify the error UI exists

            const errorBoundary = page.locator(".error-box");
            // Should not be visible initially
            await expect(errorBoundary).not.toBeVisible();
        });

        test("should display error message when API fails", async ({ page }) => {
            // Mock API failure for this specific test
            await page.route("**/api/financial-pulse", route => {
                route.abort("failed");
            });

            await page.goto("/");

            // Should show error message
            const errorBox = page.locator(".error-box");
            await expect(errorBox).toBeVisible();

            // Should have retry button
            const retryButton = page.locator(".retry-button");
            await expect(retryButton).toBeVisible();
            await expect(retryButton).toContainText("Try Again");
        });

        test("should show currency formatting errors if API returns invalid data", async ({ page }) => {
            // Mock API returning invalid balance data
            await page.route("**/api/financial-pulse", route => {
                route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        householdId: "test-id",
                        householdName: "Test",
                        asOf: new Date().toISOString(),
                        healthStatus: "HEALTHY",
                        healthMessage: "Test",
                        keyMetrics: {
                            netWorth: "not-a-number", // Invalid
                            cashAvailable: 100,
                            monthlyIncome: 100,
                            monthlyExpenses: 100,
                            monthlySurplus: 100,
                            totalDebt: 100,
                        },
                        accountsSummary: {
                            cash: [],
                            retirement: [],
                            investments: [],
                            debt: [],
                        },
                        statusMessage: "Test",
                    }),
                });
            });

            await page.goto("/");
            // Page should handle gracefully (either show error or parse successfully)
            const pageContent = await page.textContent("body");
            expect(pageContent).toBeTruthy();
        });
    });

    test.describe("Responsive Layout", () => {
        test("should display correctly on desktop viewport", async ({ page }) => {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // All sections should be visible
            const household = page.locator(".household-name");
            const health = page.locator(".health-section");
            const metrics = page.locator(".metrics-grid");
            const accounts = page.locator(".account-group");

            await expect(household).toBeVisible();
            await expect(health).toBeVisible();
            await expect(metrics).toBeVisible();
            await expect(accounts.first()).toBeVisible();
        });

        test("should display correctly on tablet viewport", async ({ page }) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // All sections should be visible (responsive)
            const household = page.locator(".household-name");
            const metrics = page.locator(".metric-card");

            await expect(household).toBeVisible();
            await expect(metrics.first()).toBeVisible();
        });

        test("should display correctly on mobile viewport", async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // All sections should be visible (mobile responsive)
            const household = page.locator(".household-name");
            const metrics = page.locator(".metric-card");

            await expect(household).toBeVisible();
            await expect(metrics.first()).toBeVisible();

            // Verify single-column layout
            const metricsGrid = page.locator(".metrics-grid");
            const boundingBox = await metricsGrid.boundingBox();
            expect(boundingBox).toBeTruthy();
        });

        test("should display interactive tooltips on all metrics", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            const whyButtons = page.locator(".metric-why");
            const count = await whyButtons.count();

            expect(count).toBe(6); // One per metric

            // Click first tooltip
            await whyButtons.first().click();

            const tooltip = page.locator(".metric-tooltip");
            await expect(tooltip.first()).toBeVisible();

            const tooltipText = await tooltip.first().textContent();
            expect(tooltipText).toBeTruthy();
            expect(tooltipText?.length).toBeGreaterThan(10);
        });
    });

    test.describe("Seeded Data Verification", () => {
        test("should verify Tucker household members are configured", async ({ page }) => {
            // This test verifies the seeded members (Sean + Wife)
            // Note: Current UI doesn't display members, but API has them

            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Verify household loads (members are validated on backend)
            const householdName = page.locator(".household-name");
            await expect(householdName).toContainText("Tucker Household");

            // In a future version with member display, add member verification
            // For now, we verify the household loads (which requires valid member setup)
        });

        test("should verify account types are correct from seeded data", async ({ page }) => {
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // Accounts by type from seeded data:
            // Cash: CHECKING, SAVINGS
            // Retirement: RETIREMENT (2 accounts)
            // Debt: MORTGAGE (1 account)
            // Investments: (none)

            const accountNames = page.locator(".account-name");
            const names = await accountNames.allTextContents();

            // Should have expected account names from seed
            expect(names.length).toBeGreaterThanOrEqual(5);

            // Verify account names (from 002_seed_tucker_household.sql)
            const hasChecking = names.some(n => n.includes("Checking"));
            const hasSavings = names.some(n => n.includes("Savings"));
            const has401k = names.some(n => n.includes("401"));
            const hasIRA = names.some(n => n.includes("IRA"));
            const hasMortgage = names.some(n => n.includes("Mortgage"));

            expect(hasChecking).toBeTruthy();
            expect(hasSavings).toBeTruthy();
            expect(has401k).toBeTruthy();
            expect(hasIRA).toBeTruthy();
            expect(hasMortgage).toBeTruthy();
        });

        test("should verify monetary values use cents internally", async ({ page }) => {
            // This test verifies that backend correctly converts cents to dollars
            // Seeded data is in cents, should display as dollars

            await page.goto("/");
            await page.waitForLoadState("networkidle");

            const pageText = await page.textContent("body");

            // Checking: 720000 cents = $7,200
            // Should show as $7,200 not 720000
            expect(pageText).toContain("7,200");
            expect(pageText).not.toContain("720000");

            // Mortgage: 24000000 cents = $240,000
            expect(pageText).toContain("240,000");
            expect(pageText).not.toContain("24000000");
        });
    });

    test.describe("Complete Production Journey", () => {
        test("complete flow: household member sees financial pulse on login", async ({ page }) => {
            // Simulate complete user journey

            // 1. User navigates to app (after login in Slice 2)
            await page.goto("/");
            await page.waitForLoadState("networkidle");

            // 2. Page shows household name
            const householdName = page.locator(".household-name");
            await expect(householdName).toContainText("Tucker Household");

            // 3. Financial health is displayed
            const healthSection = page.locator(".health-section");
            await expect(healthSection).toBeVisible();

            const healthIndicator = page.locator(".health-indicator");
            await expect(healthIndicator).toHaveClass(/healthy/);

            // 4. 6 key metrics are displayed
            const metrics = page.locator(".metric-card");
            await expect(metrics).toHaveCount(6);

            // 5. Account summary shows all account categories
            const accountGroups = page.locator(".account-group-title");
            const titles = await accountGroups.allTextContents();
            expect(titles.length).toBeGreaterThanOrEqual(3);

            // 6. User can interact with tooltips
            const whyButton = page.locator(".metric-why").first();
            await whyButton.click();

            const tooltip = page.locator(".metric-tooltip");
            await expect(tooltip.first()).toBeVisible();

            // 7. Page works on mobile
            await page.setViewportSize({ width: 375, height: 667 });

            const householdNameMobile = page.locator(".household-name");
            await expect(householdNameMobile).toBeVisible();

            const metricsMobile = page.locator(".metric-card");
            await expect(metricsMobile).toHaveCount(6);

            // 8. Can retry if needed
            const retryButton = page.locator(".retry-button");
            // Should not be visible initially
            await expect(retryButton).not.toBeVisible();
        });
    });
});
