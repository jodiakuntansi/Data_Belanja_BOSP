import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key and must only ever be imported
// from server-side code (API routes). It bypasses Row Level Security,
// which is why RLS on both tables is left with no public policies —
// every read/write to Supabase goes through our own API routes below,
// which do their own NPSN+PIN / admin-password checks first.
export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function checkAdminPassword(req) {
  const provided = req.headers.get("x-admin-password") || "";
  return provided && provided === process.env.ADMIN_PASSWORD;
}
