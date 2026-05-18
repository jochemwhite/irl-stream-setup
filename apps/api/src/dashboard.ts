import { supabase } from "./supabase";

export async function getDashboardData() {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("*");

  if (error) throw error;

  return data;
}