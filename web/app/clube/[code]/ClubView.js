'use client';

import { useEffect, useState } from 'react';
import { formatCity } from '../../../lib/cities';
import ClubLogo from '../../ClubLogo';

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
const RELAY = { key: 'Rel', label: 'Estafetas' };
const SPLITS = { key: 'Lap', label: 'Passagens' };
const STROKE_TABS = [...STROKES, RELAY, SPLITS];

const medalCls = (rank) => (rank >= 1 && rank <= 3 ? ` medal-${rank}` : '');
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function HofTable({ title, rows, highlight }) {
  return (
    <div className={`event${highlight ? ' hof-overall' : ''}`}>
      <div className="event-title">
        {highlight && <span className="badge">🏆</span>}
        {title}
      </div>
      {rows && rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Atleta</th>
                <th className="c">Ano</th>
                <th className="c">Pts</th>
                <th className="c">Méd.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`rank${medalCls(r.rank)}`}>{r.rank}</td>
                  <td>{r.name}</td>
                  <td className="c">{r.birthYear ?? ''}</td>
                  <td className="time c">{r.points}</td>
                  <td className="cell-meta c">{r.avgRank ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Sem dados.</p>
      )}
    </div>
  );
}

// All filtering happens here in the browser — instant, no navigation or server reads.
export default function ClubView({ code, clubName, rankings, hof }) {
  const [view, setView] = useState('rankings');
  const [course, setCourse] = useState('LCM');
  const [gender, setGender] = useState('M');
  const [stroke, setStroke] = useState('Liv');

  // Read deep-link filters from the URL once (so shared links still work).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('view') === 'hof') setView('hof');
    if (COURSES.some((c) => c.key === p.get('course'))) setCourse(p.get('course'));
    if (GENDERS.some((g) => g.key === p.get('gender'))) setGender(p.get('gender'));
    if (STROKE_TABS.some((s) => s.key === p.get('stroke'))) setStroke(p.get('stroke'));
  }, []);

  // Keep the URL bar in sync WITHOUT navigating (shareable + back-button friendly).
  useEffect(() => {
    const p = new URLSearchParams();
    if (view === 'hof') {
      p.set('view', 'hof');
      p.set('gender', gender);
    } else {
      p.set('course', course);
      p.set('gender', gender);
      p.set('stroke', stroke);
    }
    window.history.replaceState(null, '', `/clube/${code}?${p.toString()}`);
  }, [view, course, gender, stroke, code]);

  const hofData = hof?.[gender] || null;
  const events = (rankings?.[course]?.[gender] || []).filter((e) =>
    stroke === 'Rel'
      ? e.type === 'relay'
      : stroke === 'Lap'
      ? e.type === 'split'
      : e.type === 'individual' && e.stroke === stroke
  );
  const isRelay = stroke === 'Rel';
  const showRudolph = course === 'LCM';

  // pill as <a> (href for share/no-JS) but onClick sets state instantly.
  const Pill = ({ active, onPick, href, children }) => (
    <a
      className={`pill ${active ? 'active' : ''}`}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      {children}
    </a>
  );

  return (
    <>
      <a className="back" href="/">← Todos os clubes</a>
      <div className="club-header">
        <ClubLogo code={code} name={clubName} size={56} />
        <div>
          <h1>{clubName}</h1>
          <p className="subtitle">{code}</p>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <span className="filter-label">Ver</span>
          <div className="pills">
            <Pill active={view === 'rankings'} onPick={() => setView('rankings')} href={`/clube/${code}`}>
              Rankings
            </Pill>
            <Pill active={view === 'hof'} onPick={() => setView('hof')} href={`/clube/${code}?view=hof&gender=${gender}`}>
              🏆 Hall of Fame
            </Pill>
          </div>
        </div>
        {view === 'rankings' && (
          <div className="filter-group">
            <span className="filter-label">Piscina</span>
            <div className="pills">
              {COURSES.map((c) => (
                <Pill key={c.key} active={c.key === course} onPick={() => setCourse(c.key)} href={`/clube/${code}?course=${c.key}&gender=${gender}&stroke=${stroke}`}>
                  {c.label}
                </Pill>
              ))}
            </div>
          </div>
        )}
        <div className="filter-group">
          <span className="filter-label">Género</span>
          <div className="pills">
            {GENDERS.map((g) => (
              <Pill key={g.key} active={g.key === gender} onPick={() => setGender(g.key)} href={`/clube/${code}?gender=${g.key}`}>
                {g.label}
              </Pill>
            ))}
          </div>
        </div>
        {view === 'rankings' && (
          <div className="filter-group">
            <span className="filter-label">Estilo</span>
            <div className="pills">
              {STROKE_TABS.map((s) => (
                <Pill key={s.key} active={s.key === stroke} onPick={() => setStroke(s.key)} href={`/clube/${code}?course=${course}&gender=${gender}&stroke=${s.key}`}>
                  {s.label}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>

      {view === 'hof' ? (
        !hofData ? (
          <p className="empty">Sem dados para esta combinação.</p>
        ) : (
          <>
            <p className="subtitle">
              Pontuação combinada (piscina longa + curta): 10 pts pelo 1.º lugar do clube em cada prova, até 1 pt pelo 10.º.
            </p>
            <HofTable title="Geral — Todos os Estilos" rows={hofData.overall} highlight />
            {STROKES.map((s) => (
              <HofTable key={s.key} title={s.label} rows={hofData.strokes?.[s.key]} />
            ))}
          </>
        )
      ) : events.length === 0 ? (
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
                      <td className={`rank${medalCls(s.rank ?? i + 1)}`}>{s.rank ?? i + 1}</td>
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
