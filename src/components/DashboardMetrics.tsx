import {
  AlertTriangle,
  Banknote,
  BarChart2,
  CheckCircle2,
  Clock3,
  Gauge,
  ListChecks,
  Scale,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Trophy,
  UsersRound,
  XCircle,
} from "lucide-react";
import { FUNNEL_STAGES, OPEN_STAGES } from "../constants";
import { useMemo } from "react";
import type { Opportunity } from "../types";
import { numberFormat, sumFees } from "../utils/metrics";
import { calculateDashboardMetrics } from "../utils/dashboardMetrics";
import { formatMoney, opportunityCurrency } from "../utils/money";
import { MetricCard } from "./MetricCard";

interface DashboardMetricsProps {
  opportunities: Opportunity[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

export function DashboardMetrics({ opportunities, selectedMonth, onMonthChange }: DashboardMetricsProps) {
  const metrics = useMemo(() => calculateDashboardMetrics(opportunities, selectedMonth), [opportunities, selectedMonth]);
  const { monthly, byCurrency } = metrics;
  const money = (field: "openRevenue" | "wonRevenue" | "lostRevenue" | "weightedForecast" | "avgTicket" | "grossValue") =>
    byCurrency.map((group) => formatMoney(group.metrics[field], group.currency));
  const monthlyMoney = (field: "wonRevenue" | "lostRevenue") =>
    byCurrency.map((group) => formatMoney(group.monthly[field], group.currency)).join("\n");
  const sellerMoney = (seller: string, inMonth = false) => byCurrency.flatMap(({ currency }) => {
    const won = opportunities.filter((opportunity) => opportunity.seller === seller && opportunity.stage === "Fechado - Ganhou" && opportunityCurrency(opportunity) === currency && (!inMonth || opportunity.closedAt?.startsWith(selectedMonth)));
    return won.length ? [formatMoney(sumFees(won), currency)] : [];
  }).join("\n");
  const topStage = Object.entries(metrics.stageCounts).sort((a, b) => b[1] - a[1])[0];
  const worstStall = Object.entries(metrics.stageStallAverage).sort((a, b) => b[1] - a[1])[0];
  const bestCloser = metrics.wonRanking[0];
  const proposalConversion = metrics.stageConversionRates["Proposta Enviada"] ?? 0;

  const cards = [
    ["Fee em aberto", money("openRevenue"), "bg-sky-600", Banknote, "Receita Atlantic no pipeline"],
    ["Fee ganho", money("wonRevenue"), "bg-emerald-600", CheckCircle2, "Receita Atlantic confirmada"],
    ["Fee perdido", money("lostRevenue"), "bg-rose-600", XCircle, "Receita Atlantic não realizada"],
    ["Forecast do fee", money("weightedForecast"), "bg-violet-600", Gauge, "Fee x probabilidade"],
    ["Total de oportunidades", numberFormat.format(metrics.totalOpportunities), "bg-slate-800", ListChecks, "Todas as moedas"],
    ["Oportunidades por etapa", `${topStage?.[1] ?? 0}`, "bg-cyan-600", UsersRound, topStage?.[0] ?? "Sem etapa"],
    ["Conversão geral", percent(metrics.overallConversionRate), "bg-green-700", TrendingUp, "Ganhas sobre total"],
    ["Conversão proposta", percent(proposalConversion), "bg-amber-600", BarChart2, "Avanço pós-proposta"],
    ["Fee médio ganho", money("avgTicket"), "bg-indigo-600", Scale, "Somente ganhos com fee informado, por moeda"],
    ["Ciclo médio", `${Math.round(metrics.avgConversionDays)} dias`, "bg-teal-700", Clock3, "Entrada até fechamento"],
    ["Parado médio", `${Math.round(worstStall?.[1] ?? 0)} dias`, "bg-orange-600", TimerReset, worstStall?.[0] ?? "Sem etapa"],
    ["Win rate", percent(metrics.winRate), "bg-lime-700", Trophy, "Ganhas / fechadas"],
    ["Loss rate", percent(metrics.lossRate), "bg-red-700", TrendingDown, "Perdidas / fechadas"],
    ["Bruto das cotações", money("grossValue"), "bg-blue-700", Target, "Volume cotado, separado da receita Atlantic"],
    ["Sem próxima ação", `${metrics.withoutNextAction}`, "bg-fuchsia-700", AlertTriangle, "Oportunidades abertas"],
    ["Paradas +7 dias", `${metrics.stalledOverSeven}`, "bg-orange-700", AlertTriangle, "Exigem follow-up"],
    [
      "Ranking negociação",
      byCurrency.map(({ currency, metrics }) => {
        const leader = metrics.negotiationRanking[0];
        return leader ? `${leader.seller} · ${formatMoney(leader.value, currency)}` : `${currency}: sem negociações`;
      }),
      "bg-slate-700",
      Trophy,
      "Maior fee em cada moeda",
    ],
    [
      "Ranking ganhos",
      bestCloser ? `${bestCloser.seller}` : "Sem ganhos",
      "bg-emerald-700",
      Trophy,
      bestCloser ? `${bestCloser.count} oportunidades` : "Sem ganhos",
    ],
  ] as const;

  return (
    <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
      <div className="mb-4 rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
        Todos os indicadores consideram oportunidades de todas as moedas. Os valores financeiros aparecem separados por moeda, sem conversão cambial. Receita e forecast calculados pelo fee da Atlantic.
        {metrics.missingFeeCount > 0 && <p className="mt-1 font-semibold">Totais de receita parciais: {metrics.missingFeeCount} oportunidades sem fee informado. Edite os cards para preencher.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, tone, Icon, detail]) => (
          <MetricCard key={label} label={label} value={value} tone={tone} Icon={Icon} detail={detail} />
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold uppercase tracking-normal text-slate-500">Taxa de conversão por etapa</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FUNNEL_STAGES.slice(0, -2).map((stage) => (
              <div key={stage}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate">{stage}</span>
                  <b>{percent(metrics.stageConversionRates[stage] ?? 0)}</b>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900"
                    style={{ width: `${Math.round((metrics.stageConversionRates[stage] ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold uppercase tracking-normal text-slate-500">Ranking executivo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              {byCurrency.map(({ currency, metrics }) => <Ranking key={currency}
                title={`Fee em negociação · ${currency}`}
                data={metrics.negotiationRanking.map((item): [string, string] => [item.seller, formatMoney(item.value, currency)])}
              />)}
            </div>
            <Ranking
              title="Ranking por quantidade de ganhos"
              data={metrics.wonRanking.map((item): [string, string] => [
                item.seller,
                `${item.count} ganhos\n${sellerMoney(item.seller)}`,
              ])}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-normal text-slate-500">Dashboard de gestão mensal</h2>
            <p className="mt-1 text-xs text-slate-500">Ganhos, perdas, ranking e pipeline da base operacional selecionada.</p>
          </div>
          <input
            type="month"
            aria-label="Mês dos indicadores"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-500"
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MiniMetric label="Fee ganho no mês" value={`${monthly.wonCount} oportunidades\n${monthlyMoney("wonRevenue")}`} tone="text-emerald-700" />
          <MiniMetric label="Fee perdido no mês" value={`${monthly.lostCount} oportunidades\n${monthlyMoney("lostRevenue")}`} tone="text-rose-700" />
          <MiniMetric label="Win rate mensal" value={percent(monthly.winRate)} tone="text-lime-700" />
          <MiniMetric
            label="Top vendedor do mês por ganhos"
            value={monthly.sellerRanking[0]?.seller ?? "Sem ganhos"}
            tone="text-slate-800"
          />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Ranking
            title="Ranking por vendedor no mês"
            data={monthly.sellerRanking.map((item): [string, string] => [
              item.seller,
              `${item.count} ganhos\n${sellerMoney(item.seller, true)}`,
            ])}
          />
          <Ranking
            title="Motivos de perda no mês"
            data={monthly.lossReasonRanking.map((item): [string, string] => [item.reason, `${item.count} perdas`])}
          />
          <Ranking
            title="Fee aberto por etapa"
            data={OPEN_STAGES.map((stage): [string, string] => [
              stage,
              `${monthly.pipelineCounts[stage]} oportunidades\n${byCurrency.map(({ currency, monthly }) => formatMoney(monthly.pipelineByStage[stage]?.value ?? 0, currency)).join("\n")}`,
            ])}
          />
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</p>
      <p className={`mt-2 whitespace-pre-line break-words text-base font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Ranking({ title, data }: { title: string; data: Array<[string, string]> }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {data.length ? (
          data.map(([seller, value], index) => (
            <div key={seller} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words font-semibold text-slate-700">{index + 1}. {seller}</span>
              <span className="min-w-0 whitespace-pre-line break-words text-right text-slate-500">{value}</span>
            </div>
          ))
        ) : (
          <span className="text-sm text-slate-400">Sem dados</span>
        )}
      </div>
    </div>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
