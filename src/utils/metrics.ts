import { FUNNEL_STAGES, OPEN_STAGES } from "../constants";
import type { Currency, FunnelStage, Opportunity } from "../types";
import { opportunityCurrency, opportunityFee } from "./money";

export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const numberFormat = new Intl.NumberFormat("pt-BR");

export function daysBetween(start: string, end = todayIso()) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isOpenOpportunity(opportunity: Opportunity) {
  return !opportunity.stage.startsWith("Fechado");
}

export function stalledDays(opportunity: Opportunity) {
  return daysBetween(opportunity.lastInteractionAt);
}

export function stageConversion(opportunities: Opportunity[], stage: FunnelStage) {
  const stageIndex = FUNNEL_STAGES.indexOf(stage);
  const nextStage = FUNNEL_STAGES[stageIndex + 1];
  const entered = opportunities.filter((opportunity) => opportunity.stageHistory[stage]).length;
  const advanced = nextStage
    ? opportunities.filter((opportunity) => opportunity.stageHistory[stage] && opportunity.stageHistory[nextStage]).length
    : entered;
  return entered ? advanced / entered : 0;
}

export function calculateMetrics(allOpportunities: Opportunity[], currency: Currency = "BRL") {
  const opportunities = allOpportunities.filter((opportunity) => opportunityCurrency(opportunity) === currency);
  const open = opportunities.filter(isOpenOpportunity);
  const won = opportunities.filter((opportunity) => opportunity.stage === "Fechado - Ganhou");
  const lost = opportunities.filter((opportunity) => opportunity.stage === "Fechado - Perdido");
  const closed = [...won, ...lost];
  const openRevenue = sumFees(open);
  const wonRevenue = sumFees(won);
  const lostRevenue = sumFees(lost);
  const weightedForecast = open.reduce(
    (sum, opportunity) => sum + (opportunityFee(opportunity) ?? 0) * (opportunity.probability / 100),
    0,
  );
  const wonWithFee = won.filter((opportunity) => opportunityFee(opportunity) !== null);
  const avgTicket = wonWithFee.length ? wonRevenue / wonWithFee.length : 0;
  const avgConversionDays = closed.length
    ? closed.reduce((sum, opportunity) => sum + daysBetween(opportunity.enteredAt, opportunity.closedAt ?? todayIso()), 0) /
      closed.length
    : 0;
  const winRate = closed.length ? won.length / closed.length : 0;
  const lossRate = closed.length ? lost.length / closed.length : 0;
  const stageCounts = FUNNEL_STAGES.reduce(
    (acc, stage) => ({ ...acc, [stage]: opportunities.filter((opportunity) => opportunity.stage === stage).length }),
    {} as Record<FunnelStage, number>,
  );
  const stageStallAverage = FUNNEL_STAGES.reduce(
    (acc, stage) => {
      if (stage.startsWith("Fechado")) {
        acc[stage] = 0;
        return acc;
      }
      const stageOps = opportunities.filter((opportunity) => opportunity.stage === stage);
      acc[stage] = stageOps.length
        ? stageOps.reduce((sum, opportunity) => sum + stalledDays(opportunity), 0) / stageOps.length
        : 0;
      return acc;
    },
    {} as Record<FunnelStage, number>,
  );
  const stageConversionRates = OPEN_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = stageConversion(opportunities, stage);
      return acc;
    },
    {} as Partial<Record<FunnelStage, number>>,
  );
  const withoutNextAction = open.filter(
    (opportunity) => !opportunity.nextActionDate || opportunity.nextStep.toLowerCase().includes("sem próxima ação"),
  ).length;
  const stalledOverSeven = open.filter((opportunity) => stalledDays(opportunity) > 7).length;
  const negotiationRanking = rankBySeller(
    opportunities.filter((opportunity) => opportunity.stage === "Negociação"),
  );
  const wonRanking = rankWonBySeller(won);

  return {
    currency,
    missingFeeCount: opportunities.filter((opportunity) => opportunityFee(opportunity) === null).length,
    grossValue: opportunities.reduce((total, opportunity) => total + opportunity.value, 0),
    openRevenue,
    wonRevenue,
    lostRevenue,
    weightedForecast,
    totalOpportunities: opportunities.length,
    stageCounts,
    overallConversionRate: opportunities.length ? won.length / opportunities.length : 0,
    stageConversionRates,
    avgTicket,
    avgConversionDays,
    stageStallAverage,
    winRate,
    lossRate,
    withoutNextAction,
    stalledOverSeven,
    negotiationRanking,
    wonRanking,
  };
}

export function calculateMonthlyMetrics(allOpportunities: Opportunity[], month: string, currency: Currency = "BRL") {
  const opportunities = allOpportunities.filter((opportunity) => opportunityCurrency(opportunity) === currency);
  const closedInMonth = opportunities.filter((opportunity) => opportunity.closedAt?.startsWith(month));
  const wonInMonth = closedInMonth.filter((opportunity) => opportunity.stage === "Fechado - Ganhou");
  const lostInMonth = closedInMonth.filter((opportunity) => opportunity.stage === "Fechado - Perdido");
  const open = opportunities.filter(isOpenOpportunity);
  const pipelineByStage = OPEN_STAGES.reduce(
    (acc, stage) => {
      const stageOps = open.filter((opportunity) => opportunity.stage === stage);
      acc[stage] = {
        count: stageOps.length,
        value: sumFees(stageOps),
      };
      return acc;
    },
    {} as Partial<Record<FunnelStage, { count: number; value: number }>>,
  );
  const sellerRanking = rankWonBySeller(wonInMonth);
  const lossReasonRanking = lostInMonth.reduce<Record<string, number>>((acc, opportunity) => {
    const reason = opportunity.lossReason ?? "não informado";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  return {
    wonCount: wonInMonth.length,
    lostCount: lostInMonth.length,
    wonRevenue: sumFees(wonInMonth),
    lostRevenue: sumFees(lostInMonth),
    winRate: closedInMonth.length ? wonInMonth.length / closedInMonth.length : 0,
    sellerRanking,
    pipelineByStage,
    lossReasonRanking: Object.entries(lossReasonRanking)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function rankBySeller(opportunities: Opportunity[]) {
  const totals = opportunities.reduce<Record<string, number>>((acc, opportunity) => {
    if (opportunityFee(opportunity) === null) return acc;
    acc[opportunity.seller] = (acc[opportunity.seller] || 0) + opportunityFee(opportunity)!;
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([seller, value]) => ({ seller, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function rankWonBySeller(opportunities: Opportunity[]) {
  const totals = opportunities.reduce<Record<string, { count: number; value: number }>>((acc, opportunity) => {
    acc[opportunity.seller] ??= { count: 0, value: 0 };
    acc[opportunity.seller].count += 1;
    acc[opportunity.seller].value += opportunityFee(opportunity) ?? 0;
    return acc;
  }, {});
  return Object.entries(totals)
    .map(([seller, data]) => ({ seller, ...data }))
    .sort((a, b) => b.count - a.count || b.value - a.value)
    .slice(0, 5);
}

export function sumFees(opportunities: Opportunity[]) {
  return Math.round(opportunities.reduce((total, opportunity) => total + (opportunityFee(opportunity) ?? 0), 0) * 100) / 100;
}
