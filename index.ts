import { chromium } from "playwright";
import type { Dependency } from "./dep";
import links from "./pkgs.json"

const selector = 'input[data-use-this-package-panel-target="snippet"]';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
});

const getProductAndPackage = async (url: string): Promise<Dependency> => {
  const page = await context.newPage();

  try {
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
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
  let ls = links.slice(0, 4)
  const results: Dependency[] = []

  for (const l of ls) {
    try {
      let res = await getProductAndPackage(l)
      results.push(res)
      console.log(res.product)
      console.log(res.package)
      console.log("") // empty line for separator
    } catch (e) {
      console.error(`Error fetching ${l}:`, e)
    }
  }

  await Bun.write("dependencies.json", JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} dependencies to dependencies.json`);
};

await main();
await browser.close()
