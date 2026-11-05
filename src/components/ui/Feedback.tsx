import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog } from "./Dialog";

interface Decision {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  choices?: readonly string[];
}
interface Notice { id: number; message: string; kind: "success" | "error" }
interface FeedbackValue {
  notify: (message: string, kind?: Notice["kind"]) => void;
  decide: (request: Decision) => Promise<string | null>;
}
const Context = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [choice, setChoice] = useState("");
  const pending = useRef<((value: string | null) => void) | null>(null);
  const notify = useCallback((message: string, kind: Notice["kind"] = "success") => setNotice({ id: Date.now(), message, kind }), []);
  const decide = useCallback((request: Decision) => {
    if (pending.current) return Promise.resolve(null);
    setChoice("");
    setDecision(request);
    return new Promise<string | null>((resolve) => { pending.current = resolve; });
  }, []);
  function finish(value: string | null) {
    pending.current?.(value);
    pending.current = null;
    setDecision(null);
  }
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => () => { pending.current?.(null); }, []);

  return (
    <Context.Provider value={{ notify, decide }}>
      {children}
      {notice && (
        <div className={`fixed bottom-5 right-5 z-[90] flex max-w-[calc(100vw-2.5rem)] items-start gap-4 rounded-xl border bg-white p-4 shadow-xl sm:max-w-md ${notice.kind === "error" ? "border-red-200 text-red-800" : "border-emerald-200 text-emerald-900"}`}>
          <p role={notice.kind === "error" ? "alert" : "status"} className="text-sm font-medium">{notice.message}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar mensagem" className="rounded p-1"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {decision && (
        <Dialog labelledBy="decision-title" onClose={() => finish(null)}>
          <h2 id="decision-title" className="text-lg font-bold text-slate-950">{decision.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{decision.message}</p>
          {decision.choices && <label className="mt-4 block text-sm font-semibold text-slate-700">Motivo
            <select value={choice} onChange={(event) => setChoice(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
              <option value="">Selecione um motivo</option>
              {decision.choices.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => finish(null)}>Cancelar</button>
            <button type="button" className={decision.destructive ? "btn-danger" : "btn-primary"} disabled={Boolean(decision.choices && !choice)} onClick={() => finish(choice || "confirmed")}>{decision.confirmLabel ?? "Confirmar"}</button>
          </div>
        </Dialog>
      )}
    </Context.Provider>
  );
}

export function useFeedback() {
  const context = useContext(Context);
  if (!context) throw new Error("FeedbackProvider ausente");
  return context;
}
