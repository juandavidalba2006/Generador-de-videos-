// Función de Vercel (Node, ESM) para el enlace de Instagram de la pestaña Replicar.
//   GET /api/reel?url=<enlace del reel>          → { fuente, tamano, tipo, partes, tamParte, duracion }
//   GET /api/reel?fuente=<video en la CDN>&parte=i → los bytes de la parte i (≤ 3,5 MB: Vercel no deja responder más de 4,5 MB)
// Solo lee la página pública que Instagram ofrece para insertar un reel en otros sitios (/reel/{código}/embed/captioned/):
// sin cuenta, sin cookies, sin saltarse ningún control. Si esa página no trae el video (reel privado, música bloqueada, o
// Instagram no le responde a este servidor), contesta 422 { sinVideo: true } para que la joyera suba el archivo.
// Contra SSRF: la página solo se pide a instagram.com y el video solo a las CDN de Instagram/Facebook, por https, también al
// seguir redirecciones; el total se limita a 80 MB.
import { origenPermitido, crearTope, ipDe, enviar, parametros, textoEspera, ErrorPedido } from '../lib/servidor.js';
import { enlaceInstagram, MENSAJES_REEL, MAX_BYTES_REEL, HOSTS_INSTAGRAM } from '../js/reel.js';

export const config = { maxDuration: 30 };
export const PLAZO = 24_000;                    // ms: todo lo que se espera a Instagram termina antes, para alcanzar a responder
export const TAM_PARTE = 3.5 * 1024 * 1024;      // bytes por parte
export const MAX_TOTAL = MAX_BYTES_REEL;         // 80 MB
export const MAX_PARTES = Math.ceil(MAX_TOTAL / TAM_PARTE);
export const MAX_PAGINA = 4 * 1024 * 1024;       // la página de insertar pesa ~200–600 KB
// Topes por IP, aparte de los del chat: buscar un reel es poco frecuente; bajarlo son hasta 23 partes
export const TOPE_ENLACE = { minuto: 6, hora: 40 };
export const TOPE_PARTES = { minuto: 90, hora: 900 };

// La página de insertar se pide como la pediría el navegador de un celular (con otro navegador Instagram responde una
// página que arma todo con JavaScript y no trae el video). No se mandan cookies ni datos de ninguna cuenta.
const ENCABEZADOS_PAGINA = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-CO,es;q=0.9,en;q=0.6',
};
const ENCABEZADOS_VIDEO = { 'User-Agent': ENCABEZADOS_PAGINA['User-Agent'], 'Accept': 'video/*,*/*;q=0.5' };

// ---------- Guardas de direcciones ----------
const url = x => { try { return new URL(x); } catch { return null; } };
const puertoNormal = u => !u.port || u.port === '443';
export const esHostInstagram = x => { const u = url(x); return !!u && u.protocol === 'https:' && !u.username && !u.password && puertoNormal(u) && HOSTS_INSTAGRAM.includes(u.hostname); };
// Video: solo https a *.cdninstagram.com o *.fbcdn.net (las CDN de Instagram), sin usuario ni puerto raro
export function hostCDNPermitido(x) {
  if (typeof x !== 'string' || x.length > 4096) return false;
  const u = url(x);
  if (!u || u.protocol !== 'https:' || u.username || u.password || !puertoNormal(u)) return false;
  const h = u.hostname;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(cdninstagram\.com|fbcdn\.net)$/.test(h);
}

// ---------- Leer la página de insertar ----------
// Deshace los escapes del JSON (a veces va JSON dentro de un texto de JSON: dos capas) y las entidades del HTML
const capaJSON = s => s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, x) => (x.length === 5 && x[0] === 'u' ? String.fromCharCode(parseInt(x.slice(1), 16)) : x === 'n' ? '\n' : x));
const entidades = s => s.replace(/&(amp|quot|#38|#x26|#34|#39|apos);/gi, (_, e) => ({ amp: '&', quot: '"', '#38': '&', '#x26': '&', '#34': '"', '#39': "'", apos: "'" })[e.toLowerCase()]);
export function desescapar(s) {
  let r = String(s);
  for (let i = 0; i < 4 && r.includes('\\'); i++) r = capaJSON(r);
  for (let i = 0; i < 2 && /&(amp|quot|#38|#x26|#34|#39|apos);/i.test(r); i++) r = entidades(r);
  return r.trim();
}

// Dónde puede venir la dirección del video, en orden de preferencia (los \\*" toleran comillas escapadas una o dos veces)
const PATRONES_VIDEO = [
  /video_url\\*"\s*:\s*\\*"(https?:[^"]+?)\\*"/g,
  /video_versions\\*"\s*:\s*\[\s*\{[^\]]*?\burl\\*"\s*:\s*\\*"(https?:[^"]+?)\\*"/g,
  /contentUrl\\*"\s*:\s*\\*"(https?:[^"]+?)\\*"/g,
  /<video\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi,
  /<source\b[^>]*?\ssrc\s*=\s*["']([^"']+)["'][^>]*?type\s*=\s*["']video\//gi,
  /<meta\b[^>]*?(?:property|name)\s*=\s*["']og:video(?::secure_url|:url)?["'][^>]*?content\s*=\s*["']([^"']+)["']/gi,
  /<meta\b[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?(?:property|name)\s*=\s*["']og:video(?::secure_url|:url)?["']/gi,
];

// html → { url | null, duracion | null, tipo ('video' | 'foto' | 'carrusel' | null), motivo (por qué no hay video) }
export function extraerVideo(html) {
  const h = typeof html === 'string' ? html : '';
  const candidatos = [];
  for (const re of PATRONES_VIDEO) for (const m of h.matchAll(re)) {
    const u = desescapar(m[1]);
    if (hostCDNPermitido(u) && !candidatos.includes(u)) candidatos.push(u);
  }
  const tipoMedio = (h.match(/data-media-type="(Graph[A-Za-z]+)"/) || h.match(/__typename\\*"\s*:\s*\\*"(Graph(?:Video|Image|Sidecar))/) || [])[1];
  const tipo = tipoMedio === 'GraphVideo' ? 'video' : tipoMedio === 'GraphImage' ? 'foto' : tipoMedio === 'GraphSidecar' ? 'carrusel' : null;
  const d = Number((h.match(/video_duration\\*"\s*:\s*([0-9]+(?:\.[0-9]+)?)/) || [])[1]);
  const duracion = Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : null;
  let motivo = null;
  if (!candidatos.length) {
    if (/copyright_blocked\\*"\s*:\s*true/.test(h)) motivo = 'derechos';
    else if (/EmbedBrokenMedia/.test(h)) motivo = 'noDisponible';   // borrado, privado o con la opción de insertar apagada
    else if (tipo === 'foto') motivo = 'foto';
    else if (tipo === 'carrusel') motivo = /is_video\\*"\s*:\s*true/.test(h) ? 'carrusel' : 'foto';
    else if (!tipo && /accounts\/login|loginForm|LoginAndSignupPage/i.test(h)) motivo = 'login';
    else motivo = 'sinVideo';
  }
  return { url: candidatos[0] || null, duracion, tipo, motivo };
}

const SUBE = 'Descarga el reel (o graba la pantalla mientras se reproduce) y súbelo aquí.';
const MOTIVOS = {
  derechos: `Instagram no comparte el video de ese reel fuera de la app (por la música con derechos). ${SUBE}`,
  foto: 'Esa publicación es de fotos, no un video. Pega el enlace de un reel.',
  noDisponible: `No pude abrir ese reel: puede ser privado, haberse borrado o no dejar que lo inserten en otras páginas. Revisa el enlace; si está bien, ${SUBE.charAt(0).toLowerCase() + SUBE.slice(1)}`,
  carrusel: `Esa publicación es un carrusel y Instagram no comparte sus videos fuera de la app. ${SUBE}`,
  login: `Instagram pide iniciar sesión para ver ese reel (puede ser privado). ${SUBE}`,
  noExiste: 'No encontré ese reel: revisa el enlace (puede que lo hayan borrado o que la cuenta sea privada).',
  bloqueado: `Instagram no está dejando ver reels desde el servidor en este momento. ${SUBE}`,
  sinVideo: MENSAJES_REEL.sinVideo,
};
// el motivo más útil para la joyera cuando se probaron varias páginas
const PESO_MOTIVO = { derechos: 7, foto: 6, carrusel: 5, noDisponible: 4, noExiste: 3, login: 2, bloqueado: 1, sinVideo: 0 };
const mejorMotivo = (a, b) => (!a ? b : !b ? a : PESO_MOTIVO[a] >= PESO_MOTIVO[b] ? a : b);

// ---------- Red con plazo y redirecciones vigiladas ----------
const plazoAgotado = () => new ErrorPedido(504, `Instagram tardó demasiado en responder. Inténtalo de nuevo o ${SUBE.charAt(0).toLowerCase() + SUBE.slice(1)}`, { sinVideo: true });
async function traerSeguro(traer, direccion, { headers, permitido, ms }) {
  let actual = direccion;
  for (let salto = 0; salto <= 3; salto++) {
    if (!permitido(actual)) throw new ErrorPedido(502, MENSAJES_REEL.sinVideo, { sinVideo: true });
    let r;
    try {
      r = await traer(actual, { headers, redirect: 'manual', signal: AbortSignal.timeout(Math.max(500, ms)) });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw plazoAgotado();
      throw new ErrorPedido(502, `No se pudo conectar con Instagram. Inténtalo de nuevo o ${SUBE.charAt(0).toLowerCase() + SUBE.slice(1)}`, { sinVideo: true });
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      let siguiente = null;
      try { siguiente = new URL(r.headers.get('location'), actual).href; } catch { siguiente = null; }
      await r.body?.cancel?.().catch(() => {});
      // a la página de iniciar sesión no se sigue: ese reel no es público
      if (!siguiente || /\/accounts\/login|\/challenge/.test(new URL(siguiente).pathname)) return { status: 401, ok: false, headers: new Headers(), body: null, login: true };
      actual = siguiente;
      continue;
    }
    return r;
  }
  throw new ErrorPedido(502, MENSAJES_REEL.sinVideo, { sinVideo: true });
}

// Lee el cuerpo con tope: salta los primeros `saltar` bytes y junta hasta `max` (corta el resto)
async function leerBytes(r, { saltar = 0, max }) {
  const lector = r.body?.getReader?.();
  if (!lector) { const b = new Uint8Array(await r.arrayBuffer()); return b.subarray(Math.min(saltar, b.length), Math.min(b.length, saltar + max)); }
  const trozos = []; let visto = 0, juntado = 0;
  try {
    while (juntado < max) {
      const { done, value } = await lector.read();
      if (done) break;
      const ini = Math.max(0, saltar - visto), fin = Math.min(value.length, ini + (max - juntado));
      visto += value.length;
      if (ini < value.length && fin > ini) { trozos.push(value.subarray(ini, fin)); juntado += fin - ini; }
    }
  } finally { lector.cancel().catch(() => {}); }
  const salida = new Uint8Array(juntado); let o = 0;
  for (const t of trozos) { salida.set(t, o); o += t.length; }
  return salida;
}

// ---------- Buscar el video de un reel ----------
export async function resolverReel(enlaceTexto, { fetch: traer = globalThis.fetch, plazo = PLAZO } = {}) {
  const enlace = enlaceInstagram(enlaceTexto);
  if (!enlace) throw new ErrorPedido(400, /instagram\.com/i.test(String(enlaceTexto)) ? MENSAJES_REEL.noReel : MENSAJES_REEL.noInstagram);
  const limite = Date.now() + plazo, queda = () => limite - Date.now();
  const paginas = [...new Set([
    `https://www.instagram.com/${enlace.tipo}/${enlace.codigo}/embed/captioned/`,
    `https://www.instagram.com/p/${enlace.codigo}/embed/captioned/`,
    `https://www.instagram.com/p/${enlace.codigo}/embed/`,
  ])];
  let hallazgo = null, motivo = null, falla = null;
  for (const pagina of paginas) {
    if (queda() < 2000) break;
    let r;
    try { r = await traerSeguro(traer, pagina, { headers: ENCABEZADOS_PAGINA, permitido: esHostInstagram, ms: Math.min(9000, queda() - 1500) }); } catch (e) { falla = e; continue; }
    if (r.login) { motivo = mejorMotivo(motivo, 'login'); continue; }
    if (r.status === 404) { motivo = mejorMotivo(motivo, 'noExiste'); continue; }
    if (r.status === 429 || r.status === 403 || r.status === 401) { motivo = mejorMotivo(motivo, 'bloqueado'); continue; }
    if (!r.ok) { await r.body?.cancel?.().catch(() => {}); motivo = mejorMotivo(motivo, 'sinVideo'); continue; }
    let html = '';
    try { html = new TextDecoder().decode(await leerBytes(r, { max: MAX_PAGINA })); } catch { falla = plazoAgotado(); continue; }
    const v = extraerVideo(html);
    if (v.url) { hallazgo = v; break; }
    motivo = mejorMotivo(motivo, v.motivo);
    if (['foto', 'derechos', 'noDisponible'].includes(v.motivo)) break;   // otra página del mismo reel no lo va a cambiar
  }
  if (!hallazgo) {
    if (!motivo && falla) throw falla;
    throw new ErrorPedido(422, MOTIVOS[motivo || 'sinVideo'], { sinVideo: true, motivo: motivo || 'sinVideo' });
  }
  // tamaño y tipo, pidiendo solo el primer byte
  if (queda() < 1000) throw plazoAgotado();
  const r = await traerSeguro(traer, hallazgo.url, { headers: { ...ENCABEZADOS_VIDEO, Range: 'bytes=0-0' }, permitido: hostCDNPermitido, ms: Math.min(8000, queda()) });
  await r.body?.cancel?.().catch(() => {});
  let tamano = NaN;
  if (r.status === 206) tamano = Number((r.headers.get('content-range') || '').match(/\/(\d+)\s*$/)?.[1]);
  else if (r.status === 200) tamano = Number(r.headers.get('content-length'));
  else throw new ErrorPedido(422, MOTIVOS.sinVideo, { sinVideo: true, motivo: 'cdn' });
  if (!(tamano > 0)) throw new ErrorPedido(422, MOTIVOS.sinVideo, { sinVideo: true, motivo: 'cdn' });
  if (tamano > MAX_TOTAL) throw new ErrorPedido(413, `Ese video pesa ${Math.round(tamano / 1048576)} MB y el máximo es ${MAX_TOTAL / 1048576} MB. Descárgalo, recórtalo y súbelo aquí.`, { sinVideo: true });
  const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return { fuente: hallazgo.url, tamano, tipo: /^video\/[a-z0-9.+-]+$/.test(ct) ? ct : 'video/mp4', partes: Math.ceil(tamano / TAM_PARTE), tamParte: TAM_PARTE, duracion: hallazgo.duracion };
}

// ---------- Una parte del video ----------
export async function parteReel(fuente, parte, { fetch: traer = globalThis.fetch, plazo = PLAZO } = {}) {
  if (!hostCDNPermitido(fuente)) throw new ErrorPedido(400, 'Esa dirección de video no es de Instagram.');
  if (!/^\d{1,3}$/.test(String(parte ?? ''))) throw new ErrorPedido(400, 'Falta el número de la parte.');
  const i = Number(parte);
  if (i >= MAX_PARTES) throw new ErrorPedido(416, 'Esa parte no existe.');
  const desde = i * TAM_PARTE;
  const r = await traerSeguro(traer, fuente, { headers: { ...ENCABEZADOS_VIDEO, Range: `bytes=${desde}-${desde + TAM_PARTE - 1}` }, permitido: hostCDNPermitido, ms: plazo });
  // el enlace firmado de la CDN vence a las horas: el navegador vuelve a buscar el reel y sigue
  if (r.login || [401, 403, 404, 410].includes(r.status)) throw new ErrorPedido(410, 'El enlace del video venció. Vuelve a pegar el enlace del reel.');
  if (r.status === 416) throw new ErrorPedido(416, 'Esa parte no existe.');
  let total, saltar = 0, esperado;
  if (r.status === 206) {
    const m = (r.headers.get('content-range') || '').match(/bytes\s+(\d+)-(\d+)\/(\d+)/);
    if (!m || Number(m[1]) !== desde) { await r.body?.cancel?.().catch(() => {}); throw new ErrorPedido(502, MENSAJES_REEL.servidor); }
    total = Number(m[3]); esperado = Number(m[2]) - desde + 1;
  } else if (r.status === 200) {
    // la CDN ignoró el rango: se salta lo anterior (solo pasa con videos chicos)
    total = Number(r.headers.get('content-length')); saltar = desde;
    esperado = Number.isFinite(total) ? Math.max(0, Math.min(TAM_PARTE, total - desde)) : NaN;
  } else { await r.body?.cancel?.().catch(() => {}); throw new ErrorPedido(502, MENSAJES_REEL.servidor); }
  if (!(total > 0)) { await r.body?.cancel?.().catch(() => {}); throw new ErrorPedido(502, MENSAJES_REEL.servidor); }
  if (total > MAX_TOTAL) { await r.body?.cancel?.().catch(() => {}); throw new ErrorPedido(413, MENSAJES_REEL.grande); }
  if (desde >= total) { await r.body?.cancel?.().catch(() => {}); throw new ErrorPedido(416, 'Esa parte no existe.'); }
  let bytes;
  try { bytes = await leerBytes(r, { saltar, max: Math.min(TAM_PARTE, esperado || TAM_PARTE) }); } catch { throw plazoAgotado(); }
  if (Number.isFinite(esperado) && bytes.length !== esperado) throw new ErrorPedido(502, MENSAJES_REEL.incompleto);
  return { bytes, total };
}

// ---------- HTTP ----------
export function crearManejador({ fetch: traer = (url, init) => globalThis.fetch(url, init), plazo = PLAZO, topeEnlace = crearTope(TOPE_ENLACE), topePartes = crearTope(TOPE_PARTES) } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return enviar(res, 405, { error: 'Usa GET para buscar el reel.' }); }
    if (!origenPermitido(req.headers || {})) return enviar(res, 403, { error: MENSAJES_REEL.origen });
    const q = parametros(req), fuente = q.get('fuente'), enlace = q.get('url');
    const tope = fuente !== null ? topePartes : topeEnlace, espera = tope(ipDe(req));
    if (espera) return enviar(res, 429, { error: `Hiciste muchos pedidos seguidos. Espera ${textoEspera(espera)} y vuelve a intentarlo.`, reintentarEn: espera }, { 'Retry-After': String(espera) });
    try {
      if (fuente !== null) {
        const { bytes, total } = await parteReel(fuente, q.get('parte'), { fetch: traer, plazo });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Tamano-Total', String(total));
        return res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
      }
      if (enlace === null || !enlace.trim()) return enviar(res, 400, { error: 'Falta el enlace del reel.' });
      return enviar(res, 200, await resolverReel(enlace, { fetch: traer, plazo }));
    } catch (e) {
      if (e instanceof ErrorPedido) return enviar(res, e.estado, { error: e.message, ...e.extra });
      console.error('[api/reel] error inesperado:', e?.name ?? '', e?.message ?? e);
      return enviar(res, 500, { error: `Algo falló al buscar el video. ${SUBE}`, sinVideo: true });
    }
  };
}

export default crearManejador();
