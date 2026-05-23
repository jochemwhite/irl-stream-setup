import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  status?: "good" | "warn" | "bad" | "neutral";
  counter?: { bad: number; good: number; fallbackThreshold: number; recoverThreshold: number };
}

const statusColors = {
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  neutral: "text-foreground",
};

export function MetricCard({ label, value, unit, icon, status = "neutral", counter }: MetricCardProps) {
  const pct = counter && counter.fallbackThreshold > 0 ? counter.bad / counter.fallbackThreshold : 0;
  const counterColor = pct >= 1 ? "text-red-400" : pct >= 0.5 ? "text-amber-400" : "text-amber-300";
  const barColor = pct >= 1 ? "bg-red-500" : pct >= 0.5 ? "bg-amber-500" : "bg-amber-400";

  return (
    <Card className="bg-card/50 border-border/40">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${statusColors[status]}`}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-muted-foreground font-medium">{unit}</span>
          )}
        </div>
        {counter && counter.bad > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-medium tabular-nums ${counterColor}`}>
                {counter.bad}/{counter.fallbackThreshold} bad polls
              </span>
            </div>
            <div className="h-1 rounded-full bg-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.min(pct * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
