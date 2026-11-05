import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  tone: string;
  Icon: LucideIcon;
  detail?: string;
}

export function MetricCard({ label, value, tone, Icon, detail }: MetricCardProps) {
  return (
    <article className="flex min-h-28 min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-tight text-slate-600">{label}</p>
        <span className={`${tone} rounded-lg p-1.5 text-white`}><Icon className="shrink-0" size={18} aria-hidden="true" /></span>
      </div>
      <div>
        <strong className="mt-2 block break-words text-xl font-bold leading-tight tracking-normal">{value}</strong>
        {detail ? <span className="mt-2 block text-xs font-medium text-slate-500">{detail}</span> : null}
      </div>
    </article>
  );
}
