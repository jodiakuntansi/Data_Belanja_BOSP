import { NextResponse } from "next/server";
import { supabaseAdmin, authenticateAdmin, npsnSetForJenjang, UNAUTHORIZED } from "../../../../lib/supabaseAdmin";

// GET /api/admin/rkoran?tahun=2026&bulan=MARET
export async function GET(req) {
  const admin = await authenticateAdmin(req);
  if (!admin) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tahun = searchParams.get("tahun");
  const bulan = searchParams.get("bulan");
  if (!tahun || !bulan) return NextResponse.json({ error: "tahun dan bulan wajib diisi." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("saldo_rkoran")
    .select("npsn, saldo_rkoran")
    .eq("tahun", tahun)
    .eq("bulan", bulan);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!admin.jenjang) return NextResponse.json({ entries: data });
  try {
    const boleh = await npsnSetForJenjang(supabase, admin.jenjang);
    return NextResponse.json({ entries: data.filter((e) => boleh.has(e.npsn)) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Body: { tahun, bulan, entries: [{ npsn, saldoRkoran }] }
export async function POST(req) {
  const admin = await authenticateAdmin(req);
  if (!admin) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { tahun, bulan, entries } = await req.json();
  if (!tahun || !bulan || !Array.isArray(entries)) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const rows = entries
    .filter((e) => e.npsn)
    .map((e) => ({
      npsn: e.npsn,
      tahun,
      bulan,
      saldo_rkoran: Number(e.saldoRkoran) || 0,
      updated_at: new Date().toISOString(),
    }));

  if (admin.jenjang) {
    try {
      const boleh = await npsnSetForJenjang(supabase, admin.jenjang);
      if (rows.some((r) => !boleh.has(r.npsn))) {
        return NextResponse.json(
          { error: `Admin ${admin.jenjang} hanya dapat mengisi Saldo R.Koran sekolah jenjang ${admin.jenjang}.` },
          { status: 403 }
        );
      }
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const { error } = await supabase.from("saldo_rkoran").upsert(rows, { onConflict: "npsn,tahun,bulan" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
