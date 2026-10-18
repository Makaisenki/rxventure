import { expect, test } from '@playwright/test';

test('starts a role-specific dungeon run', async ({ page }) => {
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/question-bank', (route) => route.fulfill({ json: { bank: { id: 'bank-test', data: null } } }));
  await page.route('**/api/branches', (route) => route.fulfill({ json: { branches: [{ id: 'branch-test', name: 'North Branch', position: 0 }] } }));
  await page.route('**/api/attempts', async (route) => { attempts.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { ok: true } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: /RxVenture/i })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByRole('button', { name: /Start quest/i }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByRole('button', { name: /Choose your role/i }).click();
  await expect(page.getByRole('heading', { name: 'Select your Branch' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByLabel('Branch').selectOption('branch-test');
  await page.getByRole('button', { name: /Continue to character selection/i }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await page.screenshot({ path: '.logs/qa-roles.png', fullPage: true });
  await page.getByRole('button', { name: 'Pharmacist' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'ambience');
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await expect(page.locator('.question-scroll')).toBeVisible();
  await expect(page.getByText(/Floor 1 · 1\/30/)).toBeVisible();
  await expect(page.locator('.door')).toHaveCount(4);
  const layout = await page.evaluate(() => {
    const question = document.querySelector('.question-wrap')!.getBoundingClientRect();
    const firstDoor = document.querySelector('.door')!.getBoundingClientRect();
    return { questionBottom: question.bottom, firstDoorTop: firstDoor.top };
  });
  expect(layout.firstDoorTop).toBeGreaterThan(layout.questionBottom + 16);
  expect(layout.firstDoorTop).toBeLessThan(layout.questionBottom + 50);
  const columnCount = await page.locator('.doors').evaluate((doors) =>
    getComputedStyle(doors).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(columnCount).toBe(4);
  const inactiveHeartStyle = await page.locator('.heart').last().evaluate((heart) => {
    heart.classList.replace('heart-active', 'heart-empty');
    const style = getComputedStyle(heart);
    return { text: heart.textContent, color: style.color, textFill: style.webkitTextFillColor };
  });
  expect(inactiveHeartStyle.text).toContain('♥︎');
  expect(inactiveHeartStyle.color).toBe('rgb(104, 113, 128)');
  expect(inactiveHeartStyle.textFill).toBe('rgb(104, 113, 128)');
  await page.evaluate(() => {
    document.body.classList.add('contrast');
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const contrastPortrait = await page.locator('.player-portrait').evaluate((portrait) => {
    const rect = portrait.getBoundingClientRect();
    return { position: getComputedStyle(portrait).position, bottom: rect.bottom, viewportHeight: window.innerHeight };
  });
  expect(contrastPortrait.position).toBe('fixed');
  expect(contrastPortrait.bottom).toBeGreaterThan(contrastPortrait.viewportHeight - 16);
  expect(contrastPortrait.bottom).toBeLessThanOrEqual(contrastPortrait.viewportHeight);
  await page.locator('[data-pause]').click();
  await expect(page.locator('.pause')).toHaveClass(/show/);
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Unmute sound' })).toBeVisible();
  await expect(page.locator('.door').first()).toBeDisabled();
  await page.locator('.door').first().evaluate((door) => door.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.locator('.door.expanded')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.door').first()).toBeEnabled();
  await page.locator('.door').first().click();
  await expect(page.locator('.door.expanded')).toHaveCount(1);
  await page.locator('.door').first().click();
  await expect.poll(() => attempts.length).toBe(1);
  expect(attempts[0]).toMatchObject({ bankId: 'bank-test', branchId: 'branch-test', role: 'Pharmacist' });
  expect(attempts[0]).not.toHaveProperty('name');
  await page.screenshot({ path: '.logs/qa-gameplay.png', fullPage: true });
});

test('requires an active branch before character selection', async ({ page }) => {
  await page.route('**/api/question-bank', (route) => route.fulfill({ json: { bank: { id: 'bank-test', data: null } } }));
  await page.route('**/api/branches', (route) => route.fulfill({ json: { branches: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Start quest/i }).click();
  await page.getByRole('button', { name: /Choose your role/i }).click();
  await expect(page.getByText(/No active branches have been configured/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pharmacist' })).toHaveCount(0);
});

test('shows protected branch management and active-bank insights', async ({ page }) => {
  await page.route('**/api/admin/branches', (route) => route.fulfill({ json: { branches: [{ id: 'branch-test', name: 'North Branch', position: 0, active: true }] } }));
  await page.route('**/api/admin/insights', (route) => route.fulfill({ json: { bankId: 'bank-test', minimumAttempts: 5, questions: [{ id: 'q-1', category: 'Safety', prompt: 'Which action is safest?', attempts: 7, incorrect: 4, incorrectRate: 4 / 7, branches: [{ id: 'branch-test', name: 'North Branch', attempts: 3, incorrect: 2, incorrectRate: null }] }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => sessionStorage.setItem('rxventure-admin-token', 'test-token'));
  await page.getByRole('button', { name: 'Administration' }).click();
  await page.getByRole('button', { name: 'Manage branches' }).click();
  await expect(page.getByRole('heading', { name: 'Manage branches' })).toBeVisible();
  await expect(page.getByText('North Branch')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Learning insights & export' }).click();
  await expect(page.getByRole('heading', { name: 'Learning insights' })).toBeVisible();
  await page.getByRole('button', { name: /4\/7 incorrect/i }).click();
  await expect(page.getByText('Hidden until 5 attempts')).toBeVisible();
});

test('opens title-screen accessibility settings', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chrome', 'The touch gameplay flow is already covered on the mobile profile.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Quest Settings' })).toBeVisible();
  await expect(page.locator('.ui-layer')).toHaveCSS('background-color', 'rgb(8, 27, 57)');
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
  await page.getByLabel(/High contrast/i).check();
  await expect(page.locator('body')).toHaveClass(/contrast/);
});

test('keeps the menu BGM active on the leaderboard', async ({ page }) => {
  await page.route('**/api/leaderboard**', (route) => route.fulfill({ json: { entries: [{ name: 'Ari', branch: 'North Branch', score: 2500, at: 0 }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByRole('heading', { name: 'Hall of Prestige' })).toBeVisible();
  await expect(page.locator('.leaderboard-content .eyebrow')).toHaveCount(0);
  await expect(page.getByText('Branch', { exact: true })).toBeVisible();
  await expect(page.getByText('North Branch')).toBeVisible();
  await expect.poll(async () => page.locator('#score-list li').count()).toBe(1);
  const columns = await page.locator('.leaderboard-content').evaluate((content) => {
    const headers = [...content.querySelectorAll<HTMLElement>('.score-columns span')];
    const cells = [...content.querySelectorAll<HTMLElement>('#score-list li > *')];
    return headers.map((header, index) => ({ headerLeft: header.getBoundingClientRect().left, cellLeft: cells[index].getBoundingClientRect().left, headerRight: header.getBoundingClientRect().right, cellRight: cells[index].getBoundingClientRect().right }));
  });
  columns.forEach((column) => { expect(Math.abs(column.headerLeft - column.cellLeft)).toBeLessThanOrEqual(3); expect(Math.abs(column.headerRight - column.cellRight)).toBeLessThanOrEqual(3); });
  await expect(page.locator('body')).toHaveAttribute('data-music-scope', 'menu');
});

test('keeps the navy title backdrop when the menu scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 400 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
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
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('administrator can preview and leave the high-score page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => sessionStorage.setItem('rxventure-admin-token', 'test-token'));
  await page.getByRole('button', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
  await page.getByRole('button', { name: 'Open high-score page' }).click();
  await expect(page.getByRole('heading', { name: 'You found the sacred treasure!' })).toBeVisible();
  await expect(page.getByLabel(/Enter your adventurer nickname/i)).toBeVisible();
  await expect(page.locator('.victory')).toHaveCSS('background-image', /treasure-vault-background\.png/);
  await page.screenshot({ path: '.logs/qa-victory-vault.png', fullPage: true });
  await page.getByRole('button', { name: /Return to administrator/i }).click();
  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible();
});

test('administrator can clear learning insights separately from leaderboards', async ({ page }) => {
  let deleteRequested = false;
  await page.route('**/api/admin/insights', (route) => { deleteRequested = route.request().method() === 'DELETE'; return route.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => sessionStorage.setItem('rxventure-admin-token', 'test-token'));
  await page.getByRole('button', { name: 'Administration' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear all learning insights data' }).click();
  await expect.poll(() => deleteRequested).toBe(true);
});
