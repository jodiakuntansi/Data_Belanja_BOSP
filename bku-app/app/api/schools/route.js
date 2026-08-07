import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Without this, Next.js treats this route as static (since it reads no
// request data) and caches its response at BUILD time — which would
// permanently bake in an empty roster from before any schools existed.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("sekolah")
    .select("npsn, nama, jenjang")
    .order("nama");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schools: data });
}
