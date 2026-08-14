import Link from "next/link";
import { Building2, Landmark, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="ledger-paper min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full relative">
        <div
          className="stamp-enter absolute -top-2 right-0 sm:right-4 border-2 border-red text-red rounded-md px-3 py-1.5 font-serif font-bold text-xs tracking-wider -rotate-8 select-none"
          aria-hidden="true"
        >
          BKU
        </div>

        <div className="rise-in text-center mb-10 pt-6">
          <div className="text-[11px] tracking-[0.2em] text-inksoft uppercase font-mono mb-3">
            Buku Kas Umum · Klasifikasi Otomatis
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-ink leading-tight">
            Klasifikasi Belanja BKU
          </h1>
          <p className="text-sm text-inksoft mt-3 max-w-sm mx-auto">
            Belanja modal dan belanja barang/jasa terklasifikasi otomatis dari file BKU sekolah, terekap untuk dinas.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {["TK/PAUD", "SD", "SMP"].map((j) => (
              <span key={j} className="text-[11px] font-mono uppercase tracking-wide text-inksoft border border-border bg-card rounded-full px-2.5 py-1">
                {j}
              </span>
            ))}
          </div>
        </div>

        <div className="rise-in flex flex-col gap-3" style={{ animationDelay: "0.1s" }}>
          <Link
            href="/bendahara"
            className="group flex items-center gap-4 bg-ink text-white rounded-lg px-5 py-4 hover:brightness-110 transition shadow-sm"
          >
            <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Saya bendahara sekolah</div>
              <div className="text-xs text-white/70 mt-0.5">Unggah BKU, lihat rekap belanja langsung</div>
            </div>
            <ArrowRight size={18} className="opacity-60 group-hover:translate-x-1 transition-transform shrink-0" />
          </Link>

          <Link
            href="/admin"
            className="group flex items-center gap-4 bg-card border border-border text-ink rounded-lg px-5 py-4 hover:bg-white hover:border-inksoft/30 transition shadow-sm"
          >
            <div className="w-10 h-10 rounded-md bg-paper flex items-center justify-center shrink-0">
              <Landmark size={20} className="text-ink" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Saya dari dinas</div>
              <div className="text-xs text-inksoft mt-0.5">Lihat rekap seluruh sekolah, per jenjang</div>
            </div>
            <ArrowRight size={18} className="opacity-40 group-hover:translate-x-1 transition-transform shrink-0" />
          </Link>
        </div>
      </div>
    </main>
  );
}
