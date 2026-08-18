'use client';

// Catches runtime errors while rendering a route (e.g. Firestore unreachable).
// Must be a Client Component. Does NOT catch dev-only build/cache errors.
export default function Error({ error, reset }) {
  return (
    <div className="state-box">
      <h1>Algo correu mal</h1>
      <p className="subtitle">
        Não foi possível carregar esta página. Pode ser um problema temporário de ligação aos dados.
      </p>
      <div className="state-actions">
        <button className="pill active" onClick={() => reset()}>
          Tentar novamente
        </button>
        <a className="pill" href="/">
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
