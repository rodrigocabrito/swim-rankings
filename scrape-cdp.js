/**
 * CDP-attach scraper: drives your REAL Chrome instead of launching Chromium.
 *
 * Why: Cloudflare's Turnstile detects Playwright-LAUNCHED browsers and loops the
 * checkbox forever. But if we ATTACH to a normal Chrome that you started and that
 * already passed the challenge, there's no automation launch signature to detect.
 *
 * How to use (see the chat for the exact commands):
 *   1. Fully close Chrome.
 *   2. Launch Chrome with a debug port + a dedicated profile.
 *   3. In that Chrome, open the swimrankings URL and solve the checkbox ONCE.
 *   4. Run: node scrape-cdp.js --limit 1
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CLUBS = JSON.parse(fs.readFileSync(path.join(__dirname, 'clubs.json'), 'utf8'));
const GENDERS = [
  { code: 'Men', v: 1 },
  { code: 'Women', v: 2 },
];
const COURSES = ['LCM', 'SCM'];

const argLimit = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

const DL_DIR = path.join(__dirname, 'downloads');
const ART_DIR = path.join(__dirname, 'artifacts');
fs.mkdirSync(DL_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function urlFor(clubId, genderV, course) {
  return (
    'https://www.swimrankings.net/index.php?page=rankingDetail' +
    `&clubId=${clubId}&gender=${genderV}&course=${course}` +
    '&agegroup=0&stroke=0&season=-1'
  );
}

function looksLikeExcel(s) {
  if (!s) return false;
  s = s.toLowerCase();
  return ['excel', 'xls', 'export', '.xlsx', 'csv'].some((k) => s.includes(k));
}

async function isRealPage(page) {
  return page
    .evaluate(() => {
      const t = (document.body?.innerText || '').toLowerCase();
      return t.includes('swimrankings') && (t.includes('ranking') || t.includes('clube'));
    })
    .catch(() => false);
}

async function findAndDownload(page, saveAs) {
  const candidates = await page.evaluate(() => {
    const grab = (el) => ({
      href: el.getAttribute('href') || '', src: el.getAttribute('src') || '',
      onclick: el.getAttribute('onclick') || '', title: el.getAttribute('title') || '',
      alt: el.getAttribute('alt') || '', text: (el.innerText || '').trim().slice(0, 40),
      outer: el.outerHTML.slice(0, 220),
    });
    return [...document.querySelectorAll('a, img, button, input[type=image]')].map(grab);
  });
  const excelish = candidates.filter((c) =>
    looksLikeExcel(c.href + c.src + c.onclick + c.title + c.alt + c.text + c.outer)
  );
  fs.writeFileSync(path.join(ART_DIR, 'candidates.json'), JSON.stringify(excelish, null, 2));
  log(`  found ${excelish.length} Excel-looking element(s)`);
  excelish.forEach((c, i) => log(`    [${i}] ${c.outer}`));

  for (let i = 0; i < excelish.length; i++) {
    const c = excelish[i];
    let sel;
    if (c.title) sel = `[title="${c.title}"]`;
    else if (c.alt) sel = `[alt="${c.alt}"]`;
    else if (c.href) sel = `a[href="${c.href.replace(/"/g, '\\"')}"]`;
    else continue;
    try {
      const dlPromise = page.waitForEvent('download', { timeout: 20000 });
      await page.locator(sel).first().click({ timeout: 5000 });
      const dl = await dlPromise;
      await dl.saveAs(saveAs);
      return fs.statSync(saveAs).size;
    } catch (e) {
      log(`  candidate [${i}] no download: ${e.message.split('\n')[0]}`);
    }
  }
  return 0;
}

async function main() {
  log('Connecting to your Chrome on http://localhost:9222 ...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  context.setDefaultTimeout(20000);
  // Reuse the tab you already solved the challenge in, or open a new one.
  const page = context.pages()[0] || (await context.newPage());
  log('Connected. Using existing Chrome session (should already be past Cloudflare).');

  const results = [];
  let ok = 0;
  outer: for (const club of CLUBS) {
    for (const g of GENDERS) {
      for (const course of COURSES) {
        if (ok >= argLimit) break outer;
        const label = `${club.code}_${course}_${g.code}`;
        const saveAs = path.join(DL_DIR, `POR-${label}.xlsx`);
        log(`▶ ${label}  (clubId=${club.id})`);
        try {
          await page.goto(urlFor(club.id, g.v, course), { waitUntil: 'domcontentloaded', timeout: 60000 });
          await sleep(2500);
          if (!(await isRealPage(page))) {
            log(`  ❌ Not on the real page (Cloudflare?) for ${label}. Solve the checkbox in Chrome and re-run.`);
            await page.screenshot({ path: path.join(ART_DIR, `blocked-${label}.png`) }).catch(() => {});
            results.push({ label, status: 'BLOCKED', bytes: 0 });
            continue;
          }
          const bytes = await findAndDownload(page, saveAs);
          if (bytes > 0) {
            log(`  ✅ downloaded ${label} (${bytes} bytes)`);
            results.push({ label, status: 'OK', bytes });
            ok++;
          } else {
            log(`  ⚠️  on real page but no download for ${label}`);
            results.push({ label, status: 'NO_DOWNLOAD', bytes: 0 });
          }
        } catch (e) {
          log(`  💥 ${label}: ${e.message.split('\n')[0]}`);
          results.push({ label, status: 'ERROR', bytes: 0 });
        }
        await sleep(3000);
      }
    }
  }

  fs.writeFileSync(path.join(ART_DIR, 'results.json'), JSON.stringify(results, null, 2));
  log('==== SUMMARY ====');
  results.forEach((r) => log(`  ${r.status.padEnd(14)} ${r.label} ${r.bytes || ''}`));
  log(`Downloaded ${ok}/${results.length} attempted.`);
  // Do NOT close the browser — it's your Chrome.
  await browser.close();
}

main();
