import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function join(context: BrowserContext, code: string, nickname: string) {
  const page = await context.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join the room' }).click();
  await expect(page).toHaveURL(/\/room\//);
  return page;
}

async function makePicks(page: Page) {
  await page.getByLabel('Find a title').fill('Dune');
  const posters = page.locator('.poster-grid').last().locator('button.poster-choice');
  await expect(posters.first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => posters.count()).toBeGreaterThan(1);
  await posters.nth(0).click();
  await page.getByRole('button', { name: /^Pick 1:/ }).click();
  await posters.nth(1).click();
  await page.getByRole('button', { name: /^Pick 2:/ }).click();
  await page.getByRole('button', { name: 'Lock in both picks' }).click();
}

test('nominations keep picks pinned and contenders private by default', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Create a Room' }).click();
  const code = (await host.locator('.room-code').first().textContent())!.trim();
  const guest = await join(guestContext, code, 'Private Picker');

  await host.getByRole('button', { name: 'Start nomination timer' }).click();
  await expect(host.locator('.nomination-dock')).toBeVisible();
  await expect(guest.locator('.nomination-dock')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Connect my Plex' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Connect my Plex' })).toBeVisible();

  await Promise.all([makePicks(host), makePicks(guest)]);
  await host.getByRole('button', { name: 'Reveal now' }).click();

  await expect(host.getByRole('heading', { name: 'Keep the lineup a surprise' })).toBeVisible();
  await expect(host.getByText('Host preview: reveal submitted titles')).toBeVisible();
  await expect(guest.getByText('Host preview: reveal submitted titles')).toHaveCount(0);
  await expect(host.locator('.contender-preview')).toBeHidden();
  await host.getByText('Host preview: reveal submitted titles').click();
  await expect(host.locator('.contender-preview')).toBeVisible();

  await Promise.all([hostContext.close(), guestContext.close()]);
});
