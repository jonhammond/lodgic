import { supabase } from "./supabase";

export type Property = { id: string; name: string; location: string; total_rooms: number; segment: string };

export async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("id,name,location,total_rooms,segment")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Property[];
}
