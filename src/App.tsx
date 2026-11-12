import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { InstallPwaButton } from './components/InstallPwaButton';
import { ModelStatus } from './components/ModelStatus';
import { ThemeToggle } from './components/ThemeToggle';
import { backfillEmbeddings } from './services/documentService';

const DocumentsPage = lazy(() =>
  import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })),
);
const QuestionPage = lazy(() =>
  import('./pages/QuestionPage').then((m) => ({ default: m.QuestionPage })),
);

const IconQuestion = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconDocs = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconMobile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

function PageFallback() {
  return (
    <div className="stack gap-sm" aria-busy="true">
      <div className="skeleton" style={{ height: 28, width: '40%' }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}

export function App() {
  const [mobileMode, setMobileMode] = useState(false);

  useEffect(() => {
    void backfillEmbeddings().catch(() => undefined);
  }, []);

  return (
    <div className={`app${mobileMode ? ' mobile-mode' : ''}`}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <span className="brand">PocketRAG</span>
        <nav className="nav" aria-label="Navegação principal">
          <NavLink to="/" end className={navClass}>
            <IconQuestion /> Pergunta
          </NavLink>
          <NavLink to="/documents" className={navClass}>
            <IconDocs /> Documentos
          </NavLink>
          <button
            type="button"
            className={`ghost mobile-toggle${mobileMode ? ' active' : ''}`}
            onClick={() => setMobileMode((v) => !v)}
            aria-pressed={mobileMode}
            title="Alternar visualização mobile"
          >
            <IconMobile /> {mobileMode ? 'Desktop' : 'Mobile'}
          </button>
          <ModelStatus />
          <ThemeToggle />
          <InstallPwaButton />
        </nav>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<QuestionPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Bottom navigation for mobile / mobile mode */}
      <nav className="bottom-nav" aria-label="Navegação mobile">
        <NavLink to="/" end className={bottomNavClass}>
          <IconQuestion />
          <span>Pergunta</span>
        </NavLink>
        <NavLink to="/documents" className={bottomNavClass}>
          <IconDocs />
          <span>Documentos</span>
        </NavLink>
      </nav>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link active' : 'nav-link';
}

function bottomNavClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'bottom-nav-link active' : 'bottom-nav-link';
}