import { useRef, useState } from "react";
import { ArrowUpRight, CalendarClock, UserRound } from "lucide-react";
import { FUNNEL_STAGES, STAGE_COLORS } from "../constants";
import type { FunnelStage, Opportunity } from "../types";
import { BRL, stalledDays } from "../utils/metrics";

interface OpportunityCardProps {
  opportunity: Opportunity;
  onOpen: (opportunity: Opportunity) => void;
  onMove: (id: string, stage: FunnelStage) => Promise<void>;
}

export function OpportunityCard({ opportunity, onOpen, onMove }: OpportunityCardProps) {
  const [isMoving, setIsMoving] = useState(false);
  const movingRef = useRef(false);
  const [moveError, setMoveError] = useState("");
  const isClosed = opportunity.stage.startsWith("Fechado");
  const stalled = stalledDays(opportunity);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isOverdue = !isClosed && Boolean(opportunity.nextActionDate && opportunity.nextActionDate < today);
  const isCritical = !isClosed && stalled > 14;
  const isStalled = !isClosed && stalled > 7;
  const needsAttention = isOverdue || isStalled || (!isClosed && !opportunity.nextActionDate);

  async function handleStageChange(stage: FunnelStage) {
    if (movingRef.current || stage === opportunity.stage) return;
    movingRef.current = true;
    setIsMoving(true);
    setMoveError("");
    try {
      await onMove(opportunity.id, stage);
    } catch {
      setMoveError("Não foi possível confirmar a mudança de etapa. Recarregue os dados antes de tentar novamente.");
    } finally {
      movingRef.current = false;
      setIsMoving(false);
    }
  }

  return (
    <article
      aria-label={`${opportunity.clientName}: ${opportunity.opportunityName}`}
      aria-busy={isMoving}
      className={`rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${needsAttention ? "border-amber-300" : "border-slate-200"}`}
    >
      <div className="grid min-w-0 grid-cols-2 items-start gap-4 p-4 md:grid-cols-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_auto] xl:items-center">
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="col-span-2 min-w-0 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-600 md:col-span-1"
          aria-label={`Abrir ${opportunity.opportunityName}, cliente ${opportunity.clientName}`}
        >
          <span className="block truncate text-sm font-bold text-slate-950" title={opportunity.clientName}>{opportunity.clientName}</span>
          <span className="mt-1 block truncate text-sm text-slate-600" title={opportunity.opportunityName}>{opportunity.opportunityName}</span>
          <span className="mt-1 block truncate text-xs text-slate-500" title={`${opportunity.segment} · ${opportunity.service}`}>{opportunity.segment} · {opportunity.service}</span>
        </button>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Valor estimado</p>
          <p className="mt-1 break-words text-base font-bold text-slate-950">{BRL.format(opportunity.value)}</p>
          <p className="mt-1 text-xs text-slate-500">Probabilidade: {opportunity.probability}%</p>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs text-slate-500"><UserRound size={13} aria-hidden="true" /> Responsável</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-700" title={opportunity.seller}>{opportunity.seller}</p>
          <p className="mt-1 text-xs text-slate-500">Prioridade {opportunity.priority}</p>
        </div>
        <label className="block min-w-0">
          <span className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STAGE_COLORS[opportunity.stage]}`} />
            {isMoving ? "Salvando etapa..." : "Etapa"}
          </span>
          <select
            aria-label={`Etapa de ${opportunity.opportunityName}`}
            value={opportunity.stage}
            disabled={isClosed || isMoving}
            onChange={(event) => void handleStageChange(event.target.value as FunnelStage)}
            className="min-h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus-visible:outline-cyan-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {FUNNEL_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarClock size={13} aria-hidden="true" /> {isClosed ? "Fechamento" : "Próxima ação"}</p>
          <p className={`mt-1 text-sm font-semibold ${needsAttention ? "text-amber-800" : "text-slate-700"}`}>
            {isClosed ? formatDate(opportunity.closedAt) : formatDate(opportunity.nextActionDate)}
            {isOverdue ? " · atrasada" : ""}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500" title={isClosed ? opportunity.lossReason : opportunity.nextStep}>
            {isClosed ? opportunity.lossReason || "Oportunidade encerrada" : opportunity.nextStep}
          </p>
          {isStalled && <p className={`mt-1 text-xs font-semibold ${isCritical ? "text-red-700" : "text-amber-800"}`}>{stalled} dias sem interação</p>}
        </div>
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          aria-label={`Ver detalhes de ${opportunity.opportunityName}`}
          className="flex min-h-10 items-center justify-center gap-1 self-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-cyan-600"
        >
          Detalhes <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
      {moveError && <p role="alert" className="border-t border-red-100 px-4 py-3 text-sm text-red-700">{moveError}</p>}
    </article>
  );
}

function formatDate(value?: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "Sem data";
}
