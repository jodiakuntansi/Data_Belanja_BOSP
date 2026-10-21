import { NextResponse } from "next/server";
import { verifyAdmin } from "../../../../lib/supabaseAdmin";

// Body: { username?, password }. Username boleh kosong untuk admin utama.
export async function POST(req) {
  const { username, password } = await req.json();
  const admin = await verifyAdmin(username, password);
  if (!admin) {
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username: admin.username, nama: admin.nama, jenjang: admin.jenjang });
}
