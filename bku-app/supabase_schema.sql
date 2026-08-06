-- Jalankan seluruh isi file ini di Supabase: Project > SQL Editor > New query > Run

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
  totals jsonb not null,
  rincian jsonb not null,
  integrity_ok boolean not null default false,
  file_name text,
  submitted_at timestamptz not null default now(),
  unique (npsn, tahun, bulan)
);

-- Row Level Security aktif dengan TANPA kebijakan publik apa pun.
-- Semua akses baca/tulis hanya lewat API routes aplikasi ini, yang
-- memakai service role key di server (lihat lib/supabaseAdmin.js).
-- Ini memastikan data tidak bisa diakses langsung dari browser siapa pun.
alter table sekolah enable row level security;
alter table submissions enable row level security;
