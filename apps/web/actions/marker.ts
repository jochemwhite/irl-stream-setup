"use server";

export async function createMarker(description = "Deck marker"): Promise<{ ok: boolean; markerId?: string; error?: string }> {
  // TODO: add TWITCH_CLIENT_ID, TWITCH_TOKEN, TWITCH_CHANNEL_ID to .env.local
  // const res = await fetch("https://api.twitch.tv/helix/streams/markers", {
  //   method: "POST",
  //   headers: {
  //     "Client-ID": process.env.TWITCH_CLIENT_ID!,
  //     "Authorization": `Bearer ${process.env.TWITCH_TOKEN}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({ user_id: process.env.TWITCH_CHANNEL_ID, description }),
  // });
  // const { data } = await res.json();
  // return { ok: res.ok, markerId: data[0]?.id };

  console.log("[action] createMarker — boilerplate", description);
  return { ok: true, markerId: "boilerplate-marker-id" };
}
