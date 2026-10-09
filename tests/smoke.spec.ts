import { expect, test } from '@playwright/test';

test('starts a role-specific dungeon run', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /RxVenture/i })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByRole('button', { name: /Start quest/i }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByRole('button', { name: /Choose your role/i }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await page.screenshot({ path: '.logs/qa-roles.png', fullPage: true });
  await page.getByRole('button', { name: 'Pharmacist' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'ambience');
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await expect(page.locator('.question-scroll')).toBeVisible();
  await expect(page.locator('.door')).toHaveCount(4);
  const columnCount = await page.locator('.doors').evaluate((doors) =>
    getComputedStyle(doors).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(columnCount).toBe(4);
  await page.locator('.door').first().click();
  await expect(page.locator('.door.expanded')).toHaveCount(1);
  await page.screenshot({ path: '.logs/qa-gameplay.png', fullPage: true });
});

test('opens title-screen accessibility settings', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chrome', 'The touch gameplay flow is already covered on the mobile profile.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Quest Settings' })).toBeVisible();
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await page.getByLabel(/High contrast/i).check();
  await expect(page.locator('body')).toHaveClass(/contrast/);
});

test('keeps the navy title backdrop when the menu scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 400 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/title-page/);
  const state = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return {
      scrollY: window.scrollY,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      layerBackground: getComputedStyle(document.querySelector('.ui-layer')!).backgroundColor,
    };
  });
  expect(state.scrollY).toBeGreaterThan(0);
  expect(state.bodyBackground).toBe('rgb(8, 27, 57)');
  expect(state.layerBackground).toBe('rgb(8, 27, 57)');
  await page.screenshot({ path: '.logs/qa-title-scroll-backdrop.png', fullPage: true });
});

test('keeps the maroon administrator backdrop when content scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 400 });
  await page.goto('/');
  await page.locator('.ui-layer').waitFor();
  const state = await page.evaluate(() => {
    document.body.classList.add('admin-page');
    const layer = document.querySelector<HTMLElement>('.ui-layer')!;
    layer.innerHTML = '<section class="panel admin" style="min-height: 1100px">Administrator preview</section>';
    window.scrollTo(0, document.documentElement.scrollHeight);
    return {
      scrollY: window.scrollY,
      panelBackground: getComputedStyle(layer.querySelector('.panel')!).backgroundColor,
      layerBackground: getComputedStyle(layer).backgroundImage,
    };
  });
  expect(state.scrollY).toBeGreaterThan(0);
  expect(state.panelBackground).toBe('rgba(0, 0, 0, 0)');
  expect(state.layerBackground).toContain('linear-gradient');
  await page.screenshot({ path: '.logs/qa-admin-scroll-backdrop.png', fullPage: true });
});

test('opens administrator sign-in with one click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('administrator can preview and leave the high-score page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('rxventure-admin-token', 'test-token'));
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
  await page.getByRole('button', { name: 'Open high-score page' }).click();
  await expect(page.getByRole('heading', { name: 'You found the sacred treasure!' })).toBeVisible();
  await expect(page.getByLabel(/Enter your adventurer nickname/i)).toBeVisible();
  await page.getByRole('button', { name: /Return to administrator/i }).click();
  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
});
