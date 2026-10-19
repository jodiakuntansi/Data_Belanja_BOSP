import { NextResponse } from "next/server";
import { supabaseAdmin, checkAdminPassword } from "../../../../lib/supabaseAdmin";

// GET /api/admin/silpa?tahun=2026
// Read-only: SiLPA Kinerja values are entered directly in Supabase
// (Table Editor or SQL Editor), not through this app — this endpoint
// just lets the admin dashboard pull them in for the official recap.
export async function GET(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tahun = searchParams.get("tahun");
  if (!tahun) return NextResponse.json({ error: "tahun wajib diisi." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("silpa_kinerja").select("npsn, nominal").eq("tahun", tahun);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}
