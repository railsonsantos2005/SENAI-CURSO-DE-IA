require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_CONTEXTS = 5;
const MAX_PAYLOAD = '100kb';

// Provedores suportados (em ordem de prioridade).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const OLLAMA_URL = (process.env.OLLAMA_URL || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

app.use(cors());
app.use(express.json({ limit: MAX_PAYLOAD }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  const { question, contexts } = body;

  if (typeof question !== 'string' || question.trim().length === 0) {
    return 'question must be a non-empty string';
  }
  if (question.length > 4000) {
    return 'question is too long';
  }

  if (contexts !== undefined) {
    if (!Array.isArray(contexts)) return 'contexts must be an array';
    if (contexts.length > MAX_CONTEXTS) return `contexts must have at most ${MAX_CONTEXTS} items`;
    for (const ctx of contexts) {
      if (typeof ctx !== 'string') return 'each context must be a string';
      if (ctx.length > 8000) return 'context is too long';
    }
  }

  return null;
}

const SYSTEM_PROMPT =
  'Responda em TEXTO SIMPLES, sem formatação Markdown: sem **, ##, listas ' +
  'formatadas, blocos de código ou links em sintaxe. Apenas texto corrido, ' +
  'preservando quebras de linha naturais. Baseie-se nos contextos fornecidos.';

function buildUserContent(question, contexts) {
  const contextBlock = contexts
    .map((c, i) => `Contexto ${i + 1}:\n${c}`)
    .join('\n\n');
  return contextBlock
    ? `${contextBlock}\n\nPergunta: ${question}`
    : `Pergunta: ${question}`;
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function tryAnthropic(question, contexts) {
  if (!ANTHROPIC_API_KEY || !ANTHROPIC_API_KEY.startsWith('sk-ant-')) return null;

  const userContent = buildUserContent(question, contexts);
  const response = await fetchWithTimeout(
    ANTHROPIC_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const text = await response.text();
    let upstreamMessage = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      upstreamMessage = parsed?.error?.message || parsed?.message || upstreamMessage;
    } catch {
      /* keep raw text */
    }
    throw new Error(`Anthropic HTTP ${response.status}: ${upstreamMessage}`);
  }

  const data = await response.json();
  const answer = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return answer || null;
}

async function tryOllama(question, contexts) {
  if (!OLLAMA_URL) return null;

  const userContent = buildUserContent(question, contexts);
  const response = await fetchWithTimeout(
    `${OLLAMA_URL}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const answer = (data?.message?.content || '').trim();
  return answer || null;
}

async function tryGemini(question, contexts) {
  if (!GEMINI_API_KEY) return null;

  const userContent = buildUserContent(question, contexts);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .join('\n')
    .trim();
  return answer || null;
}

function extractiveAnswer(contexts) {
  // Fallback sem IA: devolve os trechos recuperados como resposta.
  if (!contexts || contexts.length === 0) return null;
  const parts = contexts.map((c, i) => `Trecho ${i + 1}: ${c.trim()}`).join('\n\n');
  return (
    'Não foi possível gerar uma resposta automática (nenhum provedor de IA configurado). ' +
    'Segue abaixo os trechos mais relevantes encontrados nos seus documentos:\n\n' +
    parts
  );
}

async function generateAnswer(question, contexts) {
  const providers = [
    { name: 'anthropic', fn: tryAnthropic },
    { name: 'ollama', fn: tryOllama },
    { name: 'gemini', fn: tryGemini },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      const answer = await provider.fn(question, contexts);
      if (answer) {
        return { answer, provider: provider.name };
      }
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Fallback extrativo (sem IA).
  const fallback = extractiveAnswer(contexts);
  if (fallback) {
    return { answer: fallback, provider: 'extractive' };
  }

  throw new Error(
    errors.length > 0
      ? `Nenhum provedor de IA disponível. ${errors.join(' | ')}`
      : 'Nenhum provedor de IA configurado e sem trechos para exibir.',
  );
}

app.post('/api/answer', async (req, res) => {
  const error = validateBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const question = req.body.question.trim();
  const contexts = Array.isArray(req.body.contexts) ? req.body.contexts : [];

  try {
    const result = await generateAnswer(question, contexts);
    return res.json({ answer: result.answer, provider: result.provider });
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Erro ao gerar resposta.',
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, providers: availableProviders });
});

const availableProviders = {
  anthropic: !!ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('sk-ant-'),
  ollama: !!OLLAMA_URL,
  gemini: !!GEMINI_API_KEY,
};

app.listen(PORT, () => {
  console.log(`PocketRAG server listening on port ${PORT}`);
  console.log('Provedores de IA disponíveis:', {
    ...availableProviders,
    extractive: true,
  });
});
