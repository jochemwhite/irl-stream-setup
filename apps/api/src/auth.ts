import { supabase } from "./supabase";

export async function isAuthenticated(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const token =
    url.searchParams.get("token") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) return false;

  const { data: { user } } = await supabase.auth.getUser(token);
  return !!user;
}
