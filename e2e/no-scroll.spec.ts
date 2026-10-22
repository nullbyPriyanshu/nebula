import { expect, test, type Page } from "@playwright/test";
import { FakeGoogle } from "./fake-google";

// App pages fit one screen on laptops: neither the page nor any box inside it
// should need scrolling.
const PAGES = ["/files/", "/accounts/", "/analytics/", "/trash/", "/settings/", "/help/"];
const SCREENS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test.beforeEach(async ({ context }) => {
  await new FakeGoogle().install(context);
});

// Everything on the page that is cut off and would scroll.
function scrollers(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    const root = document.scrollingElement!;

    if (root.scrollHeight > root.clientHeight + 1) found.push(`page (${root.scrollHeight - root.clientHeight}px)`);

    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const { overflowY } = getComputedStyle(el);

      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        const name = el.getAttribute("aria-label") ?? el.closest("[aria-label]")?.getAttribute("aria-label") ?? el.tagName;

        found.push(`${name} (${el.scrollHeight - el.clientHeight}px)`);
      }
    }

    return found;
  });
}

for (const screen of SCREENS) {
  test(`app pages fit a ${screen.width}×${screen.height} screen without scrolling`, async ({ page }) => {
    await page.setViewportSize(screen);
    await page.goto("/");
    await expect(async () => {
      if (!page.url().endsWith("/files/")) await page.getByRole("button", { name: "My own device" }).click({ timeout: 2000 });
      await expect(page).toHaveURL(/\/files\/$/, { timeout: 2000 });
    }).toPass();
    await page.getByRole("button", { name: "Connect account" }).click();
    await expect(page.getByText("student@gmail.com is connected.").first()).toBeVisible();

    const problems: string[] = [];

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      problems.push(...(await scrollers(page)).map((what) => `${path}: ${what}`));
    }

    expect(problems).toEqual([]);
  });
}

// A first visit straight to an app page shows the mode choice first. It is
// taller than the screen, so it must scroll like a normal page.
test("the mode choice on an app page scrolls to its buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/trash/");

  const choose = page.getByRole("button", { name: "My own device" });

  await choose.scrollIntoViewIfNeeded();
  await expect(choose).toBeInViewport();
  await choose.click();
  await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();
});
