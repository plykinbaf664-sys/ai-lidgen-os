import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchWithTransientRetry } from "@/lib/network/fetch-with-transient-retry";

function requireSyncEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Supabase sync is not configured: ${name}`);
  return value;
}

export function createRemoteSupabaseSyncClient() {
  return createClient(
    requireSyncEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireSyncEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: {
        fetch: (input, init) =>
          fetchWithTransientRetry(input, init, { timeoutMs: 30_000, maxAttempts: 2 }),
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
