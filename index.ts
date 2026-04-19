import { chromium } from "playwright";
import type { Dependency } from "./dep";
import links from "./pkgs.json"

const selector = 'input[data-use-this-package-panel-target="snippet"]';

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"]
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  timezoneId: 'America/New_York',
  permissions: ['geolocation'],
  extraHTTPHeaders: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://swiftpackageindex.com/',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
  }
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getProductAndPackage = async (url: string, isFirst: boolean = false): Promise<Dependency> => {
  const page = await context.newPage();

  try {
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

    // Using 'networkidle' for the first page helps solve initial Cloudflare challenges
    const wait = isFirst ? "networkidle" : "domcontentloaded";
    const response = await page.goto(url, { waitUntil: wait, timeout: 60_000 });
    
    if (response?.status() === 403 || response?.status() === 429) {
       throw new Error(`BLOCKED: Response status was ${response?.status()}`);
    }
    
    if (response?.status() !== 200) {
      console.warn(`Warning: Response status for ${url} was ${response?.status()}`);
    }

    // open “Use this package” panel if needed
    const countBefore = await page.locator(selector).count();
    if (countBefore === 0) {
      await page
        .getByRole("button", { name: /use this package/i })
        .click({ timeout: 10_000 });
    }

    // wait for the snippet input to exist
    await page.waitForSelector(selector, { state: "attached", timeout: 30_000 });

    // .product (your input value)
    let product = await page.locator(selector).inputValue();

    // .package (find the first snippet containing ".package(")
    let pkgLine = (await page.evaluate(() => {
      return Array.from(document.querySelectorAll("input, textarea, pre, code"))
        .map((el: any) => el.value ?? el.textContent ?? "")
        .find((t) => typeof t === "string" && t.includes(".package("));
    })) as string | undefined;

    return { product: product, package: pkgLine ?? "" };
  } finally {
    await page.close();
  }
};


const urlToPackageIndexUrl = (url: string): string => {
  // https://github.com/zunda-pixel/googleanalytics-swift.git
  // to
  // https://swiftpackageindex.com/privy-io/privy-ios"
  let parts = url.split("/") // 3 and 4
  let extracted = (parts[3]! + "/" + parts[4]!).replace(".git", "")
  return "https://swiftpackageindex.com/" + extracted
}

const mapAllLinks = async () => {
  const mappedLinks = links.map(l => urlToPackageIndexUrl(l));

  await Bun.write("./pkgs.json", JSON.stringify(mappedLinks, null, 2) + "\n");
};


const main = async () => {
  // Let's process only a small batch first to avoid being blocked.
  // Change to links.length if you want to process everything.
  const limit = 1;
  let ls = links.slice(0, limit)
  const results: Dependency[] = []

  let first = true;
  for (const l of ls) {
    try {
      // Add a small random delay between requests (2-5 seconds)
      if (!first) {
        await sleep(2000 + Math.random() * 3000);
      }
      
      let res = await getProductAndPackage(l, first)
      first = false;
      results.push(res)
      console.log(res.product)
      console.log(res.package)
      console.log("") // empty line for separator
    } catch (e: any) {
      console.error(`Error fetching ${l}:`, e.message || e)
      if (e.message?.includes("BLOCKED")) {
        console.error("Stopping scraper to prevent further blocking.");
        break;
      }
    }
  }

  await Bun.write("dependencies.json", JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} dependencies to dependencies.json`);
};

await main();
await browser.close()
