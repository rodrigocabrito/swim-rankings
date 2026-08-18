import './globals.css';

export const metadata = {
  title: 'Rankings de Natação — Portugal',
  description: 'Top 10 por prova, por clube, piscina longa e curta.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <body>
        <header className="site-header">
          <a href="/" className="brand">🏊 Rankings de Natação</a>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Dados de swimrankings.net · Atualizado semanalmente
        </footer>
      </body>
    </html>
  );
}
