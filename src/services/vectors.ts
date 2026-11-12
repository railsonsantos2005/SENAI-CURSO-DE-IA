/**
 * Vetores (embeddings) e similaridade de cosseno da busca semântica.
 *
 * Persistência: Float32Array serializado como BLOB na coluna `chunks.embedding`.
 */

/**
 * Limiar mínimo de cosseno para um trecho ser considerado relevante.
 * Referências empíricas: match real ~0.56–0.62; irrelevante ~-0.02–0.21.
 * (Não troque sem reavaliar com o log `[busca semântica]`.)
 */
export const MIN_SIMILARITY = 0.25;

/** Similaridade de cosseno entre dois vetores da mesma dimensão. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Float32Array -> bytes para gravar em BLOB (SQLite). */
export function serializeVector(vector: Float32Array): Uint8Array {
  const bytes = new Uint8Array(vector.byteLength);
  bytes.set(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength));
  return bytes;
}

/** BLOB (SQLite) -> Float32Array. Copia para alinhar offset/length arbitrários. */
export function deserializeVector(bytes: Uint8Array): Float32Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

export interface ScoredChunk {
  content: string;
  title: string;
  rank: number;
}

export interface EmbeddableChunk {
  content: string;
  title: string;
  embedding: Float32Array;
}

/**
 * Ranqueia candidatos por cosseno, descartando os abaixo de `minSimilarity`
 * e devolvendo os `limit` melhores (ordem decrescente de similaridade).
 */
export function rankBySimilarity(
  query: Float32Array,
  candidates: EmbeddableChunk[],
  limit: number,
  minSimilarity: number = MIN_SIMILARITY,
): ScoredChunk[] {
  return candidates
    .map((candidate) => ({
      content: candidate.content,
      title: candidate.title,
      rank: cosineSimilarity(query, candidate.embedding),
    }))
    .filter((scored) => scored.rank >= minSimilarity)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}
