"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CATEGORY_LABEL } from "../../lib/parseBKU";

const CATEGORY_TW = {
  modal: "text-gold",
  barang_jasa: "text-green",
  tak_terklasifikasi: "text-red",
};
const JENJANG_ORDER = ["TK/PAUD", "SD", "SMP"];
const BULAN_ORDER = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

// Period values are encoded as strings so a single <select> can offer
// individual months, semesters, or a full year:
//   "month:2026:MARET"   -> just that month
//   "semester:2026:1"    -> Jan-Jun 2026
//   "semester:2026:2"    -> Jul-Des 2026
//   "year:2026"          -> the whole year
function parsePeriod(value) {
  if (!value) return null;
  const [type, tahun, extra] = value.split(":");
  if (type === "month") return { type, tahun, bulanSet: new Set([extra]) };
  if (type === "semester") {
    const months = Object.keys(BULAN_ORDER).filter((b) =>
      extra === "1" ? BULAN_ORDER[b] <= 6 : BULAN_ORDER[b] >= 7
    );
    return { type, tahun, bulanSet: new Set(months) };
  }
  if (type === "year") return { type, tahun, bulanSet: new Set(Object.keys(BULAN_ORDER)) };
  return null;
}

function periodLabel(value) {
  const [type, tahun, extra] = value.split(":");
  if (type === "month") return `${extra} ${tahun}`;
  if (type === "semester") return `Semester ${extra} ${tahun} (${extra === "1" ? "Jan–Jun" : "Jul–Des"})`;
  if (type === "year") return `Tahunan ${tahun}`;
  return value;
}

// Combine multiple monthly submissions from the same school (relevant
// for semester/tahunan views) into one row: totals summed, rincian
// merged per kode rekening.
function aggregateByNpsn(subs) {
  const map = {};
  for (const s of subs) {
    if (!map[s.npsn]) {
      map[s.npsn] = {
        npsn: s.npsn,
        nama_sekolah: s.nama_sekolah,
        jenjang: s.jenjang,
        totals: { totalModal: 0, totalBarangJasa: 0 },
        rincianMap: {},
        integrity_ok: true,
        submitted_at: s.submitted_at,
        bulanList: [],
        file_names: [],
      };
    }
    const a = map[s.npsn];
    a.totals.totalModal += s.totals?.totalModal || 0;
    a.totals.totalBarangJasa += s.totals?.totalBarangJasa || 0;
    a.integrity_ok = a.integrity_ok && !!s.integrity_ok;
    if (new Date(s.submitted_at) > new Date(a.submitted_at)) a.submitted_at = s.submitted_at;
    a.bulanList.push(s.bulan);
    if (s.file_name) a.file_names.push(s.file_name);
    for (const g of s.rincian || []) {
      if (!a.rincianMap[g.kode]) {
        a.rincianMap[g.kode] = { kode: g.kode, kategori: g.kategori, uraian: g.uraian, total: 0, jumlahTransaksi: 0 };
      }
      a.rincianMap[g.kode].total += g.total;
      a.rincianMap[g.kode].jumlahTransaksi += g.jumlahTransaksi;
    }
  }
  return Object.values(map)
    .map((a) => ({
      ...a,
      rincian: Object.values(a.rincianMap).sort((x, y) => y.total - x.total),
      bulanList: a.bulanList.sort((x, y) => (BULAN_ORDER[x] || 99) - (BULAN_ORDER[y] || 99)),
    }))
    .sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""));
}

function fmtRp(n) {
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}

function PasswordGate({ onOk }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) setError("Password salah.");
      else {
        sessionStorage.setItem("bku_admin_pw", password);
        onOk(password);
      }
    } catch {
      setError("Gagal menghubungi server.");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="max-w-sm w-full bg-card border border-border rounded-lg p-6">
        <h1 className="font-serif text-lg font-bold text-ink mb-1">Rekap dinas</h1>
        <p className="text-sm text-inksoft mb-5">Masukkan password dinas untuk melihat rekap.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 border border-border rounded-md px-3 py-2 text-sm bg-white"
          placeholder="Password"
          required
        />
        {error && <div className="text-red text-sm mb-4">{error}</div>}
        <button type="submit" disabled={loading} className="w-full bg-ink text-white rounded-md py-2.5 font-semibold text-sm disabled:opacity-60">
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
        <Link href="/" className="block text-center text-xs text-inksoft mt-4">← Kembali</Link>
      </form>
    </main>
  );
}

function Dashboard({ password, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterText, setRosterText] = useState("");
  const [editingRoster, setEditingRoster] = useState(false);
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterMsg, setRosterMsg] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);
  const [view, setView] = useState("sekolah");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = { "x-admin-password": password };
    try {
      const [subRes, rosterRes] = await Promise.all([
        fetch("/api/admin/data", { headers }).then((r) => r.json()),
        fetch("/api/admin/roster", { headers }).then((r) => r.json()),
      ]);
      setSubmissions(subRes.submissions || []);
      const rlist = rosterRes.schools || [];
      setRoster(rlist);
      setRosterText(rlist.map((s) => `${s.npsn}|${s.nama}|${s.jenjang}|${s.pin}`).join("\n"));
    } catch {
      setSubmissions([]);
    }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    load();
  }, [load]);

  const tahunList = Array.from(new Set(submissions.map((s) => s.tahun))).sort().reverse();
  const periodOptions = [];
  for (const tahun of tahunList) {
    const bulanSet = new Set(submissions.filter((s) => s.tahun === tahun).map((s) => s.bulan));
    const bulanDesc = Array.from(bulanSet).sort((a, b) => (BULAN_ORDER[b] || 0) - (BULAN_ORDER[a] || 0));
    for (const bulan of bulanDesc) periodOptions.push(`month:${tahun}:${bulan}`);
    const hasSem1 = bulanDesc.some((b) => BULAN_ORDER[b] <= 6);
    const hasSem2 = bulanDesc.some((b) => BULAN_ORDER[b] >= 7);
    if (hasSem1) periodOptions.push(`semester:${tahun}:1`);
    if (hasSem2) periodOptions.push(`semester:${tahun}:2`);
    if (bulanDesc.length > 0) periodOptions.push(`year:${tahun}`);
  }
  const activePeriod = filterPeriod || periodOptions[0] || "";
  const period = parsePeriod(activePeriod);

  const rawFiltered = submissions.filter((s) => {
    if (period && (s.tahun !== period.tahun || !period.bulanSet.has(s.bulan))) return false;
    if (search && !`${s.nama_sekolah} ${s.npsn}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const filtered = aggregateByNpsn(rawFiltered);

  const totalModal = filtered.reduce((s, x) => s + (x.totals?.totalModal || 0), 0);
  const totalBarangJasa = filtered.reduce((s, x) => s + (x.totals?.totalBarangJasa || 0), 0);
  const submittedNpsns = new Set(filtered.map((s) => s.npsn));
  const belum = roster.filter((r) => !submittedNpsns.has(r.npsn));

  const jenjangOf = (s) => (JENJANG_ORDER.includes(s.jenjang) ? s.jenjang : "Lainnya");
  const jenjangGroups = JENJANG_ORDER.concat(filtered.some((s) => !JENJANG_ORDER.includes(s.jenjang)) ? ["Lainnya"] : []).map((jenjang) => {
    const schools = filtered.filter((s) => jenjangOf(s) === jenjang);
    return {
      jenjang,
      schools,
      totalModal: schools.reduce((s, x) => s + (x.totals?.totalModal || 0), 0),
      totalBarangJasa: schools.reduce((s, x) => s + (x.totals?.totalBarangJasa || 0), 0),
      belum: roster.filter((r) => r.jenjang === jenjang && !submittedNpsns.has(r.npsn)),
      rosterCount: roster.filter((r) => r.jenjang === jenjang).length,
    };
  });

  function buildKodeAgg(schools) {
    const agg = {};
    for (const s of schools) {
      for (const g of s.rincian || []) {
        if (!agg[g.kode]) agg[g.kode] = { kode: g.kode, kategori: g.kategori, uraian: g.uraian, total: 0, jumlahTransaksi: 0, sekolahSet: new Set() };
        agg[g.kode].total += g.total;
        agg[g.kode].jumlahTransaksi += g.jumlahTransaksi;
        agg[g.kode].sekolahSet.add(s.nama_sekolah);
      }
    }
    return Object.values(agg).map((a) => ({ ...a, jumlahSekolah: a.sekolahSet.size })).sort((a, b) => b.total - a.total);
  }

  const saveRoster = async () => {
    setRosterSaving(true);
    setRosterMsg("");
    const parsed = rosterText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split("|").map((p) => p.trim());
        return { npsn: parts[0] || "", nama: parts[1] || "", jenjang: parts[2] || "", pin: parts[3] || "" };
      })
      .filter((r) => r.npsn);
    try {
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ schools: parsed }),
      });
      const data = await res.json();
      if (!res.ok) setRosterMsg(data.error || "Gagal menyimpan.");
      else {
        setRosterMsg("Tersimpan.");
        setEditingRoster(false);
        load();
      }
    } catch {
      setRosterMsg("Gagal menghubungi server.");
    }
    setRosterSaving(false);
  };

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-xl font-bold text-ink">Rekap dinas</h1>
            <p className="text-xs text-inksoft">Klasifikasi belanja BKU — TK/PAUD, SD, SMP</p>
          </div>
          <button onClick={onLogout} className="text-xs text-inksoft border border-border rounded-md px-3 py-1.5">Keluar</button>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select
            value={activePeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm bg-white"
          >
            {periodOptions.length === 0 && <option value="">Belum ada data</option>}
            {periodOptions.map((p) => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))}
          </select>
          <input
            placeholder="Cari nama sekolah / NPSN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm w-56"
          />
          <button onClick={load} className="text-xs text-inksoft border border-border rounded-md px-3 py-2">Muat ulang</button>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-lg p-5">Memuat data...</div>
        ) : (
          <>
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Sekolah submit</div>
                <div className="font-mono text-lg font-bold text-ink">{filtered.length}{roster.length ? ` / ${roster.length}` : ""}</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Total belanja modal</div>
                <div className="font-mono text-lg font-bold text-gold">{fmtRp(totalModal)}</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-lg p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Total belanja barang & jasa</div>
                <div className="font-mono text-lg font-bold text-green">{fmtRp(totalBarangJasa)}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <div className="font-serif font-bold text-ink mb-3">Ringkasan per jenjang</div>
              <div className="grid grid-cols-[1fr_80px_110px_110px_70px] text-xs text-inksoft uppercase pb-2 border-b border-border">
                <span>Jenjang</span><span className="text-right">Sekolah</span><span className="text-right">Modal</span><span className="text-right">Barang & jasa</span><span className="text-right">Belum</span>
              </div>
              {jenjangGroups.map((jg) => (
                <div key={jg.jenjang} className="grid grid-cols-[1fr_80px_110px_110px_70px] items-center text-sm py-2 border-b border-border last:border-0">
                  <span className="font-semibold text-ink">{jg.jenjang}</span>
                  <span className="text-right text-inksoft">{jg.schools.length}{jg.rosterCount ? ` / ${jg.rosterCount}` : ""}</span>
                  <span className="text-right font-mono text-gold">{fmtRp(jg.totalModal)}</span>
                  <span className="text-right font-mono text-green">{fmtRp(jg.totalBarangJasa)}</span>
                  <span className={`text-right font-semibold ${jg.belum.length ? "text-red" : "text-green"}`}>{jg.rosterCount ? jg.belum.length : "–"}</span>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-lg p-5 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-serif font-bold text-ink">Daftar sekolah & PIN</div>
                <button onClick={() => setEditingRoster((v) => !v)} className="text-xs border border-border rounded-md px-3 py-1.5 text-inksoft">
                  {editingRoster ? "Batal" : "Kelola daftar"}
                </button>
              </div>
              {editingRoster ? (
                <div>
                  <div className="text-xs text-inksoft mb-2">Satu sekolah per baris: <code className="font-mono">NPSN|Nama Sekolah|Jenjang|PIN</code></div>
                  <textarea
                    value={rosterText}
                    onChange={(e) => setRosterText(e.target.value)}
                    rows={10}
                    className="w-full font-mono text-xs border border-border rounded-md p-2"
                    placeholder={"50104137|SD NEGERI 1 CONTOH|SD|123456"}
                  />
                  {rosterMsg && <div className="text-sm text-inksoft mt-2">{rosterMsg}</div>}
                  <button onClick={saveRoster} disabled={rosterSaving} className="mt-2 bg-ink text-white rounded-md px-4 py-2 text-sm font-semibold">
                    {rosterSaving ? "Menyimpan..." : "Simpan daftar"}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-inksoft">{roster.length} sekolah terdaftar.</div>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              {[{ id: "sekolah", label: "Per sekolah" }, { id: "kode", label: "Rincian per kode rekening" }].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={`text-xs font-semibold rounded-md px-3 py-1.5 border ${view === t.id ? "bg-ink text-white border-ink" : "border-border text-inksoft"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {view === "sekolah"
              ? jenjangGroups.map((jg) => (
                  <div key={jg.jenjang} className="bg-card border border-border rounded-lg p-5 mb-4">
                    <div className="font-serif font-bold text-ink mb-3">{jg.jenjang} <span className="text-xs font-normal text-inksoft">· {jg.schools.length} sekolah submit</span></div>
                    {jg.schools.length === 0 ? (
                      <div className="text-sm text-inksoft">Belum ada submisi {jg.jenjang} untuk periode ini.</div>
                    ) : (
                      jg.schools.sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || "")).map((s) => (
                        <div key={s.npsn}>
                          <div
                            onClick={() => setExpandedRow((r) => (r === s.npsn ? null : s.npsn))}
                            className="grid grid-cols-[1fr_110px_110px_70px] items-center text-sm py-2 border-b border-border cursor-pointer"
                          >
                            <span className="text-ink">{s.nama_sekolah} <span className="text-inksoft text-xs">({s.npsn})</span></span>
                            <span className="text-right font-mono text-gold">{fmtRp(s.totals?.totalModal)}</span>
                            <span className="text-right font-mono text-green">{fmtRp(s.totals?.totalBarangJasa)}</span>
                            <span className={`text-center ${s.integrity_ok ? "text-green" : "text-red"}`}>{s.integrity_ok ? "✓" : "!"}</span>
                          </div>
                          {expandedRow === s.npsn && (
                            <div className="pl-3 py-2 text-xs text-inksoft">
                              {(s.rincian || []).map((g) => (
                                <div key={g.kode} className="py-1 border-b border-border last:border-0">
                                  <div className="flex justify-between">
                                    <span className="font-mono text-ink">{g.kode} <span className={CATEGORY_TW[g.kategori]}>— {CATEGORY_LABEL[g.kategori]}</span></span>
                                    <span className="font-mono font-semibold text-ink">{fmtRp(g.total)}</span>
                                  </div>
                                  <div className="mt-0.5">{g.uraian || "Uraian tidak ditemukan"}</div>
                                </div>
                              ))}
                              <div className="mt-2">Bulan: {(s.bulanList || []).join(", ")} · terakhir dikirim {new Date(s.submitted_at).toLocaleString("id-ID")}</div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))
              : jenjangGroups.map((jg) => {
                  const kodeRincian = buildKodeAgg(jg.schools);
                  return (
                    <div key={jg.jenjang} className="bg-card border border-border rounded-lg p-5 mb-4">
                      <div className="font-serif font-bold text-ink mb-3">{jg.jenjang}</div>
                      {kodeRincian.length === 0 ? (
                        <div className="text-sm text-inksoft">Belum ada submisi {jg.jenjang} untuk periode ini.</div>
                      ) : (
                        kodeRincian.map((g) => (
                          <div key={g.kode} className="py-2 border-b border-border last:border-0">
                            <div className="grid grid-cols-[1fr_130px_80px_100px] items-center text-sm">
                              <span className="font-mono text-ink">{g.kode}</span>
                              <span className={`text-xs font-semibold ${CATEGORY_TW[g.kategori]}`}>{CATEGORY_LABEL[g.kategori]}</span>
                              <span className="text-right text-inksoft text-xs">{g.jumlahSekolah} sekolah</span>
                              <span className="text-right font-mono font-semibold text-ink">{fmtRp(g.total)}</span>
                            </div>
                            <div className="text-xs text-inksoft mt-1">{g.uraian || "(uraian tidak ditemukan)"}</div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
          </>
        )}
      </div>
    </main>
  );
}

export default function AdminPage() {
  const [password, setPassword] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("bku_admin_pw");
    if (saved) setPassword(saved);
  }, []);

  if (!password) return <PasswordGate onOk={setPassword} />;
  return (
    <Dashboard
      password={password}
      onLogout={() => {
        sessionStorage.removeItem("bku_admin_pw");
        setPassword(null);
      }}
    />
  );
}
