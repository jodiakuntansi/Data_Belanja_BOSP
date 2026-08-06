import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req) {
  const { npsn, pin } = await req.json();
  if (!npsn || !pin) {
    return NextResponse.json({ error: "NPSN dan PIN wajib diisi." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("sekolah")
    .select("npsn, nama, jenjang, pin")
    .eq("npsn", npsn)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || String(data.pin) !== String(pin)) {
    return NextResponse.json({ error: "NPSN atau PIN salah." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    sekolah: { npsn: data.npsn, nama: data.nama, jenjang: data.jenjang },
  });
}
