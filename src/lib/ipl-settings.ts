import { supabase } from "@/integrations/supabase/client";

export interface IplSettings {
  id: "default";
  default_amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  updated_at?: string;
  updated_by?: string | null;
}

export type IplSettingsInput = Pick<
  IplSettings,
  "default_amount" | "bank_name" | "bank_account_number" | "bank_account_name"
>;

type RawIplSettings = Partial<IplSettingsInput> & {
  id?: string | null;
  updated_at?: string;
  updated_by?: string | null;
};

export const IPL_SETTINGS_QUERY_KEY = ["ipl-settings"] as const;

export const FALLBACK_IPL_SETTINGS: IplSettings = {
  id: "default",
  default_amount: 0,
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
};

function cleanSettings(input: Partial<IplSettingsInput>): IplSettingsInput {
  return {
    default_amount: Number(input.default_amount) || 0,
    bank_name: input.bank_name?.trim() ?? "",
    bank_account_number: input.bank_account_number?.trim() ?? "",
    bank_account_name: input.bank_account_name?.trim() ?? "",
  };
}

function normalizeSettings(row: RawIplSettings | null | undefined): IplSettings {
  const cleaned = cleanSettings(row ?? {});
  return {
    id: "default",
    ...cleaned,
    updated_at: row?.updated_at,
    updated_by: row?.updated_by ?? null,
  };
}

function isSettingsTableUnavailable(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /ipl_settings|schema cache|does not exist/i.test(error.message ?? "")
  );
}

function settingsTableError() {
  return new Error("Tabel ipl_settings belum tersedia di database. Jalankan migration create_ipl_settings terlebih dahulu.");
}

export async function fetchIplSettings() {
  const { data, error } = await supabase
    .from("ipl_settings")
    .select("id, default_amount, bank_name, bank_account_number, bank_account_name, updated_at, updated_by")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    if (isSettingsTableUnavailable(error)) throw settingsTableError();
    throw error;
  }

  return normalizeSettings(data ?? FALLBACK_IPL_SETTINGS);
}

export async function saveIplSettings(input: IplSettingsInput, userId?: string | null) {
  const cleaned = cleanSettings(input);
  const payload = {
    id: "default" as const,
    ...cleaned,
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("ipl_settings")
    .upsert(payload, { onConflict: "id" })
    .select("id, default_amount, bank_name, bank_account_number, bank_account_name, updated_at, updated_by")
    .single();

  if (error) {
    if (isSettingsTableUnavailable(error)) throw settingsTableError();
    throw error;
  }

  const settings = normalizeSettings(data);
  return settings;
}
