import { NextResponse } from "next/server";
import { supabaseAdmin, checkAdminPassword } from "../../../../lib/supabaseAdmin";

// GET /api/admin/saldoawal?tahun=2026
// Read-only: saldo awal Januari (Reguler + Kinerja) diisi langsung di
// Supabase (Table Editor / SQL Editor), bukan lewat aplikasi — endpoint
// ini hanya menyalurkannya ke dashboard dinas untuk Rekapan BOSP Resmi.
export async function GET(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tahun = searchParams.get("tahun");
  if (!tahun) return NextResponse.json({ error: "tahun wajib diisi." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("saldo_awal_januari")
    .select("npsn, saldo_arkas, saldo_tunai")
    .eq("tahun", tahun);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}
