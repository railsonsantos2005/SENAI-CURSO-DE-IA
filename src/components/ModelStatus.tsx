import { useEffect, useState } from 'react';
import { onModelProgress } from '../services/embeddings';

interface ProgressInfo {
  status: string;
  file?: string;
  progress?: number;
}

export function ModelStatus() {
  const [info, setInfo] = useState<ProgressInfo | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = onModelProgress((msg) => {
      setInfo({ status: msg.status, file: msg.file, progress: msg.progress });
      setVisible(true);
      if (msg.status === 'ready' || msg.status === 'done') {
        window.setTimeout(() => setVisible(false), 1200);
      }
    });
    return unsubscribe;
  }, []);

  if (!visible || !info) return null;

  const percent =
    typeof info.progress === 'number' ? Math.round(info.progress) : null;

  return (
    <div className="model-status" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="small">
        {info.status === 'progress'
          ? `Carregando modelo${percent !== null ? ` (${percent}%)` : '...'}`
          : 'Modelo pronto'}
      </span>
      {percent !== null ? (
        <div className="model-progress">
          <div className="model-progress-bar" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}