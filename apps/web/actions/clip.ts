"use server";

export async function createClip(): Promise<{ ok: boolean; clipId?: string; error?: string }> {
  // TODO: add TWITCH_CLIENT_ID, TWITCH_TOKEN, TWITCH_CHANNEL_ID to .env.local
  // const res = await fetch(
  //   `https://api.twitch.tv/helix/clips?broadcaster_id=${process.env.TWITCH_CHANNEL_ID}`,
  //   {
  //     method: "POST",
  //     headers: {
  //       "Client-ID": process.env.TWITCH_CLIENT_ID!,
  //       "Authorization": `Bearer ${process.env.TWITCH_TOKEN}`,
  //     },
  //   }
  // );
  // const { data } = await res.json();
  // return { ok: res.ok, clipId: data[0]?.id };

  console.log("[action] createClip — boilerplate");
  return { ok: true, clipId: "boilerplate-clip-id" };
}
