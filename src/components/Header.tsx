import { BarChart3, Download, LogOut, Plus } from "lucide-react";
import { BUSINESS_UNITS } from "../constants";
import type { BusinessUnit, CurrentUser } from "../types";
import type { Currency } from "../types";
import { CURRENCIES } from "../utils/money";

interface HeaderProps {
  onAdd: () => void;
  onExport: () => void;
  storageMode: "local" | "cloud";
  currentUser: CurrentUser;
  selectedBusinessUnit: BusinessUnit;
  onBusinessUnitChange: (businessUnit: BusinessUnit) => void;
  onSignOut: () => void;
  selectedCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

export function Header({
  onAdd,
  onExport,
  storageMode,
  currentUser,
  selectedBusinessUnit,
  onBusinessUnitChange,
  onSignOut,
  selectedCurrency,
  onCurrencyChange,
}: HeaderProps) {
  const availableBusinessUnits = BUSINESS_UNITS.filter((unit) => currentUser.allowedBusinessUnits.includes(unit.id));
  const selectedBusinessUnitLabel =
    BUSINESS_UNITS.find((unit) => unit.id === selectedBusinessUnit)?.shortLabel ?? "Base comercial";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Revenue Forecast CRM</h1>
            <p className="text-sm text-slate-500">
              Kanban executivo para previsibilidade, gargalos e conversão comercial.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Desenvolvido por Paulo Penna - Atlantic Ocean Services 2026
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
            {storageMode === "cloud" ? "Dados na nuvem" : "Modo local"}
          </span>
          <span className="rounded-full bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">
            {currentUser.name} · {currentUser.role === "admin" ? "Admin" : currentUser.role === "manager" ? "Gestor" : "Vendedor"}
          </span>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            Base
            <select
              value={selectedBusinessUnit}
              onChange={(event) => onBusinessUnitChange(event.target.value as BusinessUnit)}
              className="bg-transparent text-sm font-semibold text-slate-800 outline-none"
              disabled={availableBusinessUnits.length <= 1}
              title={selectedBusinessUnitLabel}
            >
              {availableBusinessUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.shortLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            Moeda da visualização
            <select value={selectedCurrency} onChange={(event) => onCurrencyChange(event.target.value as Currency)} className="min-h-7 bg-transparent text-sm font-semibold text-slate-800 focus-visible:outline-cyan-600">
              {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
            </select>
          </label>
          <button
            onClick={onExport}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${
              currentUser.role === "seller" ? "hidden" : ""
            }`}
          >
            <Download size={18} />
            Exportar planilha
          </button>
          <button
            onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
          >
            <Plus size={18} />
            Nova oportunidade
          </button>
          <button
            onClick={onSignOut}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
