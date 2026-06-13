type SupabaseFunctionError = {
  name?: string;
  message?: string;
  context?: unknown;
};

export function isEdgeFunctionReachabilityError(error: unknown) {
  const fnError = error as SupabaseFunctionError | null;
  const message = fnError?.message ?? "";

  return fnError?.name === "FunctionsFetchError"
    || fnError?.name === "FunctionsRelayError"
    || /failed to send a request to the edge function/i.test(message)
    || /relay error invoking the edge function/i.test(message);
}

export function edgeFunctionErrorMessage(
  error: unknown,
  functionName: string,
  fallback: string,
) {
  const fnError = error as SupabaseFunctionError | null;
  const message = fnError?.message ?? "";

  if (isEdgeFunctionReachabilityError(error)) {
    return `Tidak bisa menghubungi Edge Function ${functionName}. Cek koneksi atau deploy function, lalu coba lagi.`;
  }

  return message || fallback;
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

async function edgeFunctionResponseMessage(error: unknown) {
  const context = (error as SupabaseFunctionError | null)?.context;
  if (!isResponse(context)) return null;

  const text = await context.clone().text().catch(() => "");
  if (!text) return null;

  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    return text.slice(0, 240);
  }

  return null;
}

export async function edgeFunctionErrorMessageAsync(
  error: unknown,
  functionName: string,
  fallback: string,
) {
  return await edgeFunctionResponseMessage(error)
    ?? edgeFunctionErrorMessage(error, functionName, fallback);
}
