"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { parseBKU, parseBKUFromPDF, CATEGORY_LABEL } from "../../lib/parseBKU";
import { Wallet } from "lucide-react";

const CATEGORY_TW = {
  modal_peralatan_mesin: "text-gold",
  modal_aset_lainnya: "text-blue",
  barang_jasa: "text-green",
  tak_terklasifikasi: "text-red",
};

function fmtRp(n) {
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}

function Stamp({ ok }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-bold text-xs tracking-wide ${
        ok ? "text-green bg-green/10" : "text-red bg-red/10"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green" : "bg-red"}`} />
      {ok ? "TERVERIFIKASI" : "SELISIH DITEMUKAN"}
    </div>
  );
}

function SchoolCombobox({ schools, npsn, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = schools.find((s) => s.npsn === npsn);
  const filtered = schools.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.nama.toLowerCase().includes(q) || s.npsn.includes(q);
  });

  return (
    <div className="relative mb-4">
      <input
        type="text"
        value={open ? query : selected ? `${selected.nama} (${selected.jenjang})` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect("");
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Ketik nama sekolah..."
        autoComplete="off"
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white border-border focus:border-blue outline-none transition"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-border rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-inksoft">Tidak ditemukan.</div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.npsn}
                onMouseDown={() => {
                  onSelect(s.npsn);
                  setQuery("");
                  setOpen(false);
                }}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-paper text-ink"
              >
                {s.nama} <span className="text-inksoft text-xs">({s.jenjang})</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LoginForm({ onLogin }) {
  const [schools, setSchools] = useState([]);
  const [npsn, setNpsn] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/schools")
      .then((r) => r.json())
      .then((d) => setSchools(d.schools || []))
      .catch(() => setSchools([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!npsn) {
      setError("Pilih sekolah dari daftar terlebih dahulu.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npsn, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal login.");
      } else {
        onLogin({ ...data.sekolah, pin });
      }
    } catch {
      setError("Gagal menghubungi server. Coba lagi.");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-2xl shadow-lg overflow-hidden bg-card">
        <div className="gradient-hero px-6 pt-8 pb-6 text-center">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center mx-auto mb-3">
            <Wallet size={20} className="text-white" />
          </div>
          <h1 className="font-extrabold text-lg text-white">Login bendahara</h1>
          <p className="text-xs text-white/75 mt-1">Cari sekolah dan masukkan PIN yang diberikan dinas.</p>
        </div>
        <form onSubmit={submit} className="p-6">
        <label className="text-xs text-inksoft block mb-1">Sekolah</label>
        <SchoolCombobox schools={schools} npsn={npsn} onSelect={setNpsn} />

        <label className="text-xs text-inksoft block mb-1">PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          className="w-full mb-4 border border-border rounded-xl px-3 py-2.5 text-sm bg-white border-border focus:border-blue outline-none transition"
          placeholder="6 digit"
        />

        {error && <div className="text-red text-sm mb-4">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-hero text-white rounded-xl py-3 font-bold text-sm disabled:opacity-60 shadow-md hover:brightness-110 transition"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
        <Link href="/" className="block text-center text-xs text-inksoft mt-4">
          ← Kembali
        </Link>
        </form>
      </div>
    </main>
  );
}

function UploadFlow({ sekolah, onLogout }) {
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [sumberDana, setSumberDana] = useState("REGULER");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleFile = useCallback(async (f) => {
    setFileName(f.name);
    setParsed(null);
    setSaved(false);
    setSaveError("");
    setParsing(true);
    try {
      const isPdf = f.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const buf = await f.arrayBuffer();
        const base64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setParsed({ errors: ["Gagal membaca PDF: " + (data.error || "tidak diketahui")], ok: false, totals: null, rincian: [] });
        } else {
          const result = parseBKUFromPDF(data);
          setParsed(result);
          setSumberDana(result.sumberDana || "REGULER");
        }
      } else {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const result = parseBKU(rows);
        setParsed(result);
        setSumberDana(result.sumberDana || "REGULER");
      }
    } catch (e) {
      setParsed({ errors: ["Gagal membaca file: " + e.message], ok: false, totals: null, rincian: [] });
    }
    setParsing(false);
  }, []);

  const handleSubmit = async () => {
    if (!parsed || !parsed.npsn) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npsn: sekolah.npsn,
          pin: sekolah.pin,
          tahun: parsed.tahun,
          bulan: parsed.bulan,
          sumberDana,
          totals: parsed.totals,
          rincian: parsed.rincian,
          integrityOk: parsed.integrityOk,
          fileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) setSaveError(data.error || "Gagal menyimpan.");
      else setSaved(true);
    } catch {
      setSaveError("Gagal menghubungi server.");
    }
    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-paper p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="font-extrabold text-lg text-ink">{sekolah.nama}</div>
            <div className="text-xs text-inksoft">NPSN {sekolah.npsn} · {sekolah.jenjang}</div>
          </div>
          <button onClick={onLogout} className="text-xs text-inksoft border border-border rounded-xl px-3 py-1.5">
            Keluar
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
          <div className="font-extrabold text-ink mb-3">Unggah Buku Kas Umum (BKU)</div>
          <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-2xl p-4 cursor-pointer bg-paper">
            <div>
              <div className="text-sm font-semibold text-ink">{fileName || "Klik untuk pilih file BKU (.xlsx atau .pdf)"}</div>
              <div className="text-xs text-inksoft">Format Excel atau PDF dari ARKAS, BKU bulanan standar BOSP</div>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>

        {parsing && <div className="bg-card border border-border rounded-2xl shadow-sm p-5 text-sm text-inksoft mb-4">Membaca dan mengklasifikasikan data...</div>}

        {parsed && !parsing && (
          <>
            {parsed.errors && parsed.errors.length > 0 && (
              <div className="bg-red/5 border border-red rounded-2xl p-4 mb-4">
                <div className="font-semibold text-red text-sm mb-2">Perhatian sebelum submit</div>
                <ul className="list-disc pl-5 text-sm text-inksoft">
                  {parsed.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.totals && (
              <>
                <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4 flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-extrabold text-ink">{parsed.namaSekolah}</div>
                    <div className="text-xs text-inksoft">{parsed.bulan} {parsed.tahun}</div>
                  </div>
                  <Stamp ok={parsed.integrityOk} />
                </div>

                <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                  <label className="text-xs text-inksoft uppercase block mb-2">Sumber Dana</label>
                  <div className="flex gap-2">
                    {["REGULER", "KINERJA"].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setSumberDana(opt);
                          setSaved(false);
                          setSaveError("");
                        }}
                        className={`flex-1 rounded-xl py-2 text-sm font-semibold border transition ${
                          sumberDana === opt ? "gradient-hero text-white border-transparent" : "border-border text-inksoft bg-white"
                        }`}
                      >
                        BOSP {opt === "REGULER" ? "Reguler" : "Kinerja"}
                      </button>
                    ))}
                  </div>
                  {parsed.sumberDanaRaw && (
                    <div className="text-[11px] text-inksoft mt-2">
                      Terdeteksi dari file: "{parsed.sumberDanaRaw}". Betulkan di atas kalau salah.
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                  <div className="text-xs text-inksoft uppercase mb-3">Ringkasan arus kas</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[11px] text-inksoft uppercase">Saldo Awal</div>
                      <div className="font-mono text-sm font-bold text-ink">{fmtRp(parsed.totals.saldoAwal)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-inksoft uppercase">Pendapatan</div>
                      <div className="font-mono text-sm font-bold text-green">+{fmtRp(parsed.totals.pendapatan)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-inksoft uppercase">Belanja</div>
                      <div className="font-mono text-sm font-bold text-red">-{fmtRp(parsed.totals.belanjaTotal)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-inksoft uppercase">Saldo Akhir</div>
                      <div className="font-mono text-sm font-bold text-ink">{fmtRp(parsed.totals.saldoAkhir)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                    <div className="text-xs text-inksoft uppercase mb-1">Modal - Peralatan & Mesin</div>
                    <div className="font-mono text-lg font-bold text-gold">{fmtRp(parsed.totals.totalModalPeralatanMesin)}</div>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                    <div className="text-xs text-inksoft uppercase mb-1">Modal - Aset Tetap Lainnya</div>
                    <div className="font-mono text-lg font-bold text-blue">{fmtRp(parsed.totals.totalModalAsetLainnya)}</div>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                    <div className="text-xs text-inksoft uppercase mb-1">Belanja barang & jasa</div>
                    <div className="font-mono text-lg font-bold text-green">{fmtRp(parsed.totals.totalBarangJasa)}</div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                  <div className="font-extrabold text-ink mb-3">Rincian per kode rekening</div>
                  {parsed.rincian.map((g) => (
                    <div key={g.kode} className="py-2 border-b border-border last:border-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-mono text-ink">
                          {g.kode} <span className={CATEGORY_TW[g.kategori]}>— {CATEGORY_LABEL[g.kategori]}</span>
                        </span>
                        <span className="font-mono font-semibold text-ink">{fmtRp(g.total)}</span>
                      </div>
                      <div className="text-xs text-inksoft mt-0.5">{g.uraian || "(uraian tidak ditemukan di referensi)"}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-card border border-border rounded-2xl shadow-sm p-5 flex justify-between items-center flex-wrap gap-3">
                  <div className="text-sm text-inksoft">
                    {saved ? <span className="text-green font-semibold">Data tersimpan dan masuk ke rekap dinas.</span> : "Periksa hasil di atas sebelum mengirim."}
                    {saveError && <span className="text-red block mt-1">{saveError}</span>}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!parsed.npsn || saving || saved}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                      saved ? "bg-paper text-inksoft" : "gradient-hero text-white shadow-md hover:brightness-110"
                    }`}
                  >
                    {saving ? "Menyimpan..." : saved ? "Terkirim" : "Kirim ke rekap dinas"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function BendaharaPage() {
  const [sekolah, setSekolah] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("bku_sekolah");
    if (saved) setSekolah(JSON.parse(saved));
  }, []);

  const handleLogin = (s) => {
    setSekolah(s);
    sessionStorage.setItem("bku_sekolah", JSON.stringify(s));
  };
  const handleLogout = () => {
    setSekolah(null);
    sessionStorage.removeItem("bku_sekolah");
  };

  if (!sekolah) return <LoginForm onLogin={handleLogin} />;
  return <UploadFlow sekolah={sekolah} onLogout={handleLogout} />;
}
