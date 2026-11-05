import type { CurrentUser, Filters, Opportunity } from "../types";
import { opportunityFee } from "./money";

export type QuickFilter = "all" | "overdue" | "today" | "missingFee" | "mine";
export type SortOrder = "nextAction" | "recent" | "fee" | "gross";
export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function matchesQuickFilter(opportunity: Opportunity, filter: QuickFilter, user: CurrentUser, today = localToday()) {
  const open = !opportunity.stage.startsWith("Fechado");
  switch (filter) {
    case "overdue": return open && Boolean(opportunity.nextActionDate && opportunity.nextActionDate < today);
    case "today": return open && opportunity.nextActionDate === today;
    case "missingFee": return opportunityFee(opportunity) === null;
    case "mine": return opportunity.seller === user.sellerName;
    default: return true;
  }
}
export function filterOpportunities(opportunities: Opportunity[], filters: Filters, quick: QuickFilter, user: CurrentUser) {
  const search = normalizeSearch(filters.search);
  return opportunities.filter((opportunity) =>
    (!filters.seller || opportunity.seller === filters.seller) &&
    (!filters.stage || opportunity.stage === filters.stage) &&
    (!filters.segment || opportunity.segment === filters.segment) &&
    (!filters.service || opportunity.service === filters.service) &&
    (!search || [opportunity.clientName, opportunity.opportunityName, opportunity.segment, opportunity.service].some((value) => normalizeSearch(value).includes(search))) &&
    matchesQuickFilter(opportunity, quick, user),
  );
}
export function sortOpportunities(opportunities: Opportunity[], order: SortOrder) {
  return [...opportunities].sort((a, b) => {
    if (order === "fee") return (opportunityFee(b) ?? -1) - (opportunityFee(a) ?? -1);
    if (order === "gross") return b.value - a.value;
    if (order === "recent") return b.enteredAt.localeCompare(a.enteredAt);
    const dateA = a.stage.startsWith("Fechado") ? "9999" : a.nextActionDate ?? "0000";
    const dateB = b.stage.startsWith("Fechado") ? "9999" : b.nextActionDate ?? "0000";
    return dateA.localeCompare(dateB) || a.clientName.localeCompare(b.clientName, "pt-BR");
  });
}
