import { NextResponse } from "next/server";
import { supabaseAdmin, authenticateAdmin, npsnSetForJenjang, UNAUTHORIZED } from "../../../../lib/supabaseAdmin";

// GET /api/admin/silpa?tahun=2026
// Read-only: SiLPA Kinerja values are entered directly in Supabase
// (Table Editor or SQL Editor), not through this app — this endpoint
// just lets the admin dashboard pull them in for the official recap.
export async function GET(req) {
  const admin = await authenticateAdmin(req);
  if (!admin) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tahun = searchParams.get("tahun");
  if (!tahun) return NextResponse.json({ error: "tahun wajib diisi." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("silpa_kinerja").select("npsn, nominal").eq("tahun", tahun);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!admin.jenjang) return NextResponse.json({ entries: data });
  try {
    const boleh = await npsnSetForJenjang(supabase, admin.jenjang);
    return NextResponse.json({ entries: data.filter((e) => boleh.has(e.npsn)) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
