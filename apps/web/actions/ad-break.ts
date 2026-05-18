"use server";

export async function startAdBreak(durationSeconds = 30): Promise<{ ok: boolean; error?: string }> {
  // TODO: add TWITCH_CLIENT_ID, TWITCH_TOKEN, TWITCH_CHANNEL_ID to .env.local
  // const res = await fetch("https://api.twitch.tv/helix/channels/commercial", {
  //   method: "POST",
  //   headers: {
  //     "Client-ID": process.env.TWITCH_CLIENT_ID!,
  //     "Authorization": `Bearer ${process.env.TWITCH_TOKEN}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     broadcaster_id: process.env.TWITCH_CHANNEL_ID,
  //     length: durationSeconds,
  //   }),
  // });
  // if (!res.ok) return { ok: false, error: await res.text() };
  // return { ok: true };

  console.log("[action] startAdBreak — boilerplate", durationSeconds, "s");
  return { ok: true };
}
