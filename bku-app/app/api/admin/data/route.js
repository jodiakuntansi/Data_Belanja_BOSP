import { NextResponse } from "next/server";
import { supabaseAdmin, checkAdminPassword } from "../../../../lib/supabaseAdmin";

// Supabase/PostgREST membatasi satu permintaan maksimal 1.000 baris.
// Karena submissions sudah jauh lebih banyak dari itu (sekitar 240
// sekolah x banyak bulan x sumber dana), data harus diambil bertahap
// per halaman sampai habis — kalau tidak, baris yang paling lama
// (mis. Januari) terpotong diam-diam dan rekap tampak kosong.
const PAGE_SIZE = 1000;

export async function GET(req) {
  if (!checkAdminPassword(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // Urutan tambahan (id) wajib supaya halaman tidak tumpang tindih
    // saat beberapa baris punya submitted_at yang sama.
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return NextResponse.json({ submissions: all });
}
