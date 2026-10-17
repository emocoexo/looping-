# Komponen pihak ketiga

Installer menyertakan Node.js, FFmpeg/FFprobe, dependensi npm, dan kode Loop Studio. Lisensi dependensi npm berada di direktori masing-masing di app/node_modules. Lisensi Node.js disertakan di runtime/LICENSE. Lisensi dan dokumentasi FFmpeg disertakan di licenses/ffmpeg.

- Node.js: https://nodejs.org/ ; sumber dan lisensi https://github.com/nodejs/node/tree/v24.22.0
- FFmpeg: https://ffmpeg.org/ ; versi n8.1.3 (commit 46d899d7a0), build BtbN GPL. FFmpeg adalah program terpisah yang dipanggil melalui proses anak.
- BtbN build scripts, sumber FFmpeg dan dependensinya, konfigurasi serta petunjuk membangun: https://github.com/BtbN/FFmpeg-Builds/tree/master ; https://github.com/BtbN/FFmpeg-Builds/wiki
- FFmpeg source: https://github.com/FFmpeg/FFmpeg/tree/46d899d7a0

Periksa file provenance.json di instalasi untuk URL unduhan dan SHA-256 arsip runtime yang digunakan untuk build ini. Seluruh merek dagang tetap milik pemiliknya masing-masing.
