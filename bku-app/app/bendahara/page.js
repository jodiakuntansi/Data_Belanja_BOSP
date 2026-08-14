"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { parseBKU, parseBKUFromPDF, CATEGORY_LABEL } from "../../lib/parseBKU";

const CATEGORY_TW = {
  modal: "text-gold",
  barang_jasa: "text-green",
  tak_terklasifikasi: "text-red",
};

function fmtRp(n) {
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}

function Stamp({ ok }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-serif font-bold text-sm -rotate-3 border-2 ${
        ok ? "border-green text-green bg-green/5" : "border-red text-red bg-red/5"
      }`}
    >
      {ok ? "TERVERIFIKASI · SESUAI TOTAL FILE" : "SELISIH DITEMUKAN"}
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
        className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-border rounded-md shadow-lg">
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
    <main className="ledger-paper min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="max-w-sm w-full bg-card border border-border rounded-lg shadow-sm p-6">
        <h1 className="font-serif text-lg font-bold text-ink mb-1">Login bendahara</h1>
        <p className="text-sm text-inksoft mb-5">Cari sekolah dan masukkan PIN yang diberikan dinas.</p>

        <label className="text-xs text-inksoft block mb-1">Sekolah</label>
        <SchoolCombobox schools={schools} npsn={npsn} onSelect={setNpsn} />

        <label className="text-xs text-inksoft block mb-1">PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          className="w-full mb-4 border border-border rounded-md px-3 py-2 text-sm bg-white"
          placeholder="6 digit"
        />

        {error && <div className="text-red text-sm mb-4">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-white rounded-md py-2.5 font-semibold text-sm disabled:opacity-60"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
        <Link href="/" className="block text-center text-xs text-inksoft mt-4">
          ← Kembali
        </Link>
      </form>
    </main>
  );
}

function UploadFlow({ sekolah, onLogout }) {
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
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
          setParsed(parseBKUFromPDF(data));
        }
      } else {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        setParsed(parseBKU(rows));
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
    <main className="ledger-paper min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="font-serif text-lg font-bold text-ink">{sekolah.nama}</div>
            <div className="text-xs text-inksoft">NPSN {sekolah.npsn} · {sekolah.jenjang}</div>
          </div>
          <button onClick={onLogout} className="text-xs text-inksoft border border-border rounded-md px-3 py-1.5">
            Keluar
          </button>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-5 mb-4">
          <div className="font-serif font-bold text-ink mb-3">Unggah Buku Kas Umum (BKU)</div>
          <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer bg-[#FFFCF3]">
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

        {parsing && <div className="bg-card border border-border rounded-lg shadow-sm p-5 text-sm text-inksoft mb-4">Membaca dan mengklasifikasikan data...</div>}

        {parsed && !parsing && (
          <>
            {parsed.errors && parsed.errors.length > 0 && (
              <div className="bg-red/5 border border-red rounded-lg p-4 mb-4">
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
                <div className="bg-card border border-border rounded-lg shadow-sm p-5 mb-4 flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-serif font-bold text-ink">{parsed.namaSekolah}</div>
                    <div className="text-xs text-inksoft">{parsed.bulan} {parsed.tahun}</div>
                  </div>
                  <Stamp ok={parsed.integrityOk} />
                </div>

                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className="flex-1 min-w-[140px] bg-card border border-border rounded-lg shadow-sm p-4">
                    <div className="text-xs text-inksoft uppercase mb-1">Belanja modal</div>
                    <div className="font-mono text-lg font-bold text-gold">{fmtRp(parsed.totals.totalModal)}</div>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-card border border-border rounded-lg shadow-sm p-4">
                    <div className="text-xs text-inksoft uppercase mb-1">Belanja barang & jasa</div>
                    <div className="font-mono text-lg font-bold text-green">{fmtRp(parsed.totals.totalBarangJasa)}</div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-lg shadow-sm p-5 mb-4">
                  <div className="font-serif font-bold text-ink mb-3">Rincian per kode rekening</div>
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

                <div className="bg-card border border-border rounded-lg shadow-sm p-5 flex justify-between items-center flex-wrap gap-3">
                  <div className="text-sm text-inksoft">
                    {saved ? <span className="text-green font-semibold">Data tersimpan dan masuk ke rekap dinas.</span> : "Periksa hasil di atas sebelum mengirim."}
                    {saveError && <span className="text-red block mt-1">{saveError}</span>}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!parsed.npsn || saving || saved}
                    className={`rounded-md px-5 py-2.5 text-sm font-semibold ${
                      saved ? "bg-[#EDE7D3] text-inksoft" : "bg-ink text-white"
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
