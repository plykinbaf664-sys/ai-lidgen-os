type FetchLike = typeof fetch;

type RetryFetchOptions = {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  maxAttempts?: number;
  retryDelaysMs?: number[];
};

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (typeof record.code === "string") parts.push(record.code);
      if (typeof record.message === "string") parts.push(record.message);
      current = record.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(" ");
}

export function isTransientNetworkError(error: unknown): boolean {
  return /ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR_SOCKET|socket hang up|other side closed|terminated|fetch failed|network connection was lost|AbortError|TimeoutError|operation was aborted/i.test(
    errorText(error),
  );
}

function isRetryableMethod(init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

async function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function bufferRetryableResponse(
  response: Response,
  method: string,
): Promise<Response> {
  if (method === "HEAD") {
    return response;
  }
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function fetchWithTransientRetry(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  {
    fetchImpl = fetch,
    timeoutMs,
    maxAttempts = 3,
    retryDelaysMs = [250, 750],
  }: RetryFetchOptions,
): Promise<Response> {
  const retryable = isRetryableMethod(init);
  const attempts = retryable ? Math.max(1, maxAttempts) : 1;
  const method = (init?.method ?? "GET").toUpperCase();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = init?.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      timeoutMs,
    );

    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });
      const buffered = retryable
        ? await bufferRetryableResponse(response, method)
        : response;
      if (
        retryable &&
        TRANSIENT_STATUS_CODES.has(buffered.status) &&
        attempt + 1 < attempts
      ) {
        await wait(retryDelaysMs[attempt] ?? retryDelaysMs.at(-1) ?? 750, externalSignal);
        continue;
      }
      return buffered;
    } catch (error) {
      if (
        !retryable ||
        externalSignal?.aborted ||
        !isTransientNetworkError(error) ||
        attempt + 1 >= attempts
      ) {
        throw error;
      }
      await wait(retryDelaysMs[attempt] ?? retryDelaysMs.at(-1) ?? 750, externalSignal);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  throw new Error("Transient request retry exhausted.");
}
