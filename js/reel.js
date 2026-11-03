// Bajar el video de un reel PÚBLICO de Instagram para analizarlo en la pestaña Replicar. El navegador no puede pedirle el
// video a Instagram directamente (CORS), así que lo pide por partes a la función /api/reel, que solo lee la página pública
// para «insertar» el reel en otros sitios: sin cuenta, sin cookies, sin saltarse nada. Si Instagram no lo comparte (reel
// privado, con música bloqueada o porque no responde), la joyera lo descarga o graba la pantalla y sube el archivo.
// El video se usa solo como referencia: se arma en la memoria del navegador y no se guarda en ningún lado.
// enlaceInstagram es puro y también lo usa el servidor (api/reel.js) para validar el enlace.

export const API_REEL = '/api/reel';
export const HOSTS_INSTAGRAM = ['instagram.com', 'www.instagram.com', 'm.instagram.com'];
export const MAX_BYTES_REEL = 80 * 1024 * 1024;   // el mismo tope del servidor

// Error con un código para que el panel sepa qué ofrecer: 'noInstagram' | 'local' | 'sinVideo' | 'grande' | 'limite' |
// 'origen' | 'red' | 'servidor' | 'incompleto'. El mensaje ya está en español y dice qué hacer.
export class ErrorReel extends Error {
  constructor(mensaje, codigo, extra = {}) { super(mensaje); this.name = 'ErrorReel'; this.codigo = codigo; Object.assign(this, extra); }
}

const SUBE_ARCHIVO = 'Descarga el reel (o graba la pantalla mientras se reproduce) y súbelo aquí.';
export const MENSAJES_REEL = {
  noInstagram: 'Ese enlace no es de Instagram. Abre el reel, toca Compartir → Copiar enlace y pégalo aquí.',
  noReel: 'Ese enlace de Instagram no es de un reel ni de una publicación con video. Abre el reel, toca Compartir → Copiar enlace y pégalo aquí.',
  local: 'El enlace solo funciona en la página publicada; sube el archivo.',
  sinVideo: `Instagram no dejó bajar ese reel (puede ser privado o estar bloqueado). ${SUBE_ARCHIVO}`,
  grande: 'Ese video es demasiado pesado para bajarlo (máximo 80 MB). Recórtalo o sube un archivo más liviano.',
  limite: 'Hiciste muchos pedidos seguidos. Espera un momento y vuelve a intentarlo.',
  origen: 'El enlace solo funciona desde la página del estudio.',
  red: `No hay conexión con el servidor. Revisa el internet e inténtalo de nuevo; si sigue fallando, ${SUBE_ARCHIVO.charAt(0).toLowerCase() + SUBE_ARCHIVO.slice(1)}`,
  servidor: `Instagram o el servidor no respondieron bien. Inténtalo de nuevo en un momento o ${SUBE_ARCHIVO.charAt(0).toLowerCase() + SUBE_ARCHIVO.slice(1)}`,
  incompleto: 'El video llegó incompleto. Inténtalo de nuevo.',
};

// «https://www.instagram.com/reel/ABC123/?igsh=…» → { tipo: 'reel', codigo: 'ABC123', url } (también /p/, /tv/, /reels/ y
// /usuario/reel/…; sirve aunque venga pegado dentro de un texto). Cualquier otra cosa → null.
export function enlaceInstagram(texto) {
  if (typeof texto !== 'string') return null;
  // cada palabra del texto que parezca un enlace (con o sin https://), sin la puntuación que la rodee
  for (const palabra of texto.slice(0, 4096).split(/\s+/)) {
    const t = palabra.replace(/^[<("'«“]+|[>)"'».,;:!?”]+$/g, '');
    if (!/instagram\.com/i.test(t)) continue;
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t);
    if (!conEsquema && !/^([a-z0-9-]+\.)*instagram\.com[/:]/i.test(t)) continue;
    let u;
    try { u = new URL(conEsquema ? t : 'https://' + t); } catch { continue; }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) continue;
    if (!HOSTS_INSTAGRAM.includes(u.hostname.toLowerCase())) continue;
    const p = u.pathname.match(/^\/(?:[A-Za-z0-9._]{1,30}\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,64})(?:\/|$)/);
    if (!p) continue;
    const tipo = p[1] === 'reels' ? 'reel' : p[1];
    return { tipo, codigo: p[2], url: `https://www.instagram.com/${tipo}/${p[2]}/` };
  }
  return null;
}

const pausa = ms => new Promise(ok => setTimeout(ok, ms));
const abortado = () => new DOMException('Cancelado', 'AbortError');

// Junta las tres formas de cancelar (la función cancelado() del panel, una señal externa y un error en otra parte) en una señal
function vigilante(cancelado, senalExterna) {
  const ctrl = new AbortController();
  const revisar = () => { if (!ctrl.signal.aborted && (cancelado?.() || senalExterna?.aborted)) ctrl.abort(abortado()); };
  const reloj = typeof cancelado === 'function' ? setInterval(revisar, 150) : null;
  const alAbortar = () => revisar();
  senalExterna?.addEventListener?.('abort', alAbortar);
  return {
    senal: ctrl.signal,
    abortar: e => { if (!ctrl.signal.aborted) ctrl.abort(e); },
    revisar: () => { revisar(); if (ctrl.signal.aborted) throw abortado(); },
    soltar: () => { if (reloj) clearInterval(reloj); senalExterna?.removeEventListener?.('abort', alAbortar); },
  };
}

async function leerJSON(r) {
  if (!/json/i.test(r.headers.get('content-type') || '')) return null;
  try { return await r.json(); } catch { return null; }
}

// Respuesta de error del servidor → ErrorReel con el mensaje más útil
function errorDe(r, datos, { resolviendo }) {
  const msg = typeof datos?.error === 'string' && datos.error.trim() ? datos.error.trim() : null;
  const espera = Number(datos?.reintentarEn || r.headers.get('retry-after')) || undefined;
  // sin la función (servidor estático local, o una página sin /api) llega un 404/405/501 en HTML
  if (!datos && resolviendo && [404, 405, 501].includes(r.status)) return new ErrorReel(MENSAJES_REEL.local, 'local');
  if (!datos && resolviendo && r.ok) return new ErrorReel(MENSAJES_REEL.local, 'local');
  switch (r.status) {
    case 400: return new ErrorReel(msg || MENSAJES_REEL.noReel, 'noInstagram');
    case 403: return new ErrorReel(msg || MENSAJES_REEL.origen, 'origen');
    case 404: case 405: case 501: return new ErrorReel(MENSAJES_REEL.local, 'local');
    case 410: return new ErrorReel(msg || MENSAJES_REEL.servidor, 'vencido');
    case 413: return new ErrorReel(msg || MENSAJES_REEL.grande, 'grande');
    case 422: return new ErrorReel(msg || MENSAJES_REEL.sinVideo, 'sinVideo', { sinVideo: true });
    case 429: return new ErrorReel(msg || MENSAJES_REEL.limite, 'limite', { reintentarEn: espera });
    default: return new ErrorReel(msg || MENSAJES_REEL.servidor, 'servidor');
  }
}

/**
 * Baja un reel público por partes (las respuestas de Vercel no pueden pasar de 4,5 MB) y lo arma.
 * alAvanzar(p, info): p de 0 a 1; info = { etapa: 'buscando' | 'bajando', recibido, total, partes }.
 * cancelado(): true para cancelar (también sirve signal). Rechaza con ErrorReel (o un AbortError si se canceló).
 * @param {string} url
 * @param {{ alAvanzar?: (p: number, info: object) => void, cancelado?: () => boolean, signal?: AbortSignal, fetch?: typeof fetch, api?: string, paralelo?: number }} [opciones]
 * @returns {Promise<Blob>}
 */
export async function descargarReel(url, { alAvanzar, cancelado, signal, fetch: traer = globalThis.fetch?.bind(globalThis), api = API_REEL, paralelo = 3 } = {}) {
  const enlace = enlaceInstagram(url);
  if (!enlace) throw new ErrorReel(/instagram\.com|instagr\.am/i.test(String(url || '')) ? MENSAJES_REEL.noReel : MENSAJES_REEL.noInstagram, 'noInstagram');
  if (typeof traer !== 'function') throw new ErrorReel(MENSAJES_REEL.local, 'local');
  const v = vigilante(cancelado, signal);
  // un fetch que se cancela con el vigilante; una falla de red se vuelve ErrorReel('red')
  const pedir = async u => {
    v.revisar();
    try { return await traer(u, { signal: v.senal, cache: 'no-store' }); } catch (e) {
      if (v.senal.aborted) throw v.senal.reason || abortado();   // cancelado, o ya falló otra parte
      if (e?.name === 'AbortError') throw abortado();
      throw new ErrorReel(MENSAJES_REEL.red, 'red');
    }
  };
  const resolver = async () => {
    const r = await pedir(`${api}?url=${encodeURIComponent(enlace.url)}`);
    const datos = await leerJSON(r);
    if (!r.ok || !datos) throw errorDe(r, datos, { resolviendo: true });
    const { fuente, tamano, partes, tamParte } = datos;
    if (typeof fuente !== 'string' || !(tamano > 0) || !(partes >= 1) || !(tamParte > 0) || partes !== Math.ceil(tamano / tamParte)) throw new ErrorReel(MENSAJES_REEL.servidor, 'servidor');
    if (tamano > MAX_BYTES_REEL) throw new ErrorReel(MENSAJES_REEL.grande, 'grande');
    return { ...datos, tipo: typeof datos.tipo === 'string' && datos.tipo ? datos.tipo : 'video/mp4' };
  };
  try {
    alAvanzar?.(0, { etapa: 'buscando', recibido: 0, total: 0, partes: 0 });
    let info = await resolver();
    // si el enlace firmado del video vence a mitad de camino (410), se pide uno nuevo una sola vez y se sigue
    let renovacion = null;
    const renovar = () => (renovacion ||= resolver().then(nueva => {
      if (nueva.tamano !== info.tamano || nueva.tamParte !== info.tamParte) throw new ErrorReel(MENSAJES_REEL.incompleto, 'incompleto');
      info = nueva;
    }));
    const datos = new Array(info.partes);
    let recibido = 0, siguiente = 0;
    alAvanzar?.(0, { etapa: 'bajando', recibido, total: info.tamano, partes: info.partes });
    const bajarParte = async i => {
      const esperado = Math.min(info.tamParte, info.tamano - i * info.tamParte);
      for (let intento = 1; ; intento++) {
        let error;
        try {
          const r = await pedir(`${api}?fuente=${encodeURIComponent(info.fuente)}&parte=${i}`);
          if (r.ok) {
            const buf = await r.arrayBuffer().catch(() => null);
            if (buf && buf.byteLength === esperado) return buf;
            error = new ErrorReel(MENSAJES_REEL.incompleto, 'incompleto');
          } else {
            error = errorDe(r, await leerJSON(r), { resolviendo: false });
            if (error.codigo === 'vencido' && intento <= 2) { await renovar(); continue; }
          }
        } catch (e) { error = e; }
        v.revisar();
        // se reintenta lo pasajero (red, servidor, llegó cortado); lo demás se reporta de una
        if (!(error instanceof ErrorReel) || !['red', 'servidor', 'incompleto'].includes(error.codigo) || intento >= 3) throw error;
        await pausa(400 * intento);
      }
    };
    const trabajador = async () => {
      while (siguiente < info.partes) {
        const i = siguiente++;
        datos[i] = await bajarParte(i);
        recibido += datos[i].byteLength;
        alAvanzar?.(Math.min(1, recibido / info.tamano), { etapa: 'bajando', recibido, total: info.tamano, partes: info.partes });
      }
    };
    // varias partes a la vez; si una falla, se cancelan las demás
    await Promise.all(Array.from({ length: Math.max(1, Math.min(paralelo, info.partes)) }, () => trabajador().catch(e => { v.abortar(e); throw e; })));
    v.revisar();
    const blob = new Blob(datos, { type: info.tipo });
    if (blob.size !== info.tamano) throw new ErrorReel(MENSAJES_REEL.incompleto, 'incompleto');
    return blob;
  } finally {
    v.soltar();
  }
}
