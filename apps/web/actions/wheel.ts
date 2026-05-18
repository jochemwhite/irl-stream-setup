"use server";

export async function spinWheel(): Promise<{ ok: boolean; result?: string; error?: string }> {
  // TODO: integrate with your wheel overlay
  // e.g. trigger an OBS browser source, send a websocket event to your overlay, etc.

  console.log("[action] spinWheel — boilerplate");
  return { ok: true, result: "spin triggered" };
}
