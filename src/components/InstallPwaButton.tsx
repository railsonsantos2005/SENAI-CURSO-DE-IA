import { useEffect, useState } from 'react';

/**
 * Evento `beforeinstallprompt` (Chrome/Edge/Android). O DOM não expõe o tipo,
 * então declaramos a interface mínima que usamos.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * Botão "Instalar app" do PWA. Aparece só quando o navegador permite a
 * instalação (evento `beforeinstallprompt`); some se o app já está instalado.
 * No iOS (sem esse evento), o usuário instala via Compartilhar → Adicionar à
 * Tela de Início.
 */
export function InstallPwaButton() {
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (installed || !promptEvent) return null;

  const handleInstall = async () => {
    const event = promptEvent;
    setPromptEvent(null);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
  };

  return (
    <button type="button" className="install-btn" onClick={handleInstall}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Instalar app
    </button>
  );
}
