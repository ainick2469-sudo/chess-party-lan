import { expect, test } from '@playwright/test';

test('host, join, theme sync, and play through checkmate', async ({ browser, page }) => {
  const guest = await browser.newPage();

  await page.goto('/');
  await page.getByRole('button', { name: 'Host Game' }).click();
  await expect(page.getByText(/Code \d{4}/)).toBeVisible();

  const roomLabel = await page.getByText(/Code \d{4}/).textContent();
  const roomCode = roomLabel?.match(/\d{4}/)?.[0];
  expect(roomCode).toBeTruthy();

  await guest.goto('/');
  await guest.getByLabel('4-digit room code').fill(roomCode!);
  await guest.getByRole('button', { name: 'Join Game' }).click();

  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.render_game_to_text())).mode).toBe('lobby');
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
  await expect(page.getByText('You are Light side.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go Fullscreen' })).toBeVisible();

  await page.locator('.prompt-card--compact').getByRole('button', { name: 'Not now' }).click();

  await expect.poll(async () => {
    await page.evaluate(() => window.debug_click_square('e7'));
    return JSON.parse(await page.evaluate(() => window.render_game_to_text())).selectedSquare;
  }).toBe(null);
  await page.getByRole('button', { name: 'That piece belongs to the Dark side.' }).click();
  await expect.poll(async () => {
    await page.evaluate(() => window.debug_click_square('f2'));
    return JSON.parse(await page.evaluate(() => window.render_game_to_text())).selectedSquare;
  }).toBe('f2');

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
