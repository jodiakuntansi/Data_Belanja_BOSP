import "./globals.css";

export const metadata = {
  title: "SIMBOSP",
  description: "Sistem Informasi Monitoring BOSP — rekap saldo, pendapatan, dan belanja BOSP sekolah",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
