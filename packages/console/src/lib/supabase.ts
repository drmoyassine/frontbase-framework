import { createClient } from '@supabase/supabase-js';

// Check for runtime config (injected by server) or build-time config (Vite)
const runtimeEnv = (window as any).__FRONTBASE_ENV__ || {};
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
// Visitor OAuth callbacks belong to the selected App Users provider/client.
// The imported console client must not consume them into its admin session.
const visitorEmbed=/\/embed\/auth\//.test(window.location.pathname);

// Only create Supabase client if both URL and key are provided
// This prevents using placeholder values which would cause runtime errors
export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co')
  ? createClient(supabaseUrl, supabaseAnonKey,{auth:{detectSessionInUrl:!visitorEmbed,autoRefreshToken:!visitorEmbed}})
  : null;

// Export whether Supabase is configured for use in the app
export const isSupabaseConfigured = !!supabase;
