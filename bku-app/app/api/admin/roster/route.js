import { NextResponse } from "next/server";
import { supabaseAdmin, checkAdminPassword } from "../../../../lib/supabaseAdmin";

export async function GET(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("sekolah").select("*").order("nama");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schools: data });
}

// Body: { schools: [{ npsn, nama, jenjang, pin, alamat }] }
// Upserts the whole roster in one go — used by the "Kelola daftar" editor.
export async function POST(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const { schools } = await req.json();
  if (!Array.isArray(schools) || schools.length === 0) {
    return NextResponse.json({ error: "Daftar sekolah kosong." }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("sekolah").upsert(schools, { onConflict: "npsn" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
