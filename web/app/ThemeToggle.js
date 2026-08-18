'use client';

import { useEffect, useState } from 'react';

// Toggles data-theme on <html> and remembers the choice in localStorage.
// The initial theme is set by an inline script in layout.js (no flash on load).
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
  }, []);

  function toggle() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {}
    setTheme(next);
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label="Alternar modo claro/escuro"
      title="Alternar tema"
      suppressHydrationWarning
    >
      {theme === 'dark' ? '☀️' : theme === 'light' ? '🌙' : ''}
    </button>
  );
}
