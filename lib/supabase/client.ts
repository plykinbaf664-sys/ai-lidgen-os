import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchWithTransientRetry } from "@/lib/network/fetch-with-transient-retry";

const SUPABASE_FETCH_TIMEOUT_MS = 30000;

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
  return fetchWithTransientRetry(input, init, {
    timeoutMs: SUPABASE_FETCH_TIMEOUT_MS,
    maxAttempts: 3,
  });
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
