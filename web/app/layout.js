import './globals.css';
import ThemeToggle from './ThemeToggle';

export const metadata = {
  title: 'Rankings de Natação — Portugal',
  description: 'Top 10 por prova, por clube, piscina longa e curta.',
  // Browser-tab icon. Add the file(s) in web/public/ (see below); until then
  // the browser just shows its default icon — nothing breaks.
  icons: {
    // ?v=N busts the browser's aggressive favicon cache — bump it if you swap the image.
    icon: [{ url: '/favicon.png?v=4', type: 'image/png' }],
    apple: '/apple-icon.png?v=2', // optional: web/public/apple-icon.png (iOS home screen)
  },
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
            <a href="/" className="brand">Rankings de Natação</a>
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
