// Shown for unknown routes (404).
export default function NotFound() {
  return (
    <div className="state-box">
      <h1>Página não encontrada</h1>
      <p className="subtitle">Não encontrámos o que procuravas.</p>
      <div className="state-actions">
        <a className="pill active" href="/">
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
