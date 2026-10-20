"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { CATEGORY_LABEL, classifyKode, getUraian } from "../../lib/parseBKU";
import { Landmark } from "lucide-react";

const CATEGORY_TW = {
  modal_peralatan_mesin: "text-gold",
  modal_aset_lainnya: "text-blue",
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
// Pendapatan = hanya Terima Dana BOSP (pencairanBosp). Memakai field ini
// (bukan totals.pendapatan) membuat data lama yang sudah tersimpan
// dengan pendapatan membengkak (mis. akibat PPN) ikut benar tanpa
// upload ulang. Data yang tidak punya field itu kembali ke pendapatan.
const pendapatanOf = (t) => t?.pencairanBosp ?? t?.pendapatan ?? 0;

// Total koreksi pengembalian belanja pada satu submission.
const koreksiOf = (t) =>
  Number(t?.koreksiTotal ?? (t?.koreksiList || []).reduce((a, k) => a + (Number(k.nominal) || 0), 0)) || 0;

function aggregateByNpsn(subs) {
  const map = {};
  for (const s of subs) {
    if (!map[s.npsn]) {
      map[s.npsn] = {
        npsn: s.npsn,
        nama_sekolah: s.nama_sekolah,
        jenjang: s.jenjang,
        rincianMap: {},
        integrity_ok: true,
        submitted_at: s.submitted_at,
        bulanList: [],
        file_names: [],
        pendapatan: 0,
        belanjaTotal: 0,
        saldoAwal: null,
        saldoAwalBulanOrder: Infinity,
        saldoAkhir: null,
        saldoAkhirBulanOrder: -Infinity,
      };
    }
    const a = map[s.npsn];
    a.integrity_ok = a.integrity_ok && !!s.integrity_ok;
    if (new Date(s.submitted_at) > new Date(a.submitted_at)) a.submitted_at = s.submitted_at;
    a.bulanList.push(s.bulan);
    if (s.file_name) a.file_names.push(s.file_name);

    a.pendapatan += pendapatanOf(s.totals);
    a.belanjaTotal += s.totals?.belanjaTotal || 0;
    const order = BULAN_ORDER[s.bulan] || 0;
    if (order < a.saldoAwalBulanOrder) {
      a.saldoAwalBulanOrder = order;
      a.saldoAwal = s.totals?.saldoAwal ?? null;
    }
    if (order > a.saldoAkhirBulanOrder) {
      a.saldoAkhirBulanOrder = order;
      a.saldoAkhir = s.totals?.saldoAkhir ?? null;
    }

    for (const g of s.rincian || []) {
      // Re-derive kategori/uraian from the stored kode rekening itself
      // rather than trusting whatever label was cached at submit time —
      // this way, older submissions automatically follow the current
      // classification rules (e.g. after a rule change) with no need
      // to re-upload anything.
      const kategori = classifyKode(g.kode);
      if (!a.rincianMap[g.kode]) {
        a.rincianMap[g.kode] = { kode: g.kode, kategori, uraian: getUraian(g.kode) || g.uraian, total: 0, jumlahTransaksi: 0 };
      }
      a.rincianMap[g.kode].total += g.total;
      a.rincianMap[g.kode].jumlahTransaksi += g.jumlahTransaksi;
    }
  }
  return Object.values(map)
    .map((a) => {
      const rincian = Object.values(a.rincianMap).sort((x, y) => y.total - x.total);
      const totals = {
        totalModalPeralatanMesin: rincian.filter((g) => g.kategori === "modal_peralatan_mesin").reduce((s, g) => s + g.total, 0),
        totalModalAsetLainnya: rincian.filter((g) => g.kategori === "modal_aset_lainnya").reduce((s, g) => s + g.total, 0),
        totalBarangJasa: rincian.filter((g) => g.kategori === "barang_jasa").reduce((s, g) => s + g.total, 0),
        pendapatan: a.pendapatan,
        belanjaTotal: a.belanjaTotal,
        saldoAwal: a.saldoAwal,
        saldoAkhir: a.saldoAkhir,
      };
      totals.totalModal = totals.totalModalPeralatanMesin + totals.totalModalAsetLainnya;
      return {
        ...a,
        rincian,
        totals,
        bulanList: a.bulanList.sort((x, y) => (BULAN_ORDER[x] || 99) - (BULAN_ORDER[y] || 99)),
      };
    })
    .sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""));
}

// Angka rupiah tanpa awalan "Rp" (satuan ada di judul kolom) — dipakai di
// tabel padat agar angka besar tidak patah baris.
function fmtAngka(n) {
  return Math.round(n || 0).toLocaleString("id-ID");
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
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-2xl shadow-lg overflow-hidden bg-card">
        <div className="gradient-hero px-6 pt-8 pb-6 text-center">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center mx-auto mb-3">
            <Landmark size={20} className="text-white" />
          </div>
          <h1 className="font-extrabold text-lg text-white">Rekap dinas</h1>
          <p className="text-xs text-white/75 mt-1">Masukkan password dinas untuk melihat rekap.</p>
        </div>
        <form onSubmit={submit} className="p-6">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 border border-border rounded-xl px-3 py-2.5 text-sm bg-white border-border focus:border-blue outline-none transition"
          placeholder="Password"
          required
        />
        {error && <div className="text-red text-sm mb-4">{error}</div>}
        <button type="submit" disabled={loading} className="w-full gradient-hero text-white rounded-xl py-3 font-bold text-sm disabled:opacity-60 shadow-md hover:brightness-110 transition">
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
        <Link href="/" className="block text-center text-xs text-inksoft mt-4">← Kembali</Link>
        </form>
      </div>
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
  const [expandedJenjang, setExpandedJenjang] = useState(null);
  const [view, setView] = useState("saldo");
  const [rkoranMap, setRkoranMap] = useState({});
  const [rkoranText, setRkoranText] = useState("");
  const [editingRkoran, setEditingRkoran] = useState(false);
  const [rkoranSaving, setRkoranSaving] = useState(false);
  const [rkoranMsg, setRkoranMsg] = useState("");
  const [silpaMap, setSilpaMap] = useState({});
  const [saldoAwalMap, setSaldoAwalMap] = useState({});

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

  const loadRkoran = useCallback(async () => {
    if (!period || period.type !== "month") {
      setRkoranMap({});
      return;
    }
    try {
      const res = await fetch(`/api/admin/rkoran?tahun=${period.tahun}&bulan=${[...period.bulanSet][0]}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      const map = {};
      (data.entries || []).forEach((e) => {
        map[e.npsn] = e.saldo_rkoran;
      });
      setRkoranMap(map);
      setRkoranText(Object.entries(map).map(([npsn, v]) => `${npsn}|${v}`).join("\n"));
    } catch {
      setRkoranMap({});
    }
  }, [password, activePeriod]);

  useEffect(() => {
    loadRkoran();
  }, [loadRkoran]);

  const loadSilpa = useCallback(async () => {
    if (!period) {
      setSilpaMap({});
      return;
    }
    try {
      const res = await fetch(`/api/admin/silpa?tahun=${period.tahun}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      const map = {};
      (data.entries || []).forEach((e) => {
        map[e.npsn] = Number(e.nominal) || 0;
      });
      setSilpaMap(map);
    } catch {
      setSilpaMap({});
    }
  }, [password, activePeriod]);

  useEffect(() => {
    loadSilpa();
  }, [loadSilpa]);

  const loadSaldoAwal = useCallback(async () => {
    if (!period) {
      setSaldoAwalMap({});
      return;
    }
    try {
      const res = await fetch(`/api/admin/saldoawal?tahun=${period.tahun}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      const map = {};
      (data.entries || []).forEach((e) => {
        map[e.npsn] = { arkas: Number(e.saldo_arkas) || 0, tunai: Number(e.saldo_tunai) || 0 };
      });
      setSaldoAwalMap(map);
    } catch {
      setSaldoAwalMap({});
    }
  }, [password, activePeriod]);

  useEffect(() => {
    loadSaldoAwal();
  }, [loadSaldoAwal]);

  const saveRkoran = async () => {
    if (!period || period.type !== "month") return;
    setRkoranSaving(true);
    setRkoranMsg("");
    const entries = rkoranText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [npsn, v] = l.split("|").map((p) => p.trim());
        return { npsn, saldoRkoran: v };
      })
      .filter((e) => e.npsn);
    try {
      const res = await fetch("/api/admin/rkoran", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ tahun: period.tahun, bulan: [...period.bulanSet][0], entries }),
      });
      const data = await res.json();
      if (!res.ok) setRkoranMsg(data.error || "Gagal menyimpan.");
      else {
        setRkoranMsg("Tersimpan.");
        setEditingRkoran(false);
        loadRkoran();
      }
    } catch {
      setRkoranMsg("Gagal menghubungi server.");
    }
    setRkoranSaving(false);
  };

  const rawFiltered = submissions.filter((s) => {
    if (period && (s.tahun !== period.tahun || !period.bulanSet.has(s.bulan))) return false;
    return true;
  });

  // For semester/tahunan periods, only count a school as "sudah submit"
  // once every month in that range has been submitted — a school with
  // only 1 of 6 (or 12) months filled in is treated as "belum", not
  // partially done, so totals never look complete when they aren't.
  const bulanByNpsn = {};
  for (const s of rawFiltered) {
    if (!bulanByNpsn[s.npsn]) bulanByNpsn[s.npsn] = new Set();
    bulanByNpsn[s.npsn].add(s.bulan);
  }
  const isComplete = (npsn) => {
    if (!period) return true;
    for (const b of period.bulanSet) {
      if (!bulanByNpsn[npsn]?.has(b)) return false;
    }
    return true;
  };

  const completeFiltered = rawFiltered.filter((s) => isComplete(s.npsn));
  const searched = completeFiltered.filter(
    (s) => !search || `${s.nama_sekolah} ${s.npsn}`.toLowerCase().includes(search.toLowerCase())
  );
  const filtered = aggregateByNpsn(searched);

  const totalModalPeralatanMesin = filtered.reduce((s, x) => s + (x.totals?.totalModalPeralatanMesin || 0), 0);
  const totalModalAsetLainnya = filtered.reduce((s, x) => s + (x.totals?.totalModalAsetLainnya || 0), 0);
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
      totalModalPeralatanMesin: schools.reduce((s, x) => s + (x.totals?.totalModalPeralatanMesin || 0), 0),
      totalModalAsetLainnya: schools.reduce((s, x) => s + (x.totals?.totalModalAsetLainnya || 0), 0),
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

  const JENJANG_SHEET_NAME = { "TK/PAUD": "TK-PAUD", SD: "SD", SMP: "SMP" };
  const periodFileTag = () => periodLabel(activePeriod).replace(/\s+/g, "-").replace(/[()–]/g, "");

  // Groups a jenjang's raw (pre-aggregated) submissions by school, keeping
  // BOSP Reguler and BOSP Kinerja fully separate — pendapatan and belanja
  // both split by sumber dana — matching the official "Rekapan BOSP"
  // report layout used by the dinas. Belanja per category is shown as
  // Sebelum Koreksi / Koreksi / Sesudah Koreksi: the stored totals are
  // already net of any bendahara-entered koreksi, so "sebelum" is
  // reconstructed by adding the koreksi back.
  // Perubahan saldo satu submission = Saldo Akhir - Saldo Awal menurut
  // file BKU itu sendiri (selisih saldo yang tercatat bank, tidak
  // bergantung pada cara transaksi diklasifikasikan), ditambah koreksi
  // pengembalian belanja (uang yang kembali ke rekening tetapi tidak
  // tercatat sebagai baris di BKU). Sengaja tidak memakai
  // pendapatan - belanja: kalau satu jenis transaksi pass-through salah
  // diklasifikasikan (mis. PPN sebelum diperbaiki), saldo ikut meleset.
  // Data lama yang sudah tersimpan juga ikut benar tanpa perlu upload ulang.
  const movementOf = (t) => {
    const mutasi =
      t?.saldoAkhir != null && t?.saldoAwal != null
        ? (t.saldoAkhir || 0) - (t.saldoAwal || 0)
        : (t?.pendapatan || 0) - (t?.belanjaTotal || 0);
    return mutasi + koreksiOf(t);
  };

  // ---- Tab "Saldo per sekolah": saldo awal, pendapatan, belanja, saldo
  // akhir per sekolah, dikelompokkan per jenjang. Rumus sama dengan
  // Rekapan BOSP Resmi: saldo awal = saldo awal Januari dari database
  // (+ mutasi bulan-bulan sebelum periode); jika sekolah belum ada di
  // database, dipakai saldo awal dari file BKU (+ SiLPA Kinerja) dan
  // ditandai "*". Belanja = belanja bersih setelah koreksi pengembalian.
  const saldoRingkas = (npsn) => {
    const subsP = searched.filter((x) => x.npsn === npsn);
    if (subsP.length === 0) return null;
    const tahun = subsP[0].tahun;
    const startOrder = Math.min(...subsP.map((x) => BULAN_ORDER[x.bulan] || 99));
    const anchor = saldoAwalMap[npsn];
    let saldoAwal;
    if (anchor) {
      const prior = submissions.filter(
        (x) => x.npsn === npsn && x.tahun === tahun && (BULAN_ORDER[x.bulan] || 0) < startOrder
      );
      saldoAwal = anchor.arkas + anchor.tunai + prior.reduce((a, x) => a + movementOf(x.totals), 0);
    } else {
      saldoAwal =
        subsP.filter((x) => (BULAN_ORDER[x.bulan] || 99) === startOrder).reduce((a, x) => a + (x.totals?.saldoAwal || 0), 0) +
        (silpaMap[npsn] || 0);
    }
    const pendapatan = subsP.reduce((a, x) => a + pendapatanOf(x.totals), 0);
    const belanja = subsP.reduce((a, x) => a + (x.totals?.belanjaTotal || 0) - koreksiOf(x.totals), 0);
    const saldoAkhir = saldoAwal + subsP.reduce((a, x) => a + movementOf(x.totals), 0);
    const selisih = saldoAwal + pendapatan - belanja - saldoAkhir;
    return { saldoAwal, pendapatan, belanja, saldoAkhir, selisih, dariDatabase: !!anchor };
  };

  const saldoGroups = jenjangGroups.map((jg) => {
    const rows = jg.schools
      .map((sch) => ({ sch, r: saldoRingkas(sch.npsn) }))
      .filter((x) => x.r)
      .sort((a, b) => (a.sch.nama_sekolah || "").localeCompare(b.sch.nama_sekolah || ""));
    const tot = rows.reduce(
      (a, { r }) => ({
        saldoAwal: a.saldoAwal + r.saldoAwal,
        pendapatan: a.pendapatan + r.pendapatan,
        belanja: a.belanja + r.belanja,
        saldoAkhir: a.saldoAkhir + r.saldoAkhir,
      }),
      { saldoAwal: 0, pendapatan: 0, belanja: 0, saldoAkhir: 0 }
    );
    return { jenjang: jg.jenjang, rows, tot, belum: jg.belum.length };
  });

  function buildOfficialRecap(subsForJenjang) {
    const bySchool = {};
    for (const s of subsForJenjang) {
      if (!bySchool[s.npsn]) bySchool[s.npsn] = { npsn: s.npsn, nama_sekolah: s.nama_sekolah, subs: [] };
      bySchool[s.npsn].subs.push(s);
    }
    const sum = (arr, get) => arr.reduce((acc, s) => acc + (get(s.totals || {}) || 0), 0);

    function belanjaBreakdown(subs) {
      const afterBJ = sum(subs, (t) => t.totalBarangJasa);
      const afterPM = sum(subs, (t) => t.totalModalPeralatanMesin);
      const afterATL = sum(subs, (t) => t.totalModalAsetLainnya);
      let koreksiBJ = 0;
      let koreksiPM = 0;
      let koreksiATL = 0;
      for (const s of subs) {
        for (const k of s.totals?.koreksiList || []) {
          const nominal = Number(k.nominal) || 0;
          const kategori = classifyKode(k.kode);
          if (kategori === "barang_jasa") koreksiBJ += nominal;
          else if (kategori === "modal_peralatan_mesin") koreksiPM += nominal;
          else if (kategori === "modal_aset_lainnya") koreksiATL += nominal;
        }
      }
      return {
        bjSebelum: afterBJ + koreksiBJ,
        bjKoreksi: koreksiBJ,
        bjSesudah: afterBJ,
        pmSebelum: afterPM + koreksiPM,
        pmKoreksi: koreksiPM,
        pmSesudah: afterPM,
        atlSebelum: afterATL + koreksiATL,
        atlKoreksi: koreksiATL,
        atlSesudah: afterATL,
        jumlah: afterBJ + afterPM + afterATL,
      };
    }

    return Object.values(bySchool)
      .map(({ npsn, nama_sekolah, subs }) => {
        const reguler = subs.filter((s) => (s.sumber_dana || "REGULER") === "REGULER");
        const kinerja = subs.filter((s) => s.sumber_dana === "KINERJA");
        const regulerBreakdown = belanjaBreakdown(reguler);
        const kinerjaBreakdown = belanjaBreakdown(kinerja);
        const regulerKoreksiTotal = regulerBreakdown.bjKoreksi + regulerBreakdown.pmKoreksi + regulerBreakdown.atlKoreksi;
        const kinerjaKoreksiTotal = kinerjaBreakdown.bjKoreksi + kinerjaBreakdown.pmKoreksi + kinerjaBreakdown.atlKoreksi;

        // Saldo awal & sisa saldo. Kalau sekolah punya saldo awal Januari
        // di tabel saldo_awal_januari: Januari = angka itu, bulan lain =
        // saldo akhir bulan sebelumnya yang dirantai dari Januari.
        // Kalau belum ada, jatuh kembali ke cara lama (baca dari BKU +
        // SiLPA Kinerja) supaya sekolah tersebut tetap tampil.
        const anchor = saldoAwalMap[npsn];
        let saldoAwalBank, saldoAwalTunai, sisaSaldoBKU;
        const bulanKosong = [];
        if (anchor && period?.type === "month") {
          const nowOrder = BULAN_ORDER[[...period.bulanSet][0]] || 1;
          const prior = submissions.filter(
            (x) => x.npsn === npsn && x.tahun === period.tahun && (BULAN_ORDER[x.bulan] || 0) < nowOrder
          );
          for (let o = 1; o < nowOrder; o++) {
            if (!prior.some((x) => BULAN_ORDER[x.bulan] === o)) {
              bulanKosong.push(Object.keys(BULAN_ORDER).find((b) => BULAN_ORDER[b] === o));
            }
          }
          const totalAwal = anchor.arkas + anchor.tunai + prior.reduce((acc, x) => acc + movementOf(x.totals), 0);
          if (nowOrder === 1) {
            saldoAwalBank = anchor.arkas;
            saldoAwalTunai = anchor.tunai;
          } else {
            // Pecahan tunai bulan berjalan tetap diambil dari BKU; sisanya
            // ke "Saldo di Arkas", sehingga totalnya selalu = hasil rantai.
            saldoAwalTunai = sum(subs, (t) => t.saldoAwalTunai);
            saldoAwalBank = totalAwal - saldoAwalTunai;
          }
          sisaSaldoBKU = totalAwal + subs.reduce((acc, x) => acc + movementOf(x.totals), 0);
        } else {
          saldoAwalBank = sum(subs, (t) => t.saldoAwalBank);
          saldoAwalTunai = sum(subs, (t) => t.saldoAwalTunai);
          // Koreksi tidak muncul sebagai baris sendiri di BKU, jadi
          // "Jumlah"/saldoAkhir file lebih kecil sebesar koreksi —
          // ditambahkan kembali di sini. SiLPA Kinerja hanya dipakai pada
          // jalur lama ini (sekolah tanpa saldo awal Januari di database).
          sisaSaldoBKU = sum(subs, (t) => t.saldoAkhir) + regulerKoreksiTotal + kinerjaKoreksiTotal + (silpaMap[npsn] || 0);
        }
        return {
          npsn,
          nama_sekolah,
          saldoAwalBank,
          saldoAwalTunai,
          pendapatanReguler: sum(reguler, pendapatanOf),
          pendapatanKinerja: sum(kinerja, pendapatanOf),
          reguler: regulerBreakdown,
          kinerja: kinerjaBreakdown,
          sisaSaldoBKU,
          dariDatabase: !!(anchor && period?.type === "month"),
          bulanKosong,
        };
      })
      .sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""));
  }

  // Official "Rekapan BOSP" export — matches the dinas's own report
  // layout exactly (merged multi-row headers, Reguler/Kinerja split,
  // manual Saldo R.Koran + auto Selisih). Only meaningful for a single
  // month, since Saldo R.Koran is a specific bank-statement snapshot.
  const exportRekapResmi = () => {
    if (!period || period.type !== "month") {
      alert("Pilih periode satu bulan (bukan semester/tahunan) untuk unduhan ini, karena Saldo R.Koran berupa data per tanggal tertentu.");
      return;
    }

    // Pemeriksaan sebelum unduh: rantai saldo bergantung pada submission
    // bulan-bulan sebelumnya. Bulan yang belum di-submit dianggap tanpa
    // mutasi, jadi angkanya bisa meleset — beri tahu dulu.
    const allRecap = JENJANG_ORDER.flatMap((j) => buildOfficialRecap(completeFiltered.filter((s) => jenjangOf(s) === j)));
    const berlubang = allRecap.filter((r) => r.bulanKosong.length > 0);
    const tanpaAnchor = allRecap.filter((r) => !r.dariDatabase);
    const pesan = [];
    if (berlubang.length > 0) {
      pesan.push(
        `${berlubang.length} sekolah belum submit sebagian bulan sebelumnya (mis. ${berlubang[0].nama_sekolah}: ${berlubang[0].bulanKosong.join(", ")}). Bulan itu dianggap tanpa transaksi sehingga Saldo Awal/Sisa Saldo bisa tidak akurat.`
      );
    }
    if (tanpaAnchor.length > 0) {
      pesan.push(
        `${tanpaAnchor.length} sekolah belum punya Saldo Awal Januari di database, jadi memakai saldo dari file BKU (cara lama).`
      );
    }
    if (pesan.length > 0 && !confirm(pesan.join("\n\n") + "\n\nLanjut unduh?")) return;

    const wb = XLSX.utils.book_new();
    for (const jenjang of JENJANG_ORDER) {
      const subsForJenjang = completeFiltered.filter((s) => jenjangOf(s) === jenjang);
      const recap = buildOfficialRecap(subsForJenjang);

      const title = `REKAPAN BOSP JENJANG ${jenjang === "TK/PAUD" ? "TK/PAUD" : jenjang} SE-KABUPATEN GIANYAR ${periodLabel(activePeriod).toUpperCase()}`;
      const headerRow1 = [title];
      const headerRow2 = [
        "No", "Nama Sekolah", "Saldo Awal", "",
        "Penambahan", "",
        "BOSP REGULER", "", "", "", "", "", "", "", "", "",
        "BOSP KINERJA", "", "", "", "", "", "", "", "", "",
        "Saldo Akhir", "", "",
      ];
      const headerRow3 = [
        "", "", "Saldo di Arkas", "Tunai",
        "Pendapatan Dana BOSP Reguler", "Pendapatan Dana BOSP Kinerja",
        "Belanja Barang dan Jasa", "", "",
        "Belanja Modal Peralatan dan Mesin", "", "",
        "Belanja Modal Aset Tetap Lainnya", "", "",
        "Jumlah Belanja BOSP REGULER",
        "Belanja Barang dan Jasa", "", "",
        "Belanja Modal Peralatan dan Mesin", "", "",
        "Belanja Modal Aset Tetap Lainnya", "", "",
        "Jumlah Belanja BOSP KINERJA",
        "Sisa Saldo Buku Kas Umum", "Saldo R.Koran", "Selisih",
      ];
      const headerRow4 = [
        "", "", "", "", "", "",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "Sebelum Koreksi", "Koreksi", "Sesudah Koreksi",
        "",
        "", "", "",
      ];

      const dataRows = recap.map((r, i) => {
        const rkoran = rkoranMap[r.npsn];
        return [
          i + 1,
          r.nama_sekolah,
          r.saldoAwalBank,
          r.saldoAwalTunai,
          r.pendapatanReguler,
          r.pendapatanKinerja,
          r.reguler.bjSebelum, r.reguler.bjKoreksi, r.reguler.bjSesudah,
          r.reguler.pmSebelum, r.reguler.pmKoreksi, r.reguler.pmSesudah,
          r.reguler.atlSebelum, r.reguler.atlKoreksi, r.reguler.atlSesudah,
          r.reguler.jumlah,
          r.kinerja.bjSebelum, r.kinerja.bjKoreksi, r.kinerja.bjSesudah,
          r.kinerja.pmSebelum, r.kinerja.pmKoreksi, r.kinerja.pmSesudah,
          r.kinerja.atlSebelum, r.kinerja.atlKoreksi, r.kinerja.atlSesudah,
          r.kinerja.jumlah,
          r.sisaSaldoBKU,
          rkoran ?? "",
          rkoran != null ? r.sisaSaldoBKU - rkoran : "",
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, headerRow3, headerRow4, ...dataRows]);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 28 } },
        { s: { r: 1, c: 0 }, e: { r: 3, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 3, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
        { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
        { s: { r: 1, c: 4 }, e: { r: 1, c: 5 } },
        { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
        { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } },
        { s: { r: 1, c: 6 }, e: { r: 1, c: 15 } },
        { s: { r: 2, c: 6 }, e: { r: 2, c: 8 } },
        { s: { r: 2, c: 9 }, e: { r: 2, c: 11 } },
        { s: { r: 2, c: 12 }, e: { r: 2, c: 14 } },
        { s: { r: 2, c: 15 }, e: { r: 3, c: 15 } },
        { s: { r: 1, c: 16 }, e: { r: 1, c: 25 } },
        { s: { r: 2, c: 16 }, e: { r: 2, c: 18 } },
        { s: { r: 2, c: 19 }, e: { r: 2, c: 21 } },
        { s: { r: 2, c: 22 }, e: { r: 2, c: 24 } },
        { s: { r: 2, c: 25 }, e: { r: 3, c: 25 } },
        { s: { r: 1, c: 26 }, e: { r: 1, c: 28 } },
        { s: { r: 2, c: 26 }, e: { r: 3, c: 26 } },
        { s: { r: 2, c: 27 }, e: { r: 3, c: 27 } },
        { s: { r: 2, c: 28 }, e: { r: 3, c: 28 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, JENJANG_SHEET_NAME[jenjang]);
    }
    XLSX.writeFile(wb, `Rekapan-BOSP-Resmi-${periodFileTag()}.xlsx`);
  };

  // File 1: total belanja modal & barang/jasa per sekolah, satu sheet per jenjang.
  const exportRekapTotal = () => {
    const wb = XLSX.utils.book_new();
    for (const jenjang of JENJANG_ORDER) {
      const jg = jenjangGroups.find((j) => j.jenjang === jenjang);
      const rows = [
        ["Nama Sekolah", "NPSN", "Bulan", "Saldo Awal", "Pendapatan", "Belanja Modal - Peralatan & Mesin", "Belanja Modal - Aset Tetap Lainnya", "Belanja Barang & Jasa", "Belanja Total", "Saldo Akhir"],
        ...(jg ? jg.schools : [])
          .sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""))
          .map((s) => [
            s.nama_sekolah,
            s.npsn,
            (s.bulanList || []).join(", "),
            s.totals?.saldoAwal ?? 0,
            pendapatanOf(s.totals),
            s.totals?.totalModalPeralatanMesin || 0,
            s.totals?.totalModalAsetLainnya || 0,
            s.totals?.totalBarangJasa || 0,
            s.totals?.belanjaTotal ?? 0,
            s.totals?.saldoAkhir ?? 0,
          ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), JENJANG_SHEET_NAME[jenjang]);
    }
    XLSX.writeFile(wb, `Rekap-Total-per-Jenjang-${periodFileTag()}.xlsx`);
  };

  // File 2: rincian per kode rekening, dipisah per sekolah untuk semua jenjang.
  const exportRincianKode = () => {
    const wb = XLSX.utils.book_new();
    for (const jenjang of JENJANG_ORDER) {
      const jg = jenjangGroups.find((j) => j.jenjang === jenjang);
      const schools = jg ? jg.schools : [];
      const rows = [["Nama Sekolah", "Kode Rekening", "Kategori", "Uraian Rekening", "Total"]];
      for (const s of [...schools].sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""))) {
        for (const g of s.rincian || []) {
          rows.push([s.nama_sekolah, g.kode, CATEGORY_LABEL[g.kategori], g.uraian || "", g.total]);
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), JENJANG_SHEET_NAME[jenjang]);
    }
    XLSX.writeFile(wb, `Rincian-Kode-Rekening-${periodFileTag()}.xlsx`);
  };

  // File 3: status sudah/belum submit, satu sheet per jenjang.
  const exportStatusSubmit = () => {
    const wb = XLSX.utils.book_new();
    for (const jenjang of JENJANG_ORDER) {
      const jg = jenjangGroups.find((j) => j.jenjang === jenjang);
      const sudah = jg ? jg.schools.map((s) => ({ npsn: s.npsn, nama: s.nama_sekolah, status: "Sudah" })) : [];
      const belumList = jg ? jg.belum.map((s) => ({ npsn: s.npsn, nama: s.nama, status: "Belum" })) : [];
      const rows = [
        ["NPSN", "Nama Sekolah", "Status"],
        ...[...sudah, ...belumList].sort((a, b) => (a.nama || "").localeCompare(b.nama || "")).map((s) => [s.npsn, s.nama, s.status]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), JENJANG_SHEET_NAME[jenjang]);
    }
    XLSX.writeFile(wb, `Status-Submit-${periodFileTag()}.xlsx`);
  };

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
    <main className="min-h-screen bg-paper p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-extrabold text-xl text-ink">Rekap dinas</h1>
            <p className="text-xs text-inksoft">SIMBOSP — TK/PAUD, SD, SMP</p>
          </div>
          <button onClick={onLogout} className="text-xs text-inksoft border border-border rounded-xl px-3 py-1.5">Keluar</button>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select
            value={activePeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            className="border border-border rounded-xl px-3 py-2.5 text-sm bg-white border-border focus:border-blue outline-none transition"
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
            className="border border-border rounded-xl px-3 py-2 text-sm w-56"
          />
          <button onClick={load} className="text-xs text-inksoft border border-border rounded-xl px-3 py-2">Muat ulang</button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={exportRekapTotal}
            disabled={filtered.length === 0}
            className="text-xs text-white bg-green rounded-xl px-3 py-2 font-semibold disabled:opacity-40"
          >
            ⬇ Rekap Total per Jenjang
          </button>
          <button
            onClick={exportRincianKode}
            disabled={filtered.length === 0}
            className="text-xs text-white bg-green rounded-xl px-3 py-2 font-semibold disabled:opacity-40"
          >
            ⬇ Rincian Kode Rekening
          </button>
          <button
            onClick={exportStatusSubmit}
            disabled={roster.length === 0}
            className="text-xs text-white bg-green rounded-xl px-3 py-2 font-semibold disabled:opacity-40"
          >
            ⬇ Status Submit
          </button>
          <button
            onClick={exportRekapResmi}
            disabled={completeFiltered.length === 0}
            className="text-xs text-white bg-blue rounded-xl px-3 py-2 font-semibold disabled:opacity-40"
            title="Hanya untuk periode satu bulan"
          >
            ⬇ Rekapan BOSP Resmi
          </button>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">Memuat data...</div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
              <div className="flex justify-between items-baseline flex-wrap gap-1 mb-3">
                <div className="font-extrabold text-ink">Status submit</div>
                <div className="text-sm text-inksoft">
                  <span className="font-mono font-bold text-ink">{filtered.length}</span>
                  {roster.length ? ` dari ${roster.length}` : ""} sekolah sudah submit
                  {roster.length ? (
                    <>
                      {" · "}
                      <span className={`font-semibold ${belum.length ? "text-red" : "text-green"}`}>{belum.length} belum</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_80px_80px] text-[11px] text-inksoft uppercase pb-1 border-b border-border">
                <span>Jenjang</span>
                <span className="text-right">Sudah</span>
                <span className="text-right">Belum</span>
              </div>
              {jenjangGroups.map((jg) => (
                <div key={jg.jenjang}>
                  <div
                    onClick={() => setExpandedJenjang((j) => (j === jg.jenjang ? null : jg.jenjang))}
                    className="grid grid-cols-[minmax(0,1fr)_80px_80px] items-center text-[13px] py-2 border-b border-border last:border-0 cursor-pointer hover:bg-paper"
                  >
                    <span className="font-semibold text-ink flex items-center gap-1">
                      <span className="text-inksoft text-xs">{expandedJenjang === jg.jenjang ? "▾" : "▸"}</span>
                      {jg.jenjang}
                    </span>
                    <span className="text-right font-mono text-green">
                      {jg.schools.length}
                      {jg.rosterCount ? <span className="text-inksoft"> / {jg.rosterCount}</span> : null}
                    </span>
                    <span className={`text-right font-mono font-semibold ${jg.belum.length ? "text-red" : "text-green"}`}>
                      {jg.rosterCount ? jg.belum.length : "–"}
                    </span>
                  </div>
                  {expandedJenjang === jg.jenjang && (
                    <div className="pb-3 pl-4 pr-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-green mb-1.5">Sudah submit ({jg.schools.length})</div>
                        {jg.schools.length === 0 ? (
                          <div className="text-xs text-inksoft">Belum ada.</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {[...jg.schools]
                              .sort((x, y) => (x.nama_sekolah || "").localeCompare(y.nama_sekolah || ""))
                              .map((sc) => (
                                <div key={sc.npsn} className="text-xs text-ink bg-green/5 rounded px-2 py-1">{sc.nama_sekolah}</div>
                              ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-red mb-1.5">Belum submit ({jg.belum.length})</div>
                        {!jg.rosterCount ? (
                          <div className="text-xs text-inksoft">Daftar sekolah jenjang ini belum diisi.</div>
                        ) : jg.belum.length === 0 ? (
                          <div className="text-xs text-inksoft">Semua sudah submit. 🎉</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {[...jg.belum]
                              .sort((x, y) => (x.nama || "").localeCompare(y.nama || ""))
                              .map((sc) => (
                                <div key={sc.npsn} className="text-xs text-ink bg-red/5 rounded px-2 py-1">{sc.nama}</div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="font-extrabold text-ink">Saldo R.Koran</div>
                  <div className="text-xs text-inksoft">Otomatis terisi saat bendahara mengisi di halaman upload — menu ini untuk koreksi manual kalau diperlukan.</div>
                </div>
                {period?.type === "month" && (
                  <button onClick={() => setEditingRkoran((v) => !v)} className="text-xs border border-border rounded-xl px-3 py-1.5 text-inksoft shrink-0">
                    {editingRkoran ? "Batal" : "Kelola"}
                  </button>
                )}
              </div>
              {period?.type !== "month" ? (
                <div className="text-sm text-inksoft">Pilih periode satu bulan untuk mengisi Saldo R.Koran.</div>
              ) : editingRkoran ? (
                <div>
                  <div className="text-xs text-inksoft mb-2">Satu sekolah per baris: <code className="font-mono">NPSN|Saldo R.Koran</code></div>
                  <textarea
                    value={rkoranText}
                    onChange={(e) => setRkoranText(e.target.value)}
                    rows={8}
                    className="w-full font-mono text-xs border border-border rounded-xl p-2"
                    placeholder={"50104137|16215000"}
                  />
                  {rkoranMsg && <div className="text-sm text-inksoft mt-2">{rkoranMsg}</div>}
                  <button onClick={saveRkoran} disabled={rkoranSaving} className="mt-2 bg-ink text-white rounded-xl px-4 py-2 text-sm font-semibold">
                    {rkoranSaving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-inksoft">{Object.keys(rkoranMap).length} sekolah sudah diisi untuk periode ini.</div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-extrabold text-ink">Daftar sekolah & PIN</div>
                <button onClick={() => setEditingRoster((v) => !v)} className="text-xs border border-border rounded-xl px-3 py-1.5 text-inksoft">
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
                    className="w-full font-mono text-xs border border-border rounded-xl p-2"
                    placeholder={"50104137|SD NEGERI 1 CONTOH|SD|123456"}
                  />
                  {rosterMsg && <div className="text-sm text-inksoft mt-2">{rosterMsg}</div>}
                  <button onClick={saveRoster} disabled={rosterSaving} className="mt-2 bg-ink text-white rounded-xl px-4 py-2 text-sm font-semibold">
                    {rosterSaving ? "Menyimpan..." : "Simpan daftar"}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-inksoft">{roster.length} sekolah terdaftar.</div>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              {[{ id: "saldo", label: "Saldo per sekolah" }, { id: "sekolah", label: "Klasifikasi belanja" }, { id: "kode", label: "Rincian per kode rekening" }].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={`text-xs font-semibold rounded-xl px-3 py-1.5 border ${view === t.id ? "bg-ink text-white border-ink" : "border-border text-inksoft"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {view === "saldo"
              ? saldoGroups.map((sg) => (
                  <div key={sg.jenjang} className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                    <div className="font-extrabold text-ink mb-3">
                      {sg.jenjang} <span className="text-xs font-normal text-inksoft">· {sg.rows.length} sekolah submit{sg.belum > 0 ? ` · ${sg.belum} belum` : ""}</span>
                    </div>
                    {sg.rows.length === 0 ? (
                      <div className="text-sm text-inksoft">Belum ada submisi {sg.jenjang} untuk periode ini.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="min-w-[710px]">
                          <div className="grid gap-x-2 grid-cols-[minmax(170px,1fr)_116px_116px_116px_116px_32px] text-[11px] text-inksoft uppercase pb-1 border-b border-border">
                            <span className="sticky left-0 bg-card">Sekolah</span>
                            <span className="text-right">Saldo awal</span>
                            <span className="text-right">Pendapatan</span>
                            <span className="text-right">Belanja</span>
                            <span className="text-right">Saldo akhir</span>
                            <span className="text-center">Cek</span>
                          </div>
                          {sg.rows.map(({ sch, r }) => {
                            const balance = Math.abs(r.selisih) <= 1;
                            return (
                              <div key={sch.npsn} className="grid gap-x-2 grid-cols-[minmax(170px,1fr)_116px_116px_116px_116px_32px] items-center text-[13px] py-2 border-b border-border">
                                <span className="sticky left-0 bg-card pr-2 text-ink">{sch.nama_sekolah} <span className="text-inksoft text-xs">({sch.npsn})</span></span>
                                <span className="text-right font-mono text-ink">{fmtAngka(r.saldoAwal)}{!r.dariDatabase && <span className="text-gold">*</span>}</span>
                                <span className="text-right font-mono text-green">{fmtAngka(r.pendapatan)}</span>
                                <span className="text-right font-mono text-red">{fmtAngka(r.belanja)}</span>
                                <span className="text-right font-mono font-semibold text-ink">{fmtAngka(r.saldoAkhir)}</span>
                                <span
                                  className={`text-center ${!sch.integrity_ok ? "text-red" : balance ? "text-green" : "text-gold"}`}
                                  title={
                                    !sch.integrity_ok
                                      ? "Data BKU tidak terverifikasi — minta sekolah upload ulang."
                                      : balance
                                      ? "Saldo awal + pendapatan − belanja = saldo akhir."
                                      : `Saldo awal + pendapatan − belanja berbeda Rp ${fmtAngka(r.selisih)} dari saldo akhir (mis. bunga bank bersih atau penerimaan lain).`
                                  }
                                >
                                  {!sch.integrity_ok ? "!" : balance ? "✓" : "≠"}
                                </span>
                              </div>
                            );
                          })}
                          <div className="grid gap-x-2 grid-cols-[minmax(170px,1fr)_116px_116px_116px_116px_32px] items-center text-[13px] py-2 font-bold bg-paper">
                            <span className="sticky left-0 bg-paper pl-1 text-ink">Total {sg.jenjang}</span>
                            <span className="text-right font-mono text-ink">{fmtAngka(sg.tot.saldoAwal)}</span>
                            <span className="text-right font-mono text-green">{fmtAngka(sg.tot.pendapatan)}</span>
                            <span className="text-right font-mono text-red">{fmtAngka(sg.tot.belanja)}</span>
                            <span className="text-right font-mono text-ink">{fmtAngka(sg.tot.saldoAkhir)}</span>
                            <span />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              : view === "sekolah"
              ? jenjangGroups.map((jg) => {
                  const rows = [...jg.schools].sort((x, y) => (x.nama_sekolah || "").localeCompare(y.nama_sekolah || ""));
                  const COLS = "grid-cols-[minmax(170px,1fr)_104px_104px_104px_104px_32px]";
                  const total = (k) => rows.reduce((acc, x) => acc + (x.totals?.[k] || 0), 0);
                  const totalSemua = (x) => (x.totals?.totalModalPeralatanMesin || 0) + (x.totals?.totalModalAsetLainnya || 0) + (x.totals?.totalBarangJasa || 0);
                  return (
                    <div key={jg.jenjang} className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                      <div className="font-extrabold text-ink mb-3">
                        {jg.jenjang} <span className="text-xs font-normal text-inksoft">· {rows.length} sekolah submit</span>
                      </div>
                      {rows.length === 0 ? (
                        <div className="text-sm text-inksoft">Belum ada submisi {jg.jenjang} untuk periode ini.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <div className="min-w-[660px]">
                            <div className={`grid gap-x-2 ${COLS} text-[11px] text-inksoft uppercase pb-1 border-b border-border`}>
                              <span className="sticky left-0 bg-card">Sekolah</span>
                              <span className="text-right">Modal-PM</span>
                              <span className="text-right">Modal-ATL</span>
                              <span className="text-right">Barang & jasa</span>
                              <span className="text-right">Total</span>
                              <span className="text-center">Valid</span>
                            </div>
                            {rows.map((sc) => (
                              <div key={sc.npsn}>
                                <div
                                  onClick={() => setExpandedRow((r) => (r === sc.npsn ? null : sc.npsn))}
                                  className={`group grid gap-x-2 ${COLS} items-center text-[13px] py-2 border-b border-border cursor-pointer hover:bg-paper`}
                                >
                                  <span className="sticky left-0 bg-card group-hover:bg-paper pr-2 text-ink">
                                    <span className="text-inksoft text-xs">{expandedRow === sc.npsn ? "▾" : "▸"}</span> {sc.nama_sekolah}{" "}
                                    <span className="text-inksoft text-xs">({sc.npsn})</span>
                                  </span>
                                  <span className="text-right font-mono text-gold">{fmtAngka(sc.totals?.totalModalPeralatanMesin)}</span>
                                  <span className="text-right font-mono text-blue">{fmtAngka(sc.totals?.totalModalAsetLainnya)}</span>
                                  <span className="text-right font-mono text-green">{fmtAngka(sc.totals?.totalBarangJasa)}</span>
                                  <span className="text-right font-mono font-semibold text-ink">{fmtAngka(totalSemua(sc))}</span>
                                  <span
                                    className={`text-center ${sc.integrity_ok ? "text-green" : "text-red"}`}
                                    title={sc.integrity_ok ? "Data BKU terverifikasi." : "Data BKU tidak terverifikasi — minta sekolah upload ulang."}
                                  >
                                    {sc.integrity_ok ? "✓" : "!"}
                                  </span>
                                </div>
                                {expandedRow === sc.npsn && (
                                  <div className="pl-4 pr-1 py-2 text-xs text-inksoft border-b border-border bg-paper">
                                    {(sc.rincian || []).length === 0 ? (
                                      <div>Tidak ada belanja terklasifikasi.</div>
                                    ) : (
                                      (sc.rincian || []).map((g) => (
                                        <div key={g.kode} className="py-1 border-b border-border last:border-0">
                                          <div className="flex justify-between gap-3">
                                            <span className="font-mono text-ink">
                                              {g.kode} <span className={CATEGORY_TW[g.kategori]}>— {CATEGORY_LABEL[g.kategori]}</span>
                                            </span>
                                            <span className="font-mono font-semibold text-ink shrink-0">{fmtAngka(g.total)}</span>
                                          </div>
                                          <div className="mt-0.5">{g.uraian || "Uraian tidak ditemukan"}</div>
                                        </div>
                                      ))
                                    )}
                                    <div className="mt-2">
                                      Bulan: {(sc.bulanList || []).join(", ")} · terakhir dikirim {new Date(sc.submitted_at).toLocaleString("id-ID")}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                            <div className={`grid gap-x-2 ${COLS} items-center text-[13px] py-2 font-bold bg-paper`}>
                              <span className="sticky left-0 bg-paper pl-1 text-ink">Total {jg.jenjang}</span>
                              <span className="text-right font-mono text-gold">{fmtAngka(total("totalModalPeralatanMesin"))}</span>
                              <span className="text-right font-mono text-blue">{fmtAngka(total("totalModalAsetLainnya"))}</span>
                              <span className="text-right font-mono text-green">{fmtAngka(total("totalBarangJasa"))}</span>
                              <span className="text-right font-mono text-ink">
                                {fmtAngka(rows.reduce((acc, x) => acc + totalSemua(x), 0))}
                              </span>
                              <span />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              : jenjangGroups.map((jg) => {
                  const kodeRincian = buildKodeAgg(jg.schools);
                  const COLS = "grid-cols-[152px_minmax(200px,1fr)_96px_60px_112px]";
                  const KAT_SHORT = {
                    modal_peralatan_mesin: "Modal-PM",
                    modal_aset_lainnya: "Modal-ATL",
                    barang_jasa: "Barang & jasa",
                    tak_terklasifikasi: "Tak terklasifikasi",
                  };
                  return (
                    <div key={jg.jenjang} className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                      <div className="font-extrabold text-ink mb-3">
                        {jg.jenjang} <span className="text-xs font-normal text-inksoft">· {kodeRincian.length} kode rekening</span>
                      </div>
                      {kodeRincian.length === 0 ? (
                        <div className="text-sm text-inksoft">Belum ada submisi {jg.jenjang} untuk periode ini.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <div className="min-w-[660px]">
                            <div className={`grid gap-x-2 ${COLS} text-[11px] text-inksoft uppercase pb-1 border-b border-border`}>
                              <span className="sticky left-0 bg-card">Kode rekening</span>
                              <span>Uraian</span>
                              <span>Kategori</span>
                              <span className="text-right">Sekolah</span>
                              <span className="text-right">Total (Rp)</span>
                            </div>
                            {kodeRincian.map((g) => (
                              <div key={g.kode} className={`grid gap-x-2 ${COLS} items-start text-[13px] py-2 border-b border-border`}>
                                <span className="sticky left-0 bg-card pr-2 font-mono text-ink">{g.kode}</span>
                                <span className="text-inksoft text-xs pr-3 pt-0.5">{g.uraian || "(uraian tidak ditemukan)"}</span>
                                <span className={`text-xs font-semibold pt-0.5 ${CATEGORY_TW[g.kategori]}`}>{KAT_SHORT[g.kategori] || g.kategori}</span>
                                <span className="text-right text-inksoft text-xs pt-0.5">{g.jumlahSekolah}</span>
                                <span className="text-right font-mono font-semibold text-ink">{fmtAngka(g.total)}</span>
                              </div>
                            ))}
                            <div className={`grid gap-x-2 ${COLS} items-center text-[13px] py-2 font-bold bg-paper`}>
                              <span className="sticky left-0 bg-paper pl-1 text-ink">Total {jg.jenjang}</span>
                              <span />
                              <span />
                              <span />
                              <span className="text-right font-mono text-ink">{fmtAngka(kodeRincian.reduce((acc, g) => acc + g.total, 0))}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            {view === "sekolah" && (
              <div className="text-[11px] text-inksoft mb-6">Semua angka dalam rupiah.</div>
            )}
            {view === "saldo" && (
              <div className="text-[11px] text-inksoft mb-6">
                Semua angka dalam rupiah. Belanja = belanja bersih setelah koreksi pengembalian. Pendapatan hanya dari Terima Dana BOSP (PPh, PPN, SIPLah, bunga bank tidak dihitung).{" "}
                <span className="text-gold">*</span> = saldo awal sekolah ini belum diisi di database, jadi dibaca dari file BKU.
              </div>
            )}
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
