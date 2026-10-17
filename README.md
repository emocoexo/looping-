# Loop Studio

Aplikasi web berbahasa Indonesia untuk memilih bagian video, memutarnya berulang, dan mengunduh hasil MP4 tanpa watermark.

## Instal di Windows 10/11 64-bit

Buka [halaman Releases](https://github.com/emocoexo/looping-/releases/latest), lalu unduh **Loop-Studio-Setup-1.1.0-win-x64.exe** pada bagian **Assets**. Jangan pilih **Source code**: itu kode untuk pengembang, bukan installer.

1. Buka installer `.exe` yang diunduh dan ikuti langkah pemasangan.
2. Jalankan shortcut **Loop Studio** di Desktop atau Start Menu. Aplikasi akan membuka browser secara otomatis.
3. Pilih video, atur loop, lalu klik **Ekspor video** dan **Unduh MP4**.

Node.js dan FFmpeg sudah disertakan. Tidak perlu terminal atau instalasi tambahan. Video diproses di komputer sendiri dan aplikasi bisa digunakan tanpa internet setelah dipasang. Untuk keluar, klik kanan ikon aplikasi di system tray dekat jam Windows → **Keluar**. Untuk menghapus aplikasi, gunakan **Settings → Apps → Loop Studio → Uninstall**.

Installer belum ditandatangani dengan sertifikat Windows. Checksum unduhan tersedia pada `SHA256SUMS.txt` di rilis yang sama.

Installer dibuat dan diuji pada runner Windows oleh [workflow Windows installer](https://github.com/emocoexo/looping-/actions/workflows/windows-release.yml). Workflow menerbitkan rilis hanya setelah pengujian ekspor, instalasi, launcher, uninstall, dan browser berhasil. Jika build masih berlangsung, tunggu hingga selesai sebelum membuka halaman Releases.

## Menjalankan dari kode sumber (untuk pengembang)

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

## Membuat installer Windows

Di Windows 10/11 x64 dengan Node.js, .NET Framework 4.x, dan Inno Setup 6:

```powershell
npm ci
./scripts/build-windows.ps1
./scripts/test-windows.ps1
```

Script mengunduh runtime Node.js dan FFmpeg dari sumber resminya dengan pemeriksaan SHA-256, menyertakan dependensi produksi, mengompilasi launcher Windows, lalu membuat installer di `dist/`. Folder `.build/` dan `dist/` tidak dimasukkan ke Git; installer yang sudah lolos pengujian diterbitkan pada GitHub Releases. Layanan desktop hanya mendengarkan pada loopback dengan port otomatis. Launcher menyediakan ikon system tray untuk membuka browser atau menghentikan server beserta proses ekspornya.
