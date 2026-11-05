import { Search } from "lucide-react";
import { BUSINESS_UNIT_SEGMENTS, FUNNEL_STAGES } from "../constants";
import type { BusinessUnit, CurrentUser, Filters, OfficialSalesSegment, OptionLists } from "../types";
import type { Opportunity } from "../types";
import { filterOpportunities, matchesQuickFilter } from "../utils/opportunityFilters";
import type { QuickFilter, SortOrder } from "../utils/opportunityFilters";

interface FiltersBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  optionLists: OptionLists;
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
  opportunities: Opportunity[];
  quickFilter: QuickFilter;
  onQuickFilter: (filter: QuickFilter) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
}

export function FiltersBar({ filters, onChange, optionLists, currentUser, selectedBusinessUnit, opportunities, quickFilter, onQuickFilter, sortOrder, onSortChange }: FiltersBarProps) {
  const isManager = currentUser.role === "manager" || currentUser.role === "admin";
  const sellerOptions = isManager ? optionLists.sellers : [currentUser.sellerName];
  const segmentOptions = BUSINESS_UNIT_SEGMENTS[selectedBusinessUnit];
  const serviceOptions = filters.segment
    ? optionLists.servicesBySegment[filters.segment as OfficialSalesSegment] ?? optionLists.services
    : segmentOptions.flatMap((segment) => optionLists.servicesBySegment[segment] ?? []);
  const quickOptions: [QuickFilter, string][] = [["all", "Todas"], ["today", "Hoje"], ["overdue", "Atrasadas"], ["missingFee", "Sem fee"], ["mine", "Minhas oportunidades"]];
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));
  const filterNames: Record<keyof Filters, string> = { search: "Busca", seller: "Vendedor", stage: "Etapa", segment: "Segmento", service: "Serviço" };
  const matching = filterOpportunities(opportunities, filters, "all", currentUser);

  return (
    <section className="mx-auto max-w-[1800px] px-4 sm:px-6">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Atalhos de oportunidades">
        {quickOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={quickFilter === value} onClick={() => onQuickFilter(value)} className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${quickFilter === value ? "border-cyan-800 bg-cyan-800 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
          {label} <span className="ml-1 text-xs">{matching.filter((item) => matchesQuickFilter(item, value, currentUser)).length}</span>
        </button>)}
      </div>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-soft sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.5fr)_repeat(4,minmax(0,1fr))]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Buscar cliente ou oportunidade"
            aria-label="Buscar cliente ou oportunidade"
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
          />
        </label>
        <select
          aria-label="Filtrar por vendedor"
          value={isManager ? filters.seller : currentUser.sellerName}
          onChange={(event) => onChange({ ...filters, seller: event.target.value })}
          disabled={!isManager}
          className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
        >
          {isManager && <option value="">Todos os vendedores</option>}
          {sellerOptions.map((seller) => (
            <option key={seller} value={seller}>
              {seller}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por etapa"
          value={filters.stage}
          onChange={(event) => onChange({ ...filters, stage: event.target.value })}
          className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
        >
          <option value="">Todas as etapas</option>
          {FUNNEL_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por segmento"
          value={filters.segment}
          onChange={(event) => onChange({ ...filters, segment: event.target.value, service: "" })}
          className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
        >
          <option value="">Todos os segmentos</option>
          {segmentOptions.map((segment) => (
            <option key={segment} value={segment}>
              {segment}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por serviço"
          value={filters.service}
          onChange={(event) => onChange({ ...filters, service: event.target.value })}
          className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
        >
          <option value="">Todos os serviços</option>
          {serviceOptions.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {!activeFilters.length && quickFilter === "all" && <span>Nenhum filtro adicional ativo</span>}
          {activeFilters.map(([key, value]) => <button key={key} type="button" aria-label={`Remover filtro ${filterNames[key as keyof Filters]}: ${value}`} onClick={() => onChange({ ...filters, [key]: "", ...(key === "segment" ? { service: "" } : {}) })} className="rounded-full border border-slate-200 bg-white px-3 py-2">{filterNames[key as keyof Filters]}: {value} ×</button>)}
          {(activeFilters.length > 0 || quickFilter !== "all") && <button type="button" className="min-h-10 px-2 font-semibold text-cyan-800 underline" onClick={() => { onChange({ seller: "", stage: "", segment: "", service: "", search: "" }); onQuickFilter("all"); }}>Limpar filtros</button>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">Ordenar por
          <select value={sortOrder} onChange={(event) => onSortChange(event.target.value as SortOrder)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm">
            <option value="nextAction">Próxima ação</option><option value="recent">Entrada mais recente</option><option value="fee">Maior fee</option><option value="gross">Maior bruto</option>
          </select>
        </label>
      </div>
    </section>
  );
}
