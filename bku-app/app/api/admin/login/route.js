import { NextResponse } from "next/server";

export async function POST(req) {
  const { password } = await req.json();
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Password salah." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
