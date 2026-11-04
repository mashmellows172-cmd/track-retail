import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Singleton: reutiliza la misma instancia en hot-reloads de desarrollo
// y evita conexiones duplicadas en producción
declare global {
  // eslint-disable-next-line no-var
  var _supabaseClient: SupabaseClient | undefined;
  // eslint-disable-next-line no-var
  var _supabaseServerClient: SupabaseClient | undefined;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase no está configurado');
  return (
    globalThis._supabaseClient ??
    (globalThis._supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }))
  );
}

export function getSupabaseServer(): SupabaseClient {
  if (!supabaseUrl) throw new Error('Supabase URL no está configurada');
  const keyToUse = supabaseServiceRoleKey || supabaseAnonKey;
  if (!keyToUse) throw new Error('Supabase Key no está configurada');

  return (
    globalThis._supabaseServerClient ??
    (globalThis._supabaseServerClient = createClient(supabaseUrl, keyToUse, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }))
  );
}
