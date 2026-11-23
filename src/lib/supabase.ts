import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Set when the build is missing its Supabase env vars; the app shows it instead of crashing. */
export const configError: string | null =
  url && anonKey
    ? null
    : 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. Copy .env.example to .env.local and fill them in.';

// Anon key only. The service-role key must never reach the browser.
export const supabase: SupabaseClient | null = configError
  ? null
  : createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(configError ?? 'Supabase is not configured');
  return supabase;
}
