export function calcHealth(
    bitrate: number | null,
    loss: number | null,
    rtt: number | null
  ) {
    let score = 100;
  
    if (bitrate !== null) {
      if (bitrate < 2) score -= 30;
      if (bitrate < 1) score -= 30;
    }
  
    if (loss !== null) {
      if (loss > 1) score -= 20;
      if (loss > 5) score -= 30;
    }
  
    if (rtt !== null) {
      if (rtt > 100) score -= 10;
      if (rtt > 250) score -= 20;
    }
  
    return Math.max(0, score);
  }