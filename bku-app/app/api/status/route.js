import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// POST /api/status  { npsn, pin, tahun }
// Mengembalikan bulan/sumber dana apa saja yang SUDAH diupload sekolah
// ini, supaya bendahara tahu apa yang masih kurang. PIN diverifikasi di
// server pada setiap permintaan (sama seperti /api/submit), dan hanya
// kolom ringkas yang dikirim — bukan rincian/totals.
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { npsn, pin, tahun } = await req.json();
  if (!npsn || !pin || !tahun) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: sekolah, error: sekolahErr } = await supabase
    .from("sekolah")
    .select("npsn, pin")
    .eq("npsn", npsn)
    .maybeSingle();
  if (sekolahErr) return NextResponse.json({ error: sekolahErr.message }, { status: 500 });
  if (!sekolah || String(sekolah.pin) !== String(pin)) {
    return NextResponse.json({ error: "NPSN atau PIN salah." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("bulan, sumber_dana, integrity_ok, submitted_at")
    .eq("npsn", npsn)
    .eq("tahun", String(tahun));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ submissions: data });
}
