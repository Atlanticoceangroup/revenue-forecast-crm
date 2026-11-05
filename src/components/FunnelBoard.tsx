import { useState } from "react";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import type { FunnelStage, Opportunity } from "../types";
import { sumFees } from "../utils/metrics";
import { formatMoney, opportunityCurrency, opportunityFee } from "../utils/money";
import { OpportunityCard } from "./OpportunityCard";

interface FunnelBoardProps {
  opportunities: Opportunity[];
  selectedStage: string;
  onOpen: (opportunity: Opportunity) => void;
  onMove: (id: string, stage: FunnelStage) => Promise<void>;
}

export function FunnelBoard({ opportunities, selectedStage, onOpen, onMove }: FunnelBoardProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.max(1, Math.ceil(opportunities.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  const pageOpportunities = opportunities.slice(firstIndex, firstIndex + pageSize);
  const currencies = [...new Set(opportunities.map(opportunityCurrency))];
  const totals = currencies.map((currency) => `${formatMoney(sumFees(opportunities.filter((opportunity) => opportunityCurrency(opportunity) === currency)), currency)} em fee`).join(" · ");
  const missingFeeCount = opportunities.filter((opportunity) => opportunityFee(opportunity) === null).length;

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{selectedStage || "Todas as oportunidades"}</h2>
          <p className="mt-1 text-xs text-slate-500">Todas as moedas · valores na moeda de cada cotação</p>
          <p className="mt-1 text-sm text-slate-500" aria-live="polite">
            {opportunities.length} oportunidades{totals ? ` · ${totals}` : ""} nos resultados
            {missingFeeCount > 0 ? ` · ${missingFeeCount} sem fee informado` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Por página
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 focus-visible:outline-cyan-600"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      {pageOpportunities.length ? (
        <div className="space-y-3">
          {pageOpportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} onOpen={onOpen} onMove={onMove} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <SearchX size={28} className="text-slate-400" aria-hidden="true" />
          <h3 className="font-semibold text-slate-800">Nenhuma oportunidade encontrada</h3>
          <p className="text-sm text-slate-500">Ajuste os filtros ou selecione outra etapa.</p>
        </div>
      )}
      {opportunities.length > 0 && (
        <nav aria-label="Paginação de oportunidades" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>Mostrando {firstIndex + 1}–{Math.min(firstIndex + pageSize, opportunities.length)} de {opportunities.length}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Página anterior"
              className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 focus-visible:outline-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            ><ChevronLeft size={18} aria-hidden="true" /></button>
            <span aria-live="polite">Página {currentPage} de {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              aria-label="Próxima página"
              className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 focus-visible:outline-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            ><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
        </nav>
      )}
    </main>
  );
}
