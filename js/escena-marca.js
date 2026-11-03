// Lo nuevo de las escenas de v4 (tela de satén, esquemas de luz, joya que flota, par, estuches y cajas, elementos) visto
// desde el replicador y el chat: los nombres que entiende la IA, los colores de la marca y cómo llevar un color cualquiera
// al de la marca más cercano por su papel en la escena y su claridad. Es puro y sin three.js (lo usan también las funciones
// del servidor), así que no importa utileria.js ni elementos.js: repite sus ids y arma configuraciones planas que después
// valida normalizarEscena (que llama a normalizarUtileria y normalizarElementos).
//
// completarEscena(cfg) es normalizarEscena con red: si el escenas.js de turno todavía no conoce un campo nuevo del contrato
// (fondo 'tela', luz.esquema, flotar, par, utileria, elementos), lo deja tal cual venía (validado aquí) en vez de perderlo.
import { ESCENAS, FORMAS_FONDO, escenaDe, normalizarEscena } from './escenas.js';

const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = x => Math.round(x * 100) / 100;
const hexDe = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);

// ---------- Catálogos (los mismos ids de escenas.js, utileria.js y elementos.js) ----------
export const ESQUEMAS_LUZ = {
  ventana: 'Luz de ventana',
  'clave-baja': 'Clave baja (fondo oscuro y brillos dorados)',
  'alta-clave': 'Alta clave (clara y suave)',
  contraluz: 'Contraluz (fondo claro, siluetas)',
};
export const TIPOS_UTILERIA = {
  ninguna: 'Sin estuche', 'estuche-anillo': 'Estuche de anillo', 'caja-regalo': 'Caja de regalo', 'estuche-aretes': 'Estuche de aretes',
  'estuche-collar': 'Estuche de collar', cofre: 'Cofre de tapa alta', cajon: 'Caja de cajón', bandeja: 'Bandeja', 'pila-cajas': 'Pila de cajas',
};
export const POSICIONES_UTILERIA = ['asiento', 'al-lado', 'escenario'];
// Lo que la IA puede decir que acompaña a la joya, y el grupo de elementos.js que lo recrea
export const ELEMENTOS_IA = { esferas: 'Esferas', perlas: 'Perlas', cuentas: 'Cuentas', cristal: 'Esfera de cristal', cinta: 'Cinta de satén', cadena: 'Cadena' };
export const COREOGRAFIAS_IDS = ['quieto', 'rodar', 'rebotar', 'fila-flotante', 'caer-en-circulo', 'orbitar', 'lluvia', 'entrar', 'volar'];
export const RECORRIDOS_CINTA_IDS = ['corazon', 'onda', 'espiral', 'lazo'];
// Pistas nuevas del contrato (proyecto.js las trae cuando está integrado; mientras, el chat y la réplica las validan con esto)
export const PISTAS_NUEVAS = {
  apertura: { nombre: 'Apertura del estuche', min: 0, max: 1, def: 1 },
  elevar: { nombre: 'Elevar la joya', min: 0, max: 1.5, def: 0 },
  luz: { nombre: 'Ángulo de la luz', min: -180, max: 180, def: 0 },
};

// Colores de la marca (los de estilos.css)
export const COLORES_MARCA = {
  tinta: { hex: '#1E1B15', nombre: 'Tinta' }, bosque: { hex: '#17150F', nombre: 'Bosque' }, esmeralda: { hex: '#1E5B4B', nombre: 'Esmeralda' },
  granate: { hex: '#8E2F3A', nombre: 'Granate' }, rosa: { hex: '#C9A3A8', nombre: 'Rosa' }, perla: { hex: '#F1EFEA', nombre: 'Perla' },
  papel: { hex: '#FCFBF8', nombre: 'Papel' }, oro: { hex: '#B8871F', nombre: 'Oro' },
};
export const idMarca = hex => { const h = hexDe(hex); return Object.entries(COLORES_MARCA).find(([, c]) => c.hex === h)?.[0] || null; };

// ---------- Color → color de la marca ----------
// OKLab: claridad L (0 negro … 1 blanco), croma C y tono h (grados: rojo ≈ 30, amarillo ≈ 110, verde ≈ 140, cian ≈ 195, azul ≈ 265)
export function oklab(hex) {
  const h = hexDe(hex); if (!h) return null;
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360 };
}

/**
 * El color de la marca que hace el mismo papel en la escena: por claridad y familia de tono.
 * rol: 'fondo' | 'superficie' | 'caja' | 'interior' | 'cinta' | 'acento'. → id de COLORES_MARCA
 *  · oscuro frío o azul (noche, tinta) → tinta; oscuro verde o verde azulado → esmeralda (o bosque si casi no tiene color);
 *  · oscuro cálido, rojo o vino → granate; claro → perla (papel si es casi blanco; rosa si es claro y rosado);
 *  · dorado, amarillo o naranja con color → oro (en una cinta, siempre que sea metálico o dorado).
 * Así nunca sale el azul de otra casa: un turquesa claro de caja o de fondo queda perla, uno oscuro queda esmeralda.
 */
export function marcaMasCercana(hex, rol = 'fondo') {
  const c = oklab(hex);
  if (!c) return rol === 'cinta' || rol === 'acento' ? 'oro' : rol === 'interior' ? 'perla' : 'tinta';
  const { L, C, h } = c;
  const dorado = h >= 50 && h < 115 && C >= 0.05;
  const rojizo = (h >= 340 || h < 50) && C >= 0.035;
  const verde = h >= 115 && h < 235;
  if (dorado && L >= 0.45 && L < 0.9) return 'oro';
  if (rol === 'cinta' || rol === 'acento') {
    // una cinta es clara (perla), dorada (oro) o de color (granate, esmeralda o tinta)
    if (L >= 0.62) return rojizo && L < 0.85 ? 'rosa' : 'perla';
    return rojizo ? 'granate' : verde && C >= 0.03 ? 'esmeralda' : 'tinta';
  }
  if (L >= 0.66) {
    if (rojizo && L < 0.86 && C >= 0.04) return 'rosa';
    return L >= 0.93 && C < 0.02 ? 'papel' : 'perla';
  }
  if (rojizo) return L >= 0.55 && C < 0.09 ? 'rosa' : 'granate';
  if (verde) return C >= 0.035 ? 'esmeralda' : 'bosque';
  if (h >= 235 && h < 340 && C >= 0.035) return 'tinta';   // azul, índigo o morado oscuro: la noche de la marca
  return L < 0.2 ? 'bosque' : 'tinta';
}
export const hexMarca = (hex, rol) => COLORES_MARCA[marcaMasCercana(hex, rol)].hex;

// ---------- Escenas de satén (por si escenas.js todavía no las trae) ----------
// Mismos campos del contrato; con escenas.js integrado se usan las suyas (escenaDe).
const SATEN = (nombre, descripcion, color, extra = {}) => ({
  nombre, descripcion,
  superficie: { forma: 'piso', material: 'terciopelo', color, tamano: 1, altura: 1 },
  fondo: { forma: 'tela', material: 'terciopelo', color, distancia: 1.4, ondas: 0.35, degradado: 0.5, destellos: 0 },
  luz: { gobo: 'ninguno', angulo: -12, elevacion: 55, suavidad: 0.55, intensidad: 1.2, calidez: 0.5, esquema: 'clave-baja' },
  ambiente: 0.55, flotar: { activo: true, altura: 0.35, bob: 0.3 }, par: { activo: false, separacion: 0.6 },
  utileria: { tipo: 'ninguna' }, elementos: [], respaldo: 'terciopelo', ...extra,
});
export const ESCENAS_SATEN = {
  'saten-noche': SATEN('Satén de noche', 'Tela de satén tinta con pliegues suaves y luz dorada: la joya flota.', '#1E1B15', { respaldo: 'marmol-negro' }),
  'saten-esmeralda': SATEN('Satén esmeralda', 'Satén verde esmeralda con pliegues y luz cálida.', '#1E5B4B'),
  'saten-granate': SATEN('Satén granate', 'Satén vino con brillos suaves y luz dorada.', '#8E2F3A', { respaldo: 'marmol-negro' }),
  'saten-perla': SATEN('Satén perla', 'Satén claro en alta clave: luminoso y suave.', '#F1EFEA', {
    luz: { gobo: 'ninguno', angulo: -20, elevacion: 60, suavidad: 0.8, intensidad: 1.05, calidez: 0.2, esquema: 'alta-clave' }, ambiente: 1, respaldo: 'marmol-blanco',
  }),
};
// Satén que va con un color de la marca (el fondo de la réplica o «fondo de satén esmeralda» en el chat)
export const SATEN_DE_MARCA = { tinta: 'saten-noche', bosque: 'saten-noche', esmeralda: 'saten-esmeralda', granate: 'saten-granate', perla: 'saten-perla', papel: 'saten-perla', rosa: 'saten-perla', oro: 'saten-noche' };
export const nombreEscena = id => ESCENAS[id]?.nombre || ESCENAS_SATEN[id]?.nombre || null;
export const esEscenaConocida = id => typeof id === 'string' && (Object.hasOwn(ESCENAS, id) || Object.hasOwn(ESCENAS_SATEN, id));
export const IDS_ESCENA = [...new Set([...Object.keys(ESCENAS), ...Object.keys(ESCENAS_SATEN)])];
export const FORMAS_FONDO_V4 = Object.hasOwn(FORMAS_FONDO, 'tela') ? FORMAS_FONDO : { ...FORMAS_FONDO, tela: 'Tela de satén con pliegues' };

// Configuración completa de una escena lista (también las de satén aunque escenas.js no las tenga)
export function escenaDeId(id) {
  if (Object.hasOwn(ESCENAS, id)) return completarEscena(escenaDe(id));
  const s = ESCENAS_SATEN[id];
  if (!s) return completarEscena(escenaDe(id));
  const { nombre, descripcion, respaldo, ...cfg } = JSON.parse(JSON.stringify(s));
  return completarEscena({ ...cfg, id: respaldo, preset: id });
}

// ---------- Validación de los campos nuevos (por si normalizarEscena aún no los conoce) ----------
const n01 = (v, def) => (esNum(v) ? r2(limitar(v, 0, 1)) : def);
function flotarDe(v, def = { activo: false, altura: 0.35, bob: 0.3 }) {
  if (typeof v === 'boolean') return { ...def, activo: v };
  if (!esObj(v)) return { ...def };
  return { activo: typeof v.activo === 'boolean' ? v.activo : def.activo, altura: esNum(v.altura) ? r2(limitar(v.altura, 0, 1.5)) : def.altura, bob: n01(v.bob, def.bob) };
}
function parDe(v, def = { activo: false, separacion: 0.6 }) {
  if (typeof v === 'boolean') return { ...def, activo: v };
  if (!esObj(v)) return { ...def };
  return { activo: typeof v.activo === 'boolean' ? v.activo : def.activo, separacion: esNum(v.separacion) ? r2(limitar(v.separacion, 0.2, 2)) : def.separacion };
}
// utilería y elementos: lo mínimo (normalizarUtileria y normalizarElementos completan el resto cuando escenas.js los usa)
function utileriaDe(v) {
  const c = typeof v === 'string' ? { tipo: v } : esObj(v) ? v : {};
  const tipo = typeof c.tipo === 'string' && Object.hasOwn(TIPOS_UTILERIA, c.tipo) ? c.tipo : 'ninguna';
  if (tipo === 'ninguna') return { tipo };
  const out = { ...c, tipo };
  for (const k of ['color', 'interior', 'cinta']) { if (k in out && !hexDe(out[k])) delete out[k]; else if (k in out) out[k] = hexDe(out[k]); }
  if ('apertura' in out) out.apertura = n01(out.apertura, 0);
  if ('posicion' in out && !POSICIONES_UTILERIA.includes(out.posicion)) delete out.posicion;
  return out;
}
const FORMAS_ELEMENTO_IDS = ['esfera', 'perla', 'cuenta', 'cubo', 'cilindro', 'aro', 'gema', 'regalo', 'stl', 'cinta', 'cadena'];
function elementosDe(v) {
  return (Array.isArray(v) ? v : []).filter(g => esObj(g) && FORMAS_ELEMENTO_IDS.includes(g.forma)).slice(0, 8).map(g => ({ ...g }));
}

/**
 * normalizarEscena + los campos del contrato de v4 que el escenas.js de turno no devuelva todavía. Nunca lanza.
 * cfg puede traer preset: 'saten-noche' (una escena de satén que escenas.js aún no conoce): se usa como id si ya existe.
 */
export function completarEscena(cfg) {
  const c = esObj(cfg) ? cfg : typeof cfg === 'string' ? { id: cfg } : {};
  const entrada = esObj(c) && typeof c.preset === 'string' && Object.hasOwn(ESCENAS, c.preset) ? { ...c, id: c.preset } : c;
  let r;
  try { r = normalizarEscena(entrada); } catch { r = normalizarEscena(null); }
  if (!esObj(r) || r.id === 'ninguna') return r;
  // solo lo que venga con un valor distinto del de siempre: así una escena vieja queda igual a la de normalizarEscena
  const f = esObj(c.fondo) ? c.fondo : {}, l = esObj(c.luz) ? c.luz : {};
  r.fondo = { ...r.fondo };
  r.luz = { ...r.luz };
  if (f.forma === 'tela' && r.fondo.forma !== 'tela') r.fondo.forma = 'tela';
  for (const k of ['ondas', 'degradado', 'destellos']) if (!esNum(r.fondo[k]) && esNum(f[k]) && f[k] > 0) r.fondo[k] = n01(f[k], 0);
  if (!Object.hasOwn(ESQUEMAS_LUZ, r.luz.esquema) && Object.hasOwn(ESQUEMAS_LUZ, l.esquema) && l.esquema !== 'ventana') r.luz.esquema = l.esquema;
  if (!esObj(r.flotar) && (c.flotar === true || c.flotar?.activo === true)) r.flotar = flotarDe(c.flotar);
  if (!esObj(r.par) && (c.par === true || c.par?.activo === true)) r.par = parDe(c.par);
  if (!esObj(r.utileria)) { const u = utileriaDe(c.utileria); if (u.tipo !== 'ninguna') r.utileria = u; }
  if (!Array.isArray(r.elementos)) { const g = elementosDe(c.elementos); if (g.length) r.elementos = g; }
  // una escena de satén que escenas.js todavía no conoce: se recuerda cuál era (el panel la nombra)
  if (typeof c.preset === 'string' && Object.hasOwn(ESCENAS_SATEN, c.preset) && r.id !== c.preset) r.preset = c.preset;
  return r;
}

// ---------- Utilería y elementos a partir de lo que se vio (o se pidió en el chat) ----------
// tipoJoya: el de la IA (anillo, aretes, collar, pulsera, dije, otro): qué estuche le va
export function estucheParaJoya(tipoJoya) {
  return { aretes: 'estuche-aretes', collar: 'estuche-collar', dije: 'estuche-collar', pulsera: 'cofre' }[tipoJoya] || 'estuche-anillo';
}
// Grupo de elementos.js para un tipo de los que reconoce la IA (con su coreografía y recorrido, si los dijo)
export function grupoElemento(tipo, { coreografia, recorrido, color, id } = {}) {
  const cor = COREOGRAFIAS_IDS.includes(coreografia) ? coreografia : null;
  const g = {
    esferas: { forma: 'esfera', material: 'piedra', coreografia: cor || 'rodar', cantidad: 1, tamano: 2 },
    perlas: { forma: 'perla', material: 'nacar', coreografia: cor || 'rebotar', cantidad: cor === 'caer-en-circulo' ? 14 : 6 },
    cuentas: { forma: 'cuenta', material: 'brillante', coreografia: cor || 'fila-flotante', cantidad: cor === 'caer-en-circulo' ? 18 : 12 },
    cristal: { forma: 'esfera', material: 'cristal', color: COLORES_MARCA.perla.hex, coreografia: cor && cor !== 'rodar' ? cor : 'quieto', cantidad: 1, tamano: 2.6 },
    cinta: { forma: 'cinta', material: 'saten', recorrido: RECORRIDOS_CINTA_IDS.includes(recorrido) ? recorrido : 'corazon', enhebrar: true, crecer: 0.7 },
    cadena: { forma: 'cadena', material: 'metal', colgar: 'joya', estilo: 'cable' },
  }[tipo];
  if (!g) return null;
  if (hexDe(color)) g.color = hexDe(color);
  if (id) g.id = id;
  return g;
}
