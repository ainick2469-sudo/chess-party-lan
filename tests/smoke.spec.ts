import { expect, test } from '@playwright/test';

test('public lobby flow supports join pin, reconnect, theme sync, and checkmate', async ({ browser, page }) => {
  const guest = await browser.newPage();

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Display name' }).first().fill('Nick');
  await page.getByRole('textbox', { name: 'Lobby title' }).fill("Nick's Night Chess");
  await page.getByRole('button', { name: 'Create Lobby' }).click();

  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode).toBe('lobby');
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).hostJoinPin).toMatch(/^\d{4}$/);
  const hostPin = JSON.parse(await page.evaluate(() => window.render_game_to_text())).hostJoinPin as string;

  await guest.goto('/');
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).visibleLobbies.length).toBeGreaterThanOrEqual(1);
  await guest.locator('.lobby-row', { hasText: "Nick's Night Chess" }).first().click({ force: true });
  await guest.getByRole('textbox', { name: 'Display name' }).nth(1).fill('Guest');
  await guest.getByRole('textbox', { name: '4-digit join PIN' }).fill('0000');
  await guest.getByRole('button', { name: 'Join Selected Lobby' }).click();
  await expect(guest.getByRole('button', { name: /does not unlock this lobby/i })).toBeVisible();
  await guest.getByRole('button', { name: /does not unlock this lobby/i }).click();

  await guest.getByRole('textbox', { name: '4-digit join PIN' }).fill(hostPin);
  await guest.getByRole('button', { name: 'Join Selected Lobby' }).click();
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).mode).toBe('lobby');

  await guest.reload();
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).mode).toBe('lobby');
  await expect(page.locator('.player-card')).toHaveCount(2);

  await page.locator('select').nth(4).selectOption('neon');
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).boardTheme).toBe('neon');

  await page.getByRole('button', { name: 'Ready Up' }).click();
  await guest.getByRole('button', { name: 'Ready Up' }).click();
  await page.getByRole('button', { name: 'Start Match' }).click();

  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode).toBe('playing');
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).mode).toBe('playing');
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).localSeat).toBe('white');
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).localSeat).toBe('black');

  await dismissFullscreenPrompt(page);
  await guest.reload();
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).mode).toBe('playing');
  await expect.poll(async () => JSON.parse(await guest.evaluate(() => window.render_game_to_text())).localSeat).toBe('black');
  await dismissFullscreenPrompt(guest);

  await expect.poll(async () => {
    await page.evaluate(() => window.debug_click_square('e7'));
    return JSON.parse(await page.evaluate(() => window.render_game_to_text())).selectedSquare;
  }).toBe(null);
  await page.getByRole('button', { name: 'That piece belongs to the Dark side.' }).click();

  await debugMove(page, 'f2', 'f3', 'black');
  await debugMove(guest, 'e7', 'e5', 'white');
  await debugMove(page, 'g2', 'g4', 'black');
  await debugMove(guest, 'd8', 'h4', 'white');

  await expect(page.getByText(/wins by checkmate/i).first()).toBeVisible();

  await guest.close();
});

async function debugMove(page: import('@playwright/test').Page, from: string, to: string, expectedNextTurn: 'white' | 'black') {
  await expect.poll(async () => {
    await page.evaluate((square) => window.debug_click_square(square), from);
    return JSON.parse(await page.evaluate(() => window.render_game_to_text())).selectedSquare;
  }).toBe(from);

  await page.evaluate((square) => window.debug_click_square(square), to);
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).selectedSquare).toBe(null);
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).turn).toBe(expectedNextTurn);
}

async function dismissFullscreenPrompt(page: import('@playwright/test').Page) {
  const prompt = page.locator('.prompt-card--compact');
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole('button', { name: 'Not now' }).click();
  }
}
