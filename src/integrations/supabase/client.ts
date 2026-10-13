// Conexión con el proyecto de Supabase de Manila. La clave publicable es pública por diseño:
// lo que protege los datos son los permisos por fila (RLS) de la base.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const SUPABASE_URL = "https://ighdkjmdqycphtbbcfej.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JzBGFOKC_NcSLZSoMDCjrA__QH3tCJI";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
