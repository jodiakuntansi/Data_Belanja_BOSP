import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl font-bold text-ink">Klasifikasi Belanja BKU</h1>
          <p className="text-sm text-inksoft mt-1">Belanja modal & belanja barang/jasa — TK/PAUD, SD, SMP</p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href="/bendahara"
            className="block text-center bg-ink text-white rounded-lg py-4 font-semibold hover:opacity-90 transition"
          >
            Saya bendahara sekolah
          </Link>
          <Link
            href="/admin"
            className="block text-center bg-card border border-border text-ink rounded-lg py-4 font-semibold hover:bg-white transition"
          >
            Saya dari dinas (rekap)
          </Link>
        </div>
      </div>
    </main>
  );
}
