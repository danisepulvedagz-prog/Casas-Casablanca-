import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Rol } from "@/lib/supabase/types";

/**
 * Sin fila en profiles (cuenta recién creada, o nunca se le asignó rol) se
 * trata como "usuario" — privilegio mínimo por defecto, nunca admin.
 */
export async function obtenerRol(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Rol> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "admin" ? "admin" : "usuario";
}
