-- Jalankan seluruh isi file ini di Supabase: Project > SQL Editor > New query > Run
-- Aman dijalankan berkali-kali (pakai IF NOT EXISTS / DO blocks).

create table if not exists sekolah (
  npsn text primary key,
  nama text not null,
  jenjang text not null check (jenjang in ('TK/PAUD', 'SD', 'SMP')),
  pin text not null,
  alamat text
);

create table if not exists submissions (
  id bigint generated always as identity primary key,
  npsn text not null references sekolah(npsn),
  nama_sekolah text not null,
  jenjang text not null,
  tahun text not null,
  bulan text not null,
  sumber_dana text not null default 'REGULER' check (sumber_dana in ('REGULER', 'KINERJA')),
  totals jsonb not null,
  rincian jsonb not null,
  integrity_ok boolean not null default false,
  file_name text,
  submitted_at timestamptz not null default now(),
  unique (npsn, tahun, bulan, sumber_dana)
);

-- Kalau tabel submissions sudah ada dari sebelumnya (tanpa kolom
-- sumber_dana), migrasi ringan ini menambahkannya tanpa menghapus data:
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'submissions' and column_name = 'sumber_dana'
  ) then
    alter table submissions add column sumber_dana text not null default 'REGULER' check (sumber_dana in ('REGULER', 'KINERJA'));
    alter table submissions drop constraint if exists submissions_npsn_tahun_bulan_key;
    alter table submissions add constraint submissions_npsn_tahun_bulan_sumberdana_key unique (npsn, tahun, bulan, sumber_dana);
  end if;
end $$;

-- Saldo R.Koran (saldo rekening koran/bank) diisi manual oleh dinas —
-- data ini tidak ada di file BKU manapun, jadi tidak bisa dibaca
-- otomatis. Satu angka per sekolah per bulan (rekening bank biasanya
-- satu untuk seluruh sumber dana BOSP sekolah tersebut).
create table if not exists saldo_rkoran (
  npsn text not null references sekolah(npsn),
  tahun text not null,
  bulan text not null,
  saldo_rkoran numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (npsn, tahun, bulan)
);

-- Row Level Security aktif dengan TANPA kebijakan publik apa pun.
-- Semua akses baca/tulis hanya lewat API routes aplikasi ini, yang
-- memakai service role key di server (lihat lib/supabaseAdmin.js).
-- Ini memastikan data tidak bisa diakses langsung dari browser siapa pun.
alter table sekolah enable row level security;
alter table submissions enable row level security;
alter table saldo_rkoran enable row level security;
