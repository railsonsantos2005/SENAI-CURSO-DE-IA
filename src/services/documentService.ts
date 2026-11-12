import type { BindingSpec, Database } from '@sqlite.org/sqlite-wasm';
import type { Document } from '../types/document';
import type { RelevantChunk } from '../types/search';
import { chunkText as chunkTextService } from './chunking';
import { getDatabase, inTransaction, schedulePersist } from './database';
import { embedTexts } from './embeddings';
import { deserializeVector, MIN_SIMILARITY, rankBySimilarity, serializeVector } from './vectors';

function queryAll<T>(db: Database, sql: string, bind: BindingSpec = []): T[] {
  return db.exec(sql, {
    bind,
    rowMode: 'object',
    returnValue: 'resultRows',
  }) as T[];
}

function run(db: Database, sql: string, bind: BindingSpec = []): void {
  db.exec(sql, { bind });
}

function chunkText(text: string): string[] {
  return chunkTextService(text).map((c) => c.content);
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Aviso único: sem Worker/modelo (ex.: Node) não vetoriza — sem ruído repetido. */
let vectorizationWarned = false;

function warnVectorizationUnavailable(err: unknown): void {
  if (vectorizationWarned) return;
  vectorizationWarned = true;
  const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
  console.error(`Vetorização indisponível${detail}`);
}

interface ChunkInsert {
  id: string;
  content: string;
}

/**
 * Vetoriza os chunks e grava os vetores em BLOB. Retorna `false` quando o
 * modelo/worker está indisponível (o chamador segue sem vetores — a busca
 * usará o modo léxico até um backfill).
 */
async function vectorizeChunks(entries: ChunkInsert[]): Promise<boolean> {
  if (entries.length === 0) return false;

  try {
    const vectors = await embedTexts(entries.map((entry) => entry.content));
    const db = await getDatabase();
    inTransaction(db, () => {
      entries.forEach((entry, index) => {
        const vector = vectors[index];
        if (vector) {
          run(db, 'UPDATE chunks SET embedding = ? WHERE id = ?', [
            serializeVector(vector),
            entry.id,
          ]);
        }
      });
    });
    schedulePersist();
    return true;
  } catch (err) {
    warnVectorizationUnavailable(err);
    return false;
  }
}

async function ftsTableExists(db: Database): Promise<boolean> {
  const rows = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts'",
  );
  return rows.length > 0;
}

function toTokens(question: string): string[] {
  return question
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function toFtsExpression(question: string): string {
  const tokens = toTokens(question);
  if (tokens.length === 0) return '""';
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}

export async function listDocuments(): Promise<Document[]> {
  const db = await getDatabase();
  const rows = queryAll<{ id: string; title: string; created_at: number }>(
    db,
    'SELECT id, title, created_at FROM documents ORDER BY created_at DESC',
  );

  return rows.map((row) => {
    const chunks = queryAll<{ content: string }>(
      db,
      'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [row.id],
    );
    return {
      id: row.id,
      title: row.title,
      content: chunks.map((c) => c.content).join(''),
      createdAt: row.created_at,
    };
  });
}

export async function getDocumentContent(id: string): Promise<string> {
  const db = await getDatabase();
  const chunks = queryAll<{ content: string }>(
    db,
    'SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC',
    [id],
  );
  return chunks.map((c) => c.content).join('');
}

export async function addDocument(
  title: string,
  content: string,
): Promise<Document & { vectorized: boolean }> {
  const db = await getDatabase();
  const id = newId();
  const createdAt = Date.now();
  const chunks = chunkText(content);
  const hasFts = await ftsTableExists(db);
  const inserted: ChunkInsert[] = [];

  inTransaction(db, () => {
    run(db, 'INSERT INTO documents (id, title, created_at) VALUES (?, ?, ?)', [
      id,
      title.trim(),
      createdAt,
    ]);

    chunks.forEach((chunk, index) => {
      const chunkId = `${id}-${index}`;
      run(db, 'INSERT INTO chunks (id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)', [
        chunkId,
        id,
        index,
        chunk,
      ]);
      if (hasFts) {
        run(db, 'INSERT INTO chunks_fts (content, chunk_id) VALUES (?, ?)', [chunk, chunkId]);
      }
      inserted.push({ id: chunkId, content: chunk });
    });
  });

  schedulePersist();

  // Vetoriza no ato para a busca semântica ficar disponível imediatamente.
  const vectorized = await vectorizeChunks(inserted);
  return { id, title: title.trim(), content: content.trim(), createdAt, vectorized };
}

/**
 * Vetoriza em background os chunks ainda sem embedding (ex.: adicionados com
 * o modelo indisponível). Retorna quantos chunks foram vetorizados.
 */
export async function backfillEmbeddings(): Promise<number> {
  const db = await getDatabase();
  const pending = queryAll<{ id: string; content: string }>(
    db,
    'SELECT id, content FROM chunks WHERE embedding IS NULL',
  );
  if (pending.length === 0) return 0;

  const ok = await vectorizeChunks(pending);
  return ok ? pending.length : 0;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDatabase();
  const hasFts = await ftsTableExists(db);

  inTransaction(db, () => {
    const chunks = queryAll<{ id: string }>(
      db,
      'SELECT id FROM chunks WHERE document_id = ?',
      [id],
    );
    if (hasFts) {
      chunks.forEach((chunk) => run(db, 'DELETE FROM chunks_fts WHERE chunk_id = ?', [chunk.id]));
    }
    run(db, 'DELETE FROM chunks WHERE document_id = ?', [id]);
    run(db, 'DELETE FROM documents WHERE id = ?', [id]);
  });

  schedulePersist();
}

// Fallback usado quando FTS5 não está disponível: busca por LIKE e ordena
// pelo número de tokens encontrados.
async function searchChunksByLike(question: string, limit: number): Promise<RelevantChunk[]> {
  const db = await getDatabase();
  const tokens = toTokens(question).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const orClause = tokens.map(() => 'c.content LIKE ?').join(' OR ');
  const params = tokens.map((t) => `%${t}%`);

  const rows = queryAll<{ content: string; title: string }>(
    db,
    `SELECT c.content AS content, d.title AS title
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE ${orClause}
     LIMIT 200`,
    params,
  );

  const lower = tokens.map((t) => t.toLowerCase());
  const scored = rows
    .map((r) => {
      const haystack = r.content.toLowerCase();
      const hits = lower.filter((t) => haystack.includes(t)).length;
      return { content: r.content, title: r.title, rank: -hits };
    })
    .filter((r) => r.rank < 0);

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit);
}

async function hasVectorizedData(db: Database): Promise<boolean> {
  const rows = queryAll<{ total: number }>(
    db,
    'SELECT EXISTS(SELECT 1 FROM chunks WHERE embedding IS NOT NULL) AS total',
  );
  return rows.length > 0 && rows[0].total === 1;
}

/**
 * Busca semântica: cosseno entre a pergunta e os vetores persistidos.
 * Retorna `null` quando o modelo/worker está indisponível (o chamador usa
 * o modo léxico). Quando retorna lista, ela é o veredito FINAL — inclusive
 * vazia (cosseno abaixo de MIN_SIMILARITY = "nenhum trecho relevante").
 */
async function searchChunksSemantic(
  db: Database,
  question: string,
  limit: number,
): Promise<RelevantChunk[] | null> {
  try {
    const [queryVector] = await embedTexts([question]);
    if (!queryVector) return null;

    const rows = queryAll<{ content: string; title: string; embedding: Uint8Array }>(
      db,
      `SELECT c.content AS content, d.title AS title, c.embedding AS embedding
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.embedding IS NOT NULL`,
    );

    const candidates = rows.map((row) => ({
      content: row.content,
      title: row.title,
      embedding: deserializeVector(row.embedding),
    }));

    const matches = rankBySimilarity(queryVector, candidates, limit);
    // DEBUG: top similarities
    console.debug(
      `[busca semântica] ${matches.length} trecho(s) >= ${MIN_SIMILARITY} (cosseno)`,
    );
    return matches;
  } catch (err) {
    // Modelo indisponível -> degrada para a busca léxica (FTS5/LIKE).
    console.debug(
      '[busca semântica] modelo indisponível; usando busca léxica:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function searchRelevantChunks(
  question: string,
  limit = 5,
): Promise<RelevantChunk[]> {
  // Perguntas sem tokens "significativos" (>= 3 caracteres) não têm como
  // gerar correspondência útil — evita falso positivo por stopword.
  const meaningfulTokens = toTokens(question).filter((t) => t.length >= 3);
  if (meaningfulTokens.length === 0) return [];

  const db = await getDatabase();

  // Com dado vetorizado, a semântica é o veredito principal. Quando ela não
  // encontra nada (ou o modelo está indisponível), caímos para a busca léxica
  // como rede de segurança, mas apenas se houver tokens "significativos"
  // (>= 3 caracteres) na pergunta — evitando falso positivo por stopword.
  if (await hasVectorizedData(db)) {
    const semantic = await searchChunksSemantic(db, question, limit);
    if (semantic !== null && semantic.length > 0) return semantic;
  }

  if (!(await ftsTableExists(db))) {
    return searchChunksByLike(question, limit);
  }

  const expression = toFtsExpression(question);
  if (expression === '""') return [];

  const rows = queryAll<{ content: string; title: string; rank: number }>(
    db,
    `SELECT c.content AS content, d.title AS title, bm25(chunks_fts) AS rank
     FROM chunks_fts
     JOIN chunks c ON c.id = chunks_fts.chunk_id
     JOIN documents d ON d.id = c.document_id
     WHERE chunks_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [expression, limit],
  );

  return rows.map((r) => ({ content: r.content, title: r.title, rank: r.rank }));
}