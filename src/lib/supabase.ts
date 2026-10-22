import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Singleton: reutiliza la misma instancia en hot-reloads de desarrollo
// y evita conexiones duplicadas en producción
declare global {
  var _supabaseClient: SupabaseClient | undefined;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase no está configurado');
  return globalThis._supabaseClient ??
  (globalThis._supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }));
}
