import "./globals.css";

export const metadata = {
  title: "Klasifikasi Belanja BKU",
  description: "Klasifikasi belanja modal & barang/jasa dari Buku Kas Umum sekolah",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
