import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pocketrag:theme';

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (window.localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const cycle = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  };

  const label =
    theme === 'light' ? 'Tema claro' : theme === 'dark' ? 'Tema escuro' : 'Tema do sistema';

  const icon =
    theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️';

  return (
    <button type="button" className="ghost theme-toggle" onClick={cycle} aria-label={label} title={label}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}