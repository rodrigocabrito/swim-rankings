import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ClubList from './ClubList';

// Rebuild the page at most once an hour (data changes weekly).
export const revalidate = 3600;

async function getClubs() {
  const snap = await getDoc(doc(db, 'meta', 'index'));
  if (!snap.exists()) return [];
  const clubs = snap.data().clubs || {};
  return Object.values(clubs).sort((a, b) => a.code.localeCompare(b.code, 'pt'));
}

export default async function Home() {
  const clubs = await getClubs();

  return (
    <>
      <h1>Rankings de Natação</h1>
      <p className="subtitle">Top 10 por prova · Piscina longa (50m) e curta (25m) · Masculino e Feminino.</p>

      {clubs.length === 0 ? (
        <p className="empty">Ainda não há dados. Corre o scraper para carregar os clubes.</p>
      ) : (
        <ClubList clubs={clubs} />
      )}
    </>
  );
}
