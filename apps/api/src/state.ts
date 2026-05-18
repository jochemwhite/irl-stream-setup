export interface AlertState {
  bitrate_critical: boolean;
  high_loss: boolean;
  high_rtt: boolean;
  obs_dropped: boolean;
}

export interface StreamState {
    sessionId: number;
    startedAt: number;

    lastBytesReceived?: number;
    lastBytesTime?: number;

    minBitrate?: number;
    maxBitrate?: number;

    alerts: AlertState;
  }
  
  export const sessions = new Map<string, StreamState>();

  export interface RtmpReaderState {
    lastBytesSent?: number;
    lastBytesTime?: number;
  }

  export const rtmpReaders = new Map<string, RtmpReaderState>();