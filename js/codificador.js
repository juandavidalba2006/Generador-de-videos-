// Convierte los cuadros del lienzo en un archivo de video, cuadro por cuadro (sin depender de la velocidad del equipo).
// MP4 H.264 es lo que pide Instagram; si el navegador no lo puede codificar, se usa WebM.
// El sonido llega ya codificado (sonido.js → codificarAudio) y se mete en el mismo archivo.
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Destino } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmDestino } from 'webm-muxer';

const CANDIDATOS = [
  { contenedor: 'mp4', codec: 'avc1.640034', muxer: 'avc' },   // H.264 High 5.2
  { contenedor: 'mp4', codec: 'avc1.640033', muxer: 'avc' },
  { contenedor: 'mp4', codec: 'avc1.4d0033', muxer: 'avc' },   // Main
  { contenedor: 'mp4', codec: 'avc1.42003e', muxer: 'avc' },   // Baseline
  { contenedor: 'mp4', codec: 'hvc1.1.6.L153.B0', muxer: 'hevc' },   // HEVC (Instagram también lo acepta)
  { contenedor: 'webm', codec: 'vp09.00.41.08', muxer: 'V_VP9' },
  { contenedor: 'webm', codec: 'vp8', muxer: 'V_VP8' },
];

export const puedeCodificar = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

// Escoge el códec de video (y con él el contenedor). Se llama antes de codificar el audio:
// el audio se codifica para el contenedor que salga de aquí (AAC en MP4, Opus en WebM)
export async function elegirVideo({ ancho, alto, fps, calidad = 1 }) {
  if (!puedeCodificar()) throw new Error('Este navegador no puede crear video. Usa Chrome, Edge o Safari actualizados.');
  const bitrate = Math.round(ancho * alto * fps * 0.32 * calidad);   // ~20 Mbps en 1080×1920 a 30 cuadros: nítido incluso después de la compresión de Instagram
  for (const c of CANDIDATOS) {
    const cfg = { codec: c.codec, width: ancho, height: alto, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality' };
    if (c.muxer === 'avc') cfg.avc = { format: 'avc' };
    if (c.muxer === 'hevc') cfg.hevc = { format: 'hevc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { ...c, config: cfg, ancho, alto, fps }; } catch (e) { /* siguiente */ }
  }
  throw new Error('Este navegador no tiene un codificador de video compatible.');
}

// audio: lo que devuelve codificarAudio() ({ codec: 'aac'|'opus', chunks, sampleRate, numberOfChannels }) o null (video mudo).
// video: lo que devolvió elegirVideo() con las mismas medidas (si no se pasa, se escoge aquí)
export async function crearCodificador({ ancho, alto, fps, calidad = 1, audio = null, video = null }) {
  const elegido = video && video.ancho === ancho && video.alto === alto && video.fps === fps ? video : await elegirVideo({ ancho, alto, fps, calidad });
  const config = elegido.config;
  const mp4 = elegido.contenedor === 'mp4';
  if (audio && !(audio.chunks?.length && audio.sampleRate && audio.numberOfChannels)) audio = null;
  if (audio && !mp4 && audio.codec !== 'opus') audio = null;   // WebM solo lleva Opus (no debería pasar: el audio se codifica para el contenedor)
  const destino = mp4 ? new Mp4Destino() : new WebmDestino();
  const pista = { codec: elegido.muxer, width: ancho, height: alto, frameRate: fps };
  const sonido = audio && (mp4
    ? { codec: audio.codec === 'aac' ? 'aac' : 'opus', numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate }
    : { codec: 'A_OPUS', numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate });
  const muxer = mp4
    ? new Mp4Muxer({ target: destino, video: pista, ...(sonido ? { audio: sonido } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
    : new WebmMuxer({ target: destino, video: pista, ...(sonido ? { audio: sonido } : {}), firstTimestampBehavior: 'offset' });
  // el sonido ya está listo: el muxer lo va intercalando con los cuadros a medida que llegan
  if (sonido) for (const { chunk, meta } of audio.chunks) muxer.addAudioChunk(chunk, meta);
  let error = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { error = e; } });
  enc.configure(config);
  const dur = 1e6 / fps;
  let n = 0;
  return {
    tipo: mp4 ? 'video/mp4' : 'video/webm',
    extension: mp4 ? 'mp4' : 'webm',
    conSonido: !!sonido,
    async agregar(lienzo) {
      if (error) throw error;
      const cuadro = new VideoFrame(lienzo, { timestamp: Math.round(n * dur), duration: Math.round(dur) });
      enc.encode(cuadro, { keyFrame: n % (fps * 2) === 0 });
      cuadro.close(); n++;
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
    },
    async terminar() {
      await enc.flush(); enc.close();
      if (error) throw error;
      muxer.finalize();
      return new Blob([destino.buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
    },
    cancelar() { try { enc.close(); } catch (e) { /* ya cerrado */ } },
  };
}
