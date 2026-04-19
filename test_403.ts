import { chromium } from "playwright";

const url = "https://swiftpackageindex.com/0111b/Conf";

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

  try {
    console.log(`Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    console.log(`Response status: ${response?.status()}`);
    
    if (response?.status() === 403) {
      console.log("403 REPRODUCED");
    } else {
      console.log(`Success! Status was ${response?.status()}`);
    }

    const title = await page.title();
    console.log(`Page title: ${title}`);

  } catch (e) {
    console.error("Error navigating:", e);
  } finally {
    await browser.close();
  }
};

await main();
