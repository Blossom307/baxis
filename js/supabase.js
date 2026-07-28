/**
 * BAXIS PROTOCOL — SHARED SUPABASE CLIENT CONFIGURATION (`supabase.js`)
 */

const SUPABASE_URL = 'https://sytnwsuqoeqlwybkkhhj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Qtiz_CfMKreLNiDHgVjYag_nFulAMjt';

// Helper function to safely initialize Supabase
function getBaxisSupabase() {
  if (window.baxisSupabase) {
    return window.baxisSupabase;
  }
  if (window.supabase) {
    window.baxisSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.baxisSupabase;
  }
  return null;
}

// Try initializing immediately
getBaxisSupabase();