// Convierte los cuadros del lienzo en un archivo de video, cuadro por cuadro (sin depender de la velocidad del equipo).
// MP4 H.264 es lo que pide Instagram; si el navegador no lo puede codificar, se usa WebM.
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

export async function crearCodificador({ ancho, alto, fps, calidad = 1 }) {
  if (!puedeCodificar()) throw new Error('Este navegador no puede crear video. Usa Chrome, Edge o Safari actualizados.');
  const bitrate = Math.round(ancho * alto * fps * 0.32 * calidad);   // ~20 Mbps en 1080×1920 a 30 cuadros: nítido incluso después de la compresión de Instagram
  let elegido = null, config = null;
  for (const c of CANDIDATOS) {
    const cfg = { codec: c.codec, width: ancho, height: alto, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality' };
    if (c.muxer === 'avc') cfg.avc = { format: 'avc' };
    if (c.muxer === 'hevc') cfg.hevc = { format: 'hevc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) { elegido = c; config = cfg; break; } } catch (e) { /* siguiente */ }
  }
  if (!elegido) throw new Error('Este navegador no tiene un codificador de video compatible.');

  const mp4 = elegido.contenedor === 'mp4';
  const destino = mp4 ? new Mp4Destino() : new WebmDestino();
  const muxer = mp4
    ? new Mp4Muxer({ target: destino, video: { codec: elegido.muxer, width: ancho, height: alto, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
    : new WebmMuxer({ target: destino, video: { codec: elegido.muxer, width: ancho, height: alto, frameRate: fps }, firstTimestampBehavior: 'offset' });
  let error = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { error = e; } });
  enc.configure(config);
  const dur = 1e6 / fps;
  let n = 0;
  return {
    tipo: mp4 ? 'video/mp4' : 'video/webm',
    extension: mp4 ? 'mp4' : 'webm',
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
