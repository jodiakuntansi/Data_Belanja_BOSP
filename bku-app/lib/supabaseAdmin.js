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

// Hasil verifikasi admin: { username, nama, jenjang } atau null.
//   jenjang === null  => admin semua jenjang
//   jenjang === "SD"  => hanya boleh melihat/mengelola sekolah SD
//
// Dua jenis akun:
//  1. Admin utama: username kosong atau "admin" + ADMIN_PASSWORD di
//     environment (cara login lama, tetap berlaku).
//  2. Akun di tabel admin_users (dicek lewat fungsi admin_login di
//     database, passwordnya di-hash). Jika tabel/fungsi belum dibuat,
//     hanya admin utama yang bisa masuk.
export async function verifyAdmin(username, password) {
  const user = String(username || "").trim().toLowerCase();
  const pass = String(password || "");
  if (!pass) return null;

  if ((!user || user === "admin") && process.env.ADMIN_PASSWORD && pass === process.env.ADMIN_PASSWORD) {
    return { username: "admin", nama: "Admin utama", jenjang: null };
  }
  if (!user) return null;

  try {
    const { data, error } = await supabaseAdmin().rpc("admin_login", { p_username: user, p_password: pass });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const u = data[0];
    return { username: u.username, nama: u.nama || u.username, jenjang: u.jenjang || null };
  } catch {
    return null;
  }
}

// Dipakai semua route /api/admin/*: membaca x-admin-user & x-admin-password.
export async function authenticateAdmin(req) {
  return verifyAdmin(req.headers.get("x-admin-user"), req.headers.get("x-admin-password"));
}

// Himpunan NPSN sekolah pada satu jenjang (untuk tabel yang tidak punya
// kolom jenjang: saldo_rkoran, silpa_kinerja, saldo_awal_januari).
export async function npsnSetForJenjang(supabase, jenjang) {
  const { data, error } = await supabase.from("sekolah").select("npsn").eq("jenjang", jenjang);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.npsn));
}

export const UNAUTHORIZED = { error: "Tidak diizinkan." };
