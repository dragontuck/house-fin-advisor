import { test, expect } from "@playwright/test";

const pulse = {
    householdId: "household-1",
    householdName: "Tucker Household",
    asOf: "2026-09-11T00:00:00.000Z",
    healthStatus: "HEALTHY",
    healthMessage: "Your finances look healthy.",
    keyMetrics: {
        netWorth: 189200,
        cashAvailable: 19200,
        monthlyIncome: 12000,
        monthlyExpenses: 8000,
        monthlySurplus: 4000,
        totalDebt: 240000,
    },
    accountsSummary: { cash: [], retirement: [], investments: [], debt: [] },
    statusMessage: "Current",
};

test("shows a challengeable recommendation and reframes only its explanation", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;

        if (request.method() === "GET" && path.endsWith("/financial-pulse")) {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pulse) });
            return;
        }
        if (request.method() === "GET") {
            await route.abort();
            return;
        }
        if (path.endsWith("/conversations")) {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "conversation-1" }) });
            return;
        }
        if (path.endsWith("/messages")) {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    userMessageId: "message-1",
                    intent: "AFFORDABILITY",
                    availableTools: [{ name: "simulate_purchase", description: "Run scenario" }],
                    out_of_scope: false,
                }),
            });
            return;
        }
        if (path.endsWith("/orchestrate")) {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    messageId: "message-2",
                    assistantMessage: "Wait two months before starting the project. This keeps more cash available for unexpected expenses.",
                    mode: "SCENARIO",
                    success: true,
                    retryable: false,
                    metadata: { workflowType: "AFFORDABILITY", toolsExecuted: 1, totalDurationMs: 10 },
                    toolResults: [{
                        friendlyActivity: "Running the numbers on this purchase...",
                        success: true,
                        durationMs: 8,
                        data: {
                            cashAfterCents: 1520000,
                            emergencyFundMonths: 4.2,
                            recommendations: ["Start now with a smaller project scope."],
                            evidence: [{
                                claim: "Emergency savings should remain available for unplanned expenses.",
                                sourceName: "Consumer Financial Protection Bureau",
                                sourceUrl: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/",
                                retrievalDate: "2026-09-10T00:00:00.000Z",
                            }],
                        },
                    }],
                }),
            });
            return;
        }
        await route.abort();
    });

    await page.goto("/");
    await page.getByPlaceholder("What would you like help with?").fill("Can we afford the kitchen project?");
    await page.getByRole("button", { name: "Ask" }).click();

    const recommendation = page.locator(".recommendation-experience");
    await expect(recommendation).toContainText("Recommendation");
    await expect(recommendation).toContainText("Why");
    await expect(recommendation).toContainText("Financial Impact");
    await expect(recommendation).toContainText("What I Considered");
    await expect(recommendation).toContainText("Assumptions");
    await expect(recommendation).toContainText("Risks");
    await expect(recommendation).toContainText("Evidence");
    await expect(recommendation.getByRole("link", { name: "Consumer Financial Protection Bureau" }))
        .toHaveAttribute("href", /consumerfinance\.gov/);
    await expect(recommendation).toContainText("Retrieved Sep 10, 2026");
    await expect(recommendation).toContainText("Independently checked");
    await expect(recommendation).toContainText("Confidence");
    await expect(recommendation).toContainText("Advisor Style: Retirement Planning");

    const originalImpact = await recommendation.locator(".recommendation-impact-grid").textContent();
    await recommendation.locator("select").selectOption("family");
    await expect(recommendation).toContainText("Advisor Style: Family Planning");
    await expect(recommendation).toContainText("From a household-planning perspective");
    await expect(recommendation.locator(".recommendation-impact-grid")).toHaveText(originalImpact ?? "");

    await recommendation.getByRole("button", { name: "Show validation details" }).click();
    await expect(recommendation).toContainText("The supporting financial tools completed successfully.");
});
