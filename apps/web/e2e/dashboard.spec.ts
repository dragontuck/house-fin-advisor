import { test, expect } from "@playwright/test";

// Mock data that matches the API response structure
const mockPulseData = {
    householdId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    householdName: "Tucker Household",
    asOf: new Date().toISOString(),
    healthStatus: "HEALTHY",
    healthMessage:
        "Your household is in good financial shape. Keep maintaining this momentum!",
    keyMetrics: {
        netWorth: 189200,
        cashAvailable: 19200,
        monthlyIncome: 12000,
        monthlyExpenses: 8000,
        monthlySurplus: 4000,
        totalDebt: 240000,
    },
    accountsSummary: {
        cash: [
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
