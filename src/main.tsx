import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { registerServiceWorker } from './registerSW';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();