-- ============================================================
-- MENGELOLA AKUN ADMIN (jalankan di Supabase > SQL Editor)
-- Pastikan bagian "Akun admin dinas" di supabase_schema.sql sudah
-- dijalankan lebih dulu.
-- ============================================================

-- 1) TAMBAH ADMIN PER JENJANG
--    Ganti username, password, dan nama. Username otomatis huruf kecil.
--    Gunakan password yang kuat (campuran huruf, angka; min. 10 karakter).
insert into admin_users (username, password_hash, jenjang, nama) values
  ('admin-tk', extensions.crypt('GANTI-PASSWORD-TK',  extensions.gen_salt('bf')), 'TK/PAUD', 'Admin TK/PAUD'),
  ('admin-sd', extensions.crypt('GANTI-PASSWORD-SD',  extensions.gen_salt('bf')), 'SD',      'Admin SD'),
  ('admin-smp', extensions.crypt('GANTI-PASSWORD-SMP', extensions.gen_salt('bf')), 'SMP',     'Admin SMP');

-- 2) TAMBAH ADMIN SEMUA JENJANG (selain admin utama yang sudah ada)
-- insert into admin_users (username, password_hash, jenjang, nama)
-- values ('kabid', extensions.crypt('GANTI-PASSWORD', extensions.gen_salt('bf')), null, 'Kabid');

-- 3) GANTI PASSWORD
-- update admin_users
--   set password_hash = extensions.crypt('PASSWORD-BARU', extensions.gen_salt('bf'))
--   where username = 'admin-sd';

-- 4) NONAKTIFKAN / AKTIFKAN KEMBALI (akun tidak dihapus)
-- update admin_users set aktif = false where username = 'admin-sd';
-- update admin_users set aktif = true  where username = 'admin-sd';

-- 5) LIHAT DAFTAR AKUN (password tidak ditampilkan)
select username, nama, coalesce(jenjang, 'SEMUA') as jenjang, aktif, created_at
from admin_users
order by jenjang nulls first, username;
