import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req) {
  const body = await req.json();
  const { npsn, pin, tahun, bulan, sumberDana, saldoRkoran, totals, rincian, integrityOk, fileName } = body;

  if (!npsn || !pin || !tahun || !bulan || !totals) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Re-verify PIN server-side on every write — the client-side "session"
  // is just UI convenience, never trusted for authorization.
  const { data: sekolah, error: sekolahErr } = await supabase
    .from("sekolah")
    .select("npsn, nama, jenjang, pin")
    .eq("npsn", npsn)
    .maybeSingle();

  if (sekolahErr) return NextResponse.json({ error: sekolahErr.message }, { status: 500 });
  if (!sekolah || String(sekolah.pin) !== String(pin)) {
    return NextResponse.json({ error: "NPSN atau PIN salah." }, { status: 401 });
  }

  const { error: upsertErr } = await supabase.from("submissions").upsert(
    {
      npsn,
      nama_sekolah: sekolah.nama,
      jenjang: sekolah.jenjang,
      tahun,
      bulan,
      sumber_dana: sumberDana === "KINERJA" ? "KINERJA" : "REGULER",
      totals,
      rincian,
      integrity_ok: !!integrityOk,
      file_name: fileName || null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "npsn,tahun,bulan,sumber_dana" }
  );

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  // Saldo R.Koran is one value per school per month (the physical bank
  // account, shared across Reguler/Kinerja) — only touch it when the
  // bendahara actually filled it in, so submitting one sumber dana
  // without it doesn't wipe out a value already entered via the other.
  if (saldoRkoran !== undefined && saldoRkoran !== null && saldoRkoran !== "" && !isNaN(Number(saldoRkoran))) {
    const { error: rkoranErr } = await supabase.from("saldo_rkoran").upsert(
      {
        npsn,
        tahun,
        bulan,
        saldo_rkoran: Number(saldoRkoran),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "npsn,tahun,bulan" }
    );
    if (rkoranErr) {
      // Don't fail the whole submission over this — the BKU data itself
      // is already saved successfully above.
      return NextResponse.json({ ok: true, rkoranWarning: rkoranErr.message });
    }
  }

  return NextResponse.json({ ok: true });
}
