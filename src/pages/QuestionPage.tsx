import { useState } from 'react';
import { QuestionInput } from '../components/QuestionInput';
import { useToast } from '../components/ToastProvider';
import { fetchAnswer } from '../services/apiService';
import { searchRelevantChunks } from '../services/documentService';
import type { RelevantChunk } from '../types/search';
import { countMarkdownTokens, toPlainText } from '../utils/plainText';

type Status = 'searching' | 'success' | 'no-context' | 'error';

interface Turn {
  id: number;
  question: string;
  status: Status;
  answer: string | null;
  sources: RelevantChunk[];
  error: string | null;
}

const IconRetry = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconSource = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export function QuestionPage() {
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);

  const ask = async (question: string) => {
    const id = Date.now();
    const pending: Turn = {
      id,
      question,
      status: 'searching',
      answer: null,
      sources: [],
      error: null,
    };
    setTurns((prev) => [...prev, pending]);

    try {
      const chunks = await searchRelevantChunks(question, 5);
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, sources: chunks } : t)),
      );

      if (chunks.length === 0) {
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: 'no-context' } : t)),
        );
        return;
      }

      const contexts = chunks.map((c) => c.content);
      const result = await fetchAnswer(question, contexts);
      const plain = toPlainText(result || 'Sem resposta.');
      console.debug('[resposta] markdownTokens:', countMarkdownTokens(plain));
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'success', answer: plain } : t,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao obter resposta.';
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'error', error: message } : t)),
      );
      toast.show('error', message);
    }
  };

  const retry = (turn: Turn) => {
    setTurns((prev) => prev.filter((t) => t.id !== turn.id));
    void ask(turn.question);
  };

  const copyAnswer = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('success', 'Resposta copiada.');
    } catch {
      toast.show('error', 'Não foi possível copiar.');
    }
  };

  const clearHistory = () => {
    setTurns([]);
    toast.show('info', 'Histórico limpo.');
  };

  return (
    <section className="stack gap-lg">
      <div className="page-intro">
        <h2>Pergunta</h2>
        <p className="muted">
          Faça perguntas e o PocketRAG busca os trechos mais relevantes nos seus documentos para gerar a resposta.
        </p>
      </div>

      <QuestionInput onSubmit={ask} />

      {turns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <IconSource />
          </div>
          <p className="empty">Nenhuma pergunta ainda.</p>
          <p className="muted small">Digite uma pergunta acima para começar.</p>
        </div>
      ) : null}

      <div className="stack gap-lg" aria-live="polite">
        {turns.map((turn) => (
          <article key={turn.id} className="turn">
            <div className="card asked">
              <span className="muted small">Sua pergunta:</span>
              <strong>{turn.question}</strong>
            </div>

            {turn.status === 'searching' ? (
              <div className="card status">
                <span className="spinner" aria-hidden="true" />
                <span>Buscando trechos e gerando resposta...</span>
              </div>
            ) : null}

            {turn.status === 'no-context' ? (
              <div className="card status warn">
                Nenhum trecho relevante encontrado. Tente perguntas mais específicas sobre o conteúdo
                (ex.: "Qual o tema principal?", "Resuma o documento", "O que diz sobre X?"). Se o documento
                acabou de ser anexado, aguarde a vetorização concluir.
              </div>
            ) : null}

            {turn.status === 'error' ? (
              <div className="card status error">
                <span>Erro: {turn.error}</span>
                <span className="muted small">
                  Os trechos recuperados (se houver) aparecem abaixo. Verifique a chave da API no servidor.
                </span>
                <button type="button" onClick={() => retry(turn)}>
                  <IconRetry /> Tentar novamente
                </button>
              </div>
            ) : null}

            {turn.status === 'success' && turn.answer ? (
              <div className="card status success answer-card">
                <p className="answer">{turn.answer}</p>
                <div className="row answer-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => copyAnswer(turn.answer as string)}
                  >
                    <IconCopy /> Copiar
                  </button>
                </div>
              </div>
            ) : null}

            {turn.sources.length > 0 ? (
              <details className="sources">
                <summary className="sources-summary">
                  Trechos selecionados ({turn.sources.length})
                </summary>
                <ul className="doc-list">
                  {turn.sources.map((source, index) => (
                    <li key={index} className="card doc-card source-card">
                      <div className="doc-head">
                        <strong className="doc-title">
                          <IconSource /> {source.title}
                        </strong>
                        <span className="rank-badge">
                          rank: {typeof source.rank === 'number' ? source.rank.toFixed(4) : 'n/d'}
                        </span>
                      </div>
                      <p className="doc-content">{source.content}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
      </div>

      {turns.length > 0 ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="ghost" onClick={clearHistory}>
            Limpar histórico
          </button>
        </div>
      ) : null}
    </section>
  );
}