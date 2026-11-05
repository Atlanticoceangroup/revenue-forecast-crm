import { BarChart3, Download, LogOut, Plus, UserRound } from "lucide-react";
import { BUSINESS_UNITS } from "../constants";
import type { BusinessUnit, Currency, CurrentUser } from "../types";
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
  isExporting: boolean;
}

export function Header({ onAdd, onExport, storageMode, currentUser, selectedBusinessUnit, onBusinessUnitChange, onSignOut, selectedCurrency, onCurrencyChange, isExporting }: HeaderProps) {
  const units = BUSINESS_UNITS.filter((unit) => currentUser.allowedBusinessUnits.includes(unit.id));
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden rounded-xl bg-cyan-900 p-2.5 text-white sm:block"><BarChart3 size={22} aria-hidden="true" /></span>
            <div className="min-w-0"><h1 className="text-base font-bold text-slate-950 sm:text-xl">Revenue Forecast CRM</h1><p className="hidden text-xs text-slate-500 sm:block">Atlantic Ocean Services</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onAdd} className="btn-primary"><Plus size={18} aria-hidden="true" /><span className="hidden sm:inline">Nova oportunidade</span><span className="sm:hidden">Nova</span></button>
            <details className="group relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"><UserRound size={18} aria-hidden="true" /><span className="hidden md:inline">Minha conta</span><span className="sr-only md:hidden">Minha conta</span></summary>
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <p className="break-words font-semibold text-slate-900">{currentUser.name}</p>
                <p className="mt-1 text-sm text-slate-500">{currentUser.role === "admin" ? "Administrador" : currentUser.role === "manager" ? "Gestor" : "Vendedor"}</p>
                <p className="mt-2 text-xs text-slate-500">{storageMode === "cloud" ? "Armazenamento configurado: nuvem" : "Armazenamento: navegador"}</p>
                <button type="button" onClick={onSignOut} className="btn-secondary mt-4 w-full"><LogOut size={16} aria-hidden="true" />Sair</button>
              </div>
            </details>
          </div>
        </div>
      </header>
      <section aria-label="Contexto da visualização" className="mx-auto flex max-w-[1800px] flex-wrap items-end gap-3 px-4 pt-4 sm:px-6">
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 sm:flex-none">Base operacional
          <select value={selectedBusinessUnit} onChange={(event) => onBusinessUnitChange(event.target.value as BusinessUnit)} disabled={units.length <= 1} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 sm:w-64">
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.shortLabel}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Moeda
          <select value={selectedCurrency} onChange={(event) => onCurrencyChange(event.target.value as Currency)} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
            {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
          </select>
        </label>
        {currentUser.role !== "seller" && <button type="button" onClick={onExport} disabled={isExporting} className="btn-secondary sm:ml-auto"><Download size={17} aria-hidden="true" />{isExporting ? "Gerando..." : "Exportar resultados"}</button>}
      </section>
    </>
  );
}
