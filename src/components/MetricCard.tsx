import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | string[];
  tone: string;
  Icon: LucideIcon;
  detail?: string;
}

export function MetricCard({ label, value, tone, Icon, detail }: MetricCardProps) {
  return (
    <article className={`${tone} flex min-h-36 flex-col justify-between rounded-lg p-4 text-white shadow-soft`}>
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-36 text-sm font-medium leading-tight text-white/85">{label}</p>
        <Icon className="shrink-0 text-white/90" size={22} />
      </div>
      <div>
        <strong className={`block break-words font-bold leading-tight tracking-normal ${Array.isArray(value) ? "space-y-1 text-base sm:text-lg" : "text-2xl"}`}>
          {Array.isArray(value) ? value.map((line) => <span key={line} className="block">{line}</span>) : value}
        </strong>
        {detail ? <span className="mt-2 block text-xs font-medium text-white/80">{detail}</span> : null}
      </div>
    </article>
  );
}
