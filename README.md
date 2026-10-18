# Loop Studio 2.1 — Auto Seamless

Aplikasi Windows untuk mencari titik sambung video dan audio, membuat transisi melingkar, memeriksa pratinjau, dan mengekspor MP4 tanpa watermark. Berjalan lokal tanpa API key dan tanpa internet setelah pemasangan.

## Instal di Windows 10/11 64-bit

Buka [Releases](https://github.com/emocoexo/looping-/releases/latest), lalu unduh **Loop-Studio-Setup-2.1.0-win-x64.exe** dari bagian **Assets**. Arsip **Source code** adalah kode untuk pengembang, bukan installer.

1. Tutup versi lama. Untuk versi 2.0.x, klik kanan ikon Loop Studio di system tray dekat jam Windows → **Keluar**. Jika dijalankan lewat CMD, hentikan dengan Ctrl+C.
2. Jalankan installer dan ikuti petunjuk pemasangan. Electron, Node.js, dan FFmpeg sudah disertakan; tidak perlu terminal atau komponen tambahan.
3. Buka shortcut **Loop Studio** di Desktop atau Start Menu. Loop Studio terbuka sebagai jendela desktop sendiri. Pemrosesan tetap berjalan di komputer Anda; aplikasi tidak membuka browser.

Tombol **X** menutup jendela dan menghentikan proses aplikasi. Simpan hasil sebelum keluar; pekerjaan yang sedang berjalan akan dihentikan. Tombol **Unduh MP4** membuka dialog Windows untuk memilih lokasi penyimpanan. Untuk menghapus, buka **Settings → Apps → Loop Studio → Uninstall**. Installer belum ditandatangani dengan sertifikat Windows; SHA-256 tersedia dalam rilis yang sama.

## Menggunakan Auto Seamless

1. Pilih atau tarik video ke area **Video sumber** (maksimal 500 MB dan resolusi setara 4K).
2. Tentukan rentang pencarian menggunakan waktu awal–akhir. Analisis menerima 2 detik sampai 5 menit per rentang. Tombol `−1f` / `+1f` menggeser satu frame pada keluaran 30 fps.
3. Klik **Analisis video & audio**. Aplikasi menawarkan hingga lima kandidat potongan, masing-masing maksimal 30 detik, dengan skor gambar, gerakan, audio, dan gabungan. Kandidat pertama dipilih otomatis; klik kandidat lain untuk membandingkan.
4. Atur **Transisi gambar** dan **Transisi audio** secara terpisah bila perlu. Nilai awal pada kandidat adalah rekomendasi heuristik.
5. Klik **Buat pratinjau**. Video pratinjau berisi area sekitar sambungan yang sudah dirender, sehingga transisi gambar dan audio yang didengar benar-benar berasal dari pemroses ekspor. Pemutar **Video sumber** tetap menampilkan bahan asli tanpa transisi.
6. Pilih jumlah putaran atau target durasi, klik **Ekspor video**, lalu **Unduh MP4**. Baca hasil pemeriksaan dan peringatan bila muncul.

Mengubah rentang, mode, transisi, audio, atau panjang hasil membatalkan pratinjau dan tautan unduhan sebelumnya agar tidak tertukar dengan pengaturan baru.

## Mode dan durasi

- **Seamless / crossfade:** bagian tengah dipertahankan, lalu bagian akhir dicampur dengan bagian awal. Gambar dan audio mempunyai durasi transisi masing-masing, tetapi memakai overlap bersama sebesar transisi terpanjang. Satu siklus panjangnya `durasi pilihan − overlap`. Transisi dipusatkan pada overlap bersama agar gambar dan audio tetap memakai periode yang sama. Minimal satu transisi harus lebih dari nol; overlap maksimal sepertiga panjang pilihan. Siklus keluaran dimulai setelah bagian awal yang dipakai dalam overlap.
- **Loop biasa:** mengulang potongan tanpa transisi.
- **Ping-pong:** maju lalu mundur, menghindari duplikasi frame pada titik balik. Audio pada bagian mundur juga dibalik; gunakan **Tanpa suara** jika tidak sesuai. Maksimal 30 detik sumber. Pembalikan dilakukan dalam blok maksimal 30 frame untuk membatasi penggunaan memori. Panjang siklus untuk N frame adalah `2N−2` frame.
- **Jumlah putaran:** 1–30 siklus utuh.
- **Target durasi:** 0,1–3600 detik, dibulatkan ke frame 30 fps terdekat. Target yang bukan kelipatan siklus akan memotong putaran terakhir; aplikasi memperingatkan bahwa ujung file itu belum tentu menyambung kembali ke awal. Pilih jumlah putaran jika seluruh MP4 akan diputar ulang.

Seluruh keluaran memakai H.264, 30 fps konstan, resolusi asli (dimensi ganjil dibulatkan ke bawah), serta AAC stereo 48 kHz bila audio diaktifkan. Proses ini menyandikan ulang bahan sumber; ukuran dan kualitas hasil dapat berubah. Penggabungan putaran menggunakan video yang sudah diproses, sementara audio disimpan sebagai PCM selama pengolahan dan baru disandikan ke AAC sekali pada keluaran akhir untuk menghindari penambahan priming AAC per siklus.

## Apa yang dianalisis dan batasannya

Analisis mengambil hingga sekitar 480 sampel gambar kecil pada rentang pilihan (maksimal 8 sampel/detik). Fitur gambar menggunakan warna dan pencahayaan pada grid; arah/perpindahan gerakan diperkirakan lewat pencocokan blok lokal. Audio dianalisis dalam mono 8 kHz menggunakan energi/RMS, zero-crossing, dan profil spektrum. Video keluaran tetap menggunakan resolusi sumber dan audio 48 kHz, bukan resolusi analisis.

Skor gabungan menggunakan gambar 50%, gerakan 25%, audio 25%. Tanpa audio, bobot gambar/gerakan menjadi 70%/30%. Gambar sangat minim detail dibatasi skornya dan diberi catatan. Batas akhir eksklusif dapat diperkirakan dari dua sampel terakhir agar satu siklus penuh dapat ikut menjadi kandidat; kandidat tersebut diberi label.

**Skor adalah heuristik, bukan probabilitas dan bukan jaminan seamless.** Analisis tidak mengenali identitas objek, tidak melakukan pelacakan semantik, tidak menjamin ketepatan beat musik, dan tidak menghasilkan adegan AI baru. Pencarian menggunakan sampling, sehingga momen sangat singkat atau gerakan cepat dapat terlewat. Memperpendek rentang pencarian memberi sampel yang lebih rapat. Crossfade dapat menimbulkan bayangan ganda pada objek, wajah, atau teks; gunakan kandidat/rentang lain bila perlu.

Validasi ekspor memeriksa durasi, perbedaan timestamp awal dan panjang trek audio/video, serta mendekode area sambungan untuk mendeteksi bagian gelap. Bagian gelap mungkin berasal dari materi asli. Pemeriksaan timestamp tidak membuktikan keselarasan gerak bibir atau kualitas artistik; tetap lihat dan dengarkan hasil. Perilaku pemutaran ulang pada browser atau platform unggahan juga dapat berbeda.

## Penyimpanan dan kebutuhan sistem

Pratinjau sumber membaca berkas lokal di pemutar aplikasi. Analisis/ekspor mengirim berkas ke pemroses aplikasi: lokal pada versi Windows, atau mesin server pada versi cloud. Tidak ada pengiriman ke penyedia AI atau layanan pihak ketiga. Maksimal dua pekerjaan diproses bersamaan. Gunakan ruang disk kosong yang memadai untuk sumber, video antara, dan audio PCM; kebutuhan sementara dapat jauh lebih besar daripada MP4 masukan. Analisis/video resolusi tinggi membutuhkan CPU dan waktu lebih banyak.

Sumber sementara digunakan kembali untuk analisis, pratinjau, dan ekspor. Folder bertanda milik aplikasi dibersihkan setelah sekitar satu jam tanpa pemakaian; pekerjaan aktif diperbarui penandanya. Folder tertinggal dari sesi sebelumnya juga diperiksa saat startup. Status pekerjaan berada di memori dan tidak dipulihkan setelah restart; unduh hasil sebelum keluar.

Pratinjau masukan bergantung pada codec pemutar. MP4 H.264 dan WebM direkomendasikan; MOV dapat dipakai jika codec-nya didukung pemutar. Versi cloud disiapkan untuk pengembangan pribadi; publikasi sebagai layanan umum memerlukan autentikasi dan pengelolaan penggunaan.

## Menjalankan dari kode sumber

Prasyarat: Node.js >=22, npm, FFmpeg dan FFprobe dengan encoder libx264/AAC. Tidak memerlukan database atau API key.

```sh
cd /workspace/looping-
npm ci --cache /workspace/.npm-cache
npm start
```

`npm start` memakai port 3000 (`PORT` dapat menggantinya). `npm run dev` mengaktifkan restart otomatis. `npm run start:desktop` menjalankan layanan loopback untuk pengembangan pada port tersedia; jendela desktop pada installer dijalankan oleh `desktop/main.cjs` melalui Electron. `FFMPEG_PATH` / `FFPROBE_PATH` dapat menunjuk executable tertentu. Pada paket Windows, executable bawaan digunakan otomatis. Antarmuka disajikan langsung oleh Express; tidak memerlukan frontend build.

Setiap tugas cloud sudah terisolasi. Gunakan checkout yang tersedia; jangan membuat Git worktree baru kecuali diminta.

## Pengujian dan installer

```sh
npm test
npm run test:browser
```

Pengujian menggunakan video/audio sintetis: fase gerakan yang diketahui, sumber tanpa audio, gambar gelap, frame rate tidak tetap, audio lebih pendek dari video, ekspor 30 putaran, pembalikan ping-pong, transisi terpisah, durasi, jumlah frame, perubahan piksel/sampel di sambungan, validasi masukan, serta pembersihan berkas sementara. Pengujian browser mencakup pemilihan kandidat, pratinjau hasil, pengubahan parameter, ekspor, unduh, tampilan ponsel, dan reset. Browser memakai `/usr/bin/chromium` atau `CHROMIUM_PATH`.

Membuat installer pada Windows dengan Node.js dan Inno Setup 6:

```powershell
npm ci
./scripts/build-windows.ps1
./scripts/test-windows.ps1
```

Build mengunduh runtime dari sumber upstream dan memeriksa SHA-256, memasang dependensi produksi, menyertakan `public/`, `lib/`, serta Electron dengan jendela desktop, lalu membuat installer di `dist/`. [Workflow Windows installer](https://github.com/emocoexo/looping-/actions/workflows/windows-release.yml) menguji analisis/render, pemasangan, startup lambat, pelaporan error, alur video di jendela aplikasi yang terinstal, penyimpanan MP4, penghentian server saat jendela ditutup, uninstall, dan browser sebelum menerbitkan installer di GitHub Releases.

Struktur utama: `lib/analyze.js` (analisis), `lib/render.js` (pengolahan), `public/options.js` (aturan durasi bersama), `server.js` (API/pekerjaan), `public/` (antarmuka), `desktop/` dan `scripts/` (installer).

Log kegagalan startup tersedia di `%LOCALAPPDATA%\Loop Studio\logs\launcher.log`. Renderer desktop memakai sandbox, context isolation, dan tidak memiliki akses Node.js; jendela tidak membuka tautan eksternal. Runtime Electron disertakan agar tidak perlu menginstal browser atau WebView terpisah.
