export const FPS = 30;
export function validateOptions(body, duration) {
  let start = Number(body.start), end = Number(body.end);
  const mode = body.mode || 'normal', outputMode = body.outputMode || 'repeats';
  const repeats = Number(body.repeats ?? 3);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.1 || end - start < 0.1) throw new Error('Pilih rentang video yang valid, minimal 0,1 detik.');
  if (!['normal','seamless','pingpong'].includes(mode)) throw new Error('Mode loop tidak valid.');
  if (!['repeats','duration'].includes(outputMode)) throw new Error('Jenis durasi tidak valid.');
  start = Math.round(start * FPS) / FPS;
  end = Math.floor(Math.min(end, duration) * FPS + 0.0001) / FPS;
  const clipFrames = Math.round((end-start)*FPS);
  if (clipFrames < 3) throw new Error('Rentang terlalu pendek setelah penyesuaian frame.');
  const videoFade = Number(body.videoFade ?? 0.5), audioFade = Number(body.audioFade ?? 0.2);
  if (![videoFade,audioFade].every(n => Number.isFinite(n) && n >= 0 && n <= 3)) throw new Error('Transisi gambar dan audio harus antara 0–3 detik.');
  const overlapFrames = mode === 'seamless' ? Math.ceil(Math.max(videoFade,audioFade) * FPS - 0.0001) : 0;
  if (mode === 'seamless' && (overlapFrames < 1 || overlapFrames * 3 > clipFrames)) throw new Error('Transisi maksimal sepertiga durasi pilihan dan minimal satu transisi harus di atas 0.');
  if (mode === 'pingpong' && clipFrames > 30 * FPS) throw new Error('Pilih maksimal 30 detik untuk ping-pong.');
  const periodFrames = mode === 'pingpong' ? clipFrames*2-2 : clipFrames-overlapFrames;
  let totalFrames;
  if (outputMode === 'duration') {
    const target = Number(body.targetDuration);
    if (!Number.isFinite(target) || target < 0.1 || target > 3600) throw new Error('Target durasi harus 0,1–3600 detik.');
    totalFrames = Math.round(target * FPS);
  } else {
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 30) throw new Error('Jumlah pengulangan harus antara 1 dan 30.');
    totalFrames = periodFrames * repeats;
  }
  if (totalFrames > 3600*FPS) throw new Error('Durasi hasil maksimal 60 menit.');
  return {start,end,mode,outputMode,repeats,videoFade,audioFade,clipFrames,overlapFrames,periodFrames,totalFrames,
    period:periodFrames/FPS,totalDuration:totalFrames/FPS,mute:body.mute === true || body.mute === 'true'};
}
