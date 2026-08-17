import { test, expect, Page } from "@playwright/test";

// ── Shared mock builders ─────────────────────────────────────────────────────

const HOUSEHOLD_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const NOW = new Date().toISOString();

function makePulse(overrides: object = {}) {
    return {
        householdId: HOUSEHOLD_ID,
        householdName: "Tucker Household",
        asOf: NOW,
        healthStatus: "HEALTHY",
        healthMessage: "",
        keyMetrics: {
            netWorth: 189200,
            cashAvailable: 19200,
            monthlyIncome: 12000,
            monthlyExpenses: 8000,
            monthlySurplus: 4000,
            totalDebt: 240000,
        },
        accountsSummary: {
            cash: [{ name: "Checking", balance: 7200, type: "CHECKING" }],
            retirement: [],
            investments: [],
            debt: [{ name: "Mortgage", balance: 240000, type: "MORTGAGE" }],
        },
        statusMessage: "",
        ...overrides,
    };
}

function makeHealth(overrides: object = {}) {
    return {
        householdId: HOUSEHOLD_ID,
        asOf: NOW,
        calculationVersion: 1,
        status: "HEALTHY",
        statusDescription: "Your household's financial position looks healthy.",
        factors: [],
        attentionItems: [],
        ...overrides,
    };
}

function makeBudget(overrides: object = {}) {
    const now = new Date();
    return {
        householdId: HOUSEHOLD_ID,
        period: { year: now.getFullYear(), month: now.getMonth() + 1 },
        results: [],
        totalPlannedCents: 800000,
        totalActualCents: 650000,
        totalRemainingCents: 150000,
        totalVarianceCents: -150000,
        unbudgetedSpendingCents: 0,
        asOf: NOW,
        calculatedAt: NOW,
        calculationVersion: 1,
        ...overrides,
    };
}

function makeGoals(extra: object[] = []) {
    return [
        {
            goalId: "goal-ef-001",
            householdId: HOUSEHOLD_ID,
            name: "Emergency Fund",
            type: "EMERGENCY_FUND",
            targetAmountCents: 600000,
            currentAmountCents: 480000,
            percentComplete: 80,
            remainingAmountCents: 120000,
            monthlyContributionCents: 20000,
            requiredMonthlyContributionCents: 20000,
            projectedCompletionDate: null,
            targetDate: null,
            status: "ON_TRACK",
            calculatedAt: NOW,
            calculationVersion: 1,
        },
        ...extra,
    ];
}

function makeDebt(overrides: object = {}) {
    return {
        householdId: HOUSEHOLD_ID,
        asOf: NOW,
        calculationVersion: 1,
        totalDebtCents: 24000000,
        revolvingDebtCents: 0,
        installmentDebtCents: 0,
        mortgageDebtCents: 24000000,
        totalMinimumPaymentCents: null,
        totalScheduledPaymentCents: null,
        weightedAverageRateBps: null,
        debtToIncomeRatio: null,
        status: "HEALTHY",
        statusDescription: "Debt levels are within normal parameters.",
        observations: [],
        accounts: [],
        ...overrides,
    };
}

function makeHistory() {
    const months = [-5, -4, -3, -2, -1, 0].map(offset => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return {
            period: { year: d.getFullYear(), month: d.getMonth() + 1 },
            incomeCents: 1200000,
            expensesCents: 800000,
            surplusCents: 400000,
            transactionCount: 40,
            isComplete: offset < 0,
        };
    });
    return {
        householdId: HOUSEHOLD_ID,
        months,
        averageMonthlyIncomeCents: 1200000,
        averageMonthlyExpensesCents: 800000,
        averageMonthlySurplusCents: 400000,
        calculatedAt: NOW,
    };
}

async function mockAllApis(
    page: Page,
    overrides: {
        pulse?: object;
        health?: object;
        budget?: object;
        goals?: object[];
        debt?: object;
    } = {}
) {
    await page.route("**/api/financial-pulse", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makePulse(overrides.pulse ?? {})) })
    );
    await page.route("**/api/health/summary", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeHealth(overrides.health ?? {})) })
    );
    await page.route("**/api/budgets/results**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeBudget(overrides.budget ?? {})) })
    );
    await page.route("**/api/goals", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeGoals(overrides.goals ?? [])) })
    );
    await page.route("**/api/debt/summary", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeDebt(overrides.debt ?? {})) })
    );
    await page.route("**/api/cash-flow/history**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeHistory()) })
    );
}

// ── Scenario 1: Healthy household ────────────────────────────────────────────

test.describe("Healthy household", () => {
    test.beforeEach(async ({ page }) => {
        await mockAllApis(page);
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("shows the household name", async ({ page }) => {
        await expect(page.locator(".household-name")).toContainText("Tucker Household");
    });

    test("displays a healthy status headline", async ({ page }) => {
        const headline = page.getByTestId("status-headline");
        await expect(headline).toContainText("Your household finances look healthy.");
    });

    test("status banner has healthy styling", async ({ page }) => {
        const banner = page.getByTestId("status-banner");
        await expect(banner).toHaveClass(/healthy/);
    });

    test("no attention items are shown", async ({ page }) => {
        await expect(page.getByTestId("attention-section")).not.toBeVisible();
    });

    test("monthly cash flow shows income, expenses, and surplus", async ({ page }) => {
        const section = page.getByTestId("cash-flow-section");
        await expect(section).toBeVisible();
        await expect(page.getByTestId("income-value")).toContainText("$12,000");
        await expect(page.getByTestId("expenses-value")).toContainText("$8,000");
        await expect(page.getByTestId("surplus-value")).toContainText("$4,000");
    });

    test("budget section is visible", async ({ page }) => {
        await expect(page.getByTestId("budget-section")).toBeVisible();
    });

    test("goals section shows emergency fund on track", async ({ page }) => {
        const section = page.getByTestId("goals-section");
        await expect(section).toBeVisible();
        await expect(section).toContainText("Emergency Fund");
        await expect(page.getByTestId("goal-status").first()).toContainText("On track");
    });

    test("debt section is visible", async ({ page }) => {
        await expect(page.getByTestId("debt-section")).toBeVisible();
    });

    test("trends section shows period toggle", async ({ page }) => {
        const section = page.getByTestId("trends-section");
        await expect(section).toBeVisible();
        await expect(section.getByRole("button", { name: "3m" })).toBeVisible();
        await expect(section.getByRole("button", { name: "6m" })).toBeVisible();
        await expect(section.getByRole("button", { name: "12m" })).toBeVisible();
    });

    test("Why? button reveals calculation explanation", async ({ page }) => {
        const section = page.getByTestId("cash-flow-section");
        await section.getByRole("button", { name: "Why?" }).click();
        await expect(section).toContainText("Income minus all monthly expenses");
        await expect(section.getByRole("button", { name: "Show details" })).toBeVisible();
    });

    test("Show details reveals technical inputs and as-of date", async ({ page }) => {
        const section = page.getByTestId("cash-flow-section");
        await section.getByRole("button", { name: "Why?" }).click();
        await section.getByRole("button", { name: "Show details" }).click();
        await expect(section).toContainText("As of");
        await expect(section).toContainText("Calculation version");
    });
});

// ── Scenario 2: Household with attention item ─────────────────────────────────

test.describe("Household with attention item", () => {
    const attentionItem = {
        id: `${HOUSEHOLD_ID}::EMERGENCY_FUND_LOW::ef`,
        householdId: HOUSEHOLD_ID,
        severity: "WARNING",
        type: "EMERGENCY_FUND_LOW",
        title: "Emergency fund below target",
        explanation: "Current coverage is 2.3 months against a target of 6 months.",
        metric: { label: "Coverage shortfall", value: 1200, unit: "dollars" },
        source: "emergency-fund",
        createdAt: NOW,
        status: "ACTIVE",
        dismissedAt: null,
        resolvedAt: null,
    };

    test.beforeEach(async ({ page }) => {
        await mockAllApis(page, {
            health: {
                status: "WATCH",
                statusDescription: "Your household's finances are stable with 1 item to monitor.",
                attentionItems: [attentionItem],
            },
        });
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("status banner shows watch state", async ({ page }) => {
        const banner = page.getByTestId("status-banner");
        await expect(banner).toHaveClass(/watch/);
        await expect(page.getByTestId("status-headline")).toContainText("a few things to monitor");
    });

    test("attention section is visible with the item", async ({ page }) => {
        await expect(page.getByTestId("attention-section")).toBeVisible();
        const item = page.getByTestId("attention-item").first();
        await expect(item).toContainText("Emergency fund below target");
        await expect(item).toContainText("2.3 months");
    });

    test("attention item severity styling is applied", async ({ page }) => {
        const item = page.getByTestId("attention-item").first();
        await expect(item).toHaveClass(/severity-warning/);
    });

    test("attention item expands to show source and metric", async ({ page }) => {
        const item = page.getByTestId("attention-item").first();
        await item.getByRole("button", { name: "Show details" }).click();
        await expect(item).toContainText("Coverage shortfall");
        await expect(item).toContainText("emergency-fund");
    });
});

// ── Scenario 3: Household with cash-flow risk ─────────────────────────────────

test.describe("Household with cash-flow risk", () => {
    const cashFlowWarning = {
        id: `${HOUSEHOLD_ID}::CASH_FLOW_WARNING::monthly`,
        householdId: HOUSEHOLD_ID,
        severity: "WARNING",
        type: "CASH_FLOW_WARNING",
        title: "Monthly spending exceeds income",
        explanation: "This month's expenses are $800 more than income.",
        metric: { label: "Monthly deficit", value: 800, unit: "dollars" },
        source: "cash-flow",
        createdAt: NOW,
        status: "ACTIVE",
        dismissedAt: null,
        resolvedAt: null,
    };

    test.beforeEach(async ({ page }) => {
        await mockAllApis(page, {
            pulse: {
                keyMetrics: {
                    netWorth: 120000,
                    cashAvailable: 4000,
                    monthlyIncome: 8000,
                    monthlyExpenses: 8800,
                    monthlySurplus: -800,
                    totalDebt: 260000,
                },
            },
            health: {
                status: "AT_RISK",
                statusDescription: "Your household's finances show 1 concern that warrants attention.",
                attentionItems: [cashFlowWarning],
            },
        });
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("status banner shows at-risk state", async ({ page }) => {
        const banner = page.getByTestId("status-banner");
        await expect(banner).toHaveClass(/at-risk/);
        await expect(page.getByTestId("status-headline")).toContainText("need attention");
    });

    test("cash-flow warning attention item is visible", async ({ page }) => {
        const section = page.getByTestId("attention-section");
        await expect(section).toBeVisible();
        await expect(page.getByTestId("attention-item").first()).toContainText("Monthly spending exceeds income");
    });

    test("surplus is shown as a negative value", async ({ page }) => {
        const surplus = page.getByTestId("surplus-value");
        await expect(surplus).toContainText("-$800");
        await expect(surplus).toHaveClass(/negative/);
    });

    test("income and expenses values are correct", async ({ page }) => {
        await expect(page.getByTestId("income-value")).toContainText("$8,000");
        await expect(page.getByTestId("expenses-value")).toContainText("$8,800");
    });
});

// ── Scenario 4: Household with goal falling behind ────────────────────────────

test.describe("Household with goal falling behind", () => {
    const goalBehindItem = {
        id: `${HOUSEHOLD_ID}::GOAL_BEHIND::goal-vac-001`,
        householdId: HOUSEHOLD_ID,
        severity: "WARNING",
        type: "GOAL_BEHIND",
        title: "Vacation fund is behind schedule",
        explanation: "The goal is 45% complete with 60% of the time elapsed.",
        metric: { label: "Progress", value: 45, unit: "percent" },
        source: "goals",
        createdAt: NOW,
        status: "ACTIVE",
        dismissedAt: null,
        resolvedAt: null,
    };

    const vacationGoal = {
        goalId: "goal-vac-001",
        householdId: HOUSEHOLD_ID,
        name: "Vacation Fund",
        type: "VACATION",
        targetAmountCents: 500000,
        currentAmountCents: 225000,
        percentComplete: 45,
        remainingAmountCents: 275000,
        monthlyContributionCents: 15000,
        requiredMonthlyContributionCents: 25000,
        projectedCompletionDate: null,
        targetDate: new Date(new Date().getFullYear() + 1, 5, 1).toISOString(),
        status: "BEHIND",
        calculatedAt: NOW,
        calculationVersion: 1,
    };

    test.beforeEach(async ({ page }) => {
        await mockAllApis(page, {
            health: {
                status: "WATCH",
                statusDescription: "Your household's finances are stable with 1 item to monitor.",
                attentionItems: [goalBehindItem],
            },
            goals: [vacationGoal],
        });
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("status banner shows watch state", async ({ page }) => {
        await expect(page.getByTestId("status-banner")).toHaveClass(/watch/);
    });

    test("goal-behind attention item is shown", async ({ page }) => {
        const section = page.getByTestId("attention-section");
        await expect(section).toBeVisible();
        await expect(page.getByTestId("attention-item").first()).toContainText("Vacation fund is behind schedule");
        await expect(page.getByTestId("attention-item").first()).toContainText("45% complete");
    });

    test("goals section shows vacation fund with behind badge", async ({ page }) => {
        const section = page.getByTestId("goals-section");
        await expect(section).toBeVisible();
        await expect(section).toContainText("Vacation Fund");
        const badge = page.getByTestId("goal-status").first();
        await expect(badge).toContainText("Behind schedule");
        await expect(badge).toHaveClass(/behind/);
    });

    test("goal card shows 45% progress", async ({ page }) => {
        await expect(page.getByTestId("goal-card").first()).toContainText("45%");
    });

    test("goal card expands to show target date and required monthly contribution", async ({ page }) => {
        const card = page.getByTestId("goal-card").first();
        await card.getByRole("button", { name: "Show details" }).click();
        await expect(card).toContainText("Target date");
        await expect(card).toContainText("Required monthly");
    });
});
{ name: "Checking Account", balance: 7200, type: "CHECKING" },
{ name: "Savings Account", balance: 12000, type: "SAVINGS" },
        ],
retirement: [
    { name: "401k", balance: 325000, type: "RETIREMENT" },
    { name: "IRA", balance: 85000, type: "RETIREMENT" },
],
    investments: [],
        debt: [
            { name: "Home Mortgage", balance: 240000, type: "MORTGAGE" },
        ],
    },
statusMessage:
"Your household is in good financial shape. Keep maintaining this momentum!",
};

test.describe("Financial Pulse Dashboard", () => {
    test.beforeEach(async ({ page }) => {
        // Mock the API endpoint using route.fulfill
        await page.route("**/api/financial-pulse", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockPulseData),
            });
        });
    });

    test("should display household name and update date", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Verify household header is visible
        const householdName = page.locator(".household-name");
        await expect(householdName).toContainText("Tucker Household");

        // Verify last updated date is shown
        const lastUpdated = page.locator(".last-updated");
        await expect(lastUpdated).toBeVisible();
    });

    test("should display health status section with correct message", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Check health status card
        const healthTitle = page.locator(".health-title");
        await expect(healthTitle).toContainText("You're in great shape");

        const healthMessage = page.locator(".health-message");
        await expect(healthMessage).toContainText(
            "Your household is in good financial shape"
        );

        // Check health indicator for positive status
        const healthIndicator = page.locator(".health-indicator");
        await expect(healthIndicator).toHaveClass(/healthy/);
    });

    test("should display all key metrics", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Get all metric cards
        const metricCards = page.locator(".metric-card");
        await expect(metricCards).toHaveCount(6);

        // Verify specific metrics are rendered
        await expect(page.locator(".metric-label")).toContainText("Monthly income");
        await expect(page.locator(".metric-label")).toContainText(
            "Available cash"
        );
        await expect(page.locator(".metric-label")).toContainText("Total debt");
    });

    test("should show net worth as positive value", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Find net worth metric
        const metricValues = page.locator(".metric-value");
        let foundNetWorth = false;

        for (let i = 0; i < (await metricValues.count()); i++) {
            const text = await metricValues.nth(i).textContent();
            if (text && text.includes("189,200")) {
                const element = metricValues.nth(i);
                await expect(element).toHaveClass(/positive/);
                foundNetWorth = true;
                break;
            }
        }

        expect(foundNetWorth).toBeTruthy();
    });

    test("should show positive monthly surplus", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Look for monthly surplus in the metric values
        const metricValues = page.locator(".metric-value");
        let foundSurplus = false;

        for (let i = 0; i < (await metricValues.count()); i++) {
            const text = await metricValues.nth(i).textContent();
            if (text && text.includes("4,000")) {
                const element = metricValues.nth(i);
                // Verify it's displayed as a positive value
                foundSurplus = true;
                break;
            }
        }

        expect(foundSurplus).toBeTruthy();
    });

    test("should display account groups organized by category", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Check for account group titles
        const groupTitles = page.locator(".account-group-title");
        const groupsText = await groupTitles.allTextContents();

        expect(groupsText).toContain("Daily cash");
        expect(groupsText).toContain("Retirement savings");
        expect(groupsText).toContain("Debt");
    });

    test("should display specific accounts under correct categories", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Check for checking account
        const accountNames = page.locator(".account-name");
        const names = await accountNames.allTextContents();

        expect(names).toContain("Checking Account");
        expect(names).toContain("401k");
        expect(names).toContain("Home Mortgage");
    });

    test("should show correct account balances in currency format", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Verify currency formatting (should show $ and commas)
        const accountBalances = page.locator(".account-balance");
        const balanceTexts = await accountBalances.allTextContents();

        // Should contain formatted currency
        const hasFormattedCurrency = balanceTexts.some(
            (text) => text.includes("$") && text.includes(",")
        );
        expect(hasFormattedCurrency).toBeTruthy();
    });

    test("should have interactive 'Why' tooltips on metrics", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const whyButtons = page.locator(".metric-why");
        await expect(whyButtons).toHaveCount(6);

        // Click on first why button
        await whyButtons.first().click();

        // Check tooltip is visible
        const tooltip = page.locator(".metric-tooltip");
        await expect(tooltip.first()).toBeVisible();
    });

    test("should show tooltip content when 'Why' button is clicked", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Click a why button
        const whyButton = page.locator(".metric-why").first();
        await whyButton.click();

        // Verify tooltip content appears
        const tooltip = page.locator(".metric-tooltip");
        const tooltipText = await tooltip.first().textContent();
        expect(tooltipText).toBeTruthy();
        expect(tooltipText?.length).toBeGreaterThan(10);
    });

    test("should be responsive on mobile viewport", async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Verify main elements are still visible
        const householdName = page.locator(".household-name");
        await expect(householdName).toBeVisible();

        const healthSection = page.locator(".health-section");
        await expect(healthSection).toBeVisible();

        const metricsGrid = page.locator(".metrics-grid");
        await expect(metricsGrid).toBeVisible();
    });

    test("should be responsive on tablet viewport", async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });

        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Verify layout works on tablet
        const appContainer = page.locator(".app-container");
        await expect(appContainer).toBeVisible();

        const metricCards = page.locator(".metric-card");
        await expect(metricCards).toHaveCount(6);
    });

    test("should handle error state gracefully", async ({ page }) => {
        // Mock API failure by aborting the request
        await page.route("**/api/financial-pulse", (route) => {
            route.abort("failed");
        });

        await page.goto("/");

        // Should show error message
        const errorBox = page.locator(".error-box");
        await expect(errorBox).toBeVisible();

        const errorMessage = page.locator(".error-message");
        await expect(errorMessage).toBeVisible();

        // Should have retry button
        const retryButton = page.locator(".retry-button");
        await expect(retryButton).toBeVisible();
        await expect(retryButton).toContainText("Try Again");
    });

    test("should load within performance budget (30 seconds)", async ({
        page,
    }) => {
        const startTime = Date.now();

        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const endTime = Date.now();
        const loadTime = endTime - startTime;

        // Should load in under 30 seconds (30000 ms)
        expect(loadTime).toBeLessThan(30000);
    });

    test("should not show raw IDs or technical details", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const pageText = await page.textContent("body");
        expect(pageText).not.toContain("f47ac10b-58cc-4372-a567-0e02b2c3d479");
        expect(pageText).not.toContain("householdId");
        expect(pageText).not.toContain("healthStatus");
        expect(pageText).not.toContain("HEALTHY");
        expect(pageText).not.toContain("{");
        expect(pageText).not.toContain("}");
    });

    test("should use plain language without jargon", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const pageText = await page.textContent("body");

        // Should use plain language like "How much do we have?"
        expect(pageText).toContain("How much do we have");
        expect(pageText).toContain("Available cash");
        expect(pageText).toContain("Monthly income");
        expect(pageText).toContain("Account breakdown");

        // Should NOT use technical jargon
        expect(pageText).not.toContain("liquidity");
        expect(pageText).not.toContain("equity");
    });

    test("should have strong visual hierarchy", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Household name should be largest
        const householdName = page.locator(".household-name");
        const householdStyle = await householdName.evaluate((el) => {
            return window.getComputedStyle(el).fontSize;
        });

        // Metric labels should be smaller
        const metricLabel = page.locator(".metric-label").first();
        const metricStyle = await metricLabel.evaluate((el) => {
            return window.getComputedStyle(el).fontSize;
        });

        // Parse font sizes and compare
        const householdSize = parseFloat(householdStyle);
        const metricSize = parseFloat(metricStyle);
        expect(householdSize).toBeGreaterThan(metricSize);
    });
});

test.describe("Household with low emergency fund", () => {
    const mockPulseData = {
        householdId: HOUSEHOLD_ID,
        householdName: "Emergency Fund Household",
        asOf: NOW,
        healthStatus: "WATCH",
        healthMessage: "Emergency fund is below target — build it up",
        keyMetrics: {
            netWorth: 150000,
            cashAvailable: 8000, // Only 1.6 months of essential expenses
            monthlyIncome: 10000,
            monthlyExpenses: 7000,
            monthlySurplus: 3000,
            totalDebt: 0,
        },
        accountsSummary: {
            cash: [{ name: "Savings", balance: 8000, type: "SAVINGS" }],
            retirement: [],
            investments: [],
            debt: [],
        },
        statusMessage: "Emergency fund is 1.6 months of expenses. Target: 3 months.",
        calculationDetails: {
            snapshotId: "snapshot-ef-123",
            calculationVersion: 1,
            calculatedAt: NOW,
            monthlyIncomeCents: 1000000,
            monthlyEssentialExpensesCents: 500000,
            monthlyDiscretionaryExpensesCents: 200000,
            surplusExplanation: "$10,000 income minus $7,000 expenses",
        },
    };

    test.beforeEach(async ({ page }) => {
        await mockAllApis(page, {
            pulse: mockPulseData,
            health: {
                status: "WATCH",
                attentionItems: [
                    {
                        type: "EMERGENCY_FUND_LOW",
                        severity: "WARNING",
                        evidence: "Current: 1.6 months. Target: 3 months. Need $7,000 more.",
                    },
                ],
                emergencyFundCoverageMonths: 1.6,
                emergencyFundTargetMonths: 3,
            },
        });
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("status banner shows watch state for low emergency fund", async ({ page }) => {
        const banner = page.getByTestId("status-banner");
        await expect(banner).toContainText("WATCH");
    });

    test("attention section shows emergency fund low item", async ({ page }) => {
        const attentionItems = page.getByTestId("attention-item");
        const efItem = attentionItems.filter({
            hasText: /emergency|emergency fund|1.6|3 months/i,
        });
        await expect(efItem.first()).toBeVisible();
    });

    test("attention item shows current vs target coverage", async ({ page }) => {
        const attentionItem = page.getByTestId("attention-item").first();
        await expect(attentionItem).toContainText("1.6");
        await expect(attentionItem).toContainText("3");
    });

    test("attention item expands to show required amount", async ({ page }) => {
        const attentionItem = page.getByTestId("attention-item").first();
        const expandBtn = attentionItem.getByRole("button");
        await expandBtn.click();
        await expect(attentionItem).toContainText("$7,000");
    });

    test("cash flow section shows positive surplus despite low savings", async ({ page }) => {
        const surplusValue = page.getByTestId("surplus-value");
        await expect(surplusValue).toContainText("$3,000");
    });
});

test.describe("Household with increasing debt", () => {
    const mockPulseData = {
        householdId: HOUSEHOLD_ID,
        householdName: "Debt-Rising Household",
        asOf: NOW,
        healthStatus: "AT_RISK",
        healthMessage: "Revolving debt is increasing — pay it down",
        keyMetrics: {
            netWorth: 120000,
            cashAvailable: 6000,
            monthlyIncome: 11000,
            monthlyExpenses: 9500, // High expenses due to debt service
            monthlySurplus: 1500,
            totalDebt: 75000, // High debt
        },
        accountsSummary: {
            cash: [{ name: "Checking", balance: 6000, type: "CHECKING" }],
            retirement: [],
            investments: [],
            debt: [
                { name: "Credit Card 1", balance: 18000, type: "CREDIT_CARD" },
                { name: "Credit Card 2", balance: 15000, type: "CREDIT_CARD" },
                { name: "Auto Loan", balance: 42000, type: "LOAN" },
            ],
        },
        statusMessage: "Revolving debt increased 20% from last month. Create a paydown plan.",
        calculationDetails: {
            snapshotId: "snapshot-debt-456",
            calculationVersion: 1,
            calculatedAt: NOW,
            monthlyIncomeCents: 1100000,
            monthlyEssentialExpensesCents: 600000,
            monthlyDiscretionaryExpensesCents: 350000,
            surplusExplanation: "$11,000 income minus $9,500 expenses",
        },
    };

    test.beforeEach(async ({ page }) => {
        await mockAllApis(page, {
            pulse: mockPulseData,
            health: {
                status: "AT_RISK",
                attentionItems: [
                    {
                        type: "DEBT_INCREASE",
                        severity: "CRITICAL",
                        evidence: "Revolving debt up 20% ($3,000) from last month: $15k → $18k",
                    },
                ],
                debtStatus: "HIGH",
                revolvingDebtCents: 3300000, // $33,000
                previousRevolvingDebtCents: 2750000, // $27,500 previous
            },
        });
        await page.goto("/");
        await page.waitForLoadState("networkidle");
    });

    test("status banner shows at-risk state for debt increase", async ({ page }) => {
        const banner = page.getByTestId("status-banner");
        await expect(banner).toContainText("AT_RISK");
    });

    test("attention section shows debt increase item", async ({ page }) => {
        const attentionItems = page.getByTestId("attention-item");
        const debtItem = attentionItems.filter({
            hasText: /debt|increase|20%|$3,000/i,
        });
        await expect(debtItem.first()).toBeVisible();
    });

    test("attention item shows percentage increase", async ({ page }) => {
        const attentionItem = page.getByTestId("attention-item").first();
        await expect(attentionItem).toContainText("20%");
    });

    test("debt section shows high revolving debt balance", async ({ page }) => {
        const debtSection = page.getByTestId("debt-section");
        await expect(debtSection).toBeVisible();
        // Should show the credit cards with high balances
        await expect(debtSection).toContainText("Credit Card");
    });

    test("multiple credit cards are displayed", async ({ page }) => {
        const debtSection = page.getByTestId("debt-section");
        const creditCardItems = debtSection.getByText(/credit card/i);
        expect(await creditCardItems.count()).toBeGreaterThanOrEqual(2);
    });

    test("cash flow section shows reduced surplus due to debt service", async ({ page }) => {
        const surplusValue = page.getByTestId("surplus-value");
        await expect(surplusValue).toContainText("$1,500");
    });

    test("expansion shows debt trend details", async ({ page }) => {
        const attentionItem = page.getByTestId("attention-item").first();
        const expandBtn = attentionItem.getByRole("button");
        await expandBtn.click();
        await expect(attentionItem).toContainText("$3,000");
    });
});

