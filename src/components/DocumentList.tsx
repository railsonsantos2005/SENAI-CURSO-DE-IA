import type { Document } from '../types/document';

interface DocumentListProps {
  documents: Document[];
  onDelete?: (id: string) => void;
}

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const IconDoc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export function DocumentList({ documents, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <IconDoc />
        </div>
        <p className="empty">Nenhum documento salvo.</p>
        <p className="muted small">Anexe um arquivo de texto para começar.</p>
      </div>
    );
  }

  return (
    <ul className="doc-list">
      {documents.map((doc) => (
        <li key={doc.id} className="card doc-card">
          <div className="doc-head">
            <div className="doc-title-wrap">
              <span className="doc-icon">
                <IconDoc />
              </span>
              <strong className="doc-title">{doc.title}</strong>
            </div>
            <span className="doc-date">
              {new Date(doc.createdAt).toLocaleString('pt-BR')}
            </span>
          </div>

          <p className="doc-content">{doc.content || '(sem conteúdo)'}</p>

          {onDelete ? (
            <div className="row">
              <button
                type="button"
                className="danger"
                onClick={() => onDelete(doc.id)}
              >
                <IconTrash /> Excluir
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}