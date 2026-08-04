import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { newAutomationContext, settleForScreenshot } from './visual';

const captureDocs = process.env.CAPTURE_DOCS === '1';

async function join(context: BrowserContext, code: string, nickname: string) {
  const page = await context.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join the room' }).click();
  await expect(page).toHaveURL(/\/room\//);
  return page;
}

async function makePicks(page: Page, query: string, secondQuery?: string) {
  const search = page.getByLabel('Search for a title');
  await search.fill(query);
  const posters = page.locator('.poster-grid').last().locator('button.poster-choice');
  await expect(posters.first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => posters.count()).toBeGreaterThan(1);
  await posters.nth(0).click();
  await expect(page.getByRole('button', { name: /^Pick 1:(?! empty)/ })).toBeVisible();
  if (secondQuery) {
    await search.fill(secondQuery);
    await expect(posters.first()).toContainText(secondQuery, { timeout: 15_000 });
    await posters.nth(0).click();
  } else {
    await posters.nth(1).click();
  }
  await expect(page.getByRole('button', { name: /^Pick 2:(?! empty)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Lock in both picks' }).click();
}

test('nominations keep picks pinned and contenders private by default', async ({ browser }) => {
  test.setTimeout(captureDocs ? 180_000 : 120_000);
  const hostContext = await newAutomationContext(browser);
  const guestContext = await newAutomationContext(browser);
  const guestTwoContext = await newAutomationContext(browser);
  const guestThreeContext = await newAutomationContext(browser);
  let docsDisplayContext: BrowserContext | undefined;
  let docsPairingCode: string | undefined;
  const host = await hostContext.newPage();
  await host.goto('/');
  await host.getByRole('button', { name: 'Create a room' }).click();
  const code = (await host.locator('.room-code').first().textContent())!.trim();
  const guest = await join(guestContext, code, 'Private Picker');
  const guestTwo = await join(guestTwoContext, code, 'Tape Rewinder');
  const guestThree = await join(guestThreeContext, code, 'Snack Runner');
  const voters = [host, guest, guestTwo, guestThree];
  if (captureDocs) {
    await host.getByRole('button', { name: 'Pair browser display' }).click();
    docsPairingCode = (await host.locator('strong.room-code').textContent())!.trim();
  }

  await host.getByRole('button', { name: 'Start picking' }).click();
  await expect(host.locator('.nomination-dock')).toBeVisible();
  await expect(guest.locator('.nomination-dock')).toBeVisible();
  await expect(host.getByRole('button', { name: /Connect my Plex/ })).toBeVisible();
  await expect(guest.getByRole('button', { name: /Connect my Plex/ })).toBeVisible();

  await Promise.all([
    makePicks(host, 'Dune', captureDocs ? 'The Matrix' : undefined),
    makePicks(guest, 'Star Wars', captureDocs ? 'Alien' : undefined),
    ...(guestTwo ? [makePicks(guestTwo, 'The Matrix')] : []),
    ...(guestThree ? [makePicks(guestThree, 'Alien')] : []),
  ]);
  if (captureDocs) {
    await host.setViewportSize({ width: 1280, height: 900 });
    await host.locator('.nomination-dock').scrollIntoViewIfNeeded();
    await settleForScreenshot(host);
    await host.screenshot({ path: 'docs/assets/demo-nominations.png' });
  }
  await host.getByRole('button', { name: 'Edit picks' }).click();
  await host.getByRole('button', { name: 'Reveal now' }).click();

  await expect(host.getByRole('heading', { name: 'Keep the lineup a surprise' })).toBeVisible();
  await expect(host.getByText('Host preview: reveal submitted titles')).toBeVisible();
  await expect(guest.getByText('Host preview: reveal submitted titles')).toHaveCount(0);
  await expect(host.locator('.contender-preview')).toBeHidden();
  await host.getByText('Host preview: reveal submitted titles').click();
  await expect(host.locator('.contender-preview')).toBeVisible();

  if (captureDocs) await host.getByLabel('Seconds per vote').selectOption('60');
  await host.getByRole('button', { name: 'Build bracket and begin' }).click();
  await expect(host.getByText(/Voting opens in/)).toBeVisible({ timeout: 15_000 });
  await host.getByRole('button', { name: 'Skip presentation' }).click();
  await expect(host.getByRole('button', { name: 'Choose a poster' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Choose a poster' })).toBeVisible();
  if (captureDocs) {
    await host.locator('.tournament-controller').scrollIntoViewIfNeeded();
    await settleForScreenshot(host);
    await host.screenshot({ path: 'docs/assets/demo-voting.png' });
  }

  for (let matchup = 1; matchup <= 9; matchup += 1) {
    await Promise.all(voters.map((voter) => voter.locator('button.matchup-poster-option').first().click()));
    await Promise.all(voters.map((voter) => voter.getByRole('button', { name: /Vote for/ }).click()));
    await expect(host.getByText('advances')).toBeVisible({ timeout: 5_000 });
    await host.getByRole('button', { name: 'Skip presentation' }).click();
    if (matchup === 9) break;
    await expect(host.getByText(/Voting opens in/)).toBeVisible();
    await host.getByRole('button', { name: 'Skip presentation' }).click();
    await expect(host.getByRole('button', { name: 'Choose a poster' })).toBeVisible();
    if (captureDocs && matchup === 4) await host.waitForTimeout(45_000);
    await host.waitForTimeout(750);
  }

  await expect(host.getByLabel('Tournament podium')).toBeVisible();
  await expect(host.locator('.podium-place')).toHaveCount(3);
  await expect(host.locator('.controller-confetti i')).toHaveCount(32);
  await expect(host.getByRole('link', { name: /Watch now on Plex|Open in Jellyseerr to request|View streaming options/ })).toBeVisible();
  if (captureDocs) {
    await host.setViewportSize({ width: 1280, height: 1000 });
    await host.locator('.winner-controller').scrollIntoViewIfNeeded();
    await settleForScreenshot(host);
    await host.screenshot({ path: 'docs/assets/demo-winner.png' });

    docsDisplayContext = await newAutomationContext(browser, { viewport: { width: 1280, height: 720 } });
    const display = await docsDisplayContext.newPage();
    await display.goto('/display');
    await display.getByLabel('TV code').fill(docsPairingCode!);
    await display.getByRole('button', { name: 'Connect TV' }).click();
    await expect(display.getByLabel('Tournament podium')).toBeVisible();

    host.once('dialog', (dialog) => void dialog.accept());
    await host.getByRole('button', { name: 'I object!' }).click();
    await expect(host.locator('.objection-panel')).toBeVisible();
    await expect(host.getByText(/has objected!/)).toBeVisible();
    await host.locator('.objection-panel').scrollIntoViewIfNeeded();
    await settleForScreenshot(host);
    await host.screenshot({ path: 'docs/assets/demo-objection.png' });
    await expect(display.getByRole('heading', { name: 'Gold + Silver overtime' })).toBeVisible();
    await settleForScreenshot(display);
    await display.screenshot({ path: 'docs/assets/demo-objection-display.png' });
  }

  await Promise.all([
    hostContext.close(),
    guestContext.close(),
    guestTwoContext.close(),
    guestThreeContext.close(),
    docsDisplayContext?.close(),
  ]);
});
