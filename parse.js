/**
 * Parser: turns the downloaded swimrankings .xlsx files into clean JSON.
 *
 * Input:  downloads/POR-<CODE>_<COURSE>_<GENDER>.xlsx  (one club x course x gender)
 * Output: parsed/<CODE>_<COURSE>_<GENDER>.json         (top 10 per event)
 *         parsed/index.json                            (summary for site nav / Firestore)
 *
 * Each input sheet = one event. Rows are pre-sorted by PLACE, so "top 10" = first 10.
 * No browser / network here — pure transformation, runs on the files already on disk.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DL_DIR = path.join(__dirname, 'downloads');
const OUT_DIR = path.join(__dirname, 'parsed');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Clean club display names come from the config we control, not the messy sheet title.
const CLUB_NAMES = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'clubs.json'), 'utf8')).map((c) => [c.code, c.name])
);

const TOP_N = 10;

// Portuguese stroke names for the four codes + medley.
const STROKE_NAMES = {
  Liv: 'Livre',
  Cos: 'Costas',
  Bru: 'Bruços',
  Mar: 'Mariposa',
  Est: 'Estilos',
};

const log = (...a) => console.log(...a);

// POR-CFB_LCM_Men.xlsx -> { code:'CFB', course:'LCM', gender:'M' }
function parseFileName(fn) {
  const m = fn.match(/^POR-(.+)_(LCM|SCM)_(Men|Women)\.xlsx$/i);
  if (!m) return null;
  return {
    code: m[1],
    course: m[2].toUpperCase(),
    gender: m[3].toLowerCase() === 'men' ? 'M' : 'F',
  };
}

// Event kind from the sheet name.
function classifyEvent(sheetName) {
  const s = sheetName.toLowerCase();
  if (s.includes('lap')) return 'split'; // e.g. "50m Liv Lap" — passage/split times
  if (s.includes('x')) return 'relay';   // e.g. "4 x 100m Liv"
  return 'individual';
}

function toISODate(v) {
  // Use LOCAL components — SheetJS dates are at local midnight, so toISOString()
  // (UTC) would shift the day back by one in timezones ahead of UTC.
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}
function toYear(v) {
  if (v instanceof Date && !isNaN(v)) return v.getFullYear();
  return null;
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function parseSheet(ws, sheetName) {
  // header:1 -> array of arrays. Row 0 = club title, Row 1 = header, Row 2+ = data.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, cellDates: true, defval: null });
  if (rows.length < 3) return null;

  const header = rows[1].map((h) => (h == null ? '' : String(h).trim()));
  const col = {};
  header.forEach((h, i) => (col[h] = i));
  const get = (row, name) => (col[name] != null ? row[col[name]] : null);

  const dataRows = rows.slice(2).filter((r) => r && r.some((c) => c != null));
  const top = dataRows.slice(0, TOP_N);
  if (top.length === 0) return null;

  const type = classifyEvent(sheetName);
  const first = top[0];

  const swimmers = top.map((r) => ({
    rank: num(get(r, 'PLACE')),
    name: get(r, 'FULLNAME') || null,
    birthYear: toYear(get(r, 'BIRTHDATE')),
    nation: get(r, 'NATION') || null,
    time: get(r, 'SWIMTIME') != null ? String(get(r, 'SWIMTIME')) : null,
    timeSeconds: num(get(r, 'SWIMTIME_N')),
    points: num(get(r, 'PTS_FINA')),
    rudolphPoints: num(get(r, 'PTS_RUDOLPH')),
    meetDate: toISODate(get(r, 'MEETDATE')),
    meetCity: get(r, 'MEETCITY') || null,
    meetName: get(r, 'MEETNAME') || null,
  }));

  return {
    sheet: sheetName,
    distance: get(first, 'DISTANCE') != null ? String(get(first, 'DISTANCE')) : null,
    stroke: get(first, 'STROKE') || null,
    strokeName: STROKE_NAMES[get(first, 'STROKE')] || get(first, 'STROKE') || null,
    type,
    swimmers,
  };
}

// Reports cities never seen before, so new FOREIGN cities can be tagged in
// web/lib/cities.js. Keeps a committed ledger (known-cities.json); anything not
// in it is "new". Cross-checks the web map to say which new ones still need a code.
function detectNewCities(allCities) {
  const LEDGER = path.join(__dirname, 'known-cities.json');
  let known = [];
  try {
    known = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {}

  const current = [...allCities].sort((a, b) => a.localeCompare(b, 'pt'));

  // First run: silently establish the baseline (already reflected in cities.js).
  if (known.length === 0) {
    fs.writeFileSync(LEDGER, JSON.stringify(current, null, 2) + '\n');
    log(`\n🌍 Seeded known-cities baseline with ${current.length} cities.`);
    return;
  }

  const knownSet = new Set(known);
  const newOnes = current.filter((c) => !knownSet.has(c));

  // Which cities already have a country code in the web app's cities.js?
  const classified = new Set();
  try {
    const txt = fs.readFileSync(path.join(__dirname, 'web', 'lib', 'cities.js'), 'utf8');
    const re = /(?:'([^']+)'|([A-Za-z][\w.]*))\s*:\s*'[A-Z]{3}'/g;
    let m;
    while ((m = re.exec(txt))) classified.add(m[1] || m[2]);
  } catch {}

  if (newOnes.length === 0) {
    log('\n🌍 No new cities this sync.');
  } else {
    log(`\n🌍 ${newOnes.length} NEW cit${newOnes.length === 1 ? 'y' : 'ies'} this sync — check if any are foreign:`);
    for (const c of newOnes) {
      const tag = classified.has(c)
        ? 'already tagged ✅'
        : '❓ if foreign, add to web/lib/cities.js';
      log(`   • ${c}  →  ${tag}`);
    }
  }

  const merged = [...new Set([...known, ...current])].sort((a, b) => a.localeCompare(b, 'pt'));
  fs.writeFileSync(LEDGER, JSON.stringify(merged, null, 2) + '\n');
}

function main() {
  const files = fs
    .readdirSync(DL_DIR)
    .filter((f) => /^POR-.+_(LCM|SCM)_(Men|Women)\.xlsx$/i.test(f));

  if (files.length === 0) {
    log('No downloaded files found in', DL_DIR);
    return;
  }

  const index = { generatedAt: new Date().toISOString(), clubs: {} };
  let totalEvents = 0;
  const allCities = new Set();

  for (const fn of files) {
    const meta = parseFileName(fn);
    if (!meta) {
      log('  skip (bad name):', fn);
      continue;
    }
    const wb = XLSX.readFile(path.join(DL_DIR, fn), { cellDates: true });
    const events = [];
    let clubName = meta.code;

    for (const sheetName of wb.SheetNames) {
      if (sheetName.toLowerCase().includes('top results')) continue; // summary sheet
      const parsed = parseSheet(wb.Sheets[sheetName], sheetName);
      if (!parsed) continue;
      for (const s of parsed.swimmers) if (s.meetCity) allCities.add(s.meetCity);
      events.push(parsed);
    }

    // Clean display name from our config; fall back to the sheet title row.
    if (CLUB_NAMES[meta.code]) {
      clubName = CLUB_NAMES[meta.code];
    } else {
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const titleRow = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false })[0];
      if (titleRow && titleRow[0]) clubName = String(titleRow[0]).trim();
    }

    const out = {
      club: { code: meta.code, name: clubName },
      course: meta.course,
      gender: meta.gender,
      generatedAt: index.generatedAt,
      eventCount: events.length,
      events,
    };
    const outName = `${meta.code}_${meta.course}_${meta.gender}.json`;
    fs.writeFileSync(path.join(OUT_DIR, outName), JSON.stringify(out, null, 2));
    totalEvents += events.length;

    // Build index.
    const ck = meta.code;
    index.clubs[ck] = index.clubs[ck] || { code: meta.code, name: clubName, files: [] };
    index.clubs[ck].name = clubName;
    index.clubs[ck].files.push({ course: meta.course, gender: meta.gender, events: events.length, file: outName });

    log(`  ${outName.padEnd(22)} ${events.length} events, top-${TOP_N} each`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  log(`\nParsed ${files.length} files, ${Object.keys(index.clubs).length} clubs, ${totalEvents} events total.`);
  log('Output in parsed/');

  detectNewCities(allCities);
}

main();
