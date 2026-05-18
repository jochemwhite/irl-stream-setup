'use client';

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, VideoOff } from "lucide-react";

interface WebRTCPlayerProps {
  whepUrl?: string;
}

export function WebRTCPlayer({ whepUrl }: WebRTCPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error" | "idle">("idle");
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const url = whepUrl || process.env.NEXT_PUBLIC_WHEP_URL;

  useEffect(() => {
    if (!url) {
      setStatus("idle");
      return;
    }

    const resolvedUrl = url;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      setStatus("connecting");

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0];
            setStatus("live");
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            pc.close();
            if (!cancelled) {
              setStatus("error");
              retryRef.current = setTimeout(connect, 3000);
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(resolvedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });

        if (!res.ok) {
          throw new Error(`WHEP ${res.status}`);
        }

        const answerSdp = await res.text();
        await pc.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
      } catch {
        if (!cancelled) {
          setStatus("error");
          retryRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryRef.current);
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [url]);

  return (
    <Card className="bg-card/50 border-border/40 overflow-hidden">
      <CardContent className="p-0 relative">
        <div className="absolute top-2 right-2 z-10">
          <Badge
            variant="outline"
            className={`text-[10px] gap-1 ${
              status === "live"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : status === "connecting"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-border text-muted-foreground"
            }`}
          >
            {status === "live" ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
            {status === "live" ? "WebRTC" : status === "connecting" ? "Connecting..." : "No feed"}
          </Badge>
        </div>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full aspect-video bg-black"
        />
        {status !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <VideoOff className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {status === "connecting" ? "Connecting to stream..." : status === "idle" ? "No stream active" : "Stream unavailable"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
