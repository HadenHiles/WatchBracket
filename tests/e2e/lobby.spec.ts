import { expect, test, type BrowserContext } from "@playwright/test";
import { settleForScreenshot } from "./visual";

const captureDocs = process.env.CAPTURE_DOCS === "1";

async function join(context: BrowserContext, code: string, nickname: string) {
  const page = await context.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("Your nickname").fill(nickname);
  await page.getByRole("button", { name: "Join the room" }).click();
  await expect(page).toHaveURL(/\/room\//);
  return page;
}

test("host, guests, and an independent revocable display share a durable lobby", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestBContext = await browser.newContext();
  const guestCContext = await browser.newContext();
  const displayContext = await browser.newContext();
  const lateContext = await browser.newContext();

  const host = await hostContext.newPage();
  await host.goto("/");
  await expect(host.getByRole("heading", { name: "Tonight's pick, decided together." })).toBeVisible();
  if (captureDocs) {
    await settleForScreenshot(host);
    await host.screenshot({ path: "docs/assets/demo-home.png", fullPage: true });
  }
  await host.getByRole("button", { name: "Create a room" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 15_000 });
  await expect(host.getByRole("status")).toContainText("connected");
  await expect(host.getByRole("button", { name: /Cast to TV/ })).toBeVisible();

  const code = (await host.locator(".room-code").first().textContent())!.trim();
  await expect(host.locator(".person").filter({ hasText: "Host" })).toHaveCount(1);

  const guestB = await join(guestBContext, code, "Browser B");
  const guestC = await join(guestCContext, code, "Browser C");
  await expect(host.getByText("Browser B")).toBeVisible();
  await expect(host.getByText("Browser C")).toBeVisible();
  if (captureDocs) {
    await settleForScreenshot(host);
    await host.screenshot({ path: "docs/assets/demo-lobby.png", fullPage: true });
  }
  await guestB.reload();
  await expect(host.getByText("Browser B")).toHaveCount(1);

  await host.getByRole("button", { name: "Pair browser display" }).click();
  const pairing = (await host.locator("strong.room-code").textContent())!.trim();
  const display = await displayContext.newPage();
  await display.goto("/display");
  await display.getByLabel("TV code").fill(pairing);
  await display.getByRole("button", { name: "Connect TV" }).click();
  await expect(display.getByText("Browser B")).toBeVisible();
  await expect(display.getByText("Browser C")).toBeVisible();
  if (captureDocs) {
    await settleForScreenshot(display);
    await display.screenshot({ path: "docs/assets/demo-display.png", fullPage: true });
  }

  await host.goto("about:blank");
  await guestC.reload();
  await expect(display.getByText("Browser C")).toBeVisible();
  await host.goBack();
  await expect(host).toHaveURL(/\/room\//);
  await host.getByRole("button", { name: "Lock room" }).click();

  const late = await lateContext.newPage();
  await late.goto(`/join/${code}`);
  await late.getByLabel("Your nickname").fill("Browser E");
  await late.getByRole("button", { name: "Join the room" }).click();
  await expect(late.getByText("This room is locked.")).toBeVisible();

  await host.getByRole("button", { name: "Revoke" }).click();
  await expect(display.locator('[data-wb-scene="lobby"]')).toContainText(
    "revoked",
  );
  await Promise.all([
    hostContext.close(),
    guestBContext.close(),
    guestCContext.close(),
    displayContext.close(),
    lateContext.close(),
  ]);
});
