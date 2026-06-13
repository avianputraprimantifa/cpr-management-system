import { supabase } from "@/integrations/supabase/client";
import {
  edgeFunctionErrorMessageAsync,
  isEdgeFunctionReachabilityError,
} from "@/lib/edge-function-error";

type ReceiptKind = "receipt" | "thumbnail";

type SignReceiptResponse = {
  signed_url?: string;
  error?: string;
};

type SignReceiptPayload = {
  bill_id: string;
  kind: ReceiptKind;
  expires_in: number;
};

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function invokeSignerDirectly(payload: SignReceiptPayload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) throw new Error("Sesi tidak valid.");

  const response = await fetch(`${supabaseUrl}/functions/v1/sign-payment-receipt`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-client-info": "carlton-management-system",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as SignReceiptResponse;

  if (!response.ok || body.error || !body.signed_url) {
    throw new Error(body.error ?? "Gagal membuka bukti pembayaran.");
  }

  return body.signed_url;
}

export async function getPaymentReceiptSignedUrl(
  billId: string,
  kind: ReceiptKind,
  fallbackPath: string | null | undefined,
  expiresIn = 300,
) {
  const payload = {
    bill_id: billId,
    kind,
    expires_in: expiresIn,
  };
  const { data, error } = await supabase.functions.invoke("sign-payment-receipt", {
    body: payload,
  });
  const result = data as SignReceiptResponse | null;

  if (!error && result?.signed_url) return result.signed_url;
  if (result?.error) throw new Error(result.error);

  if (error && fallbackPath && isEdgeFunctionReachabilityError(error)) {
    try {
      return await invokeSignerDirectly(payload);
    } catch (directError) {
      console.warn("[sign-payment-receipt] Direct function retry failed.", directError);
    }

    const fallback = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(fallbackPath, expiresIn);
    if (!fallback.error && fallback.data?.signedUrl) return fallback.data.signedUrl;
  }

  throw new Error(await edgeFunctionErrorMessageAsync(error, "sign-payment-receipt", "Gagal membuka bukti pembayaran."));
}
