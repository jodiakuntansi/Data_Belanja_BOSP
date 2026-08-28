import { NextResponse } from "next/server";
import { supabaseAdmin, checkAdminPassword } from "../../../../lib/supabaseAdmin";

// GET /api/admin/rkoran?tahun=2026&bulan=MARET
export async function GET(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
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
  return NextResponse.json({ entries: data });
}

// Body: { tahun, bulan, entries: [{ npsn, saldoRkoran }] }
export async function POST(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
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

  const { error } = await supabase.from("saldo_rkoran").upsert(rows, { onConflict: "npsn,tahun,bulan" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
