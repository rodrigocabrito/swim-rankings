import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { formatCity } from '../../../lib/cities';

export const revalidate = 3600;

const COURSES = [
  { key: 'LCM', label: 'Piscina Longa (50m)' },
  { key: 'SCM', label: 'Piscina Curta (25m)' },
];
const GENDERS = [
  { key: 'M', label: 'Masculino' },
  { key: 'F', label: 'Feminino' },
];
const STROKES = [
  { key: 'Liv', label: 'Livres' },
  { key: 'Cos', label: 'Costas' },
  { key: 'Bru', label: 'Bruços' },
  { key: 'Mar', label: 'Mariposa' },
  { key: 'Est', label: 'Estilos' },
];
// Relays and individual splits (passagens) each get their own tab.
const RELAY = { key: 'Rel', label: 'Estafetas' };
const SPLITS = { key: 'Lap', label: 'Passagens' };
const STROKE_TABS = [...STROKES, RELAY, SPLITS];

async function getDocData(id) {
  const snap = await getDoc(doc(db, 'rankings', id));
  return snap.exists() ? snap.data() : null;
}

// ISO "2022-05-15" -> "15/05/2022" (pt format); blank if missing.
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default async function ClubPage({ params, searchParams }) {
  const code = params.code;
  const course = COURSES.some((c) => c.key === searchParams.course) ? searchParams.course : 'LCM';
  const gender = GENDERS.some((g) => g.key === searchParams.gender) ? searchParams.gender : 'M';
  const stroke = STROKE_TABS.some((s) => s.key === searchParams.stroke) ? searchParams.stroke : 'Liv';

  const data = await getDocData(`${code}_${course}_${gender}`);
  const clubName = data?.club?.name || code;

  // Estafetas tab = all relays; stroke tabs = individual events of that stroke only.
  // Split (Lap) passages stay hidden either way.
  const events = (data?.events || []).filter((e) =>
    stroke === 'Rel'
      ? e.type === 'relay'
      : stroke === 'Lap'
      ? e.type === 'split'
      : e.type === 'individual' && e.stroke === stroke
  );

  const isRelay = stroke === 'Rel';
  const showRudolph = course === 'LCM'; // Rudolph points only exist for long course.

  const linkFor = (c, g, s) => `/clube/${code}?course=${c}&gender=${g}&stroke=${s}`;

  return (
    <>
      <a className="back" href="/">← Todos os clubes</a>
      <h1>{clubName}</h1>
      <p className="subtitle">{code}</p>

      <div className="filters">
        <div className="filter-group">
          <span className="filter-label">Piscina</span>
          <div className="pills">
            {COURSES.map((c) => (
              <a key={c.key} className={`pill ${c.key === course ? 'active' : ''}`} href={linkFor(c.key, gender, stroke)}>
                {c.label}
              </a>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Género</span>
          <div className="pills">
            {GENDERS.map((g) => (
              <a key={g.key} className={`pill ${g.key === gender ? 'active' : ''}`} href={linkFor(course, g.key, stroke)}>
                {g.label}
              </a>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Estilo</span>
          <div className="pills">
            {STROKE_TABS.map((s) => (
              <a key={s.key} className={`pill ${s.key === stroke ? 'active' : ''}`} href={linkFor(course, gender, s.key)}>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="empty">Sem dados para esta combinação.</p>
      ) : (
        events.map((ev) => (
          <div className="event" key={ev.sheet}>
            <div className="event-title">
              {ev.sheet}
              {ev.type === 'relay' && <span className="badge">Estafeta</span>}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>{isRelay ? 'Equipa' : 'Nome'}</th>
                    {!isRelay && <th className="c">Ano</th>}
                    <th className="c">Tempo</th>
                    <th className="c">FINA</th>
                    {showRudolph && <th className="c">Rudolph</th>}
                    <th className="c">Data</th>
                    <th className="c">Cidade</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.swimmers.map((s, i) => (
                    <tr key={i}>
                      <td className="rank">{s.rank ?? i + 1}</td>
                      <td>{s.name}</td>
                      {!isRelay && <td className="c">{s.birthYear ?? ''}</td>}
                      <td className="time c">{s.time}</td>
                      <td className="c">{s.points ?? ''}</td>
                      {showRudolph && <td className="c">{s.rudolphPoints ?? ''}</td>}
                      <td className="cell-meta c">{fmtDate(s.meetDate)}</td>
                      <td className="cell-meta c">{formatCity(s.meetCity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
