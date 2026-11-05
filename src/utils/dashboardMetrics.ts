import { FUNNEL_STAGES, OPEN_STAGES } from "../constants";
import type { Opportunity } from "../types";
import { calculateMetrics, calculateMonthlyMetrics, daysBetween, isOpenOpportunity, stageConversion, stalledDays } from "./metrics";
import { CURRENCIES, opportunityCurrency, opportunityFee } from "./money";

function rankByCount(opportunities: Opportunity[]) {
  const counts = new Map<string, number>();
  for (const opportunity of opportunities) {
    counts.set(opportunity.seller, (counts.get(opportunity.seller) ?? 0) + 1);
  }
  return [...counts].map(([seller, count]) => ({ seller, count }))
    .sort((a, b) => b.count - a.count || a.seller.localeCompare(b.seller, "pt-BR"))
    .slice(0, 5);
}

export function calculateDashboardMetrics(opportunities: Opportunity[], month: string) {
  const open = opportunities.filter(isOpenOpportunity);
  const won = opportunities.filter((opportunity) => opportunity.stage === "Fechado - Ganhou");
  const lost = opportunities.filter((opportunity) => opportunity.stage === "Fechado - Perdido");
  const closed = [...won, ...lost];
  const wonInMonth = won.filter((opportunity) => opportunity.closedAt?.startsWith(month));
  const lostInMonth = lost.filter((opportunity) => opportunity.closedAt?.startsWith(month));
  const stageCounts = Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage, opportunities.filter((opportunity) => opportunity.stage === stage).length]));
  const stageStallAverage = Object.fromEntries(OPEN_STAGES.map((stage) => {
    const group = open.filter((opportunity) => opportunity.stage === stage);
    return [stage, group.length ? group.reduce((sum, opportunity) => sum + stalledDays(opportunity), 0) / group.length : 0];
  }));
  const stageConversionRates = Object.fromEntries(OPEN_STAGES.map((stage) => [stage, stageConversion(opportunities, stage)]));
  const lossCounts = new Map<string, number>();
  for (const opportunity of lostInMonth) {
    const reason = opportunity.lossReason ?? "não informado";
    lossCounts.set(reason, (lossCounts.get(reason) ?? 0) + 1);
  }
  const currencies = CURRENCIES.map((item) => item.code).filter((currency) =>
    opportunities.some((opportunity) => opportunityCurrency(opportunity) === currency),
  );
  if (!currencies.length) currencies.push("BRL");

  return {
    totalOpportunities: opportunities.length,
    missingFeeCount: opportunities.filter((opportunity) => opportunityFee(opportunity) === null).length,
    stageCounts,
    stageStallAverage,
    stageConversionRates,
    overallConversionRate: opportunities.length ? won.length / opportunities.length : 0,
    avgConversionDays: closed.length
      ? closed.reduce((sum, opportunity) => sum + daysBetween(opportunity.enteredAt, opportunity.closedAt), 0) / closed.length
      : 0,
    winRate: closed.length ? won.length / closed.length : 0,
    lossRate: closed.length ? lost.length / closed.length : 0,
    withoutNextAction: open.filter((opportunity) => !opportunity.nextActionDate || opportunity.nextStep.toLowerCase().includes("sem próxima ação")).length,
    stalledOverSeven: open.filter((opportunity) => stalledDays(opportunity) > 7).length,
    wonRanking: rankByCount(won),
    monthly: {
      wonCount: wonInMonth.length,
      lostCount: lostInMonth.length,
      winRate: wonInMonth.length + lostInMonth.length ? wonInMonth.length / (wonInMonth.length + lostInMonth.length) : 0,
      sellerRanking: rankByCount(wonInMonth),
      lossReasonRanking: [...lossCounts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "pt-BR")),
      pipelineCounts: Object.fromEntries(OPEN_STAGES.map((stage) => [stage, open.filter((opportunity) => opportunity.stage === stage).length])),
    },
    byCurrency: currencies.map((currency) => ({
      currency,
      metrics: calculateMetrics(opportunities, currency),
      monthly: calculateMonthlyMetrics(opportunities, month, currency),
    })),
  };
}
