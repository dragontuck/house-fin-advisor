/**
 * E2E tests for Statement Upload feature
 * Tests: successful upload, processing states, errors, review required
 */

import { test, expect } from "@playwright/test";

// Mock API responses
const mockUploadResponse = {
    id: "doc-123",
    correlationId: "corr-123",
    objectStorageKey: "uploads/doc-123",
    status: "UPLOADED",
    message: "Document uploaded successfully",
};

const mockProcessingStatus = {
    id: "doc-123",
    fileName: "statement.csv",
    sourceType: "CSV",
    processingStatus: "VALIDATING",
    uploadedAt: new Date().toISOString(),
    processedAt: null,
    errorCode: null,
    errorMessageUser: null,
};

test.describe("Statement Upload", () => {
    test.beforeEach(async ({ page }) => {
        // Mock the financial pulse API
        await page.route("**/api/financial-pulse", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    householdId: "test-household",
                    householdName: "Test Household",
                    asOf: new Date().toISOString(),
                    healthStatus: "HEALTHY",
                    healthMessage: "All good",
                    keyMetrics: {
                        netWorth: 100000,
                        cashAvailable: 10000,
                        monthlyIncome: 5000,
                        monthlyExpenses: 3000,
                        monthlySurplus: 2000,
                        totalDebt: 50000,
                    },
                    accountsSummary: {
                        cash: [],
                        retirement: [],
                        investments: [],
                        debt: [],
                    },
                }),
            });
        });

        // Navigate to app
        await page.goto("/");

        // Wait for app to load
        await page.waitForSelector(".app");

        // Click "Add Statement" button to show upload
        const addButton = page.locator(".btn-add-statement");
        await addButton.click();

        // Wait for upload component to appear
        await page.waitForSelector(".statement-upload-container");
    });

    test("should show upload interface with drag-drop and file picker", async ({ page }) => {
        // Verify upload box is visible
        const uploadBox = page.locator(".upload-box");
        await expect(uploadBox).toBeVisible();

        // Verify key elements
        await expect(page.locator(".upload-icon")).toContainText("📄");
        await expect(page.locator(".upload-box h2")).toContainText("Add a Statement");
        await expect(page.locator(".upload-description")).toContainText("Drag and drop");

        // Verify file picker button exists
        const chooseButton = page.locator("button:has-text('Choose File')");
        await expect(chooseButton).toBeVisible();

        // Verify supported formats are shown
        await expect(page.locator(".upload-formats")).toContainText("CSV, PDF, PNG, JPEG, TIFF");
    });

    test("should upload CSV and show processing", async ({ page }) => {
        // Mock the upload endpoint
        await page.route("**/api/documents/upload", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockUploadResponse),
            });
        });

        // Mock the status polling endpoint
        await page.route("**/api/documents/doc-123", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockProcessingStatus),
            });
        });

        const csvContent = "Date,Description,Amount\n2026-01-25,Deposit,1000.00\n";
        const fileBuffer = Buffer.from(csvContent);
        const fileInput = page.locator('input[type="file"]');

        await fileInput.setInputFiles({
            name: "statement.csv",
            mimeType: "text/csv",
            buffer: fileBuffer,
        });

        // Should show uploading progress
        await expect(page.locator(".status-box")).toBeVisible();
        await expect(page.locator("h2")).toContainText("Uploading Statement");

        // Wait for processing state
        await expect(page.locator(".spinner")).toBeVisible({ timeout: 5000 });

        // Verify file name is displayed
        await expect(page.locator(".file-name")).toContainText("statement.csv");
    });

    test("should show error for unsupported file type", async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const buffer = Buffer.from("some content");

        await fileInput.setInputFiles({
            name: "invalid.exe",
            mimeType: "application/x-msdownload",
            buffer,
        });

        // Wait for error state
        await expect(page.locator(".status-box.error")).toBeVisible({ timeout: 3000 });

        // Verify error box is displayed
        const errorBox = page.locator(".status-box.error");
        await expect(errorBox).toBeVisible();

        // Should show "Try Another File" button
        const tryAgainButton = page.locator('button:has-text("Try Another File")');
        await expect(tryAgainButton).toBeVisible();
    });

    test("should allow retry after error", async ({ page }) => {
        const fileInput = page.locator('input[type="file"]');
        const buffer = Buffer.from("content");

        // First upload (invalid)
        await fileInput.setInputFiles({
            name: "invalid.exe",
            mimeType: "application/x-msdownload",
            buffer,
        });

        // Wait for error
        await expect(page.locator(".status-box.error")).toBeVisible({ timeout: 3000 });

        // Click retry
        const tryAgainButton = page.locator('button:has-text("Try Another File")');
        await tryAgainButton.click();

        // Should show upload box again
        await expect(page.locator(".upload-box")).toBeVisible({ timeout: 3000 });
    });

    test("should handle PDF upload", async ({ page }) => {
        // Mock the upload endpoint
        await page.route("**/api/documents/upload", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockUploadResponse),
            });
        });

        const pdfContent = "%PDF-1.4\n%mock pdf content\n";
        const fileBuffer = Buffer.from(pdfContent);
        const fileInput = page.locator('input[type="file"]');

        await fileInput.setInputFiles({
            name: "statement.pdf",
            mimeType: "application/pdf",
            buffer: fileBuffer,
        });

        // Should show uploading state
        await expect(page.locator("h2")).toContainText("Uploading Statement");
    });

    test("should handle PNG upload", async ({ page }) => {
        // Mock the upload endpoint
        await page.route("**/api/documents/upload", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockUploadResponse),
            });
        });

        const pngContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        const fileInput = page.locator('input[type="file"]');

        await fileInput.setInputFiles({
            name: "statement.png",
            mimeType: "image/png",
            buffer: pngContent,
        });

        // Should show uploading state
        await expect(page.locator("h2")).toContainText("Uploading Statement");
    });

    test("should hide upload when toggle is clicked", async ({ page }) => {
        // Upload should be visible
        await expect(page.locator(".statement-upload-container")).toBeVisible();

        // Click toggle to hide
        const toggleButton = page.locator(".btn-add-statement");
        await toggleButton.click();

        // Upload should be hidden
        await expect(page.locator(".statement-upload-container")).not.toBeVisible();
    });

    test("should show progress bar during upload", async ({ page }) => {
        // Mock the upload endpoint
        await page.route("**/api/documents/upload", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockUploadResponse),
            });
        });

        const csvContent = "Date,Description,Amount\n";
        const fileBuffer = Buffer.from(csvContent);
        const fileInput = page.locator('input[type="file"]');

        await fileInput.setInputFiles({
            name: "statement.csv",
            mimeType: "text/csv",
            buffer: fileBuffer,
        });

        // Progress bar should be visible
        await expect(page.locator(".progress-bar")).toBeVisible();
        await expect(page.locator(".progress-fill")).toBeVisible();
    });

    test("should display file name throughout upload", async ({ page }) => {
        // Mock the upload endpoint
        await page.route("**/api/documents/upload", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockUploadResponse),
            });
        });

        // Mock the status endpoint
        await page.route("**/api/documents/doc-123", (route) => {
            route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockProcessingStatus),
            });
        });

        const csvContent = "Date,Description,Amount\n";
        const fileBuffer = Buffer.from(csvContent);
        const fileInput = page.locator('input[type="file"]');
        const fileName = "test-statement.csv";

        await fileInput.setInputFiles({
            name: fileName,
            mimeType: "text/csv",
            buffer: fileBuffer,
        });

        // File name should appear
        await expect(page.locator(".file-name")).toContainText(fileName);
    });
});
