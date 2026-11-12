import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { DocumentList } from '../components/DocumentList';
import { useToast } from '../components/ToastProvider';
import { addDocument, deleteDocument, listDocuments } from '../services/documentService';
import { extractPdfText } from '../services/pdfText';
import type { Document } from '../types/document';

const TEXT_TYPES = ['text/', 'application/json', 'application/xml', ''];

const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export function DocumentsPage() {
  const toast = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listDocuments();
        if (active) setDocuments(data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    await refresh();
    toast.show('success', 'Documento excluído.');
  };

  const isSupported = (file: File): boolean => {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return true;
    return (
      TEXT_TYPES.some((t) => t && file.type.startsWith(t)) ||
      /\.(txt|md|csv|json|xml|html|log|ts|js|tsx|jsx|css)$/i.test(file.name)
    );
  };

  const readFileContent = async (file: File): Promise<string | null> => {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (isPdf) return extractPdfText(file);
    return file.text();
  };

  const processFiles = async (files: File[]) => {
    const supported = files.filter(isSupported);
    const unsupported = files.filter((f) => !isSupported(f));
    if (unsupported.length > 0) {
      toast.show('error', `${unsupported.length} arquivo(s) não suportado(s) ignorado(s).`);
    }
    if (supported.length === 0) return;

    setAttaching(true);
    setProgress({ done: 0, total: supported.length });

    let savedCount = 0;
    for (let i = 0; i < supported.length; i++) {
      const file = supported[i];
      try {
        const content = await readFileContent(file);
        if (!content || !content.trim()) {
          toast.show('error', `"${file.name}" está vazio ou sem texto extraível.`);
          continue;
        }
        const saved = await addDocument(file.name, content);
        savedCount++;
        if (!saved.vectorized) {
          toast.show('info', `"${file.name}" anexado; vetorização pendente.`);
        }
      } catch (err) {
        toast.show('error', err instanceof Error ? err.message : `Falha ao processar "${file.name}".`);
      } finally {
        setProgress({ done: i + 1, total: supported.length });
      }
    }

    await refresh();
    if (savedCount > 0) {
      toast.show('success', `${savedCount} documento(s) anexado(s).`);
    }
    setAttaching(false);
    setProgress(null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await processFiles(files);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    await processFiles(files);
  };

  if (loading) {
    return (
      <section className="stack gap-lg">
        <div className="page-intro">
          <h2>Documentos</h2>
          <p className="muted">Carregando sua biblioteca...</p>
        </div>
        <div className="stack gap-sm">
          <div className="skeleton" style={{ height: 88 }} />
          <div className="skeleton" style={{ height: 88 }} />
          <div className="skeleton" style={{ height: 88 }} />
        </div>
      </section>
    );
  }

  return (
    <section className="stack gap-lg">
      <div className="page-intro">
        <h2>Documentos</h2>
        <p className="muted">
          Anexe arquivos de texto ou PDFs para que o PocketRAG possa responder perguntas com base neles.
        </p>
      </div>

      <div
        className={`card attach-card dropzone${dragging ? ' dropzone-active' : ''}${attaching ? ' disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!attaching) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="attach-header">
          <div>
            <h3>Anexar documento</h3>
            <p className="muted small">
              Arraste arquivos aqui ou clique para selecionar. Formatos: .txt, .md, .csv, .json, .xml, .html, .log, código e .pdf.
            </p>
          </div>
          <label className={`file-label${attaching ? ' disabled' : ''}`}>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.xml,.html,.log,.pdf,text/*,application/pdf"
              onChange={handleFileChange}
              disabled={attaching}
            />
            <span className="file-button">
              {attaching ? <span className="spinner" aria-hidden="true" /> : <IconUpload />}
              {attaching ? 'Anexando...' : 'Selecionar arquivos'}
            </span>
          </label>
        </div>

        {attaching && progress ? (
          <div className="progress">
            <div
              className="progress-bar"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
            <span className="muted small">
              Processando {progress.done} de {progress.total}...
            </span>
          </div>
        ) : null}
      </div>

      <div className="stack gap-sm">
        <div className="sources-header">
          <h3>Biblioteca</h3>
          <span className="badge">{documents.length}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(documents, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `pocketrag-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.show('success', 'Biblioteca exportada.');
            }}
            disabled={documents.length === 0}
          >
            Exportar JSON
          </button>
        </div>
        <DocumentList documents={documents} onDelete={handleDelete} />
      </div>
    </section>
  );
}