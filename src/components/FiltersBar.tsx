import { Search } from "lucide-react";
import { BUSINESS_UNIT_SEGMENTS, FUNNEL_STAGES } from "../constants";
import type { BusinessUnit, CurrentUser, Filters, OfficialSalesSegment, OptionLists } from "../types";

interface FiltersBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  optionLists: OptionLists;
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
}

export function FiltersBar({ filters, onChange, optionLists, currentUser, selectedBusinessUnit }: FiltersBarProps) {
  const isManager = currentUser.role === "manager" || currentUser.role === "admin";
  const sellerOptions = isManager ? optionLists.sellers : [currentUser.sellerName];
  const segmentOptions = BUSINESS_UNIT_SEGMENTS[selectedBusinessUnit];
  const serviceOptions = filters.segment
    ? optionLists.servicesBySegment[filters.segment as OfficialSalesSegment] ?? optionLists.services
    : segmentOptions.flatMap((segment) => optionLists.servicesBySegment[segment] ?? []);

  return (
    <section className="mx-auto max-w-[1800px] px-4 sm:px-6">
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
    </section>
  );
}
