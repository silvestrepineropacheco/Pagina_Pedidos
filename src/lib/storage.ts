import { supabase } from "@/integrations/supabase/client";

const BUCKET = "request-attachments";
const MAX_SIZE = 10 * 1024 * 1024;

const sanitize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80);

/**
 * Carpetas con permisos separados:
 * - requests/{requestId}/...  -> quien puede ver el pedido
 * - purchases/{purchaseId}/... -> solo administradores (una compra puede abarcar varios sectores)
 * - drafts/{userId}/...       -> adjuntos cargados antes de crear la solicitud
 */
export const uploadAttachment = async (file: File, folder: string): Promise<string> => {
  if (file.size > MAX_SIZE) {
    throw new Error("El archivo supera los 10 MB permitidos.");
  }
  const path = `${folder}/${crypto.randomUUID()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
};

export const getAttachmentUrl = async (path: string): Promise<string | null> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
};
