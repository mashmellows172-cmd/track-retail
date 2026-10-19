import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Singleton: reutiliza la misma instancia en hot-reloads de desarrollo
// y evita conexiones duplicadas en producción
declare global {
  // eslint-disable-next-line no-var
  var _supabaseClient: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis._supabaseClient ??
  (globalThis._supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }));
