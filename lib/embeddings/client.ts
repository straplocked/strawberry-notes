/**
 * OpenAI-compatible embeddings client.
 *
 * Any provider that speaks `POST /v1/embeddings` with the OpenAI request /
 * response shape works here: OpenAI, Ollama (`/v1/embeddings`), llama.cpp
 * server, LM Studio, vLLM, etc. The whole point of leaning on the shape
 * rather than an SDK is self-hosters keep control of where their text goes.
 *
 * The client is deliberately tiny — no retries, no streaming, no SDK — so
 * that it stays legible and the non-bloat line holds.
 *
 * Env (all optional; feature silently disabled if `EMBEDDING_ENDPOINT` is
 * empty):
 *   EMBEDDING_ENDPOINT   Base URL, e.g. `https://api.openai.com/v1` or
 *                        `http://ollama:11434/v1`.
 *   EMBEDDING_MODEL      Model id, e.g. `text-embedding-3-small`.
 *   EMBEDDING_API_KEY    Bearer token; sent as `Authorization: Bearer ...`.
 *                        Optional — local providers typically do not require it.
 *   EMBEDDING_DIMS       Integer dims the column was provisioned for. Must
 *                        match the provider/model output. Default 1024.
 */

export interface EmbeddingConfig {
  endpoint: string;
  model: string;
  apiKey: string | null;
  dims: number;
}

export class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super(
      'Semantic search is not configured. Set EMBEDDING_ENDPOINT, EMBEDDING_MODEL, and EMBEDDING_DIMS (optionally EMBEDDING_API_KEY) on the server, then run `npm run db:embed`.',
    );
    this.name = 'EmbeddingNotConfiguredError';
  }
}

export class EmbeddingDimMismatchError extends Error {
  constructor(expected: number, got: number) {
    super(
      `Embedding dim mismatch: EMBEDDING_DIMS=${expected} but provider returned ${got}. Re-run the migration with the right dim or pick a matching model.`,
    );
    this.name = 'EmbeddingDimMismatchError';
  }
}

/**
 * Read the embedding config from environment. Returns null when the feature
 * is not configured (so callers can return a clear 503).
 */
export function readEmbeddingConfig(): EmbeddingConfig | null {
  const endpoint = (process.env.EMBEDDING_ENDPOINT ?? '').trim();
  const model = (process.env.EMBEDDING_MODEL ?? '').trim();
  const apiKey = (process.env.EMBEDDING_API_KEY ?? '').trim() || null;
  const dims = Number(process.env.EMBEDDING_DIMS ?? 1024) || 1024;
  if (!endpoint || !model) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    model,
    apiKey,
    dims,
  };
}

/** True when the embedding feature is usable. */
export function isEmbeddingConfigured(): boolean {
  return readEmbeddingConfig() !== null;
}

/**
 * Low-level: call `POST {endpoint}/embeddings` with an array of inputs and
 * return the vectors in the same order. Throws on HTTP errors.
 */
async function callEmbeddings(
  cfg: EmbeddingConfig,
  inputs: string[],
  fetchFn: typeof fetch = fetch,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const url = `${cfg.endpoint}/embeddings`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: cfg.model, input: inputs }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Embedding provider returned ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding: number[]; index?: number }>;
  };
  const data = json.data;
  if (!Array.isArray(data) || data.length !== inputs.length) {
    throw new Error(`Embedding provider returned unexpected shape`);
  }
  // OpenAI sorts by index already, but be defensive.
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = sorted.map((d) => d.embedding);
  for (const v of vectors) {
    if (!Array.isArray(v)) throw new Error('Embedding provider returned non-array embedding');
    if (v.length !== cfg.dims) {
      throw new EmbeddingDimMismatchError(cfg.dims, v.length);
    }
  }
  return vectors;
}

/**
 * Embed a batch of strings. Throws `EmbeddingNotConfiguredError` if env is
 * unset. Accepts an injected `fetch` for tests.
 */
export async function embedBatch(
  inputs: string[],
  opts: { fetchFn?: typeof fetch; config?: EmbeddingConfig | null } = {},
): Promise<number[][]> {
  const cfg = opts.config ?? readEmbeddingConfig();
  if (!cfg) throw new EmbeddingNotConfiguredError();
  return callEmbeddings(cfg, inputs, opts.fetchFn ?? fetch);
}

/** Convenience: embed a single string. */
export async function embedOne(
  input: string,
  opts: { fetchFn?: typeof fetch; config?: EmbeddingConfig | null } = {},
): Promise<number[]> {
  const [v] = await embedBatch([input], opts);
  return v;
}

/**
 * Build the text we feed to the embedding model for a note. Title is
 * prepended so semantic queries against the title alone still rank. We also
 * cap the size to avoid blowing token budgets on huge notes — providers
 * usually enforce their own cap; this is a soft safety net.
 */
export function embeddingInputFor(title: string, contentText: string, maxChars = 8000): string {
  const head = title.trim();
  const body = contentText.trim();
  const combined = head ? `${head}\n\n${body}` : body;
  if (combined.length <= maxChars) return combined;
  return combined.slice(0, maxChars);
}
