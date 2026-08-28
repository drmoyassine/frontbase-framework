import { createClient } from '@supabase/supabase-js';

// Check for runtime config (injected by server) or build-time config (Vite)
const runtimeEnv = (window as any).__FRONTBASE_ENV__ || {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create Supabase client if both URL and key are provided
// This prevents using placeholder values which would cause runtime errors
export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Export whether Supabase is configured for use in the app
export const isSupabaseConfigured = !!supabase;
