/**
 * Local swimrankings scraper (runs on the home laptop / residential IP).
 *
 * - Reads clubs from clubs.json (configurable — add clubs there, no code changes).
 * - Loops clubs x genders x courses, downloads each Excel from swimrankings.
 * - Runs a VISIBLE browser with a PERSISTENT profile so Cloudflare clearance is
 *   solved at most once and reused across the batch (and across future runs).
 *
 * Usage:
 *   node scrape.js            -> full matrix (all clubs, M/F, LCM/SCM)
 *   node scrape.js --limit 1  -> stop after 1 successful download (smoke test)
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

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
const USER_DATA = path.join(__dirname, '.browser-profile');

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

async function isCloudflareWall(page) {
  const title = (await page.title().catch(() => '')) || '';
  const body = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) || '';
  const hay = (title + ' ' + body).toLowerCase();
  const textMatch = [
    'just a moment', 'checking your browser', 'verify you are human',
    'enable javascript and cookies', 'verificação de segurança',
    'confirme que é humano', 'não é um bot',
  ].some((k) => hay.includes(k));
  const hasTurnstile = await page
    .locator('iframe[src*="challenges.cloudflare.com"]').count()
    .then((n) => n > 0).catch(() => false);
  return textMatch || hasTurnstile;
}

async function isRealPage(page) {
  return page.evaluate(() => {
    const t = (document.body?.innerText || '').toLowerCase();
    return t.includes('swimrankings') && (t.includes('ranking') || t.includes('clube'));
  }).catch(() => false);
}

// Wait for the challenge to clear. Since the browser is visible, the user can
// click the checkbox if stealth doesn't auto-pass. Waits up to ~2 minutes.
async function passCloudflare(page) {
  for (let i = 0; i < 24; i++) {
    if ((await isRealPage(page)) && !(await isCloudflareWall(page))) return true;
    if (i === 0) log('  ⏳ If you see a "Confirme que é humano" checkbox, please click it now...');
    await sleep(5000);
  }
  return (await isRealPage(page)) && !(await isCloudflareWall(page));
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
  // Headed (visible) by default so you can solve the checkbox; set HEADLESS=1 for
  // unattended runs (scheduled task) — this also tests auto-pass on the home IP.
  const headless = process.env.HEADLESS === '1';
  log(`Launching ${headless ? 'HEADLESS' : 'visible'} Chromium (persistent profile). Clubs: ${CLUBS.length}, limit: ${argLimit}`);
  const context = await chromium.launchPersistentContext(USER_DATA, {
    headless,
    viewport: { width: 1366, height: 768 },
    locale: 'pt-PT',
    acceptDownloads: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || (await context.newPage());

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
          if (!(await passCloudflare(page))) {
            log(`  ❌ Cloudflare not passed for ${label}`);
            results.push({ label, status: 'CLOUDFLARE_BLOCKED', bytes: 0 });
            continue;
          }
          const bytes = await findAndDownload(page, saveAs);
          if (bytes > 0) {
            log(`  ✅ downloaded ${label} (${bytes} bytes)`);
            results.push({ label, status: 'OK', bytes });
            ok++;
          } else {
            log(`  ⚠️  passed Cloudflare but no download for ${label}`);
            results.push({ label, status: 'NO_DOWNLOAD', bytes: 0 });
          }
        } catch (e) {
          log(`  💥 ${label}: ${e.message.split('\n')[0]}`);
          results.push({ label, status: 'ERROR', bytes: 0 });
        }
        await sleep(3000); // gentle throttle between files
      }
    }
  }

  fs.writeFileSync(path.join(ART_DIR, 'results.json'), JSON.stringify(results, null, 2));
  log('==== SUMMARY ====');
  results.forEach((r) => log(`  ${r.status.padEnd(18)} ${r.label} ${r.bytes || ''}`));
  log(`Downloaded ${ok}/${results.length} attempted.`);
  await context.close();
}

main();
