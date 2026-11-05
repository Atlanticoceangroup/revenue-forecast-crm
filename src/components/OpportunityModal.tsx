import { CalendarDays, Edit3, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BUSINESS_UNITS } from "../constants";
import { loadOpportunityHistory } from "../services/opportunityRepository";
import type { BusinessUnit, ClientDraft, ClientOption, CurrentUser, OfficialSalesSegment, Opportunity, OpportunityHistory, OptionLists } from "../types";
import { BRL, stalledDays } from "../utils/metrics";
import { AddOpportunityForm } from "./AddOpportunityForm";

interface OpportunityModalProps {
  opportunity: Opportunity | null;
  mode: "view" | "edit" | "create";
  onClose: () => void;
  onEdit: () => void;
  onSave: (opportunity: Opportunity) => Promise<void>;
  onDelete: (opportunity: Opportunity) => void;
  optionLists: OptionLists;
  onAddOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  onAddClient: (client: ClientDraft) => Promise<ClientOption>;
  onDeleteOption: (type: keyof OptionLists, name: string, segment?: OfficialSalesSegment) => Promise<void>;
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
  canEdit: boolean;
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
}: OpportunityModalProps) {
  const [history, setHistory] = useState<OpportunityHistory[]>([]);
  const isClosed = opportunity?.stage.startsWith("Fechado") ?? false;

  useEffect(() => {
    if (mode === "view" && opportunity) {
      loadOpportunityHistory(opportunity.id).then(setHistory).catch(() => setHistory([]));
    }
  }, [mode, opportunity]);

  if (!opportunity && mode !== "create") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <aside className="h-full w-full overflow-y-auto bg-white p-5 shadow-soft sm:max-w-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
              {mode === "create" ? "Nova oportunidade" : opportunity?.stage}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {mode === "create" ? "Adicionar oportunidade" : opportunity?.clientName}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>

        {mode === "view" && opportunity ? (
          <div className="space-y-5">
            <div className="rounded-lg bg-slate-950 p-4 text-white">
              <p className="text-sm text-white/70">{opportunity.opportunityName}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <strong className="text-3xl">{BRL.format(opportunity.value)}</strong>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{opportunity.probability}% forecast</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-normal text-slate-500">Movimentações registradas</p>
              <div className="space-y-2">
                {history.length ? (
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
            </div>
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
            {!isClosed ? (
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-normal text-slate-500">Próximo passo</p>
                <p className="mt-2 text-sm text-slate-700">{opportunity.nextStep}</p>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-200 p-4">
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {canEdit ? (
                <button
                  onClick={onEdit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
                >
                  <Edit3 size={17} />
                  Editar oportunidade
                </button>
              ) : null}
              {currentUser.role === "manager" || currentUser.role === "admin" ? (
                <button
                  onClick={() => onDelete(opportunity)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                >
                  <Trash2 size={17} />
                  Excluir oportunidade
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <AddOpportunityForm
            initial={mode === "edit" ? opportunity : null}
            onSubmit={onSave}
            onCancel={onClose}
            optionLists={optionLists}
            onAddOption={onAddOption}
            onAddClient={onAddClient}
            onDeleteOption={onDeleteOption}
            currentUser={currentUser}
            selectedBusinessUnit={selectedBusinessUnit}
          />
        )}
      </aside>
    </div>
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
