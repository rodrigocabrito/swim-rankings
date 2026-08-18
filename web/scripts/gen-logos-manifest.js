/**
 * Scans web/public/logos and writes web/lib/logos-manifest.json listing which
 * club logos exist. The app imports that manifest to render the correct logo URL
 * on the first paint (no 404 flash before falling back to the default).
 *
 * Runs automatically before `dev` and `build` (see package.json pre-scripts).
 */
const fs = require('fs');
const path = require('path');

const logosDir = path.join(__dirname, '..', 'public', 'logos');
const outFile = path.join(__dirname, '..', 'lib', 'logos-manifest.json');

let files = [];
try {
  files = fs.readdirSync(logosDir);
} catch {}

const pngs = files.filter((f) => /\.png$/i.test(f)).map((f) => f.replace(/\.png$/i, ''));
const codes = pngs.filter((c) => c.toUpperCase() !== 'FPN').sort();
const hasDefault = pngs.some((c) => c.toUpperCase() === 'FPN');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ codes, hasDefault }, null, 2) + '\n');
console.log(`logos-manifest: ${codes.length} club logo(s), default(FPN)=${hasDefault}`);
