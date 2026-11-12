import { describe, expect, it } from 'vitest';
import {
  MIN_SIMILARITY,
  cosineSimilarity,
  deserializeVector,
  rankBySimilarity,
  serializeVector,
} from '../vectors';

describe('vectors (busca semântica)', () => {
  it('MIN_SIMILARITY é 0.25 (cosseno)', () => {
    expect(MIN_SIMILARITY).toBe(0.25);
  });

  it('vetores idênticos têm cosseno 1', () => {
    const vector = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('vetores ortogonais dão 0 e opostos dão -1', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 5);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([-1, 0]))).toBeCloseTo(
      -1,
      5,
    );
  });

  it('dimensões divergentes ou vetores nulos retornam 0', () => {
    expect(cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 2]))).toBe(0);
  });

  it('serialização Float32Array <-> BLOB preserva os valores', () => {
    const vector = new Float32Array([0.125, -0.5, 0.75, 1]);
    const roundtrip = deserializeVector(serializeVector(vector));
    expect(roundtrip).toBeInstanceOf(Float32Array);
    expect(Array.from(roundtrip)).toEqual(Array.from(vector));
  });

  it('deserializa BLOBs com offset/length arbitrários', () => {
    const backing = new Uint8Array(32);
    const vector = new Float32Array([1.5, -2.5]);
    backing.set(new Uint8Array(vector.buffer), 8);
    const view = backing.subarray(8, 16);

    const roundtrip = deserializeVector(view);
    expect(Array.from(roundtrip)).toEqual([1.5, -2.5]);
  });

  it('rankBySimilarity filtra abaixo do limiar e ordena decrescente', () => {
    const query = new Float32Array([1, 0]);
    const candidates = [
      { content: 'alto', title: 'a', embedding: new Float32Array([1, 0]) }, // 1.0
      { content: 'medio', title: 'b', embedding: new Float32Array([0.9, 0.1]) }, // ~0.99
      { content: 'baixo', title: 'c', embedding: new Float32Array([0, 1]) }, // 0.0
    ];

    const ranked = rankBySimilarity(query, candidates, 5);
    expect(ranked.map((r) => r.content)).toEqual(['alto', 'medio']);
    expect(ranked.every((r) => r.rank >= MIN_SIMILARITY)).toBe(true);
  });

  it('rankBySimilarity respeita o limite de resultados', () => {
    const query = new Float32Array([1, 0]);
    const candidates = [1, 2, 3].map((n) => ({
      content: `c${n}`,
      title: `t${n}`,
      embedding: new Float32Array([1, 0.01 * n]),
    }));

    const ranked = rankBySimilarity(query, candidates, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].rank).toBeGreaterThanOrEqual(ranked[1].rank);
  });
});
