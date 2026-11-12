/**
 * Web Worker de embeddings (transformers.js + ONNX Runtime WASM).
 *
 * Config self-hosted OBRIGATÓRIA — sem CDN:
 * - modelo em /models/ (baixado por `npm run model:download`);
 * - binários do ONNX Runtime em /onnx/ (mesma origem; o CDN jsdelivr
 *   quebraria offline e as headers COEP do app).
 */
import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = false;
env.useWasmCache = false;

// O bundle web popula env.backends.onnx no import (spread de ort.env, que
// sempre inicializa `wasm`), mas o tipo é Partial<Env> — por isso o `!`.
// SEM este override o transformers.js aponta o wasmPaths para o CDN jsdelivr
// (definido no import quando vazio), quebrando offline e as headers COEP.
env.backends.onnx.wasm!.wasmPaths = {
  mjs: '/onnx/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: '/onnx/ort-wasm-simd-threaded.asyncify.wasm',
};

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

interface EmbedRequest {
  type: 'embed';
  id: number;
  texts: string[];
}

interface ProgressInfo {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

/** Escopo do worker (o DOM também declara `self`; tipamos de forma explícita). */
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<EmbedRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (progress: ProgressInfo) => {
        workerScope.postMessage({ type: 'progress', ...progress });
      },
    });
  }
  return extractorPromise;
}

/** Vetoriza um lote (≤ 16 textos) com pooling mean + normalização. */
async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });

  const data = output.data as Float32Array;
  if (texts.length === 0) return [];
  const dim = data.length / texts.length;
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error(`Dimensão de embedding inválida (${data.length} / ${texts.length}).`);
  }

  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    vectors.push(data.slice(i * dim, (i + 1) * dim));
  }
  return vectors;
}

workerScope.onmessage = (event) => {
  const { id, texts } = event.data;
  void embedBatch(texts)
    .then((vectors) => {
      const transfer = vectors.map((vector) => vector.buffer as ArrayBuffer);
      workerScope.postMessage({ type: 'result', id, embeddings: vectors }, transfer);
    })
    .catch((err: unknown) => {
      workerScope.postMessage({
        type: 'error',
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
};
