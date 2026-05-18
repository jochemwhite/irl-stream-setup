'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

interface Session {
  id: number;
  path: string;
  srt_conn_id: string;
  started_at: string;
  ended_at: string | null;
}

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((e - s) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">History of all streaming sessions</p>
      </div>

      <Card className="bg-card/50 border-border/40">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-medium">All Sessions</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No sessions recorded yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="pl-5 text-xs">Path</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Started</TableHead>
                  <TableHead className="text-xs">Duration</TableHead>
                  <TableHead className="text-xs pr-5 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className="border-border/40 hover:bg-accent/30 transition-colors">
                    <TableCell className="pl-5 font-mono text-sm">{s.path}</TableCell>
                    <TableCell>
                      {s.ended_at ? (
                        <Badge variant="outline" className="text-muted-foreground border-border text-xs">Ended</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">Live</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(s.started_at)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDuration(s.started_at, s.ended_at)}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <Link href={`/sessions/${s.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        View <ArrowRight className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
