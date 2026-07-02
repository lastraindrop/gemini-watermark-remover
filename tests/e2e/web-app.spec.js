import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('loads production UI and exposes supported controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/Watermark Studio/);
    await expect(page.locator('#profileSelect')).toHaveValue('gemini');
    await expect(page.locator('#profileSelect option')).toHaveCount(3);
    await expect(page.locator('#versionDisplay')).toContainText('v2.7.1');

    await page.locator('#toggleAdvancedBtn').click();
    await expect(page.locator('#advancedPanel')).toBeVisible();
    await page.locator('label:has(#manualModeToggle)').click();
    await expect(page.locator('#manualModeToggle')).toBeChecked();
    await expect(page.locator('#manualCoords')).not.toHaveClass(/pointer-events-none/);

    expect(errors).toEqual([]);
});

test('uploads and processes a reported Gemini fixture end to end', async ({ page }) => {
    await page.goto('/');
    const fixture = path.join(root, 'sample', 'error', 'Gemini_Generated_Image_6ndho06ndho06ndh.png');

    await page.locator('#fileInput').setInputFiles(fixture);
    await expect(page.locator('.gwr-image-card')).toHaveCount(1);
    const status = page.locator('[id^="status-"]');
    await expect(status).not.toHaveText(/PROCESSING/i, { timeout: 120000 });
    await expect(status).not.toHaveText(/FAILED/i);

    const compare = page.locator('[id^="compare-"]');
    await expect(compare).toHaveAttribute('aria-pressed', 'false');
    await compare.click();
    await expect(compare).toHaveAttribute('aria-pressed', 'true');
    await compare.click();
    await expect(compare).toHaveAttribute('aria-pressed', 'false');
});

test('mobile viewport has no horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.locator('#chooseFileBtn')).toBeVisible();
});
