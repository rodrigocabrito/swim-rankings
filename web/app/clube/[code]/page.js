import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import ClubView from './ClubView';

// Rebuild at most hourly; the page is static/cacheable (no per-request Firestore).
export const revalidate = 3600;

// Pre-render every club page at build so the first visit is instant too.
export async function generateStaticParams() {
  try {
    const snap = await getDoc(doc(db, 'meta', 'index'));
    const clubs = snap.exists() ? snap.data().clubs || {} : {};
    return Object.keys(clubs).map((code) => ({ code }));
  } catch {
    return [];
  }
}

const COURSES = ['LCM', 'SCM'];
const GENDERS = ['M', 'F'];

// Keep only the fields the UI actually shows — shrinks the page payload a lot.
function slimEvents(events) {
  return (events || []).map((e) => ({
    sheet: e.sheet,
    stroke: e.stroke,
    type: e.type,
    swimmers: (e.swimmers || []).map((s) => ({
      rank: s.rank,
      name: s.name,
      birthYear: s.birthYear,
      time: s.time,
      points: s.points,
      rudolphPoints: s.rudolphPoints,
      meetDate: s.meetDate,
      meetCity: s.meetCity,
    })),
  }));
}

export default async function ClubPage({ params }) {
  const code = params.code;
  let clubName = code;

  const rankings = { LCM: {}, SCM: {} };
  await Promise.all(
    COURSES.flatMap((c) =>
      GENDERS.map(async (g) => {
        const snap = await getDoc(doc(db, 'rankings', `${code}_${c}_${g}`));
        if (snap.exists()) {
          const d = snap.data();
          clubName = d.club?.name || clubName;
          rankings[c][g] = slimEvents(d.events);
        } else {
          rankings[c][g] = [];
        }
      })
    )
  );

  const hof = {};
  await Promise.all(
    GENDERS.map(async (g) => {
      const snap = await getDoc(doc(db, 'halloffame', `${code}_${g}`));
      hof[g] = snap.exists() ? { overall: snap.data().overall, strokes: snap.data().strokes } : null;
    })
  );

  return <ClubView code={code} clubName={clubName} rankings={rankings} hof={hof} />;
}
