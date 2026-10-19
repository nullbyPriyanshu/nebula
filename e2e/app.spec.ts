import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { FakeGoogle } from "./fake-google";

const EMAIL = "student@gmail.com";

let google: FakeGoogle;
let problems: string[];

test.beforeEach(async ({ context, page }) => {
  google = new FakeGoogle();
  await google.install(context);

  // Any CSP violation or uncaught error fails the test.
  problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/.test(message.text())) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "My own device" }).click();
  await expect(page).toHaveURL(/\/files\/$/);
  await page.getByRole("button", { name: "Connect account" }).click();
  await expect(page.getByText(`${EMAIL} is connected.`)).toBeVisible();
}

async function upload(page: Page, name: string, content: string) {
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await expect(page.getByRole("list", { name: "Files" }).getByRole("button", { name, exact: true })).toBeVisible();
}

const files = (page: Page) => page.getByRole("list", { name: "Files" });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("uploads, previews, renames, trashes and undoes", async ({ page }) => {
  await start(page);
  await upload(page, "notes.txt", "hello from nebula");

  expect(google.storedNames(EMAIL)).toEqual(["notes.txt"]);

  await files(page).getByRole("button", { name: "notes.txt", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "notes.txt" })).toContainText("hello from nebula");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await menu(page, "notes.txt", "Rename");
  await page.getByLabel("New name").fill("diary.txt");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(files(page).getByRole("button", { name: "diary.txt", exact: true })).toBeVisible();
  await expect.poll(() => google.storedNames(EMAIL)).toEqual(["diary.txt"]);

  await menu(page, "diary.txt", "Move to trash");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await page.getByRole("status").filter({ hasText: "moved to the trash" }).getByRole("button", { name: "Undo" }).click();
  await expect(files(page).getByRole("button", { name: "diary.txt", exact: true })).toBeVisible();
});

test("keeps folders in the URL and the list across a reload", async ({ page }) => {
  await start(page);
  await upload(page, "notes.txt", "x");

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("textbox").fill("Sem 4");
  await page.getByRole("button", { name: "Create" }).click();

  await menu(page, "notes.txt", "Move to…");
  await page.getByRole("option", { name: /Sem 4/ }).click();
  await page.getByRole("button", { name: "Move here" }).click();

  await page.getByRole("list", { name: "Folders" }).getByRole("button", { name: /^Sem 4/ }).click();
  await expect(page).toHaveURL(/path=%2FSem\+4|path=%2FSem%204/);
  await expect(files(page).getByRole("button", { name: "notes.txt", exact: true })).toBeVisible();

  // A reload keeps the folder, shows the saved list and asks to sign in again.
  await page.reload();
  await expect(files(page).getByRole("button", { name: "notes.txt", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Reconnect ${EMAIL}` })).toBeVisible();
});

test("downloads a file intact", async ({ page }) => {
  // Use the download path every browser has, rather than Chrome's save dialog.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await start(page);
  await upload(page, "notes.txt", "download me");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download notes.txt" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("notes.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe("download me");
});

test("encrypts files before they reach Google", async ({ page }) => {
  await start(page);

  await page.getByRole("banner").getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Set up encryption" }).click();
  await page.getByLabel(/Passphrase/).fill("correct horse battery");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Type it again").fill("correct horse battery");
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "I understand, turn it on" }).click();
  await expect(page.getByText("Encryption is on.")).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "My files" }).click();
  await upload(page, "secret.txt", "the plans");

  const [stored] = google.storedContent(EMAIL);

  expect(stored.toString()).not.toContain("the plans");
  expect(google.storedNames(EMAIL)[0]).toMatch(/^nebula-[0-9a-f]+\.bin$/);

  await files(page).getByRole("button", { name: "secret.txt", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "secret.txt" })).toContainText("the plans");
});

test("search, views and keyboard shortcuts", async ({ page }) => {
  await start(page);
  await upload(page, "Résumé.txt", "cv");
  await upload(page, "notes.txt", "x");

  await page.keyboard.press("/");
  // With its history list, the search field is a combobox.
  await expect(page.getByRole("combobox", { name: "Search all files" })).toBeFocused();
  await page.keyboard.type("resume");
  await expect(files(page).getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await menu(page, "notes.txt", "Star");
  await page.getByRole("button", { name: "Starred" }).click();
  await expect(files(page).getByRole("listitem")).toHaveCount(1);
  await expect(page).toHaveURL(/show=starred/);
});

test("two browsers on the same account see each other's changes", async ({ browser, page }) => {
  await start(page);
  await upload(page, "laptop.txt", "from the laptop");

  // A second browser with its own storage, on the same fake Google.
  const phoneContext = await browser.newContext({ serviceWorkers: "block" });
  await google.install(phoneContext);

  const phone = await phoneContext.newPage();

  await start(phone);
  await expect(files(phone).getByRole("button", { name: "laptop.txt", exact: true })).toBeVisible();
  await upload(phone, "phone.txt", "from the phone");

  // The laptop picks it up when it next syncs (it does on focus).
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(files(page).getByRole("button", { name: "phone.txt", exact: true })).toBeVisible();
  await expect(files(page).getByRole("button", { name: "laptop.txt", exact: true })).toBeVisible();

  await phoneContext.close();
});

test("the logo leads back to the landing page, which leads back to the files", async ({ page }) => {
  await start(page);

  await page.getByRole("link", { name: "Nebula home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /One drive/ })).toBeVisible();

  // Only one "Open my files" at a time: the hero's, until it scrolls away.
  await expect(page.getByRole("link", { name: "Open my files" })).toHaveCount(1);
  await expect(page.getByRole("banner").getByRole("link", { name: "Open my files" })).toHaveCount(0);

  await page.getByRole("heading", { name: "Choose your mode" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("banner").getByRole("link", { name: "Open my files" })).toBeInViewport();
  await expect(page.locator("#hero-start")).not.toBeInViewport();

  await page.getByRole("banner").getByRole("link", { name: "Open my files" }).click();
  await expect(page).toHaveURL(/\/files\/$/);
  await expect(page.getByRole("heading", { name: "Your space" })).toBeVisible();
});

test("my files never scrolls: a long list is split into pages that fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await start(page);

  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles(
    Array.from({ length: 30 }, (_, i) => ({
      name: `file-${String(i + 1).padStart(2, "0")}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`content ${i}`),
    })),
  );
  // The upload dock clears itself away once everything is done.
  await expect(page.getByRole("region", { name: "Uploads" })).toHaveCount(0, { timeout: 40_000 });

  // Nothing on the page can scroll: not the page, not a panel.
  const scrolling = await page.evaluate(() =>
    [document.documentElement, ...document.querySelectorAll("*")]
      .filter((el) => {
        const style = getComputedStyle(el);
        const canScroll = el === document.documentElement || /auto|scroll/.test(style.overflowY);

        return canScroll && el.scrollHeight > el.clientHeight + 1;
      })
      .map((el) => el.tagName + "." + String((el as HTMLElement).className).slice(0, 40)),
  );

  expect(scrolling).toEqual([]);

  const pager = page.getByRole("navigation", { name: "Pages" });

  await expect(pager).toBeVisible();

  const firstPage = await files(page).getByRole("listitem").count();

  expect(firstPage).toBeGreaterThan(2);
  expect(firstPage).toBeLessThan(30);

  await pager.getByRole("button", { name: "Next page" }).click();
  await expect(pager).toContainText(`${firstPage + 1}–`);
});
