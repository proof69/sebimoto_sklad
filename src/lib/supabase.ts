import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { validateConfig } from './config';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const configurationError = validateConfig(url, key);

export const supabase = configurationError ? null : createClient<Database>(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export function database() {
  if (!supabase) throw new Error(configurationError ?? 'Databáze není dostupná.');
  return supabase;
}
