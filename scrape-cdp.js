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

// Wait until the real page is loaded — gives you time to solve the checkbox in
// Chrome if Cloudflare challenges (e.g. at the start, or if clearance expires
// mid-run). Returns false only if it never clears within ~90s.
async function ensureRealPage(page, label) {
  for (let i = 0; i < 45; i++) {
    if (await isRealPage(page)) return true;
    if (i === 0) log(`   ⏳ Cloudflare — solve the checkbox in the Chrome window (waiting for ${label})...`);
    await sleep(2000);
  }
  return false;
}

// Detect a swimrankings server error page (502/503/504) so we can back off
// instead of hammering — the usual cause of a bulk run failing partway.
async function isServerError(page) {
  return page
    .evaluate(() => {
      const t = ((document.title || '') + ' ' + (document.body?.innerText || '')).toLowerCase();
      return (
        t.includes('502') || t.includes('bad gateway') ||
        t.includes('503') || t.includes('service unavailable') ||
        t.includes('504') || t.includes('gateway time-out')
      );
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
  let ok = 0, skipped = 0, serverStreak = 0;
  const THROTTLE = Number(process.env.THROTTLE_MS || 4500); // gentler default pacing
  outer: for (const club of CLUBS) {
    for (const g of GENDERS) {
      for (const course of COURSES) {
        if (ok >= argLimit) break outer;
        const label = `${club.code}_${course}_${g.code}`;
        const saveAs = path.join(DL_DIR, `POR-${label}.xlsx`);

        // Resume: skip files already downloaded so a re-run only fetches what's
        // missing. (For a fresh weekly pull, clear the downloads/ folder first.)
        if (fs.existsSync(saveAs) && fs.statSync(saveAs).size >= 3000) {
          skipped++;
          results.push({ label, status: 'SKIP', bytes: fs.statSync(saveAs).size });
          continue;
        }

        log(`▶ ${label}  (clubId=${club.id})`);
        let status = 'ERROR', bytes = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(urlFor(club.id, g.v, course), { waitUntil: 'domcontentloaded', timeout: 60000 });
            if (await isServerError(page)) {
              serverStreak++;
              const backoff = Math.min(30000 * serverStreak, 180000);
              log(`  🛑 server error (502/503) — backing off ${Math.round(backoff / 1000)}s (attempt ${attempt})`);
              status = 'SERVER_ERROR';
              await sleep(backoff);
              continue;
            }
            if (!(await ensureRealPage(page, label))) {
              if (await isServerError(page)) { status = 'SERVER_ERROR'; serverStreak++; await sleep(30000); continue; }
              status = 'BLOCKED';
              await sleep(10000);
              continue;
            }
            bytes = await findAndDownload(page, saveAs);
            if (bytes > 0) { status = 'OK'; serverStreak = 0; break; }
            status = 'NO_DOWNLOAD';
            await sleep(8000);
          } catch (e) {
            log(`  💥 ${label}: ${e.message.split('\n')[0]}`);
            status = 'ERROR';
            await sleep(8000);
          }
        }
        if (status === 'OK') { log(`  ✅ downloaded ${label} (${bytes} bytes)`); ok++; }
        else log(`  ⚠️  ${label}: ${status} after retries`);
        results.push({ label, status, bytes });

        // If the server keeps failing, stop rather than risk a ban — re-run later
        // and resume (finished files are skipped).
        if (serverStreak >= 5) {
          log('🛑 Repeated server errors — stopping. Re-run later; downloaded files will be skipped.');
          break outer;
        }
        await sleep(THROTTLE + Math.floor(Math.random() * 1500));
      }
    }
  }

  fs.writeFileSync(path.join(ART_DIR, 'results.json'), JSON.stringify(results, null, 2));
  log('==== SUMMARY ====');
  const failed = results.filter((r) => !['OK', 'SKIP'].includes(r.status));
  failed.forEach((r) => log(`  ${r.status.padEnd(14)} ${r.label}`));
  log(`Downloaded ${ok}, skipped(existing) ${skipped}, failed ${failed.length}, of ${results.length} total.`);
  // Do NOT close the browser — it's your Chrome.
  await browser.close();
}

main();
