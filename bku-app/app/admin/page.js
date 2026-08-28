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

    a.pendapatan += s.totals?.pendapatan || 0;
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
  const [view, setView] = useState("sekolah");
  const [rkoranMap, setRkoranMap] = useState({});
  const [rkoranText, setRkoranText] = useState("");
  const [editingRkoran, setEditingRkoran] = useState(false);
  const [rkoranSaving, setRkoranSaving] = useState(false);
  const [rkoranMsg, setRkoranMsg] = useState("");

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
  // BOSP Reguler and BOSP Kinerja spending separate (as their own belanja
  // columns) while combining saldo/pendapatan across both — matching the
  // official "Rekapan BOSP" report layout used by the dinas.
  function buildOfficialRecap(subsForJenjang) {
    const bySchool = {};
    for (const s of subsForJenjang) {
      if (!bySchool[s.npsn]) bySchool[s.npsn] = { npsn: s.npsn, nama_sekolah: s.nama_sekolah, subs: [] };
      bySchool[s.npsn].subs.push(s);
    }
    const sum = (arr, get) => arr.reduce((acc, s) => acc + (get(s.totals || {}) || 0), 0);
    return Object.values(bySchool)
      .map(({ npsn, nama_sekolah, subs }) => {
        const reguler = subs.filter((s) => (s.sumber_dana || "REGULER") === "REGULER");
        const kinerja = subs.filter((s) => s.sumber_dana === "KINERJA");
        const regulerBJ = sum(reguler, (t) => t.totalBarangJasa);
        const regulerPM = sum(reguler, (t) => t.totalModalPeralatanMesin);
        const regulerATL = sum(reguler, (t) => t.totalModalAsetLainnya);
        const kinerjaBJ = sum(kinerja, (t) => t.totalBarangJasa);
        const kinerjaPM = sum(kinerja, (t) => t.totalModalPeralatanMesin);
        const kinerjaATL = sum(kinerja, (t) => t.totalModalAsetLainnya);
        return {
          npsn,
          nama_sekolah,
          saldoAwalBank: sum(subs, (t) => t.saldoAwalBank),
          saldoAwalTunai: sum(subs, (t) => t.saldoAwalTunai),
          pencairanBosp: sum(subs, (t) => t.pencairanBosp),
          bungaBank: sum(subs, (t) => t.bungaBank),
          potonganPajak: sum(subs, (t) => t.potonganPajak),
          pendapatanLain: sum(subs, (t) => t.pendapatanLain),
          jumlahPendapatan: sum(subs, (t) => t.jumlahPendapatanLengkap),
          regulerBJ,
          regulerPM,
          regulerATL,
          regulerJumlah: regulerBJ + regulerPM + regulerATL,
          kinerjaBJ,
          kinerjaPM,
          kinerjaATL,
          kinerjaJumlah: kinerjaBJ + kinerjaPM + kinerjaATL,
          sisaSaldoBKU: sum(subs, (t) => t.saldoAkhir),
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
    const wb = XLSX.utils.book_new();
    for (const jenjang of JENJANG_ORDER) {
      const subsForJenjang = completeFiltered.filter((s) => jenjangOf(s) === jenjang);
      const recap = buildOfficialRecap(subsForJenjang);

      const title = `REKAPAN BOSP JENJANG ${jenjang === "TK/PAUD" ? "TK/PAUD" : jenjang} SE-KABUPATEN GIANYAR ${periodLabel(activePeriod).toUpperCase()}`;
      const headerRow1 = [title];
      const headerRow2 = ["No", "Nama Sekolah", "Saldo Awal", "", "Penambahan", "", "", "", "", "BOSP REGULER", "", "", "", "BOSP KINERJA", "", "", "", "Saldo Akhir", "", ""];
      const headerRow3 = [
        "", "", "Saldo di Arkas", "Tunai",
        "Pencairan Dana BOSP", "Bunga Bank/Jasa Giro", "Potongan dan Pungutan Pajak", "Pendapatan Lain-lain", "Jumlah Pendapatan",
        "Belanja Barang dan Jasa", "Belanja Modal", "", "Jumlah Belanja BOSP REGULER",
        "Belanja Barang dan Jasa", "Belanja Modal", "", "Jumlah Belanja BOSP KINERJA",
        "Sisa Saldo Buku Kas Umum", "Saldo R.Koran", "Selisih",
      ];
      const headerRow4 = ["", "", "", "", "", "", "", "", "", "", "Peralatan Mesin", "Aset Tetap Lainnya", "", "", "Peralatan Mesin", "Aset Tetap Lainnya", "", "", "", ""];

      const dataRows = recap.map((r, i) => {
        const rkoran = rkoranMap[r.npsn];
        return [
          i + 1,
          r.nama_sekolah,
          r.saldoAwalBank,
          r.saldoAwalTunai,
          r.pencairanBosp,
          r.bungaBank,
          r.potonganPajak,
          r.pendapatanLain,
          r.jumlahPendapatan,
          r.regulerBJ,
          r.regulerPM,
          r.regulerATL,
          r.regulerJumlah,
          r.kinerjaBJ,
          r.kinerjaPM,
          r.kinerjaATL,
          r.kinerjaJumlah,
          r.sisaSaldoBKU,
          rkoran ?? "",
          rkoran != null ? r.sisaSaldoBKU - rkoran : "",
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, headerRow3, headerRow4, ...dataRows]);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
        { s: { r: 1, c: 0 }, e: { r: 3, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 3, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
        { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
        { s: { r: 1, c: 4 }, e: { r: 1, c: 8 } },
        { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
        { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } },
        { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } },
        { s: { r: 2, c: 7 }, e: { r: 3, c: 7 } },
        { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } },
        { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },
        { s: { r: 2, c: 9 }, e: { r: 3, c: 9 } },
        { s: { r: 2, c: 10 }, e: { r: 2, c: 11 } },
        { s: { r: 2, c: 12 }, e: { r: 3, c: 12 } },
        { s: { r: 1, c: 13 }, e: { r: 1, c: 16 } },
        { s: { r: 2, c: 13 }, e: { r: 3, c: 13 } },
        { s: { r: 2, c: 14 }, e: { r: 2, c: 15 } },
        { s: { r: 2, c: 16 }, e: { r: 3, c: 16 } },
        { s: { r: 1, c: 17 }, e: { r: 1, c: 19 } },
        { s: { r: 2, c: 17 }, e: { r: 3, c: 17 } },
        { s: { r: 2, c: 18 }, e: { r: 3, c: 18 } },
        { s: { r: 2, c: 19 }, e: { r: 3, c: 19 } },
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
            s.totals?.pendapatan ?? 0,
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
            <p className="text-xs text-inksoft">Klasifikasi belanja BKU — TK/PAUD, SD, SMP</p>
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
            <div className="flex gap-3 mb-4 flex-wrap">
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Sekolah submit</div>
                <div className="font-mono text-lg font-bold text-ink">{filtered.length}{roster.length ? ` / ${roster.length}` : ""}</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Modal - Peralatan & Mesin</div>
                <div className="font-mono text-lg font-bold text-gold">{fmtRp(totalModalPeralatanMesin)}</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Modal - Aset Tetap Lainnya</div>
                <div className="font-mono text-lg font-bold text-blue">{fmtRp(totalModalAsetLainnya)}</div>
              </div>
              <div className="flex-1 min-w-[140px] bg-card border border-border rounded-2xl shadow-sm p-4">
                <div className="text-xs text-inksoft uppercase mb-1">Total belanja barang & jasa</div>
                <div className="font-mono text-lg font-bold text-green">{fmtRp(totalBarangJasa)}</div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
              <div className="font-extrabold text-ink mb-3">Ringkasan per jenjang</div>
              <div className="grid grid-cols-[1fr_70px_110px_110px_110px_70px] text-xs text-inksoft uppercase pb-2 border-b border-border">
                <span>Jenjang</span><span className="text-right">Sekolah</span><span className="text-right">Modal-PM</span><span className="text-right">Modal-ATL</span><span className="text-right">Barang & jasa</span><span className="text-right">Belum</span>
              </div>
              {jenjangGroups.map((jg) => (
                <div key={jg.jenjang}>
                  <div
                    onClick={() => setExpandedJenjang((j) => (j === jg.jenjang ? null : jg.jenjang))}
                    className="grid grid-cols-[1fr_70px_110px_110px_110px_70px] items-center text-sm py-2 border-b border-border last:border-0 cursor-pointer hover:bg-paper"
                  >
                    <span className="font-semibold text-ink flex items-center gap-1">
                      <span className="text-inksoft text-xs">{expandedJenjang === jg.jenjang ? "▾" : "▸"}</span>
                      {jg.jenjang}
                    </span>
                    <span className="text-right text-inksoft">{jg.schools.length}{jg.rosterCount ? ` / ${jg.rosterCount}` : ""}</span>
                    <span className="text-right font-mono text-gold">{fmtRp(jg.totalModalPeralatanMesin)}</span>
                    <span className="text-right font-mono text-blue">{fmtRp(jg.totalModalAsetLainnya)}</span>
                    <span className="text-right font-mono text-green">{fmtRp(jg.totalBarangJasa)}</span>
                    <span className={`text-right font-semibold ${jg.belum.length ? "text-red" : "text-green"}`}>{jg.rosterCount ? jg.belum.length : "–"}</span>
                  </div>
                  {expandedJenjang === jg.jenjang && (
                    <div className="pb-3 pl-4 pr-1 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-green mb-1.5">Sudah submit ({jg.schools.length})</div>
                        {jg.schools.length === 0 ? (
                          <div className="text-xs text-inksoft">Belum ada.</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {jg.schools
                              .sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || ""))
                              .map((s) => (
                                <div key={s.npsn} className="text-xs text-ink bg-green/5 rounded px-2 py-1">{s.nama_sekolah}</div>
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
                            {jg.belum
                              .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""))
                              .map((s) => (
                                <div key={s.npsn} className="text-xs text-ink bg-red/5 rounded px-2 py-1">{s.nama}</div>
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
                  <div className="text-xs text-inksoft">Diisi manual dari rekening koran bank — dipakai untuk hitung Selisih di Rekapan BOSP Resmi.</div>
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
              {[{ id: "sekolah", label: "Per sekolah" }, { id: "kode", label: "Rincian per kode rekening" }].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={`text-xs font-semibold rounded-xl px-3 py-1.5 border ${view === t.id ? "bg-ink text-white border-ink" : "border-border text-inksoft"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {view === "sekolah"
              ? jenjangGroups.map((jg) => (
                  <div key={jg.jenjang} className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                    <div className="font-extrabold text-ink mb-3">{jg.jenjang} <span className="text-xs font-normal text-inksoft">· {jg.schools.length} sekolah submit</span></div>
                    {jg.schools.length === 0 ? (
                      <div className="text-sm text-inksoft">Belum ada submisi {jg.jenjang} untuk periode ini.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_95px_95px_95px_60px] text-[11px] text-inksoft uppercase pb-1 border-b border-border">
                          <span>Sekolah</span><span className="text-right">Modal-PM</span><span className="text-right">Modal-ATL</span><span className="text-right">Barang & jasa</span><span className="text-right">Valid</span>
                        </div>
                      {jg.schools.sort((a, b) => (a.nama_sekolah || "").localeCompare(b.nama_sekolah || "")).map((s) => (
                        <div key={s.npsn}>
                          <div
                            onClick={() => setExpandedRow((r) => (r === s.npsn ? null : s.npsn))}
                            className="grid grid-cols-[1fr_95px_95px_95px_60px] items-center text-sm py-2 border-b border-border cursor-pointer"
                          >
                            <span className="text-ink">{s.nama_sekolah} <span className="text-inksoft text-xs">({s.npsn})</span></span>
                            <span className="text-right font-mono text-gold">{fmtRp(s.totals?.totalModalPeralatanMesin)}</span>
                            <span className="text-right font-mono text-blue">{fmtRp(s.totals?.totalModalAsetLainnya)}</span>
                            <span className="text-right font-mono text-green">{fmtRp(s.totals?.totalBarangJasa)}</span>
                            <span className={`text-center ${s.integrity_ok ? "text-green" : "text-red"}`}>{s.integrity_ok ? "✓" : "!"}</span>
                          </div>
                          {expandedRow === s.npsn && (
                            <div className="pl-3 py-2 text-xs text-inksoft">
                              <div className="grid grid-cols-4 gap-2 mb-3 pb-3 border-b border-border">
                                <div>
                                  <div className="text-[10px] uppercase">Saldo Awal</div>
                                  <div className="font-mono font-semibold text-ink">{fmtRp(s.totals?.saldoAwal)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase">Pendapatan</div>
                                  <div className="font-mono font-semibold text-green">+{fmtRp(s.totals?.pendapatan)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase">Belanja</div>
                                  <div className="font-mono font-semibold text-red">-{fmtRp(s.totals?.belanjaTotal)}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase">Saldo Akhir</div>
                                  <div className="font-mono font-semibold text-ink">{fmtRp(s.totals?.saldoAkhir)}</div>
                                </div>
                              </div>
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
                      ))}
                      </>
                    )}
                  </div>
                ))
              : jenjangGroups.map((jg) => {
                  const kodeRincian = buildKodeAgg(jg.schools);
                  return (
                    <div key={jg.jenjang} className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-4">
                      <div className="font-extrabold text-ink mb-3">{jg.jenjang}</div>
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
