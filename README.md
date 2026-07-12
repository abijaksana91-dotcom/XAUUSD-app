# XAU/USD Terminal Analisa

App ini berjalan di luar Claude (Vercel/Netlify) karena Claude Artifacts memblokir
fetch ke domain pihak ketiga seperti TwelveData.

## Cara deploy (paling mudah — Vercel, gratis, ±3 menit)

1. Buat akun gratis di https://vercel.com (bisa login pakai GitHub/Google)
2. Download folder ini (`xauusd-app`)
3. Install Vercel CLI (sekali saja):
   ```
   npm install -g vercel
   ```
4. Masuk ke folder project lalu jalankan:
   ```
   cd xauusd-app
   npm install
   vercel
   ```
5. Ikuti instruksi di terminal (pilih akun, nama project, dsb). Vercel akan
   kasih kamu link seperti `https://xauusd-app-xxxx.vercel.app` yang bisa
   dibuka dari HP kapan saja.

## Cara jalankan di komputer sendiri dulu (opsional, untuk coba-coba)

```
npm install
npm run dev
```
Lalu buka link yang muncul di terminal (biasanya `http://localhost:5173`).

## API key yang dibutuhkan

- **TwelveData** (wajib) — daftar gratis di twelvedata.com, untuk data harga XAUUSD
- **Anthropic** (opsional) — dari console.anthropic.com, untuk narasi & setup
  trading otomatis. Tanpa ini, app tetap jalan tapi cuma tampilkan angka
  indikator mentah (RSI, EMA, MACD, ATR) tanpa narasi.

Kedua key ditempel langsung di dalam app (bukan di kode), dan hanya
tersimpan di memori browser selama sesi berjalan.

## Catatan keamanan

Karena ini app sisi-klien murni (tanpa backend), API key akan terlihat di
request browser siapa pun yang membuka app kamu. Untuk pemakaian pribadi
ini aman-aman saja. Kalau nanti mau dibagikan ke orang lain, sebaiknya
tambahkan backend kecil supaya key tidak perlu dimasukkan tiap orang.
