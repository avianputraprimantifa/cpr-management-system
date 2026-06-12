export const BLOCK_UNIT_PREFIX = "CPR-";

export function sanitizeBlockUnitDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 2);
}

export function blockUnitInputDigits(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  const prefixed = text.match(/^CPR-(\d{1,2})$/i);
  if (prefixed) return prefixed[1].padStart(2, "0");

  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-2).padStart(2, "0");
}

export function isCompleteBlockUnit(value: string | null | undefined) {
  return sanitizeBlockUnitDigits(value).length === 2;
}

export function normalizeBlockUnit(value: string | null | undefined) {
  const digits = sanitizeBlockUnitDigits(value);
  return digits.length === 2 ? `${BLOCK_UNIT_PREFIX}${digits}` : null;
}

export function formatBlockUnit(value: string | null | undefined) {
  const digits = blockUnitInputDigits(value);
  return digits ? `${BLOCK_UNIT_PREFIX}${digits}` : null;
}
