/**
 * Cloudflare + Excel-download feasibility test.
 *
 * Goal: find out, for FREE, whether a cloud runner (GitHub Actions) can:
 *   1. Load the swimrankings rankingDetail page,
 *   2. Get past Cloudflare's anti-bot challenge,
 *   3. Click the Excel export icon and capture the downloaded .xlsx.
 *
 * This run is also a DISCOVERY run: it dumps every candidate link/image so we
 * learn the exact selector of the Excel button from the logs/artifacts, since
 * we can't safely inspect the protected page by hand.
 *
 * Nothing here is swim-specific yet — it just answers "is this possible for free?".
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

// The exact URL you gave me (CFB, men, LCM, all-time).
const TARGET_URL =
  'https://www.swimrankings.net/index.php?page=rankingDetail&clubId=65881&gender=1&course=LCM&agegroup=0&stroke=0&season=-1';

const OUT_DIR = path.join(__dirname, 'artifacts');
fs.mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

function looksLikeExcel(s) {
  if (!s) return false;
  s = s.toLowerCase();
  return (
    s.includes('excel') ||
    s.includes('xls') ||
    s.includes('export') ||
    s.includes('.xlsx') ||
    s.includes('csv')
  );
}

async function isCloudflareWall(page) {
  const title = (await page.title().catch(() => '')) || '';
  const body = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) || '';
  const hay = (title + ' ' + body).toLowerCase();
  return (
    hay.includes('just a moment') ||
    hay.includes('checking your browser') ||
    hay.includes('verify you are human') ||
    hay.includes('cf-challenge') ||
    hay.includes('enable javascript and cookies')
  );
}

async function main() {
  log('Launching Chromium (stealth)...');
  const browser = await chromium.launch({
    headless: false, // Cloudflare flags true-headless; on CI we wrap this in xvfb-run.
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'pt-PT',
    acceptDownloads: true,
  });

  const page = await context.newPage();
  let verdict = 'UNKNOWN';

  try {
    log('Navigating to target...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Give Cloudflare's challenge time to solve itself, then poll.
    log('Waiting for a potential Cloudflare challenge to clear...');
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(4000);
      if (!(await isCloudflareWall(page))) break;
      log(`  still on challenge screen (check ${i + 1}/8)...`);
    }

    const blocked = await isCloudflareWall(page);
    await page.screenshot({ path: path.join(OUT_DIR, 'page.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT_DIR, 'page.html'), await page.content().catch(() => ''));

    if (blocked) {
      verdict = 'BLOCKED_BY_CLOUDFLARE';
      log('❌ Still behind Cloudflare after waiting. See artifacts/page.png.');
      return;
    }
    log('✅ Cloudflare appears to be PASSED (real page content loaded).');

    // --- DISCOVERY: enumerate candidate Excel controls -----------------------
    const candidates = await page.evaluate(() => {
      const grab = (el) => ({
        tag: el.tagName,
        href: el.getAttribute('href') || '',
        src: el.getAttribute('src') || '',
        onclick: el.getAttribute('onclick') || '',
        title: el.getAttribute('title') || '',
        alt: el.getAttribute('alt') || '',
        text: (el.innerText || '').trim().slice(0, 40),
        outer: el.outerHTML.slice(0, 200),
      });
      const els = [...document.querySelectorAll('a, img, button, input[type=image]')];
      return els.map(grab);
    });

    const excelish = candidates.filter((c) =>
      looksLikeExcel(c.href + c.src + c.onclick + c.title + c.alt + c.text + c.outer)
    );

    fs.writeFileSync(
      path.join(OUT_DIR, 'candidates.json'),
      JSON.stringify({ allCount: candidates.length, excelish }, null, 2)
    );
    log(`Found ${excelish.length} Excel-looking element(s). Full list in artifacts/candidates.json`);
    excelish.forEach((c, i) => log(`  [${i}] ${c.tag} title="${c.title}" alt="${c.alt}" -> ${c.outer}`));

    if (excelish.length === 0) {
      verdict = 'CLOUDFLARE_PASSED_BUT_NO_EXCEL_BUTTON_FOUND';
      log('⚠️  Passed Cloudflare but could not spot the Excel button. Inspect candidates.json/page.html.');
      return;
    }

    // --- Try to trigger the download ----------------------------------------
    // We try each Excel-looking element until one produces a download event.
    for (let i = 0; i < excelish.length; i++) {
      const c = excelish[i];
      log(`Attempting download via candidate [${i}]...`);
      try {
        // Build a locator that matches this specific element.
        let locator;
        if (c.title) locator = page.locator(`[title="${c.title}"]`).first();
        else if (c.alt) locator = page.locator(`[alt="${c.alt}"]`).first();
        else if (c.href) locator = page.locator(`a[href="${c.href}"]`).first();
        else continue;

        const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
        await locator.click({ timeout: 5000 });
        const download = await downloadPromise;
        const savePath = path.join(OUT_DIR, download.suggestedFilename() || `download-${i}.xlsx`);
        await download.saveAs(savePath);
        const size = fs.statSync(savePath).size;
        log(`✅✅ DOWNLOAD SUCCESS: ${savePath} (${size} bytes)`);
        verdict = 'DOWNLOAD_SUCCESS';
        return;
      } catch (e) {
        log(`  candidate [${i}] did not yield a download: ${e.message}`);
      }
    }

    verdict = 'CLOUDFLARE_PASSED_BUT_DOWNLOAD_FAILED';
    log('⚠️  Passed Cloudflare, found Excel-looking buttons, but no click produced a download.');
  } catch (err) {
    verdict = 'ERROR';
    log('💥 Error:', err.message);
    await page.screenshot({ path: path.join(OUT_DIR, 'error.png'), fullPage: true }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT_DIR, 'verdict.txt'), verdict + '\n');
    log('VERDICT:', verdict);
    await browser.close();
  }
}

main();
