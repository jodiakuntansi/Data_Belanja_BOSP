from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import re
import pdfplumber


def extract_header(text):
    npsn = ""
    nama = ""
    alamat_parts = []
    bulan = ""
    tahun = ""
    sumber_dana_raw = ""
    sumber_dana = "REGULER"

    m = re.search(r"NPSN\s*:\s*(\d{6,10})", text)
    if m:
        npsn = m.group(1)

    m = re.search(r"Nama Sekolah\s*:\s*(.+)", text)
    if m:
        nama = m.group(1).strip()

    for label in [r"Desa/Kecamatan", r"Kabupaten\s*/\s*Kota", r"Provinsi"]:
        m = re.search(label + r"\s*:\s*(.+)", text)
        if m:
            val = m.group(1).strip()
            if val:
                alamat_parts.append(val)

    m = re.search(r"BULAN\s*:\s*([A-Za-z]+)", text, re.I)
    if m:
        bulan = m.group(1).upper()

    m = re.search(r"TAHUN\s*:\s*(\d{4})", text, re.I)
    if m:
        tahun = m.group(1)

    m = re.search(r"Sumber Dana\s*:\s*(.+)", text, re.I)
    if m:
        sumber_dana_raw = m.group(1).strip()
        sumber_dana = "KINERJA" if re.search(r"kinerja", sumber_dana_raw, re.I) else "REGULER"

    return npsn, nama, ", ".join(alamat_parts), bulan, tahun, sumber_dana, sumber_dana_raw


def extract_pdf(pdf_bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if len(pdf.pages) == 0:
            return {"error": "PDF tidak berisi halaman."}

        first_text = pdf.pages[0].extract_text() or ""
        npsn, nama, alamat, bulan, tahun, sumber_dana, sumber_dana_raw = extract_header(first_text)

        # Grid-based extraction: pdfplumber detects the table using the
        # PDF's own drawn cell borders, so column assignment is exact —
        # not a positional guess. Every page's table(s) are concatenated;
        # repeated header/numbering rows on continuation pages are left
        # in place and safely ignored downstream (lib/parseBKU.js only
        # acts on rows that start with a real date or the "Jumlah" row).
        all_rows = []
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    all_rows.append([(cell if cell is not None else "") for cell in row])

        return {
            "npsn": npsn,
            "namaSekolah": nama,
            "alamat": alamat,
            "bulan": bulan,
            "tahun": tahun,
            "sumberDana": sumber_dana,
            "sumberDanaRaw": sumber_dana_raw,
            "rows": all_rows,
        }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            pdf_bytes = base64.b64decode(data["file"])
            result = extract_pdf(pdf_bytes)
            status = 400 if "error" in result else 200
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
