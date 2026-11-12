import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_BATCH_SIZE,
  EmbeddingUnavailableError,
  embedTexts,
  splitIntoBatches,
} from '../embeddings';

describe('embeddings (cliente do worker)', () => {
  it('lote padrão tem 16 textos', () => {
    expect(EMBEDDING_BATCH_SIZE).toBe(16);
    expect(splitIntoBatches(['a', 'b'])).toEqual([['a', 'b']]);
  });

  it('divide 33 textos em lotes de 16/16/1 preservando a ordem', () => {
    const texts = Array.from({ length: 33 }, (_, i) => `texto ${i}`);
    const batches = splitIntoBatches(texts);

    expect(batches.map((batch) => batch.length)).toEqual([16, 16, 1]);
    expect(batches.flat()).toEqual(texts);
  });

  it('entrada vazia resolve sem tocar no worker', async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
  });

  it('sem Web Worker lança EmbeddingUnavailableError (caminho degradado)', async () => {
    // Node não expõe Web Worker global: exatamente o que os testes de
    // documento exercitam — o serviço cai para a busca léxica.
    expect(typeof Worker).toBe('undefined');
    await expect(embedTexts(['pergunta qualquer'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });
});
