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
  const textMatch =
    // English
    hay.includes('just a moment') ||
    hay.includes('checking your browser') ||
    hay.includes('verify you are human') ||
    hay.includes('cf-challenge') ||
    hay.includes('enable javascript and cookies') ||
    // Portuguese (the variant we actually hit)
    hay.includes('verificação de segurança') ||
    hay.includes('confirme que é humano') ||
    hay.includes('não é um bot') ||
    hay.includes('ray id');
  // Also treat the presence of a Turnstile iframe as "still walled".
  const hasTurnstile = await page
    .locator('iframe[src*="challenges.cloudflare.com"]')
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return textMatch || hasTurnstile;
}

// Positive signal that the REAL ranking page loaded (not the challenge).
async function isRealPage(page) {
  return page
    .evaluate(() => {
      const t = (document.body?.innerText || '').toLowerCase();
      // The real rankingDetail page shows the club and ranking UI.
      return t.includes('swimrankings') && (t.includes('ranking') || t.includes('clube'));
    })
    .catch(() => false);
}

// Try to click the Turnstile "Confirme que é humano" checkbox.
// Two strategies: (1) pierce the iframe and click the checkbox element directly,
// (2) human-like mouse move + click at the checkbox's on-screen position.
async function tryClickTurnstile(page, log) {
  // Strategy 1: frameLocator into the challenge iframe.
  try {
    const fl = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
    const cb = fl.locator('input[type="checkbox"], label, #challenge-stage, .cb-lb, .cb-c').first();
    if (await cb.count().catch(() => 0)) {
      await cb.click({ timeout: 4000 });
      log('  clicked Turnstile via frameLocator');
      return true;
    }
  } catch (e) {
    log('  frameLocator click failed:', e.message);
  }
  // Strategy 2: real mouse move + click at the widget checkbox position.
  try {
    const iframe = page.locator('iframe[src*="challenges.cloudflare.com"]').first();
    if ((await iframe.count()) === 0) return false;
    const box = await iframe.boundingBox();
    if (box) {
      const x = box.x + 32;
      const y = box.y + box.height / 2;
      // Move in human-like steps before clicking.
      await page.mouse.move(x - 50, y - 25, { steps: 8 });
      await page.mouse.move(x, y, { steps: 12 });
      await page.waitForTimeout(350);
      await page.mouse.click(x, y, { delay: 70 });
      log(`  clicked Turnstile (mouse) at ~(${Math.round(x)}, ${Math.round(y)})`);
      return true;
    }
  } catch (e) {
    log('  mouse click attempt failed:', e.message);
  }
  return false;
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
    // Turnstile can auto-solve after a few seconds; if not, we click the checkbox.
    log('Waiting for Cloudflare challenge to clear (up to ~90s)...');
    let clickedOnce = false;
    for (let i = 0; i < 18; i++) {
      await page.waitForTimeout(5000);
      if ((await isRealPage(page)) && !(await isCloudflareWall(page))) {
        log(`  challenge cleared on check ${i + 1}.`);
        break;
      }
      log(`  still on challenge screen (check ${i + 1}/18)...`);
      // Retry clicking the Turnstile checkbox on several cycles (10s, 20s, 30s, 45s).
      if ([2, 4, 6, 9].includes(i)) {
        await page.screenshot({ path: path.join(OUT_DIR, `before-click-${i}.png`) }).catch(() => {});
        clickedOnce = (await tryClickTurnstile(page, log)) || clickedOnce;
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT_DIR, `after-click-${i}.png`) }).catch(() => {});
      }
    }

    const blocked = (await isCloudflareWall(page)) || !(await isRealPage(page));
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
