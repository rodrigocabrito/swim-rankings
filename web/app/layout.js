import './globals.css';
import ThemeToggle from './ThemeToggle';

export const metadata = {
  title: 'Rankings de Natação — Portugal',
  description: 'Top 10 por prova, por clube, piscina longa e curta.',
};

// Runs before paint: sets the theme from localStorage or system preference so
// there's no flash of the wrong theme on load.
const themeScript = `
(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <header className="site-header">
          <div className="header-inner">
            <a href="/" className="brand">🏊 Rankings de Natação</a>
            <ThemeToggle />
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Dados de swimrankings.net · Atualizado semanalmente
        </footer>
      </body>
    </html>
  );
}
