# Loop Studio

Aplikasi web berbahasa Indonesia untuk memilih bagian video, memutarnya berulang, dan mengunduh hasil MP4 tanpa watermark.

## Menjalankan

Prasyarat: Node.js 22 atau lebih baru, npm, serta `ffmpeg` dan `ffprobe` dengan encoder H.264 (`libx264`) dan AAC pada PATH. Lingkungan cloud ini telah diuji menggunakan Node.js 24 dan FFmpeg 7.1.

```sh
cd /workspace/looping-
npm ci --cache /workspace/.npm-cache
npm start
```

Server berjalan pada port 3000; gunakan variabel `PORT` untuk menggantinya. `npm run dev` mengaktifkan restart otomatis saat server berubah. Antarmuka disajikan langsung oleh Express, sehingga tidak memerlukan tahap build atau layanan basis data. Tidak memerlukan API key.

## Menggunakan aplikasi

1. Pilih atau tarik video ke area pratinjau (maksimum 500 MB).
2. Atur waktu awal dan akhir menggunakan penggeser atau angka dalam detik.
3. Tentukan 1–30 putaran; aktifkan **Tanpa suara** jika diperlukan.
4. Gunakan tombol putar atau tombol Spasi untuk pratinjau. Pratinjau terus berulang pada bagian terpilih; jumlah putaran berlaku untuk video hasil ekspor.
5. Klik **Ekspor video**, tunggu proses selesai, lalu **Unduh MP4**.

Format masukan bergantung pada codec yang didukung browser; MP4 H.264 dan WebM direkomendasikan. MOV dapat dipakai jika codec-nya didukung browser. Hasil menggunakan H.264/AAC, mempertahankan resolusi (dimensi ganjil dibulatkan ke bawah agar kompatibel), dengan total durasi maksimal 60 menit. Potongan memiliki ketelitian sesuai frame video; durasi akhir dapat berbeda sedikit akibat batas frame video/audio. Ukuran hasil bergantung pada isi dan jumlah pengulangan.

Pratinjau menggunakan berkas lokal browser. Ekspor mengunggah video ke server aplikasi, memotongnya dengan FFmpeg, lalu menggabungkan sejumlah putaran. Maksimal dua pekerjaan diproses bersamaan. Berkas masukan dihapus setelah pemrosesan. Hasil disimpan sementara dan dibersihkan setelah sekitar satu jam selama server berjalan. Unduh sebelum server dihentikan; status pekerjaan tidak disimpan lintas restart.

Ini adalah aplikasi untuk lingkungan pengembangan pribadi. Publikasi layanan internet memerlukan autentikasi, pembatasan penggunaan, dan pengelolaan penyimpanan sesuai kebutuhan operasional.

## Pengujian

```sh
npm test
npm run test:browser
```

`npm test` membuat video sintetis dengan audio, menjalankan API nyata, mengekspor potongan 1 detik sebanyak 3 putaran, memeriksa durasi dan codec, memeriksa ada/tidaknya audio, dan mendekode hasil. Pengujian juga mencakup validasi masukan dan respons kesalahan.

`npm run test:browser` menggunakan Chromium di `/usr/bin/chromium` (atau `CHROMIUM_PATH`) untuk menguji unggah, potong, pemutaran berulang, bisukan, ekspor, unduh, tata letak ponsel, dan reset. Server pengujian menggunakan port sementara sendiri. Tangkapan layar disimpan di `/tmp/loop-studio-*.png`.

## Struktur

- `server.js`: server statis, validasi unggahan, antrean pekerjaan, dan ekspor FFmpeg.
- `public/`: antarmuka responsif tanpa framework dan tanpa sumber daya CDN.
- `test/`: pengujian integrasi dan browser.

Setiap tugas cloud sudah terisolasi. Gunakan checkout yang tersedia; tidak perlu membuat Git worktree baru kecuali diminta.
