import "server-only";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_FETCH_TIMEOUT_MS = 10000;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, SUPABASE_FETCH_TIMEOUT_MS);
  const externalSignal = init?.signal;

  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    controller.abort();
  } else {
    externalSignal?.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { once: true },
    );
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createSupabaseServerClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: {
        fetch: fetchWithTimeout,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
