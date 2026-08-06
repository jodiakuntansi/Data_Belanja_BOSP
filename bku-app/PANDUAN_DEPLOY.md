# Panduan Deploy — Klasifikasi Belanja BKU

Panduan ini mengasumsikan Bapak/Ibu sudah punya akun Vercel dan Supabase, tapi belum pernah pakai keduanya. Ikuti urutan ini persis.

## Bagian 1 — Setup Database (Supabase)

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard), klik **New Project**.
2. Isi nama project (misal `klasifikasi-bku`), buat password database (simpan baik-baik, tapi tidak akan dipakai langsung di aplikasi ini), pilih region terdekat (Singapore), klik **Create new project**. Tunggu ~2 menit sampai selesai provisioning.
3. Setelah project siap, buka menu **SQL Editor** di sidebar kiri, klik **New query**.
4. Buka file `supabase_schema.sql` dari folder ini, salin **seluruh isinya**, tempel ke SQL Editor, lalu klik **Run**. Ini membuat 2 tabel: `sekolah` dan `submissions`.
5. Buka menu **Project Settings** (ikon gerigi) → **API**. Catat dua nilai ini, akan dipakai di Bagian 3:
   - **Project URL** (contoh: `https://xxxxx.supabase.co`)
   - **service_role key** (di bagian "Project API keys" — klik "Reveal" untuk melihatnya. **Bukan** yang `anon public`, harus yang `service_role`, karena ini dipakai server untuk baca/tulis data secara aman).

## Bagian 2 — Upload kode ke GitHub

1. Buka [github.com/new](https://github.com/new), buat repository baru (misal `klasifikasi-bku`), boleh **Private**. Jangan centang "Add README" (kita sudah punya file sendiri).
2. Di komputer Bapak/Ibu, buka folder `bku-app` hasil extract zip ini lewat terminal, lalu jalankan:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/klasifikasi-bku.git
   git push -u origin main
   ```
   (Ganti `USERNAME` dan nama repo sesuai punya Bapak/Ibu. Kalau belum pernah pakai `git` di komputer, GitHub akan menawarkan opsi upload file langsung lewat browser di halaman repo yang baru dibuat — itu juga bisa dipakai sebagai alternatif, tinggal drag-drop seluruh isi folder `bku-app`.)

## Bagian 3 — Deploy ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new), klik **Import** pada repository `klasifikasi-bku` yang baru dibuat (hubungkan akun GitHub dulu kalau diminta).
2. Di halaman konfigurasi sebelum deploy, buka bagian **Environment Variables**, tambahkan 3 baris ini (nilainya dari Bagian 1 & pilihan sendiri):
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | Project URL dari Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key dari Supabase |
   | `ADMIN_PASSWORD` | password bebas untuk login dinas, buat yang kuat |
3. Klik **Deploy**. Tunggu 1-2 menit. Setelah selesai, Vercel akan memberi alamat web publik seperti `https://klasifikasi-bku.vercel.app` — ini yang dibagikan ke semua sekolah.

## Bagian 4 — Isi daftar sekolah & PIN

1. Buka `https://[alamat-vercel-anda]/admin`, login pakai `ADMIN_PASSWORD` yang tadi diisi di Vercel.
2. Klik **Kelola daftar**, isi 317 sekolah satu baris per sekolah dengan format:
   ```
   NPSN|Nama Sekolah|Jenjang|PIN
   ```
   Jenjang harus persis salah satu dari: `TK/PAUD`, `SD`, `SMP`. PIN bebas 6 digit, beda-beda per sekolah (kalau Bapak/Ibu punya data ini di Excel, tinggal kirim ke saya — saya bisa bantu susun jadi format ini sekaligus).
3. Klik **Simpan daftar**.

## Bagian 5 — Uji coba

1. Buka `https://[alamat-vercel-anda]/bendahara`, pilih salah satu sekolah, masukkan PIN-nya, coba upload satu file BKU.
2. Buka `/admin` lagi, cek apakah data itu muncul di rekap.

Kalau ada langkah yang macet atau error, screenshot pesan errornya dan kirim ke saya — saya bantu diagnosis.

## Setelah live

- Bagikan alamat `/bendahara` ke semua bendahara sekolah beserta PIN masing-masing.
- Bagikan alamat `/admin` + `ADMIN_PASSWORD` hanya ke pihak dinas yang berwenang.
- Data tersimpan permanen di Supabase (beda dari prototipe sebelumnya) — aman untuk dipakai produksi sungguhan.
