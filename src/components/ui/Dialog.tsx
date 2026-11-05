import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const stack: symbol[] = [];
let savedOverflow = "";
const focusable = 'button:not(:disabled), summary, a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export function Dialog({ children, labelledBy, onClose, drawer = false }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  drawer?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const token = Symbol();
    const previous = document.activeElement as HTMLElement | null;
    if (!stack.length) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    stack.push(token);
    const elements = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(focusable) ?? []).filter((element) => element.getClientRects().length > 0);
    const focusFirst = () => (elements()[0] ?? panel.current)?.focus();
    focusFirst();
    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const items = elements();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); return; }
        if (!panel.current?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    function onFocus(event: FocusEvent) {
      if (stack[stack.length - 1] === token && !panel.current?.contains(event.target as Node)) focusFirst();
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      stack.splice(stack.indexOf(token), 1);
      if (!stack.length) document.body.style.overflow = savedOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const content = (
    <div className={`fixed inset-0 flex bg-slate-950/45 ${drawer ? "z-50 justify-end" : "z-[80] items-center justify-center p-4"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        className={drawer ? "flex h-full w-full max-w-3xl flex-col bg-white shadow-xl outline-none" : "max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl outline-none"}>
        {children}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
