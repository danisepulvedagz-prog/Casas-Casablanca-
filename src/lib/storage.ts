import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sube una foto de boleta/factura/transferencia al bucket privado "boletas".
 * Devuelve la ruta guardada en gastos.foto_boleta_url, o null si no se pasó
 * ningún archivo (el campo es siempre opcional).
 */
export async function subirFotoGasto(file: File | null, proyectoId: string): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const admin = createAdminClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${proyectoId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage.from("boletas").upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);

  return path;
}

/**
 * El bucket "boletas" es privado, así que para mostrar una foto en la app
 * hay que generar una URL firmada de corta duración en vez de usar la ruta
 * guardada directamente.
 */
export async function crearUrlFirmada(path: string | null): Promise<string | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("boletas").createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}
