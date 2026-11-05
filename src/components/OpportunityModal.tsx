import { CalendarDays, Edit3, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BUSINESS_UNITS } from "../constants";
import { loadOpportunityHistory } from "../services/opportunityRepository";
import type { BusinessUnit, ClientDraft, ClientOption, CurrentUser, OfficialSalesSegment, Opportunity, OpportunityHistory, OptionLists } from "../types";
import { stalledDays } from "../utils/metrics";
import { formatMoney, opportunityCurrency, opportunityFee } from "../utils/money";
import type { Currency } from "../types";
import { AddOpportunityForm } from "./AddOpportunityForm";
import { Dialog } from "./ui/Dialog";
import { useFeedback } from "./ui/Feedback";

interface OpportunityModalProps {
  opportunity: Opportunity | null;
  mode: "view" | "edit" | "create";
  onClose: () => void;
  onEdit: () => void;
  onSave: (opportunity: Opportunity) => Promise<void>;
  onDelete: (opportunity: Opportunity) => Promise<void>;
  optionLists: OptionLists;
  onAddOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  onAddClient: (client: ClientDraft) => Promise<ClientOption>;
  onDeleteOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
  canEdit: boolean;
  defaultCurrency?: Currency;
}

export function OpportunityModal({
  opportunity,
  mode,
  onClose,
  onEdit,
  onSave,
  onDelete,
  optionLists,
  onAddOption,
  onAddClient,
  onDeleteOption,
  currentUser,
  selectedBusinessUnit,
  canEdit,
  defaultCurrency,
}: OpportunityModalProps) {
  const [history, setHistory] = useState<OpportunityHistory[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReload, setHistoryReload] = useState(0);
  const [tab, setTab] = useState<"details" | "history">("details");
  const [isDirty, setIsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const closingRef = useRef(false);
  const { decide } = useFeedback();
  const isClosed = opportunity?.stage.startsWith("Fechado") ?? false;

  useEffect(() => {
    if (mode !== "view" || !opportunity || tab !== "history") return;
    let active = true;
    setHistory([]); setHistoryLoading(true); setHistoryError(false);
    loadOpportunityHistory(opportunity.id)
      .then((items) => { if (active) setHistory(items); })
      .catch(() => { if (active) setHistoryError(true); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [mode, opportunity?.id, tab, historyReload]);

  useEffect(() => { setIsDirty(false); setBusy(false); setTab("details"); }, [mode, opportunity?.id]);
  useEffect(() => {
    if (!isDirty || mode === "view") return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty, mode]);

  async function requestClose() {
    if (busy || closingRef.current) return;
    closingRef.current = true;
    try {
      if (isDirty && mode !== "view") {
        const confirmed = await decide({ title: "Descartar alterações?", message: "Há dados preenchidos que ainda não foram salvos. Deseja fechar e descartar essas alterações?", confirmLabel: "Descartar alterações", destructive: true });
        if (!confirmed) return;
      }
      onClose();
    } finally { closingRef.current = false; }
  }

  if (!opportunity && mode !== "create") {
    return null;
  }

  return (
    <Dialog drawer labelledBy="opportunity-dialog-title" onClose={() => void requestClose()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
              {mode === "create" ? "Nova oportunidade" : opportunity?.stage}
            </p>
            <h2 id="opportunity-dialog-title" className="mt-1 break-words text-xl font-bold text-slate-950">
              {mode === "create" ? "Adicionar oportunidade" : opportunity?.clientName}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {mode === "view" && opportunity && canEdit && <button type="button" onClick={onEdit} className="btn-primary"><Edit3 size={16} aria-hidden="true" /><span className="hidden sm:inline">Editar</span><span className="sr-only sm:hidden">Editar oportunidade</span></button>}
          {mode === "view" && opportunity && currentUser.role !== "seller" && <details className="relative">
            <summary className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Mais</summary>
            <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(opportunity); } finally { setBusy(false); } }} className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-sm text-red-700 hover:bg-red-50"><Trash2 size={15} aria-hidden="true" />Excluir oportunidade</button></div>
          </details>}
          <button type="button" aria-label="Fechar painel da oportunidade" disabled={busy} onClick={() => void requestClose()} className="rounded-lg border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <X size={20} />
          </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {mode === "view" && opportunity ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-slate-950 p-4 text-white">
              <p className="text-sm text-white/70">{opportunity.opportunityName}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-white/70">Receita Atlantic (fee)</p>
                  <strong className="text-3xl">{opportunityFee(opportunity) === null ? "Não informado" : formatMoney(opportunityFee(opportunity)!, opportunityCurrency(opportunity))}</strong>
                  <p className="mt-2 text-sm text-white/80">Bruto: {formatMoney(opportunity.value, opportunityCurrency(opportunity))}</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{opportunity.probability}% forecast</span>
              </div>
            </div>
            <nav aria-label="Seções da oportunidade" className="flex gap-2 border-b border-slate-200 pb-3">
              <button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")} className={tab === "details" ? "btn-primary" : "btn-secondary"}>Informações</button>
              <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")} className={tab === "history" ? "btn-primary" : "btn-secondary"}>Histórico</button>
            </nav>
            {tab === "history" && <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-normal text-slate-500">Movimentações registradas</p>
              <div className="space-y-2">
                {historyLoading ? <p role="status" className="text-sm text-slate-500">Carregando movimentações...</p> : historyError ? <div><p role="alert" className="text-sm text-red-700">Não foi possível carregar o histórico.</p><button type="button" className="btn-secondary mt-3" onClick={() => setHistoryReload((value) => value + 1)}>Tentar novamente</button></div> : history.length ? (
                  history.map((item) => (
                    <p key={item.id} className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">{item.changedByName}</span> moveu de{" "}
                      <span className="font-semibold">{item.fromStage || "sem etapa"}</span> para{" "}
                      <span className="font-semibold">{item.toStage}</span> em {formatDateTime(item.changedAt)}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Nenhuma movimentação registrada ainda.</p>
                )}
              </div>
            </div>}
            {tab === "details" && <>
            {!isClosed && <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><h3 className="font-bold text-cyan-950">Próxima ação · {formatDate(opportunity.nextActionDate ?? "")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-cyan-900">{opportunity.nextStep}</p></div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Vendedor" value={opportunity.seller} />
              <Info label="Base operacional" value={businessUnitLabel(opportunity.businessUnit)} />
              <Info label="Segmento" value={opportunity.segment} />
              <Info label="Serviço" value={opportunity.service} />
              <Info label="Prioridade" value={opportunity.priority} />
              <Info label="Origem" value={opportunity.source} />
              <Info label="Tipo de lead" value={opportunity.leadType} />
              <Info label="Temperatura" value={opportunity.temperature} />
              {!isClosed ? <Info label="Tempo parado" value={`${stalledDays(opportunity)} dias`} /> : null}
              <Info label="Entrada" value={formatDate(opportunity.enteredAt)} />
              <Info label="Última interação" value={formatDate(opportunity.lastInteractionAt)} />
              {isClosed && opportunity.closedAt ? <Info label="Fechamento" value={formatDate(opportunity.closedAt)} /> : null}
              {!isClosed ? <Info label="Próxima ação" value={opportunity.nextActionDate ? formatDate(opportunity.nextActionDate) : "-"} /> : null}
              {opportunity.lossReason ? <Info label="Motivo da perda" value={opportunity.lossReason} /> : null}
            </div>
            </>}
            {tab === "history" && <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-normal text-slate-500">Histórico do funil</p>
              <div className="space-y-2">
                {Object.entries(opportunity.stageHistory).map(([stage, date]) => (
                  <p key={stage} className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays size={15} />
                    <span className="font-semibold text-slate-800">{stage}</span>
                    <span>{formatDate(date ?? "")}</span>
                  </p>
                ))}
              </div>
            </div>}
          </div>
        ) : (
          <AddOpportunityForm
            initial={mode === "edit" ? opportunity : null}
            onSubmit={onSave}
            onCancel={() => void requestClose()}
            optionLists={optionLists}
            onAddOption={onAddOption}
            onAddClient={onAddClient}
            onDeleteOption={onDeleteOption}
            currentUser={currentUser}
            selectedBusinessUnit={selectedBusinessUnit}
            defaultCurrency={defaultCurrency}
            onDirtyChange={setIsDirty}
            onBusyChange={setBusy}
          />
        )}
        </div>
    </Dialog>
  );
}

function businessUnitLabel(value: BusinessUnit) {
  return BUSINESS_UNITS.find((unit) => unit.id === value)?.label ?? value;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "-";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
