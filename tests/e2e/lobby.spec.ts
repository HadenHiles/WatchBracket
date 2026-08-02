import { expect, test, type BrowserContext } from '@playwright/test';

async function join(context: BrowserContext, code: string, nickname: string) {
  const page = await context.newPage(); await page.goto(`/join/${code}`); await page.getByLabel('Your nickname').fill(nickname); await page.getByRole('button', { name: 'Join the room' }).click(); await expect(page).toHaveURL(/\/room\//); return page;
}

test('host, guests, and an independent revocable display share a durable lobby', async ({ browser }) => {
  const hostContext=await browser.newContext();const guestBContext=await browser.newContext();const guestCContext=await browser.newContext();const displayContext=await browser.newContext();const lateContext=await browser.newContext();
  const host=await hostContext.newPage();await host.goto('/admin/login');await host.getByLabel('Email').fill(process.env.ADMIN_BOOTSTRAP_EMAIL??'host@example.com');await host.getByLabel('Password').fill(process.env.ADMIN_BOOTSTRAP_PASSWORD??'correct-horse-battery-staple');await host.getByRole('button',{name:'Sign in'}).click();await host.waitForURL(/\/(setup)?$/);await host.goto('/setup');for(let step=0;step<4;step++)await host.getByRole('button',{name:'Continue'}).click();await host.getByRole('button',{name:'Finish setup'}).click();await host.getByRole('button',{name:'Create a Room'}).click();await expect(host).toHaveURL(/\/room\//);
  const code=(await host.locator('.room-code').first().textContent())!.trim();await expect(host.locator('.person').filter({hasText:'Host'})).toHaveCount(1);
  const guestB=await join(guestBContext,code,'Browser B');const guestC=await join(guestCContext,code,'Browser C');await expect(host.getByText('Browser B')).toBeVisible();await expect(host.getByText('Browser C')).toBeVisible();
  await guestB.reload();await expect(host.getByText('Browser B')).toHaveCount(1);
  await host.getByRole('button',{name:'Pair browser display'}).click();const pairing=(await host.locator('strong.room-code').textContent())!.trim();const display=await displayContext.newPage();await display.goto('/display');await display.getByLabel('Pairing code').fill(pairing);await display.getByRole('button',{name:'Connect display'}).click();await expect(display.getByText('Browser B')).toBeVisible();await expect(display.getByText('Browser C')).toBeVisible();
  await host.goto('about:blank');await guestC.reload();await expect(display.getByText('Browser C')).toBeVisible();await host.goBack();await expect(host).toHaveURL(/\/room\//);await host.getByRole('button',{name:'Lock room'}).click();
  const late=await lateContext.newPage();await late.goto(`/join/${code}`);await late.getByLabel('Your nickname').fill('Browser E');await late.getByRole('button',{name:'Join the room'}).click();await expect(late.getByText('This room is locked.')).toBeVisible();
  await host.getByRole('button',{name:'Revoke'}).click();await expect(display.getByText(/Display revoked/i)).toBeVisible();
  await Promise.all([hostContext.close(),guestBContext.close(),guestCContext.close(),displayContext.close(),lateContext.close()]);
});
