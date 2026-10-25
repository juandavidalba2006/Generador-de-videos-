// Qué clase de error devolvió el SDK de Anthropic, sin depender solo de `instanceof`: si el error viene de otra copia del SDK
// (un empaquetado de la función que duplica el paquete, o las pruebas con su propia carpeta node_modules) las clases no son
// las mismas y `instanceof` falla aunque el error sea el de siempre. Se mira, en orden: instanceof con el SDK que se importa
// aquí, los nombres de las clases en la cadena de prototipos, y el código HTTP (`status`) que traen todos los errores de la API.
import Anthropic from '@anthropic-ai/sdk';

const CLASES = [
  ['tiempo', 'APIConnectionTimeoutError'], ['conexion', 'APIConnectionError'], ['abortado', 'APIUserAbortError'],
  ['clave', 'AuthenticationError'], ['permiso', 'PermissionDeniedError'], ['limite', 'RateLimitError'], ['pedido', 'BadRequestError'],
  ['saturada', 'InternalServerError'], ['api', 'APIError'],
];
const nombresDe = e => {
  const out = new Set();
  if (typeof e?.name === 'string') out.add(e.name);
  for (let p = e && Object.getPrototypeOf(e), i = 0; p && i < 12; p = Object.getPrototypeOf(p), i++) if (typeof p.constructor?.name === 'string') out.add(p.constructor.name);
  return out;
};
// ¿Tiene la forma de un error de la API del SDK? (los de la API traen status, headers y requestID; los de conexión, status undefined)
const pareceDelSDK = e => !!e && typeof e === 'object' && 'status' in e && 'headers' in e && ('requestID' in e || 'error' in e);

/** → 'tiempo' | 'conexion' | 'abortado' | 'clave' | 'permiso' | 'limite' | 'pedido' | 'saturada' | 'api' | null (no es de la IA) */
export function tipoErrorIA(e) {
  if (!e || typeof e !== 'object') return null;
  for (const [tipo, clase] of CLASES) if (typeof Anthropic[clase] === 'function' && e instanceof Anthropic[clase]) return tipo;
  const nombres = nombresDe(e);
  for (const [tipo, clase] of CLASES) if (nombres.has(clase)) return tipo;
  // empaquetado que cambió los nombres de las clases: queda el código HTTP (y el mensaje, en los de conexión)
  if (!pareceDelSDK(e)) return null;
  const s = Number(e.status);
  if (Number.isFinite(s) && s > 0) return s === 401 ? 'clave' : s === 403 ? 'permiso' : s === 429 ? 'limite' : s === 400 ? 'pedido' : s >= 500 ? 'saturada' : 'api';
  return /timed?\s*out|timeout/i.test(String(e.message || '')) ? 'tiempo' : /abort/i.test(String(e.message || '')) ? 'abortado' : 'conexion';
}

// Segundos de «retry-after» de un error 429 (Headers del SDK o un objeto plano), o NaN
export function reintentarDe(e) {
  const h = e?.headers;
  const v = typeof h?.get === 'function' ? h.get('retry-after') : h && typeof h === 'object' ? h['retry-after'] : undefined;
  return Number(v);
}

// Un solo reintento, y solo para una falla rápida y pasajera (IA saturada, límite de velocidad, conexión): cuánto esperar (ms)
// o null. Un tiempo agotado no se reintenta: se cobraría dos veces y se pasaría del plazo de la función.
export function esperaReintentoIA(e) {
  const tipo = tipoErrorIA(e);
  if (tipo === 'limite') { const s = reintentarDe(e); return !Number.isFinite(s) || s < 0 ? 1000 : s <= 5 ? s * 1000 : null; }
  return tipo === 'saturada' || tipo === 'conexion' ? 800 : null;
}
