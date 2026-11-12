import { useState, type FormEvent } from 'react';

interface QuestionInputProps {
  onSubmit: (question: string) => void | Promise<void>;
}

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export function QuestionInput({ onSubmit }: QuestionInputProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const current = question.trim();
    if (!current || busy) return;

    setBusy(true);
    try {
      await onSubmit(current);
      setQuestion('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack question-form" onSubmit={handleSubmit}>
      <textarea
        className="input textarea"
        placeholder="Faça uma pergunta sobre seus documentos..."
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={4}
      />
      <div className="row question-actions">
        <span className="muted small">
          {question.trim().length > 0 ? `${question.trim().length} caracteres` : 'Digite sua pergunta'}
        </span>
        <button type="submit" disabled={busy || question.trim().length === 0}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Perguntando...
            </>
          ) : (
            <>
              <IconSend /> Perguntar
            </>
          )}
        </button>
      </div>
    </form>
  );
}