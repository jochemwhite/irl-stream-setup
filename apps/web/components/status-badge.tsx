import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  live: boolean;
}

export function StatusBadge({ live }: StatusBadgeProps) {
  if (live) {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        LIVE
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-border text-muted-foreground">
      OFFLINE
    </Badge>
  );
}
