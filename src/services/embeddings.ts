/**
 * Cliente do worker de embeddings.
 *
 * A inferência roda SEMPRE em Web Worker (nunca na thread principal) e em
 * lotes de EMBEDDING_BATCH_SIZE textos. Se o worker/modelo não estiver
 * disponível (ex.: testes em Node), lança EmbeddingUnavailableError — o
 * chamador decide o fallback (busca léxica).
 */

export const EMBEDDING_BATCH_SIZE = 16;
export const EMBEDDING_TIMEOUT_MS = 120_000;

export class EmbeddingUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmbeddingUnavailableError';
  }
}

interface EmbedRequest {
  type: 'embed';
  id: number;
  texts: string[];
}

type WorkerResponse =
  | { type: 'result'; id: number; embeddings: Float32Array[] }
  | { type: 'error'; id: number; message: string }
  | { type: 'progress'; status: string; file?: string; progress?: number; loaded?: number; total?: number };

/** Divide os textos em lotes de no máximo `batchSize`. */
export function splitIntoBatches(texts: string[], batchSize = EMBEDDING_BATCH_SIZE): string[][] {
  if (batchSize <= 0) throw new Error('batchSize deve ser maior que 0.');
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }
  return batches;
}

let worker: Worker | null = null;
let nextId = 1;

const progressListeners = new Set<(info: Extract<WorkerResponse, { type: 'progress' }>) => void>();

export function onModelProgress(
  listener: (info: Extract<WorkerResponse, { type: 'progress' }>) => void,
): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

const pending = new Map<
  number,
  {
    resolve: (vectors: Float32Array[]) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function failAllPending(err: Error): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(err);
  }
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;

  const created = new Worker(new URL('./embeddingWorker.ts', import.meta.url), {
    type: 'module',
  });

  created.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'progress') {
      for (const listener of progressListeners) listener(message);
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.type === 'result') entry.resolve(message.embeddings);
    else entry.reject(new EmbeddingUnavailableError(message.message));
  };

  created.onerror = (event) => {
    const err = new EmbeddingUnavailableError(
      event.message || 'Falha ao carregar o worker de embeddings.',
    );
    failAllPending(err);
    created.terminate();
    if (worker === created) worker = null;
  };

  worker = created;
  return created;
}

function runBatch(texts: string[]): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    let active: Worker;
    try {
      active = ensureWorker();
    } catch (err) {
      // Sem Web Worker (ex.: Node/testes) ou worker indisponível.
      reject(
        new EmbeddingUnavailableError('Web Worker de embeddings indisponível.', { cause: err }),
      );
      return;
    }

    const id = nextId;
    nextId += 1;

    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new EmbeddingUnavailableError('Tempo esgotado ao vetorizar textos.'));
    }, EMBEDDING_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    const request: EmbedRequest = { type: 'embed', id, texts };
    active.postMessage(request);
  });
}

/**
 * Vetoriza textos retornando um Float32Array por texto (dimensão do modelo).
 * Processa os lotes sequencialmente, um lote de 16 por vez.
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  for (const batch of splitIntoBatches(texts)) {
    results.push(...(await runBatch(batch)));
  }
  return results;
}
