import type { BusinessUnit, CurrentUser, Opportunity } from "../types";

export function visibleOpportunitiesForUser(
  opportunities: Opportunity[],
  user: CurrentUser | null,
  businessUnit: BusinessUnit,
) {
  if (!user || !user.allowedBusinessUnits.includes(businessUnit)) return [];
  const canViewAllSellers = user.role === "manager" || user.role === "admin";
  return opportunities.filter((opportunity) =>
    opportunity.businessUnit === businessUnit &&
    (canViewAllSellers || opportunity.seller === user.sellerName),
  );
}
