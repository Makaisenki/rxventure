import { expect, test } from '@playwright/test';

test('starts a role-specific dungeon run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /RxVenture/i })).toBeVisible();
  await page.getByRole('button', { name: /Start quest/i }).click();
  await page.getByRole('button', { name: /Choose your role/i }).click();
  await page.screenshot({ path: '.logs/qa-roles.png', fullPage: true });
  await page.getByRole('button', { name: 'Pharmacist' }).click();
  await expect(page.locator('.question-scroll')).toBeVisible();
  await expect(page.locator('.door')).toHaveCount(4);
  await page.locator('.door').first().click();
  await expect(page.locator('.door.expanded')).toHaveCount(1);
  await page.screenshot({ path: '.logs/qa-gameplay.png', fullPage: true });
});

test('opens title-screen accessibility settings', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chrome', 'The touch gameplay flow is already covered on the mobile profile.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: /Make the dungeon yours/i })).toBeVisible();
  await page.getByLabel(/High contrast/i).check();
  await expect(page.locator('body')).toHaveClass(/contrast/);
});

test('opens administrator sign-in with one click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});
