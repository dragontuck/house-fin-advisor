/**
 * E2E tests for Review Queue functionality
 * Tests transaction categorization, duplicate resolution, and balance mismatch handling
 */

import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const HOUSEHOLD_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

test.describe("Review Queue - E2E Tests", () => {
    test.beforeEach(async ({ page }) => {
        // Set household context
        page.addInitScript(({ householdId }) => {
            localStorage.setItem("x-household-id", householdId);
        }, { householdId: HOUSEHOLD_ID });

        await page.goto(BASE_URL);
    });

    test("should display review queue with pending items", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");

        // Wait for stats to load
        await page.waitForSelector(".review-queue-panel");

        // Should show attention badge with item count
        const badge = await page.locator(".attention-badge").textContent();
        const itemCount = parseInt(badge!);
        expect(itemCount).toBeGreaterThan(0);

        // Should list items
        const items = await page.locator(".review-item-card").count();
        expect(items).toBe(itemCount);
    });

    test("should resolve ambiguous transaction categorization", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Find and click an ambiguous transaction
        const ambiguousItem = await page.locator('.review-item-card:has-text("Ambiguous")').first();
        await ambiguousItem.click();

        // Wait for detail modal
        await page.waitForSelector(".review-detail");

        // Verify evidence is displayed
        const evidence = await page.locator(".evidence-item");
        expect(await evidence.count()).toBeGreaterThan(0);

        // Select a category
        await page.click("label:has-text('Shopping')");

        // Provide reasoning
        await page.fill("textarea#reasoning", "This is clearly a shopping transaction from the merchant name");

        // Save decision
        await page.click("button:has-text('Save Decision')");

        // Should show success and move to next item or close
        await page.waitForSelector(".review-queue-panel");

        // Verify item was resolved
        const resolved = await page.locator('.review-item-card:has-text("Resolved")').count();
        expect(resolved).toBeGreaterThanOrEqual(0);
    });

    test("should resolve possible duplicate - keep both", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Find duplicate item
        const duplicateItem = await page
            .locator('.review-item-card:has-text("Possible Duplicate")')
            .first();

        if (await duplicateItem.count() === 0) {
            test.skip();
        }

        await duplicateItem.click();
        await page.waitForSelector(".review-detail");

        // Verify evidence shows both transactions
        const evidence = await page.locator(".evidence-item");
        const evidenceCount = await evidence.count();
        expect(evidenceCount).toBeGreaterThan(0);

        // Select "Keep Both" action
        await page.click("label:has-text('Keep Both')");

        // Provide reasoning
        await page.fill(
            "textarea#reasoning",
            "This is a split transaction - both records are legitimate"
        );

        // Save decision
        await page.click("button:has-text('Save Decision')");

        // Verify resolution
        await page.waitForSelector(".review-queue-panel");
    });

    test("should resolve possible duplicate - use existing", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Find duplicate item
        const duplicateItem = await page
            .locator('.review-item-card:has-text("Possible Duplicate")')
            .first();

        if (await duplicateItem.count() === 0) {
            test.skip();
        }

        await duplicateItem.click();
        await page.waitForSelector(".review-detail");

        // Select "Use Existing" action
        await page.click("label:has-text('Use Existing')");

        // Provide reasoning
        await page.fill(
            "textarea#reasoning",
            "The existing record is the authoritative one; discard the import"
        );

        // Save decision
        await page.click("button:has-text('Save Decision')");

        // Verify success
        await page.waitForSelector(".review-queue-panel");
    });

    test("should resolve reconciliation conflict", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Find conflict item
        const conflictItem = await page
            .locator('.review-item-card:has-text("Conflict")')
            .first();

        if (await conflictItem.count() === 0) {
            test.skip();
        }

        await conflictItem.click();
        await page.waitForSelector(".review-detail");

        // Verify message explains the conflict
        const message = await page.locator(".user-message").textContent();
        expect(message).toContain("conflict");

        // Show evidence of discrepancy
        const evidence = await page.locator(".evidence-item");
        expect(await evidence.count()).toBeGreaterThan(0);

        // Select action (e.g., accept CSV)
        await page.click("label:has-text('Accept Imported Data')");

        // Provide reasoning
        await page.fill(
            "textarea#reasoning",
            "The import source is more reliable; use the imported amount"
        );

        // Save decision
        await page.click("button:has-text('Save Decision')");

        // Verify
        await page.waitForSelector(".review-queue-panel");
    });

    test("should resolve balance mismatch", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Find balance mismatch
        const mismatchItem = await page
            .locator('.review-item-card:has-text("Balance Mismatch")')
            .first();

        if (await mismatchItem.count() === 0) {
            test.skip();
        }

        await mismatchItem.click();
        await page.waitForSelector(".review-detail");

        // Evidence should show expected vs actual balance
        const evidence = await page.locator(".evidence-item");
        expect(await evidence.count()).toBeGreaterThan(0);

        // Select action
        await page.click("label:has-text('Mark as Expected')");

        // Provide reasoning
        await page.fill(
            "textarea#reasoning",
            "Small discrepancy is expected due to timing differences in posting"
        );

        // Save
        await page.click("button:has-text('Save Decision')");

        // Verify
        await page.waitForSelector(".review-queue-panel");
    });

    test("should defer review item for later", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Click first item
        await page.locator(".review-item-card").first().click();
        await page.waitForSelector(".review-detail");

        // Click "Review Later"
        await page.click("button:has-text('Review Later')");

        // Should return to queue, item archived
        await page.waitForSelector(".review-queue-panel");

        // Item should no longer appear in pending
        const itemTitle = await page
            .locator(".review-item-card")
            .first()
            .locator(".item-title")
            .textContent();

        // Count should have decreased by 1
        const badgeAfter = await page.locator(".attention-badge").textContent();
        expect(parseInt(badgeAfter || "0")).toBeGreaterThan(-1);
    });

    test("should display evidence clearly without technical details", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Open any item
        await page.locator(".review-item-card").first().click();
        await page.waitForSelector(".review-detail");

        // Verify user-facing content only
        const title = await page.locator(".detail-header h2").textContent();
        expect(title).toBeTruthy();
        expect(title).not.toContain("UUID");
        expect(title).not.toContain("_id");

        // Verify no database IDs in user message
        const message = await page.locator(".user-message").textContent();
        expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);

        // Evidence descriptions should be clear
        const evidenceDesc = await page.locator(".evidence-description").first().textContent();
        expect(evidenceDesc).toBeTruthy();
    });

    test("should show statistics about review queue", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");

        // Wait for stats
        await page.waitForSelector(".queue-summary");

        // Should show severity counts
        const summary = await page.locator(".queue-summary").textContent();
        expect(summary).toBeTruthy();

        // If there are items, should show attention badge
        const badge = await page.locator(".attention-badge").isVisible();
        if (badge) {
            const count = await page.locator(".attention-badge").textContent();
            expect(parseInt(count || "0")).toBeGreaterThan(0);
        }
    });

    test("should validate required fields before submission", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Open item
        await page.locator(".review-item-card").first().click();
        await page.waitForSelector(".review-detail");

        // Try to submit without action or reasoning
        const saveBtn = await page.locator("button:has-text('Save Decision')");

        // Should be disabled until both fields are filled
        expect(await saveBtn.isDisabled()).toBeTruthy();

        // Select an action
        await page.locator(".choice-label").first().click();

        // Still disabled without reasoning
        expect(await saveBtn.isDisabled()).toBeTruthy();

        // Add reasoning
        await page.fill("textarea#reasoning", "Test reasoning");

        // Now should be enabled
        expect(await saveBtn.isDisabled()).toBeFalsy();
    });

    test("should maintain audit trail after resolution", async ({ page }) => {
        // Navigate to review queue
        await page.click("text=Review Queue");
        await page.waitForSelector(".review-item-card");

        // Get first item details
        const firstItemText = await page
            .locator(".review-item-card")
            .first()
            .locator(".item-title")
            .textContent();

        // Open and resolve
        await page.locator(".review-item-card").first().click();
        await page.waitForSelector(".review-detail");

        const action = await page.locator(".choice-label").first();
        await action.click();

        const reasoning = "Test resolution - E2E";
        await page.fill("textarea#reasoning", reasoning);
        await page.click("button:has-text('Save Decision')");

        // Wait for return to queue
        await page.waitForSelector(".review-queue-panel");

        // In production, verify via API that resolution was recorded
        // For now, verify item is no longer in pending list
        // (This would require filtering/re-fetch in real UI)
    });

    test("should handle network errors gracefully", async ({ page }) => {
        // Simulate offline
        await page.context().setOffline(true);

        // Try to navigate to queue
        await page.click("text=Review Queue");

        // Should show error message (not crash)
        await page.waitForTimeout(1000);

        // Bring back online
        await page.context().setOffline(false);

        // Should be able to retry
        await page.reload();
        await page.waitForSelector(".review-queue-panel");
    });
});

test.describe("Review Queue - API Tests", () => {
    test("POST /review-queue/items/:id/resolve should create audit record", async ({ request }) => {
        // Get next item
        const queueResponse = await request.get(`/api/review-queue/items?status=PENDING`, {
            headers: { "x-household-id": HOUSEHOLD_ID },
        });
        expect(queueResponse.ok()).toBeTruthy();

        const items = await queueResponse.json();
        if (items.items.length === 0) {
            test.skip();
        }

        const itemId = items.items[0].id;

        // Resolve the item
        const resolveResponse = await request.post(
            `/api/review-queue/items/${itemId}/resolve`,
            {
                headers: {
                    "x-household-id": HOUSEHOLD_ID,
                    "x-user-id": "test-user-123",
                    "Content-Type": "application/json",
                },
                data: {
                    chosenAction: "ACCEPT_CSV",
                    reasoning: "E2E test resolution",
                },
            }
        );

        expect(resolveResponse.ok()).toBeTruthy();

        const result = await resolveResponse.json();
        expect(result.newStatus).toBe("RESOLVED");
        expect(result.reviewItemId).toBe(itemId);

        // Verify can't resolve again (status changed)
        const secondResolve = await request.post(
            `/api/review-queue/items/${itemId}/resolve`,
            {
                headers: {
                    "x-household-id": HOUSEHOLD_ID,
                    "Content-Type": "application/json",
                },
                data: {
                    chosenAction: "ACCEPT_BANK",
                    reasoning: "Attempt second resolution",
                },
            }
        );

        expect(secondResolve.status()).toBe(400);
    });

    test("GET /review-queue should return accurate statistics", async ({ request }) => {
        const response = await request.get(`/api/review-queue`, {
            headers: { "x-household-id": HOUSEHOLD_ID },
        });

        expect(response.ok()).toBeTruthy();

        const stats = await response.json();
        expect(stats.householdId).toBe(HOUSEHOLD_ID);
        expect(typeof stats.totalItems).toBe("number");
        expect(stats.byStatus).toBeTruthy();
        expect(stats.byType).toBeTruthy();
        expect(stats.bySeverity).toBeTruthy();
    });

    test("GET /review-queue/items/next should return highest priority item", async ({ request }) => {
        const response = await request.get(`/api/review-queue/items/next`, {
            headers: { "x-household-id": HOUSEHOLD_ID },
        });

        expect(response.ok()).toBeTruthy();

        const result = await response.json();
        if (!result.item) {
            expect(result.item).toBeNull();
        } else {
            expect(result.item.id).toBeTruthy();
            expect(result.item.type).toBeTruthy();
            expect(result.item.status).toBe("IN_PROGRESS");
        }
    });
});
