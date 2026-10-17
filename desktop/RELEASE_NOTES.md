## Loop Studio 2.0.1 — Auto Seamless untuk Windows 10/11 64-bit

Unduh **Loop-Studio-Setup-2.0.1-win-x64.exe** pada bagian **Assets**, bukan **Source code**.

1. Keluar dari versi lama melalui ikon Loop Studio di system tray (dekat jam Windows).
2. Buka installer, ikuti pemasangan, lalu buka shortcut **Loop Studio** di Desktop atau Start Menu.
3. Pilih video → atur rentang → **Analisis video & audio** → pilih kandidat → **Buat pratinjau** → **Ekspor video** → **Unduh MP4**.

### Perbaikan launcher Windows
- Waktu tunggu startup menjadi 90 detik, dengan pemeriksaan FFmpeg/FFprobe paralel.
- Baris informasi sebelum alamat server tidak lagi menyebabkan kegagalan.
- Detail kegagalan ditampilkan dan disimpan di `%LOCALAPPDATA%\Loop Studio\logs\launcher.log`.
- Pengujian installer mencakup startup lambat, pesan tambahan, dan kegagalan server.

### Fitur
- Analisis lokal gambar, pencahayaan, pola gerakan, volume dan karakter audio; hingga lima kandidat titik sambung.
- Mode seamless dengan transisi gambar/audio terpisah, loop biasa, dan ping-pong.
- Pratinjau area sambungan yang benar-benar dirender, penggeseran satu frame, jumlah putaran atau target durasi.
- Pemeriksaan durasi, timestamp audio/video, dan bagian gelap di sekitar sambungan.
- Pemrosesan audio sebelum satu kali encoding AAC pada hasil akhir.

**Tidak perlu API key, Node.js, FFmpeg terpisah, atau koneksi internet setelah instalasi.** Video diproses di komputer sendiri. Untuk keluar sepenuhnya, klik kanan ikon di system tray → **Keluar**.

Skor adalah perkiraan, bukan jaminan seamless. Analisis memakai sampling (rentang 2 detik–5 menit, kandidat maksimal 30 detik); hasil perlu diperiksa secara visual dan didengarkan. Ekspor maksimal 60 menit, 30 fps, resolusi sampai setara 4K, unggahan maksimal 500 MB. Target durasi yang memotong siklus terakhir belum tentu menyambung kembali ke awal; gunakan jumlah putaran untuk siklus utuh.

Installer belum memiliki sertifikat penandatanganan Windows. SHA-256 disediakan di `SHA256SUMS.txt`. Folder sementara dibersihkan setelah sekitar satu jam tanpa pemakaian, termasuk saat aplikasi dijalankan kembali; unduh hasil sebelum keluar.
