type SupabaseFunctionError = {
  name?: string;
  message?: string;
};

export function edgeFunctionErrorMessage(
  error: unknown,
  functionName: string,
  fallback: string,
) {
  const fnError = error as SupabaseFunctionError | null;
  const message = fnError?.message ?? "";
  const isFetchError = fnError?.name === "FunctionsFetchError"
    || /failed to send a request to the edge function/i.test(message);

  if (isFetchError) {
    return `Edge Function ${functionName} belum bisa diakses. Deploy ulang function di Supabase, lalu coba lagi.`;
  }

  return message || fallback;
}
