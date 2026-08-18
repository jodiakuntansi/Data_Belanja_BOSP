import Link from "next/link";
import { Building2, Landmark, ArrowRight, Wallet } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-paper">
      <div className="max-w-md w-full rounded-3xl overflow-hidden shadow-xl bg-card">
        <div className="gradient-hero px-8 pt-10 pb-14 text-center relative overflow-hidden">
          <div className="stamp-enter w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-4">
            <Wallet size={26} className="text-white" />
          </div>
          <h1 className="text-white font-extrabold text-2xl tracking-tight">
            Klasifikasi Belanja BKU
          </h1>
          <p className="text-white/80 text-sm mt-2 max-w-xs mx-auto">
            Rekap belanja modal & barang/jasa otomatis dari BKU sekolah
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            {["TK/PAUD", "SD", "SMP"].map((j) => (
              <span key={j} className="text-[11px] font-semibold uppercase tracking-wide text-white bg-white/15 rounded-full px-3 py-1">
                {j}
              </span>
            ))}
          </div>
        </div>

        <div className="rise-in px-6 -mt-8 pb-8 relative">
          <div className="flex flex-col gap-3">
            <Link
              href="/bendahara"
              className="group flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className="icon-badge w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                <Building2 size={22} className="text-blue" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm text-ink">Bendahara sekolah</div>
                <div className="text-xs text-inksoft mt-0.5">Unggah BKU, lihat rekap langsung</div>
              </div>
              <ArrowRight size={18} className="text-inksoft/50 group-hover:translate-x-1 group-hover:text-blue transition-all shrink-0" />
            </Link>

            <Link
              href="/admin"
              className="group flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className="icon-badge w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                <Landmark size={22} className="text-blue" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm text-ink">Dinas</div>
                <div className="text-xs text-inksoft mt-0.5">Rekap seluruh sekolah, per jenjang</div>
              </div>
              <ArrowRight size={18} className="text-inksoft/50 group-hover:translate-x-1 group-hover:text-blue transition-all shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
