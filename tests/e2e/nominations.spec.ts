import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const captureDocs = process.env.CAPTURE_DOCS === '1';

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
  await expect(posters.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Pick 1:/ }).click();
  await posters.nth(1).click();
  await expect(posters.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Pick 2:/ }).click();
  await expect(page.getByRole('button', { name: /^Pick 2:(?! empty)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Lock in both picks' }).click();
}

test('nominations keep picks pinned and contenders private by default', async ({ browser }) => {
  test.setTimeout(120_000);
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
  if (captureDocs) await host.screenshot({ path: 'docs/assets/demo-nominations.png', fullPage: true });
  await host.getByRole('button', { name: 'Reveal now' }).click();

  await expect(host.getByRole('heading', { name: 'Keep the lineup a surprise' })).toBeVisible();
  await expect(host.getByText('Host preview: reveal submitted titles')).toBeVisible();
  await expect(guest.getByText('Host preview: reveal submitted titles')).toHaveCount(0);
  await expect(host.locator('.contender-preview')).toBeHidden();
  await host.getByText('Host preview: reveal submitted titles').click();
  await expect(host.locator('.contender-preview')).toBeVisible();

  await host.getByRole('button', { name: 'Build bracket and begin' }).click();
  await expect(host.getByText('Matchup incoming. Voting opens when the intro completes.')).toBeVisible({ timeout: 15_000 });
  await host.getByRole('button', { name: 'Skip presentation' }).click();
  await expect(host.getByText('Tap a poster, then lock it in.')).toBeVisible();
  await expect(guest.getByText('Tap a poster, then lock it in.')).toBeVisible();
  if (captureDocs) await host.screenshot({ path: 'docs/assets/demo-voting.png', fullPage: true });

  for (let matchup = 1; matchup <= 9; matchup += 1) {
    await host.locator('button.matchup-poster-option').first().click();
    await guest.locator('button.matchup-poster-option').first().click();
    await host.getByRole('button', { name: 'Lock in pick' }).click();
    await expect(host.getByRole('button', { name: 'Pick locked in' })).toBeVisible();
    await guest.getByRole('button', { name: 'Lock in pick' }).click();
    await expect(host.getByText('advances')).toBeVisible({ timeout: 5_000 });
    await host.getByRole('button', { name: 'Skip presentation' }).click();
    if (matchup === 9) break;
    await expect(host.getByText('Matchup incoming. Voting opens when the intro completes.')).toBeVisible();
    await host.getByRole('button', { name: 'Skip presentation' }).click();
    await expect(host.getByText('Tap a poster, then lock it in.')).toBeVisible();
  }

  await expect(host.getByLabel('Tournament podium')).toBeVisible();
  await expect(host.locator('.podium-place')).toHaveCount(3);
  await expect(host.locator('.controller-confetti i')).toHaveCount(32);
  await expect(host.getByRole('link', { name: /Watch now on Plex|Open in Jellyseerr to request/ })).toBeVisible();
  if (captureDocs) await host.screenshot({ path: 'docs/assets/demo-winner.png', fullPage: true });

  await Promise.all([hostContext.close(), guestContext.close()]);
});
