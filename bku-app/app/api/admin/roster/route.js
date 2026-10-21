import { NextResponse } from "next/server";
import { supabaseAdmin, authenticateAdmin, UNAUTHORIZED } from "../../../../lib/supabaseAdmin";

export async function GET(req) {
  const admin = await authenticateAdmin(req);
  if (!admin) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const supabase = supabaseAdmin();
  let q = supabase.from("sekolah").select("*");
  if (admin.jenjang) q = q.eq("jenjang", admin.jenjang);
  const { data, error } = await q.order("nama");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schools: data });
}

// Body: { schools: [{ npsn, nama, jenjang, pin, alamat }] }
// Upserts the whole roster in one go — used by the "Kelola daftar" editor.
export async function POST(req) {
  const admin = await authenticateAdmin(req);
  if (!admin) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { schools } = await req.json();
  if (!Array.isArray(schools) || schools.length === 0) {
    return NextResponse.json({ error: "Daftar sekolah kosong." }, { status: 400 });
  }
  const supabase = supabaseAdmin();

  if (admin.jenjang) {
    const pesan = `Admin ${admin.jenjang} hanya dapat mengelola sekolah jenjang ${admin.jenjang}.`;
    // 1) Setiap baris yang dikirim harus berjenjang milik admin ini.
    if (schools.some((s) => s.jenjang !== admin.jenjang)) {
      return NextResponse.json({ error: pesan }, { status: 403 });
    }
    // 2) NPSN yang sudah ada di database tidak boleh milik jenjang lain
    //    (kalau tidak, admin bisa menimpa sekolah jenjang lain dengan
    //    mengirim NPSN-nya).
    const npsnList = schools.map((s) => s.npsn).filter(Boolean);
    const { data: existing, error: exErr } = await supabase.from("sekolah").select("npsn, jenjang").in("npsn", npsnList);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if ((existing || []).some((e) => e.jenjang !== admin.jenjang)) {
      return NextResponse.json({ error: pesan }, { status: 403 });
    }
  }

  const { error } = await supabase.from("sekolah").upsert(schools, { onConflict: "npsn" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
