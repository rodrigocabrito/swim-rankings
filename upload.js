/**
 * Uploader: pushes the parsed JSON into Firestore.
 *
 * Data model (flat):
 *   collection "rankings" -> doc id "<CODE>_<COURSE>_<GENDER>" (e.g. CFB_LCM_M)
 *                            = that file's club/course/gender + its events
 *   collection "meta"     -> doc "index" = the clubs index (for site navigation)
 *
 * Auth: uses serviceAccountKey.json (Admin SDK) — bypasses security rules, so the
 * laptop can write freely while the public can only read.
 *
 * Run:  node upload.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const PARSED_DIR = path.join(__dirname, 'parsed');

if (!fs.existsSync(KEY_PATH)) {
  console.error('❌ serviceAccountKey.json not found. Download it from Firebase console');
  console.error('   (Project settings → Service accounts → Generate new private key)');
  console.error('   and save it as:', KEY_PATH);
  process.exit(1);
}

const serviceAccount = require(KEY_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const log = (...a) => console.log(...a);

async function commitInChunks(docs) {
  // Firestore batches cap at 500 writes.
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const { ref, data } of docs.slice(i, i + CHUNK)) batch.set(ref, data);
    await batch.commit();
    written += Math.min(CHUNK, docs.length - i);
    log(`  committed ${written}/${docs.length}`);
  }
}

async function main() {
  const files = fs
    .readdirSync(PARSED_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json');

  if (files.length === 0) {
    console.error('No parsed JSON found in', PARSED_DIR, '- run `node parse.js` first.');
    process.exit(1);
  }

  log(`Project: ${serviceAccount.project_id}`);
  log(`Uploading ${files.length} ranking docs to collection "rankings"...`);

  const docs = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, f), 'utf8'));
    const id = f.replace(/\.json$/, ''); // CFB_LCM_M
    data.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    return { ref: db.collection('rankings').doc(id), data };
  });

  await commitInChunks(docs);

  // Index doc for site navigation.
  const indexPath = path.join(PARSED_DIR, 'index.json');
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    index.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('meta').doc('index').set(index);
    log('  wrote meta/index');
  }

  log(`✅ Done. ${files.length} ranking docs + index uploaded.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('💥 Upload failed:', e.message);
  process.exit(1);
});
