export type AbortableOperationInput<T> = {
  operation: (signal: AbortSignal) => Promise<T>;
  timeoutMs: number;
  fallback: T;
  parentSignal?: AbortSignal | null;
};

let activeAbortableOperations = 0;

function abortReason(message: string, name = "AbortError") {
  return new DOMException(message, name);
}

/**
 * Runs network-backed work under a real AbortSignal. The controller is also
 * aborted after a successful/failed completion so detached child requests
 * cannot outlive the bounded operation.
 */
export async function runAbortableOperation<T>({
  operation,
  timeoutMs,
  fallback,
  parentSignal,
}: AbortableOperationInput<T>): Promise<T> {
  activeAbortableOperations += 1;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(
    parentSignal?.reason ?? abortReason("Parent operation aborted"),
  );
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = setTimeout(
    () => controller.abort(abortReason("Operation timed out", "TimeoutError")),
    Math.max(1, timeoutMs),
  );

  try {
    return await operation(controller.signal);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
    if (!controller.signal.aborted) {
      controller.abort(abortReason("Bounded operation completed"));
    }
    activeAbortableOperations -= 1;
  }
}

export function getActiveAbortableOperationCount(): number {
  return activeAbortableOperations;
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw signal.reason ?? abortReason("Operation aborted");
  }
}
