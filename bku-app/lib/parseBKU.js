import REKENING_MAP from "./rekeningMap.json";

export const CATEGORY_LABEL = {
  modal: "Belanja modal",
  barang_jasa: "Belanja barang & jasa",
  tak_terklasifikasi: "Perlu diperiksa",
};

export const CATEGORY_COLOR = {
  modal: "gold",
  barang_jasa: "green",
  tak_terklasifikasi: "red",
};

export function classifyKode(kode) {
  if (!kode) return "tak_terklasifikasi";
  const k = kode.trim();
  if (k.startsWith("5.2")) return "modal";
  if (k.startsWith("5.1")) return "barang_jasa";
  return "tak_terklasifikasi";
}

// Look up the official BAS description for a kode rekening. Tries the
// exact code first, then progressively shorter parent segments (the
// reference table also has entries at the group/sub-group level), so a
// code missing from the sheet still resolves to its nearest parent.
export function getUraian(kode) {
  if (!kode) return null;
  if (REKENING_MAP[kode]) return REKENING_MAP[kode];
  const parts = kode.split(".");
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join(".");
    if (REKENING_MAP[prefix]) return REKENING_MAP[prefix];
  }
  return null;
}

function isSiplahPassthrough(uraian) {
  if (!uraian) return false;
  const u = uraian.trim().toLowerCase();
  return (u.startsWith("terima") || u.startsWith("setor")) && u.includes("siplah");
}

function cellStr(v) {
  return v === undefined || v === null ? "" : String(v);
}

const HEADER_LABEL_MAP = {
  TANGGAL: "tanggal",
  "KODE KEGIATAN": "kodeKegiatan",
  "KODE REKENING": "kodeRekening",
  "NO. BUKTI": "noBukti",
  "NO BUKTI": "noBukti",
  URAIAN: "uraian",
  PENERIMAAN: "penerimaan",
  PENGELUARAN: "pengeluaran",
  SALDO: "saldo",
};

// Column positions in the BKU template shift between files (the merged
// title/NPSN block can be a different width per school), so instead of
// fixed indices we locate every column by matching the header row's own
// text labels. This is what keeps the parser working across schools.
function findHeaderInfo(rows) {
  let headerIdx = -1;
  let cols = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const rowCols = {};
    let hits = 0;
    for (let c = 0; c < r.length; c++) {
      const label = cellStr(r[c]).trim().toUpperCase();
      if (HEADER_LABEL_MAP[label]) {
        rowCols[HEADER_LABEL_MAP[label]] = c;
        hits++;
      }
    }
    if (hits >= 5) {
      headerIdx = i;
      cols = rowCols;
      break;
    }
  }
  return { headerIdx, cols };
}

export function parseBKU(rows) {
  const errors = [];
  let npsn = "";
  let namaSekolah = "";
  let alamat = "";
  let bulan = "";
  let tahun = "";

  const row0 = rows[0] || [];
  for (const v of row0) {
    const s = cellStr(v);
    if (!npsn && /NPSN/i.test(s)) {
      const m = s.match(/(\d{6,10})/);
      if (m) npsn = m[1];
    }
    const bm = s.match(/BULAN\s*:\s*([A-Z]+)/i);
    const tm = s.match(/TAHUN\s*:\s*(\d{4})/i);
    if (bm) bulan = bm[1].toUpperCase();
    if (tm) tahun = tm[1];
  }

  let valueCellLines = null;
  let valueCellNpsnLineIdx = -1;
  if (!npsn) {
    outerNpsn: for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i] || [];
      for (let c = 0; c < r.length; c++) {
        const s = cellStr(r[c]);
        if (!s) continue;
        const lines = s.split("\n");
        for (let li = 0; li < lines.length; li++) {
          const m = lines[li].match(/^[.:\s]*(\d{6,10})\s*$/);
          if (m) {
            npsn = m[1];
            valueCellLines = lines;
            valueCellNpsnLineIdx = li;
            break outerNpsn;
          }
        }
      }
    }
  }

  outer: for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      const s = cellStr(r[c]);
      if (!s) continue;
      for (const line of s.split("\n")) {
        const m = line.match(/Nama Sekolah\s*:\s*(.+)/i);
        if (m && m[1].trim()) {
          namaSekolah = m[1].trim();
          break outer;
        }
      }
    }
  }
  if (!namaSekolah && valueCellLines && valueCellLines[valueCellNpsnLineIdx + 1]) {
    namaSekolah = valueCellLines[valueCellNpsnLineIdx + 1].replace(/^[.:\s]+/, "").trim();
    alamat = valueCellLines
      .slice(valueCellNpsnLineIdx + 2)
      .map((l) => l.replace(/^[.:\s]+/, "").trim())
      .filter((l) => l && !/Sumber Dana/i.test(l))
      .join(", ");
  }
  if (!namaSekolah) {
    let namaRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const r = rows[i] || [];
      if (r.some((v) => /Nama Sekolah/i.test(cellStr(v)))) {
        namaRowIdx = i;
        break;
      }
    }
    if (namaRowIdx >= 0) {
      const r = rows[namaRowIdx];
      for (let c = 0; c < r.length; c++) {
        const s = cellStr(r[c]);
        if (!s.trim() || /Nama Sekolah/i.test(s)) continue;
        const parts = s.split("\n").map((p) => p.replace(/^:\s*/, "").trim());
        namaSekolah = parts[0] || "";
        alamat = parts.slice(1).filter(Boolean).join(", ");
        break;
      }
    }
  }
  if (!alamat) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i] || [];
      for (const v of r) {
        const s = cellStr(v);
        if (/Desa\/Kecamatan|Kabupaten|Provinsi/i.test(s) && !/Nama Sekolah\s*:/i.test(s)) {
          alamat = s
            .split("\n")
            .map((l) => l.replace(/^[A-Za-z /]+:\s*/, "").trim())
            .filter(Boolean)
            .join(", ");
          break;
        }
      }
      if (alamat) break;
    }
  }

  if (!npsn) errors.push("NPSN tidak ditemukan di file — periksa apakah format file sesuai template BKU standar.");
  if (!namaSekolah) errors.push("Nama sekolah tidak ditemukan di file.");
  if (!bulan || !tahun) errors.push("Bulan/tahun tidak terbaca dari judul file.");

  const { headerIdx, cols } = findHeaderInfo(rows);
  if (
    headerIdx === -1 ||
    cols.tanggal === undefined ||
    cols.kodeRekening === undefined ||
    cols.uraian === undefined ||
    cols.pengeluaran === undefined
  ) {
    errors.push("Baris header tabel (TANGGAL / KODE REKENING / URAIAN) tidak ditemukan atau tidak lengkap. File mungkin bukan format BKU standar.");
    return { npsn, namaSekolah, alamat, bulan, tahun, transaksi: [], rincian: [], totals: null, errors, ok: false };
  }

  const transaksi = [];
  let jumlahRow = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const colA = r[cols.tanggal];
    if (colA instanceof Date) {
      const kodeRaw = cellStr(r[cols.kodeRekening]);
      const kodeParts = kodeRaw.split("\n").map((p) => p.trim()).filter(Boolean);
      const kodeUtama = kodeParts.length > 1 ? kodeParts[0] + kodeParts[1] : kodeParts[0] || "";
      const uraian = cellStr(r[cols.uraian]).trim();
      const penerimaan = Number(r[cols.penerimaan]) || 0;
      const pengeluaran = Number(r[cols.pengeluaran]) || 0;
      const excluded = isSiplahPassthrough(uraian) || !kodeUtama;
      const kategori = excluded ? null : classifyKode(kodeUtama);
      transaksi.push({
        tanggal: colA,
        kodeKegiatan: cellStr(r[cols.kodeKegiatan]).trim(),
        kodeRekening: kodeUtama,
        noBukti: cellStr(r[cols.noBukti]).trim(),
        uraian,
        penerimaan,
        pengeluaran,
        excluded,
        excludedReason: isSiplahPassthrough(uraian)
          ? "Transaksi pass-through SIPLah (diabaikan)"
          : !kodeUtama
          ? "Bukan transaksi belanja (saldo/bunga bank)"
          : null,
        kategori,
      });
    } else {
      const jumlahCellRaw = r.find((v) => /^Jumlah\b/i.test(cellStr(v).trim()));
      if (jumlahCellRaw !== undefined) {
        let penerimaan = Number(r[cols.penerimaan]) || 0;
        let pengeluaran = Number(r[cols.pengeluaran]) || 0;
        let saldo = Number(r[cols.saldo]) || 0;
        if (!penerimaan && !pengeluaran && !saldo) {
          const nums = cellStr(jumlahCellRaw).match(/\d{1,3}(?:\.\d{3})+/g);
          if (nums && nums.length >= 3) {
            penerimaan = Number(nums[0].replace(/\./g, ""));
            pengeluaran = Number(nums[1].replace(/\./g, ""));
            saldo = Number(nums[2].replace(/\./g, ""));
          }
        }
        jumlahRow = { penerimaan, pengeluaran, saldo };
        break;
      }
    }
  }

  if (!jumlahRow) {
    errors.push("Baris 'Jumlah' total tidak ditemukan — validasi total tidak bisa dilakukan.");
  }

  const sumAllPengeluaran = transaksi.reduce((s, t) => s + t.pengeluaran, 0);
  const sumAllPenerimaan = transaksi.reduce((s, t) => s + t.penerimaan, 0);
  const integrityOk = jumlahRow
    ? Math.abs(sumAllPengeluaran - jumlahRow.pengeluaran) < 1 && Math.abs(sumAllPenerimaan - jumlahRow.penerimaan) < 1
    : false;

  const groups = {};
  for (const t of transaksi) {
    if (t.excluded || t.pengeluaran <= 0) continue;
    if (!groups[t.kodeRekening]) {
      groups[t.kodeRekening] = {
        kode: t.kodeRekening,
        kategori: t.kategori,
        uraian: getUraian(t.kodeRekening),
        jumlahTransaksi: 0,
        total: 0,
      };
    }
    groups[t.kodeRekening].jumlahTransaksi += 1;
    groups[t.kodeRekening].total += t.pengeluaran;
  }
  const rincian = Object.values(groups).sort((a, b) => b.total - a.total);

  const totalModal = rincian.filter((g) => g.kategori === "modal").reduce((s, g) => s + g.total, 0);
  const totalBarangJasa = rincian.filter((g) => g.kategori === "barang_jasa").reduce((s, g) => s + g.total, 0);
  const totalTakTerklasifikasi = rincian.filter((g) => g.kategori === "tak_terklasifikasi").reduce((s, g) => s + g.total, 0);
  const totalSiplahPassthrough = transaksi
    .filter((t) => isSiplahPassthrough(t.uraian) && t.pengeluaran > 0)
    .reduce((s, t) => s + t.pengeluaran, 0);

  return {
    npsn,
    namaSekolah,
    alamat,
    bulan,
    tahun,
    transaksi,
    rincian,
    totals: {
      totalModal,
      totalBarangJasa,
      totalTakTerklasifikasi,
      totalSiplahPassthrough,
      totalBelanjaTerklasifikasi: totalModal + totalBarangJasa + totalTakTerklasifikasi,
      totalPengeluaranFile: jumlahRow ? jumlahRow.pengeluaran : null,
      totalPenerimaanFile: jumlahRow ? jumlahRow.penerimaan : null,
      saldoAkhirFile: jumlahRow ? jumlahRow.saldo : null,
      sumAllPengeluaran,
      sumAllPenerimaan,
    },
    integrityOk,
    errors,
    ok: errors.length === 0,
  };
}
