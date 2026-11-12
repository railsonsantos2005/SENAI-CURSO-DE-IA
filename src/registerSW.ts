/**
 * Registro do service worker — APENAS em produção.
 *
 * Em dev o SW intercepta o HMR do Vite e quebra os hot reloads,
 * por isso o guard com import.meta.env.PROD.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err: unknown) => {
        console.error('Falha ao registrar o service worker:', err);
      });
  });
}
