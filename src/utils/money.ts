import type { Currency, Opportunity } from "../types";

export const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "BRL", label: "BRL — Real" },
  { code: "USD", label: "USD — Dólar americano" },
  { code: "EUR", label: "EUR — Euro" },
];

export function opportunityCurrency(opportunity: Opportunity): Currency {
  return opportunity.currency ?? "BRL";
}

export function opportunityFee(opportunity: Opportunity): number | null {
  return typeof opportunity.fee === "number" && Number.isFinite(opportunity.fee) ? opportunity.fee : null;
}

export function formatMoney(value: number, currency: Currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2 }).format(value);
}

// Inputs accept Brazilian decimal notation and optional thousands separators.
export function parseMoney(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const valid = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text);
  if (!valid) throw new Error("Informe um valor válido, como 2.349,00 ou 190,00.");
  const result = Number(text.replace(/\./g, "").replace(",", "."));
  if (!Number.isSafeInteger(Math.round(result * 100))) throw new Error("O valor informado é muito alto.");
  return result;
}

export function moneyInput(value?: number | null) {
  return value == null ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function validateQuotation(gross: number, fee: number | null) {
  if (!Number.isFinite(gross) || gross < 0) throw new Error("O valor bruto precisa ser maior ou igual a zero.");
  if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > gross)) {
    throw new Error("O fee deve ser maior ou igual a zero e não pode ultrapassar o valor bruto.");
  }
}
