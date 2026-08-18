'use client';

import { useState } from 'react';

// Client-side searchable club grid. Receives the full list from the server
// component and filters it live as you type (by name or code).
export default function ClubList({ clubs }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const filtered = query
    ? clubs.filter(
        (c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query)
      )
    : clubs;

  return (
    <>
      <input
        className="search"
        type="search"
        placeholder="Procurar clube por nome ou sigla…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Procurar clube"
        autoComplete="off"
      />

      {filtered.length === 0 ? (
        <p className="empty">Nenhum clube encontrado para “{q}”.</p>
      ) : (
        <div className="club-grid">
          {filtered.map((c) => (
            <a key={c.code} className="club-card" href={`/clube/${c.code}`}>
              <div className="code">{c.code}</div>
              <div className="name">{c.name}</div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
