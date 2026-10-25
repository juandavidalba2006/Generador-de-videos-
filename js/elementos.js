// Elementos de la escena: utilería que se mueve alrededor de la joya y conversa con ella, como en los reels de joyería:
// esferas de piedra, perlas, cuentas, cubos, cilindros, aros, gemas, cajitas de regalo y el STL propio de la joyera, con
// coreografías (rodar, rebotar, fila flotante, caer en círculo, orbitar, lluvia, entrar, volar con estela de destellos);
// una cinta de satén que puede pasar por el agujero del anillo y una cadena fina para colgar un dije (o dejarla caer
// sobre una esfera).
// Todo el movimiento es una función cerrada del tiempo t (sin azar por cuadro: la semilla fija la variación), así la vista
// previa y el video dan exactamente lo mismo. Nada atraviesa la joya, el piso ni a los otros elementos: las trayectorias
// se planean con holguras y se revisan con números al armar.
// Unidades: las del estudio (el STL de la joya viene en mm: mmPorUnidad = 1). El STL que se exporta va en mm.
// Marcos: la utilería del piso gira con el escenario (motor rápido: girar(az), como Escenario3D; trazador: quieta, allá gira
// la joya) y la cinta y la cadena del dije van pegadas a la joya (motor rápido: quietas; trazador: dentro de la tornamesa).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { escribirSTL } from './stl.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const EJE_Y = V(0, 1, 0);
const sat = x => Math.min(1, Math.max(0, x));
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suave = u => (u = sat(u), u * u * (3 - 2 * u));
const suave5 = u => (u = sat(u), u * u * u * (u * (6 * u - 15) + 10));
const friccion = u => (u = sat(u), 1 - (1 - u) * (1 - u));   // rozamiento parejo: la velocidad baja en línea recta hasta 0
const salida3 = u => (u = sat(u), 1 - (1 - u) ** 3);
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const hayDOM = () => typeof document !== 'undefined';

// ---------- Catálogo ----------
// Colores de la marca (nunca el azul de otra casa: la joyera puede escoger cualquier color con el selector libre)
export const COLORES_MARCA = [
  { id: 'esmeralda', hex: '#1E5B4B', nombre: 'Esmeralda' },
  { id: 'perla', hex: '#F1EFEA', nombre: 'Perla' },
  { id: 'oro', hex: '#B8871F', nombre: 'Oro' },
  { id: 'granate', hex: '#8E2F3A', nombre: 'Granate' },
  { id: 'tinta', hex: '#1E1B15', nombre: 'Tinta' },
  { id: 'rosa', hex: '#C9A3A8', nombre: 'Rosa' },
];
const HEX = Object.fromEntries(COLORES_MARCA.map(c => [c.id, c.hex]));

// camino: la forma no tiene coreografía, sigue un recorrido (cinta) o cuelga (cadena)
export const FORMAS_ELEMENTO = {
  esfera:   { nombre: 'Esfera', color: 'esmeralda', material: 'piedra', coreografia: 'rodar', cantidad: 1, max: 12 },
  perla:    { nombre: 'Perla', color: 'perla', material: 'nacar', coreografia: 'rebotar', cantidad: 5, max: 36 },
  cuenta:   { nombre: 'Cuenta', color: 'granate', material: 'brillante', coreografia: 'fila-flotante', cantidad: 9, max: 48 },
  cubo:     { nombre: 'Cubo', color: 'rosa', material: 'laca', coreografia: 'quieto', cantidad: 2, max: 12 },
  cilindro: { nombre: 'Cilindro', color: 'tinta', material: 'laca', coreografia: 'rodar', cantidad: 2, max: 12 },
  aro:      { nombre: 'Aro', color: 'oro', material: 'metal', coreografia: 'orbitar', cantidad: 3, max: 12 },
  gema:     { nombre: 'Gema', color: 'granate', material: 'cristal', coreografia: 'orbitar', cantidad: 3, max: 12 },
  regalo:   { nombre: 'Cajita de regalo', color: 'esmeralda', material: 'laca', coreografia: 'volar', cantidad: 1, max: 6 },
  stl:      { nombre: 'Mi STL', color: 'perla', material: 'laca', coreografia: 'entrar', cantidad: 1, max: 6 },
  cinta:    { nombre: 'Cinta de satén', color: 'perla', material: 'saten', coreografia: 'quieto', cantidad: 1, max: 1, camino: true },
  cadena:   { nombre: 'Cadena', color: 'oro', material: 'metal', coreografia: 'quieto', cantidad: 1, max: 1, camino: true },
};
export const MATERIALES_ELEMENTO = {
  piedra: 'Piedra mate', laca: 'Laca', brillante: 'Pulido', nacar: 'Nácar', metal: 'Metal', cristal: 'Cristal', saten: 'Satén',
};
export const COREOGRAFIAS = {
  quieto: 'Quieto', rodar: 'Rodar y frenar', rebotar: 'Caer y rebotar', 'fila-flotante': 'Fila flotante',
  'caer-en-circulo': 'Caer en círculo', orbitar: 'Orbitar', lluvia: 'Lluvia', entrar: 'Entrar deslizando', volar: 'Volar en bucle',
};
export const RECORRIDOS_CINTA = { corazon: 'Corazón', onda: 'Onda', espiral: 'Espiral', lazo: 'Lazo' };
export const ESTILOS_CADENA = { cable: 'Cable', rolo: 'Rolo', serpiente: 'Serpiente' };
export const METALES_CADENA = { joya: 'Como la joya', amarillo: 'Oro amarillo', rosa: 'Oro rosa', blanco: 'Oro blanco', plata: 'Plata' };
export const COLGAR_CADENA = { joya: 'Del dije (la joya)', libre: 'Suelta entre dos puntos' };
const DURACION = { quieto: 1, rodar: 2.6, rebotar: 2.4, 'fila-flotante': 6, 'caer-en-circulo': 3, orbitar: 6, lluvia: 4, entrar: 2.4, volar: 5 };
export const RANGOS_ELEMENTO = {
  cantidad: { min: 1, max: 48, def: 1 }, tamano: { min: 0.2, max: 4, def: 1 },
  inicio: { min: 0, max: 60, def: 0 }, duracion: { min: 0.3, max: 30, def: 2.5 }, semilla: { min: 0, max: 9999, def: 1 },
  crecer: { min: 0, max: 1, def: 0.7 }, aleteo: { min: 0, max: 1, def: 0.35 }, largo: { min: 0.4, max: 2.5, def: 1 },
  holgura: { min: 0, max: 0.6, def: 0.02 }, vaiven: { min: 0, max: 1, def: 0.3 }, estela: { min: 0, max: 1, def: 0.6 },
};
export const MAX_GRUPOS = 8;

const num = (v, k, def = RANGOS_ELEMENTO[k].def) => (typeof v === 'number' && Number.isFinite(v) ? limitar(v, RANGOS_ELEMENTO[k].min, RANGOS_ELEMENTO[k].max) : def);
const clave = (lista, v, def) => (typeof v === 'string' && Object.hasOwn(lista, v) ? v : def);
function colorDe(v, def) {
  if (typeof v !== 'string') return def;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  return HEX[s.toLowerCase()] || def;
}

// Valida un grupo de elementos (de un archivo, del chat o del panel). Nunca lanza: lo que no sirve toma su valor por defecto
export function normalizarElemento(cfg, i = 0) {
  const c = esObj(cfg) ? cfg : {};
  const forma = clave(FORMAS_ELEMENTO, c.forma, 'perla'), F = FORMAS_ELEMENTO[forma];
  const coreografia = F.camino ? 'quieto' : clave(COREOGRAFIAS, c.coreografia, F.coreografia);
  const stl = forma === 'stl' && esObj(c.stl) && typeof c.stl.id === 'string' && /^[\w-]{1,64}$/.test(c.stl.id)
    ? { id: c.stl.id, nombre: String(c.stl.nombre ?? '').replace(/[<>]/g, '').slice(0, 60) } : null;
  return {
    id: typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : `el-${i + 1}`,
    forma,
    color: colorDe(c.color, HEX[F.color]),
    color2: colorDe(c.color2, forma === 'regalo' ? HEX.oro : HEX.perla),   // la cinta de la cajita de regalo
    material: clave(MATERIALES_ELEMENTO, c.material, F.material),
    cantidad: Math.round(limitar(typeof c.cantidad === 'number' && Number.isFinite(c.cantidad) ? c.cantidad : F.cantidad, 1, F.max)),
    tamano: num(c.tamano, 'tamano'),
    coreografia,
    inicio: num(c.inicio, 'inicio'),
    duracion: num(c.duracion, 'duracion', forma === 'cinta' ? 2.5 : DURACION[coreografia]),   // (la cinta: lo que tarda en dibujarse)
    semilla: Math.round(num(c.semilla, 'semilla')),
    // cinta
    recorrido: clave(RECORRIDOS_CINTA, c.recorrido, 'corazon'),
    enhebrar: typeof c.enhebrar === 'boolean' ? c.enhebrar : true,
    crecer: num(c.crecer, 'crecer'), aleteo: num(c.aleteo, 'aleteo'), largo: num(c.largo, 'largo'),
    // cadena
    estilo: clave(ESTILOS_CADENA, c.estilo, 'cable'),
    metal: clave(METALES_CADENA, c.metal, 'joya'),
    colgar: clave(COLGAR_CADENA, c.colgar, 'joya'),
    holgura: num(c.holgura, 'holgura'), vaiven: num(c.vaiven, 'vaiven'),
    sobre: typeof c.sobre === 'string' && /^[\w-]{1,40}$/.test(c.sobre) ? c.sobre : '',
    punto: Array.isArray(c.punto) && c.punto.length === 3 && c.punto.every(v => typeof v === 'number' && Number.isFinite(v)) ? c.punto.slice() : null,
    // volar
    estela: num(c.estela, 'estela'),
    stl,
  };
}
export function normalizarElementos(lista) {
  if (!Array.isArray(lista)) return [];
  const sal = [], usados = new Set();
  for (const x of lista) {
    if (sal.length >= MAX_GRUPOS) break;
    if (!esObj(x)) continue;
    const g = normalizarElemento(x, sal.length);
    let id = g.id, k = 2;
    while (usados.has(id)) id = `${g.id}-${k++}`.slice(-40);
    g.id = id; usados.add(id);
    if (g.sobre === g.id) g.sobre = '';
    sal.push(g);
  }
  return sal;
}
// Grupo nuevo para el panel (id que no choca con los que hay y otra semilla)
export function elementoNuevo(forma = 'perla', lista = []) {
  const ids = new Set((Array.isArray(lista) ? lista : []).map(g => g?.id));
  let i = 1; while (ids.has(`el-${i}`)) i++;
  return normalizarElemento({ forma, id: `el-${i}`, semilla: (i * 37 + 11) % 10000 }, i - 1);
}

// ---------- Azar con semilla y utilidades ----------
function azar(semilla) {
  let s = (semilla >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashNum = (a, b = 0) => { let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const qAzar = r => { const u1 = r(), u2 = r() * 2 * Math.PI, u3 = r() * 2 * Math.PI, a = Math.sqrt(1 - u1), b = Math.sqrt(u1); return new THREE.Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)); };
const qEje = (eje, ang, q = Q()) => q.setFromAxisAngle(eje, ang);
const aV = x => (x?.isVector3 ? x.clone() : Array.isArray(x) && x.length >= 3 && x.slice(0, 3).every(Number.isFinite) ? V(x[0], x[1], x[2]) : esObj(x) && [x.x, x.y, x.z].every(Number.isFinite) ? V(x.x, x.y, x.z) : null);
function aCaja(c) {
  if (c?.isBox3) return c.isEmpty() ? null : c.clone();
  if (esObj(c)) { const a = aV(c.min), b = aV(c.max); if (a && b) return new THREE.Box3(a.clone().min(b), a.max(b)); }
  return null;
}

// ---------- La joya ----------
// caja: límites de la joya en unidades del estudio (centrada como la deja estudio.medir); objeto: el grupo con sus mallas (para
// sus triángulos de verdad: el agujero del anillo, el punto más alto para la cadena); triangulos: lo mismo ya en un Float32Array
export function describirJoya(op = {}) {
  const j = esObj(op.joya) ? op.joya : {};
  const mm = typeof j.mmPorUnidad === 'number' && j.mmPorUnidad > 0 && Number.isFinite(j.mmPorUnidad) ? j.mmPorUnidad : 1;
  const caja = aCaja(j.caja) || new THREE.Box3(V(-10, -10, -2).divideScalar(mm), V(10, 10, 2).divideScalar(mm));
  const tam = caja.getSize(V()), R = Math.max(tam.length() / 2, 1e-4);
  const ax = Math.max(Math.abs(caja.min.x), Math.abs(caja.max.x)), az = Math.max(Math.abs(caja.min.z), Math.abs(caja.max.z));
  const suelo = typeof op.suelo === 'number' && Number.isFinite(op.suelo) ? Math.min(op.suelo, caja.min.y) : caja.min.y;
  return {
    caja, mm, R, rJ: Math.hypot(ax, az), yMin: caja.min.y, yMax: caja.max.y, centro: caja.getCenter(V()), suelo, gap: 0.05 * R,
    version: op.version ?? null, objeto: j.objeto?.isObject3D ? j.objeto : null, triangulos: j.triangulos instanceof Float32Array ? j.triangulos : null,
    metal: typeof op.metal === 'string' ? op.metal : typeof j.metal === 'string' ? j.metal : '',
  };
}
// Triángulos de la joya en coordenadas del mundo (9 números por triángulo). Se guardan por versión del modelo
const CACHE_TRI = new Map();
function triangulosJoya(J) {
  if (J.triangulos) return J.triangulos;
  if (!J.objeto) return null;
  const k = `${J.version}|${J.objeto.uuid}|${J.caja.min.toArray()}|${J.caja.max.toArray()}`;
  if (CACHE_TRI.has(k)) return CACHE_TRI.get(k);
  J.objeto.updateMatrixWorld(true);
  const partes = [], vistos = new Set(), v = V();
  J.objeto.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const id = o.geometry.uuid + o.matrixWorld.elements.join(',');
    if (vistos.has(id)) return;   // (las piedras del motor rápido son dos mallas con la misma geometría)
    vistos.add(id);
    const p = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : p.count, sal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(o.matrixWorld); sal[3 * i] = v.x; sal[3 * i + 1] = v.y; sal[3 * i + 2] = v.z; }
    partes.push(sal);
  });
  const total = partes.reduce((a, p) => a + p.length, 0), tri = new Float32Array(total);
  let o = 0; for (const p of partes) { tri.set(p, o); o += p.length; }
  if (CACHE_TRI.size > 6) CACHE_TRI.clear();
  CACHE_TRI.set(k, tri);
  return tri;
}

// ---------- Geometría: punto–triángulo y rejilla de búsqueda ----------
const _ab = V(), _ac = V(), _ap = V(), _bp = V(), _cp = V();
function puntoMasCercano(p, a, b, c, out) {   // (Ericson, «Real-Time Collision Detection» 5.1.5)
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  _bp.subVectors(p, b); const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(_ab, d1 / (d1 - d3));
  _cp.subVectors(p, c); const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(_ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return out.copy(b).addScaledVector(_cp.subVectors(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(_ab, vb * den).addScaledVector(_ac, vc * den);
}
// Rejilla uniforme con los triángulos de la joya: ¿qué tan lejos está un punto del metal?
const CACHE_REJ = new WeakMap();
function rejillaDe(tri, R) {
  if (CACHE_REJ.has(tri)) return CACHE_REJ.get(tri);
  const n = tri.length / 9, caja = new THREE.Box3();
  for (let i = 0; i < tri.length; i += 3) caja.expandByPoint(_ap.set(tri[i], tri[i + 1], tri[i + 2]));
  const h = Math.max(R / 10, caja.getSize(V()).length() / 60), o = caja.min.clone().addScalar(-h), N = caja.getSize(V()).addScalar(2 * h).divideScalar(h).ceil().addScalar(1);
  const celda = (x, y, z) => (Math.floor((z - o.z) / h) * N.y + Math.floor((y - o.y) / h)) * N.x + Math.floor((x - o.x) / h);
  const cuenta = new Int32Array(N.x * N.y * N.z + 1), rangos = [];
  for (let t = 0; t < n; t++) {
    const i = 9 * t;
    const x0 = Math.min(tri[i], tri[i + 3], tri[i + 6]), x1 = Math.max(tri[i], tri[i + 3], tri[i + 6]);
    const y0 = Math.min(tri[i + 1], tri[i + 4], tri[i + 7]), y1 = Math.max(tri[i + 1], tri[i + 4], tri[i + 7]);
    const z0 = Math.min(tri[i + 2], tri[i + 5], tri[i + 8]), z1 = Math.max(tri[i + 2], tri[i + 5], tri[i + 8]);
    const r = [Math.floor((x0 - o.x) / h), Math.floor((x1 - o.x) / h), Math.floor((y0 - o.y) / h), Math.floor((y1 - o.y) / h), Math.floor((z0 - o.z) / h), Math.floor((z1 - o.z) / h)];
    rangos.push(r);
    for (let z = r[4]; z <= r[5]; z++) for (let y = r[2]; y <= r[3]; y++) for (let x = r[0]; x <= r[1]; x++) cuenta[(z * N.y + y) * N.x + x + 1]++;
  }
  for (let i = 1; i < cuenta.length; i++) cuenta[i] += cuenta[i - 1];
  const lista = new Int32Array(cuenta[cuenta.length - 1]), pos = cuenta.slice(0, -1);
  rangos.forEach((r, t) => { for (let z = r[4]; z <= r[5]; z++) for (let y = r[2]; y <= r[3]; y++) for (let x = r[0]; x <= r[1]; x++) lista[pos[(z * N.y + y) * N.x + x]++] = t; });
  const rej = { tri, h, o, N, cuenta, lista, caja, celda, marca: new Uint32Array(n), vuelta: 1 };
  CACHE_REJ.set(tri, rej);
  return rej;
}
const _a = V(), _b = V(), _c = V(), _q = V();
// Distancia del punto al metal (si es mayor que tope, devuelve tope: solo se buscan las celdas cercanas)
function distanciaJoya(rej, p, tope) {
  const { h, o, N, cuenta, lista, tri, marca } = rej;
  if (p.x < rej.caja.min.x - tope || p.y < rej.caja.min.y - tope || p.z < rej.caja.min.z - tope || p.x > rej.caja.max.x + tope || p.y > rej.caja.max.y + tope || p.z > rej.caja.max.z + tope) return tope;
  const v = ++rej.vuelta; let mejor = tope;
  const x0 = Math.max(0, Math.floor((p.x - tope - o.x) / h)), x1 = Math.min(N.x - 1, Math.floor((p.x + tope - o.x) / h));
  const y0 = Math.max(0, Math.floor((p.y - tope - o.y) / h)), y1 = Math.min(N.y - 1, Math.floor((p.y + tope - o.y) / h));
  const z0 = Math.max(0, Math.floor((p.z - tope - o.z) / h)), z1 = Math.min(N.z - 1, Math.floor((p.z + tope - o.z) / h));
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = (z * N.y + y) * N.x + x;
    for (let k = cuenta[c]; k < cuenta[c + 1]; k++) {
      const t = lista[k]; if (marca[t] === v) continue; marca[t] = v;
      const i = 9 * t;
      puntoMasCercano(p, _a.set(tri[i], tri[i + 1], tri[i + 2]), _b.set(tri[i + 3], tri[i + 4], tri[i + 5]), _c.set(tri[i + 6], tri[i + 7], tri[i + 8]), _q);
      const d = _q.distanceTo(p); if (d < mejor) mejor = d;
    }
  }
  return mejor;
}

// ---------- El agujero de la joya (para pasar la cinta por el anillo) ----------
// Se proyecta la joya a lo largo de varios ejes (x, y, z y los de su forma) en una cuadrícula; los huecos encerrados son
// agujeros. El mejor es el más ancho; su centro y su radio se afinan con la distancia exacta a los triángulos proyectados.
// Por construcción, el cilindro de ese radio a lo largo del eje no toca ningún triángulo: la cinta que va recta por ahí
// no puede chocar con el metal.
const CACHE_AGUJERO = new WeakMap();
function ejesPrincipales(tri) {
  const n = tri.length / 3, paso = Math.max(1, Math.floor(n / 30000)), m = V();
  let k = 0;
  for (let i = 0; i < n; i += paso) { m.x += tri[3 * i]; m.y += tri[3 * i + 1]; m.z += tri[3 * i + 2]; k++; }
  m.divideScalar(k);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i += paso) {
    const d = [tri[3 * i] - m.x, tri[3 * i + 1] - m.y, tri[3 * i + 2] - m.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b];
  }
  // Jacobi para la matriz simétrica 3×3
  const Vm = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 40; it++) {
    let p = 0, q = 1;
    if (Math.abs(C[0][2]) > Math.abs(C[p][q])) { p = 0; q = 2; }
    if (Math.abs(C[1][2]) > Math.abs(C[p][q])) { p = 1; q = 2; }
    if (Math.abs(C[p][q]) < 1e-12 * (Math.abs(C[0][0]) + Math.abs(C[1][1]) + Math.abs(C[2][2]) + 1e-30)) break;
    const th = 0.5 * Math.atan2(2 * C[p][q], C[q][q] - C[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k2 = 0; k2 < 3; k2++) { const a = C[k2][p], b = C[k2][q]; C[k2][p] = c * a - s * b; C[k2][q] = s * a + c * b; }
    for (let k2 = 0; k2 < 3; k2++) { const a = C[p][k2], b = C[q][k2]; C[p][k2] = c * a - s * b; C[q][k2] = s * a + c * b; }
    for (let k2 = 0; k2 < 3; k2++) { const a = Vm[k2][p], b = Vm[k2][q]; Vm[k2][p] = c * a - s * b; Vm[k2][q] = s * a + c * b; }
  }
  return [0, 1, 2].map(j => V(Vm[0][j], Vm[1][j], Vm[2][j]).normalize());
}
function dentro2D(px, py, t, P) {
  const i = 6 * t, ax = P[i], ay = P[i + 1], bx = P[i + 2], by = P[i + 3], cx = P[i + 4], cy = P[i + 5];
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx), s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
function seg2D(px, py, x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy, u = l > 0 ? sat(((px - x0) * dx + (py - y0) * dy) / l) : 0, ex = px - x0 - u * dx, ey = py - y0 - u * dy; return Math.sqrt(ex * ex + ey * ey); }
function dist2DTri(px, py, t, P) {   // distancia de (px, py) al triángulo t proyectado (P: 6 números por triángulo)
  if (dentro2D(px, py, t, P)) return 0;
  const i = 6 * t;
  return Math.min(seg2D(px, py, P[i], P[i + 1], P[i + 2], P[i + 3]), seg2D(px, py, P[i + 2], P[i + 3], P[i + 4], P[i + 5]), seg2D(px, py, P[i + 4], P[i + 5], P[i], P[i + 1]));
}
function agujeroEnEje(tri, a, R) {
  const n = tri.length / 9, u = Math.abs(a.y) < 0.9 ? V(0, 1, 0).cross(a).normalize() : V(1, 0, 0).cross(a).normalize(), w = a.clone().cross(u);
  const P = new Float32Array(6 * n);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const i = 9 * t + 3 * k, x = tri[i] * u.x + tri[i + 1] * u.y + tri[i + 2] * u.z, y = tri[i] * w.x + tri[i + 1] * w.y + tri[i + 2] * w.z;
    P[6 * t + 2 * k] = x; P[6 * t + 2 * k + 1] = y;
    u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y);
  }
  const N = 128, lado = Math.max(u1 - u0, v1 - v0, 1e-6), cel = lado / (N - 6), ox = (u0 + u1) / 2 - cel * N / 2, oy = (v0 + v1) / 2 - cel * N / 2;
  const occ = new Uint8Array(N * N), marcar = (x, y) => { const i = Math.floor((x - ox) / cel), j = Math.floor((y - oy) / cel); if (i >= 0 && j >= 0 && i < N && j < N) occ[j * N + i] = 1; };
  for (let t = 0; t < n; t++) {
    const i = 6 * t;
    for (let k = 0; k < 3; k++) {   // vértices y bordes (los triángulos de canto no tienen área en la proyección)
      const x0 = P[i + 2 * k], y0 = P[i + 2 * k + 1], x1 = P[i + (2 * k + 2) % 6], y1 = P[i + (2 * k + 3) % 6];
      const pasos = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (0.5 * cel)) + 1;
      for (let s = 0; s <= pasos; s++) marcar(x0 + (x1 - x0) * s / pasos, y0 + (y1 - y0) * s / pasos);
    }
    const i0 = Math.max(0, Math.floor((Math.min(P[i], P[i + 2], P[i + 4]) - ox) / cel)), i1 = Math.min(N - 1, Math.floor((Math.max(P[i], P[i + 2], P[i + 4]) - ox) / cel));
    const j0 = Math.max(0, Math.floor((Math.min(P[i + 1], P[i + 3], P[i + 5]) - oy) / cel)), j1 = Math.min(N - 1, Math.floor((Math.max(P[i + 1], P[i + 3], P[i + 5]) - oy) / cel));
    if ((i1 - i0) * (j1 - j0) > 1) for (let j = j0; j <= j1; j++) for (let i2 = i0; i2 <= i1; i2++) if (dentro2D(ox + (i2 + 0.5) * cel, oy + (j + 0.5) * cel, t, P)) occ[j * N + i2] = 1;
  }
  // lo libre que toca el borde es «afuera»
  const pila = [];
  for (let k = 0; k < N; k++) for (const c of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (!occ[c]) { occ[c] = 2; pila.push(c); }
  while (pila.length) {
    const c = pila.pop(), i = c % N, j = (c - i) / N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= N || y >= N) continue; const d = y * N + x; if (!occ[d]) { occ[d] = 2; pila.push(d); } }
  }
  // distancia al metal (chaflán 8 vecinos, dos pasadas): el centro del hueco encerrado más ancho
  const D = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) D[c] = occ[c] === 1 ? 0 : 1e9;
  const R2 = Math.SQRT2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = j * N + i; if (!D[c]) continue; let d = D[c]; if (i) d = Math.min(d, D[c - 1] + 1); if (j) { d = Math.min(d, D[c - N] + 1); if (i) d = Math.min(d, D[c - N - 1] + R2); if (i < N - 1) d = Math.min(d, D[c - N + 1] + R2); } D[c] = d; }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const c = j * N + i; if (!D[c]) continue; let d = D[c]; if (i < N - 1) d = Math.min(d, D[c + 1] + 1); if (j < N - 1) { d = Math.min(d, D[c + N] + 1); if (i < N - 1) d = Math.min(d, D[c + N + 1] + R2); if (i) d = Math.min(d, D[c + N - 1] + R2); } D[c] = d; }
  let mejor = -1, md = 0;
  for (let c = 0; c < N * N; c++) if (occ[c] === 0 && D[c] > md && D[c] < 1e8) { md = D[c]; mejor = c; }
  if (mejor < 0) return null;
  const ci = mejor % N, cj = (mejor - ci) / N;
  return { eje: a, u, w, P, n, cx: ox + (ci + 0.5) * cel, cy: oy + (cj + 0.5) * cel, aprox: md * cel, cel };
}
export function buscarAgujero(tri, R) {
  if (!tri || tri.length < 27) return null;
  if (CACHE_AGUJERO.has(tri)) return CACHE_AGUJERO.get(tri);
  let mejor = null;
  for (const a of [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), ...ejesPrincipales(tri)]) {
    const r = agujeroEnEje(tri, a, R);
    if (r && (!mejor || r.aprox > mejor.aprox * 1.02)) mejor = r;
  }
  let res = null;
  if (mejor && mejor.aprox > 0.05 * R) {
    // afinar: solo los triángulos cerca del centro; búsqueda por patrón del punto más lejos del metal
    const { P, n } = mejor, lim = mejor.aprox + 4 * mejor.cel, cerca = [];
    for (let t = 0; t < n; t++) {
      const i = 6 * t, x0 = Math.min(P[i], P[i + 2], P[i + 4]), x1 = Math.max(P[i], P[i + 2], P[i + 4]), y0 = Math.min(P[i + 1], P[i + 3], P[i + 5]), y1 = Math.max(P[i + 1], P[i + 3], P[i + 5]);
      if (x1 > mejor.cx - lim * 1.5 && x0 < mejor.cx + lim * 1.5 && y1 > mejor.cy - lim * 1.5 && y0 < mejor.cy + lim * 1.5) cerca.push(t);
    }
    const cajas = new Float32Array(cerca.length * 4);
    cerca.forEach((t, k) => { const i = 6 * t; cajas.set([Math.min(P[i], P[i + 2], P[i + 4]), Math.max(P[i], P[i + 2], P[i + 4]), Math.min(P[i + 1], P[i + 3], P[i + 5]), Math.max(P[i + 1], P[i + 3], P[i + 5])], 4 * k); });
    // (la caja de cada triángulo descarta casi todos: solo se mide de verdad lo que puede quedar más cerca)
    const dist = (x, y) => {
      let d = Infinity;
      for (let k = 0; k < cerca.length; k++) {
        const ex = Math.max(cajas[4 * k] - x, 0, x - cajas[4 * k + 1]), ey = Math.max(cajas[4 * k + 2] - y, 0, y - cajas[4 * k + 3]);
        if (ex * ex + ey * ey >= d * d) continue;
        const e = dist2DTri(x, y, cerca[k], P); if (e < d) d = e;
      }
      return d;
    };
    let x = mejor.cx, y = mejor.cy, d = dist(x, y), paso = mejor.cel;
    while (paso > mejor.cel / 64) {
      let mov = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        const e = dist(x + dx * paso, y + dy * paso);
        if (e > d) { d = e; x += dx * paso; y += dy * paso; mov = true; break; }
      }
      if (!mov) paso /= 2;
    }
    // cuánto ocupa el metal a lo largo del eje alrededor del agujero
    const a = mejor.eje; let s0 = Infinity, s1 = -Infinity;
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const i = 9 * t + 3 * k, px = P[6 * t + 2 * k] - x, py = P[6 * t + 2 * k + 1] - y;
      if (px * px + py * py > (d + 0.6 * R) ** 2) continue;
      const s = tri[i] * a.x + tri[i + 1] * a.y + tri[i + 2] * a.z; s0 = Math.min(s0, s); s1 = Math.max(s1, s);
    }
    if (d > 0.05 * R && Number.isFinite(s0)) {
      const centro = mejor.u.clone().multiplyScalar(x).addScaledVector(mejor.w, y).addScaledVector(a, (s0 + s1) / 2);
      res = { centro, eje: a.clone(), radio: d, medio: (s1 - s0) / 2 };
    }
  }
  CACHE_AGUJERO.set(tri, res);
  return res;
}

// ---------- Curvas: B-spline, remuestreo por largo y marcos sin giros (transporte paralelo) ----------
export function curvaB(ctrl, muestras = 400) {
  const Pp = [ctrl[0], ctrl[0], ...ctrl, ctrl[ctrl.length - 1], ctrl[ctrl.length - 1]], seg = Pp.length - 3, sal = [];
  for (let k = 0; k <= muestras; k++) {
    const f = k / muestras * seg, i = Math.min(seg - 1, Math.floor(f)), t = f - i, t2 = t * t, t3 = t2 * t;
    const b0 = (1 - t) ** 3 / 6, b1 = (3 * t3 - 6 * t2 + 4) / 6, b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, b3 = t3 / 6;
    sal.push(V().addScaledVector(Pp[i], b0).addScaledVector(Pp[i + 1], b1).addScaledVector(Pp[i + 2], b2).addScaledVector(Pp[i + 3], b3));
  }
  return sal;
}
export function remuestrear(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L[L.length - 1], sal = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = total * k / (n - 1);
    while (j < pts.length - 2 && L[j + 1] < s) j++;
    const d = L[j + 1] - L[j], u = d > 0 ? sat((s - L[j]) / d) : 0;
    sal.push(pts[j].clone().lerp(pts[j + 1], u));
  }
  return { puntos: sal, largo: total };
}
function tangentes(P) {
  return P.map((p, i) => V().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
}
// Transporte paralelo: el ancho de la cinta (N) arranca en n0 y gira lo mínimo para seguir la curva (sin vueltas ni saltos).
// plano: en los recorridos planos (corazón, onda, lazo) el ancho queda en su plano: para una curva plana es lo mismo que el
// transporte paralelo, y en el rizo (que sale un poco del plano) no acumula la torsión que dejaría la cinta de canto después
export function marcosParalelos(P, n0, plano = null) {
  const T = tangentes(P), N = [], B = [], qq = Q();
  if (plano) {
    let prev = null;
    for (let i = 0; i < P.length; i++) {
      let n = V().crossVectors(plano, T[i]);
      if (n.lengthSq() < 1e-8) n = prev ? prev.clone() : n0.clone();
      n.addScaledVector(T[i], -n.dot(T[i])).normalize();
      if (prev && n.dot(prev) < 0) n.negate();
      if (!prev && n.dot(n0) < 0) n.negate();
      N.push(n); B.push(V().crossVectors(T[i], n).normalize()); prev = n;
    }
    return { T, N, B };
  }
  let n = n0.clone().addScaledVector(T[0], -n0.dot(T[0]));
  if (n.lengthSq() < 1e-10) n = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0).cross(T[0]) : V(1, 0, 0).cross(T[0]);
  n.normalize();
  for (let i = 0; i < P.length; i++) {
    if (i > 0) { qq.setFromUnitVectors(T[i - 1], T[i]); n.applyQuaternion(qq); n.addScaledVector(T[i], -n.dot(T[i])).normalize(); }
    N.push(n.clone()); B.push(V().crossVectors(T[i], n).normalize());
  }
  return { T, N, B };
}

// ---------- Barridos: cinta (sección rectangular) y alambre (sección redonda) ----------
// Cinta: 4 esquinas por muestra. Para dibujar, cada cara lleva sus vértices (normales planas en el canto); para el STL, las
// esquinas se comparten (sólido cerrado, caras hacia afuera). cerrado: el recorrido da la vuelta (sin tapas)
function esquinasCinta(P, N, B, ancho, espesor) {
  return P.map((p, i) => {
    const n = N[i].clone().multiplyScalar(ancho / 2), b = B[i].clone().multiplyScalar(espesor / 2);
    return [p.clone().add(n).add(b), p.clone().sub(n).add(b), p.clone().sub(n).sub(b), p.clone().add(n).sub(b)];
  });
}
// caras: [índice A, índice B, normal] con (B − A) × T hacia afuera (ver el comentario de cintaGeometria)
const CARAS_CINTA = [[0, 1, 'B'], [2, 3, '-B'], [3, 0, 'N'], [1, 2, '-N']];
function cintaGeometria(P, N, B, T, ancho, espesor, { cerrado = false, uLargo = 1 } = {}) {
  // por muestra: 8 vértices (2 por cara) + tapas
  const n = P.length, E = esquinasCinta(P, N, B, ancho, espesor), pos = [], nor = [], uv = [], idx = [];
  const normal = (k, i) => (k === 'B' ? B[i] : k === '-B' ? B[i].clone().negate() : k === 'N' ? N[i] : N[i].clone().negate());
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += P[i].distanceTo(P[i - 1]);
    for (const [a, b, k] of CARAS_CINTA) {
      const nn = normal(k, i);
      pos.push(...E[i][a].toArray(), ...E[i][b].toArray()); nor.push(...nn.toArray(), ...nn.toArray());
      uv.push(s / uLargo, 0, s / uLargo, 1);
    }
  }
  const tramos = cerrado ? n : n - 1;
  for (let i = 0; i < tramos; i++) for (let f = 0; f < 4; f++) {
    const a0 = 8 * i + 2 * f, b0 = a0 + 1, j = (i + 1) % n, a1 = 8 * j + 2 * f, b1 = a1 + 1;
    idx.push(a0, b0, a1, b0, b1, a1);
  }
  if (!cerrado) for (const [i, signo] of [[0, -1], [n - 1, 1]]) {
    const base = pos.length / 3, t = T[i].clone().multiplyScalar(signo);
    for (let k = 0; k < 4; k++) { pos.push(...E[i][k].toArray()); nor.push(...t.toArray()); uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 1 : 0); }
    if (signo > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// Mueve los vértices de una cinta ya armada (mismo número de muestras): para el aleteo y para que crezca
function cintaActualizar(g, P, N, B, T, ancho, espesor) {
  const n = P.length, E = esquinasCinta(P, N, B, ancho, espesor), pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    CARAS_CINTA.forEach(([a, b, k], f) => {
      const nn = k === 'B' ? B[i] : k === '-B' ? B[i].clone().negate() : k === 'N' ? N[i] : N[i].clone().negate(), o = 8 * i + 2 * f;
      pos.setXYZ(o, E[i][a].x, E[i][a].y, E[i][a].z); pos.setXYZ(o + 1, E[i][b].x, E[i][b].y, E[i][b].z);
      nor.setXYZ(o, nn.x, nn.y, nn.z); nor.setXYZ(o + 1, nn.x, nn.y, nn.z);
    });
  }
  if (g.userData.tapas) for (const [i, signo, o] of [[0, -1, 8 * n], [n - 1, 1, 8 * n + 4]]) {
    const t = T[i].clone().multiplyScalar(signo);
    for (let k = 0; k < 4; k++) { pos.setXYZ(o + k, E[i][k].x, E[i][k].y, E[i][k].z); nor.setXYZ(o + k, t.x, t.y, t.z); }
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
}
// Sólido cerrado de una cinta (triángulos, 9 números cada uno)
function cintaSolida(P, N, B, ancho, espesor, cerrado, sal) {
  const E = esquinasCinta(P, N, B, ancho, espesor), n = P.length, tri = (a, b, c) => sal.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < (cerrado ? n : n - 1); i++) {
    const j = (i + 1) % n;
    for (const [a, b] of CARAS_CINTA) { tri(E[i][a], E[i][b], E[j][a]); tri(E[i][b], E[j][b], E[j][a]); }
  }
  if (!cerrado) {
    const a = E[0], z = E[n - 1];
    tri(a[0], a[2], a[1]); tri(a[0], a[3], a[2]);
    tri(z[0], z[1], z[2]); tri(z[0], z[2], z[3]);
  }
  return sal;
}
// Alambre: tubo de sección redonda a lo largo de una curva (cerrada: un eslabón; abierta: con tapas)
function tubo(P, N, B, radio, lados, cerrado) {
  const n = P.length, pos = [], nor = [], idx = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < lados; k++) {
    const a = 2 * Math.PI * k / lados, d = V().addScaledVector(N[i], Math.cos(a)).addScaledVector(B[i], Math.sin(a));
    pos.push(...V().copy(P[i]).addScaledVector(d, radio).toArray()); nor.push(...d.toArray());
  }
  for (let i = 0; i < (cerrado ? n : n - 1); i++) {
    const j = (i + 1) % n;
    // (con B = T × N el anillo gira de N a B: (b − a) × (c − a) ≈ B × T = N, hacia afuera)
    for (let k = 0; k < lados; k++) { const k2 = (k + 1) % lados, a = i * lados + k, b = i * lados + k2, c = j * lados + k, d = j * lados + k2; idx.push(a, b, c, b, d, c); }
  }
  if (!cerrado) for (const [i, signo] of [[0, -1], [n - 1, 1]]) {
    const c = pos.length / 3, t = V().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize().multiplyScalar(signo);
    pos.push(...P[i].toArray()); nor.push(...t.toArray());
    for (let k = 0; k < lados; k++) { const k2 = (k + 1) % lados; if (signo > 0) idx.push(c, i * lados + k, i * lados + k2); else idx.push(c, i * lados + k2, i * lados + k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
// Curva cerrada en el plano XY (eslabón): estadio de largo L y ancho W medidos por la línea central del alambre
function estadio(L, W, n = 28) {
  const r = W / 2, recto = Math.max(0, L - W) / 2, pts = [], per = 2 * Math.PI * r + 4 * recto;
  for (let k = 0; k < n; k++) {
    let s = per * k / n;
    // recorrido: lado de arriba (de +recto a −recto), media vuelta izquierda, lado de abajo, media vuelta derecha
    if (s < 2 * recto) { pts.push(V(recto - s, r, 0)); continue; } s -= 2 * recto;
    if (s < Math.PI * r) { const a = Math.PI / 2 + s / r; pts.push(V(-recto + r * Math.cos(a), r * Math.sin(a), 0)); continue; } s -= Math.PI * r;
    if (s < 2 * recto) { pts.push(V(-recto + s, -r, 0)); continue; } s -= 2 * recto;
    const a = -Math.PI / 2 + s / r; pts.push(V(recto + r * Math.cos(a), r * Math.sin(a), 0));
  }
  return pts;
}
function eslabonGeo(L, W, d, lados = 10, n = 28) {
  const P = estadio(L - d, W - d, n), T = tangentes([P[n - 1], ...P, P[0]]).slice(1, -1);
  const N = P.map((p, i) => V(0, 0, 1).cross(T[i]).normalize().negate()), B = T.map((t, i) => V().crossVectors(t, N[i]));
  return tubo(P, N, B, d / 2, lados, true);
}

// ---------- Formas: tamaño, geometría para dibujar y sólido para imprimir ----------
// Medidas en unidades del estudio, a partir del radio R de la joya (tamano = 1: proporciones de una foto de joyería)
function medidas(g, J, stlInfo) {
  const R = J.R, k = g.tamano;
  switch (g.forma) {
    case 'esfera': return { r: 0.45 * R * k };
    case 'perla': return { r: 0.28 * R * k };
    case 'cuenta': return { r: 0.14 * R * k };
    case 'cubo': { const s = 0.7 * R * k; return { s, rc: 0.14 * s }; }
    case 'cilindro': return { r: 0.3 * R * k, h: 0.72 * R * k };
    case 'aro': return { R: 0.42 * R * k, t: 0.085 * R * k };
    case 'gema': return { g: 0.32 * R * k };
    case 'regalo': return { s: 0.5 * R * k };
    case 'stl': return { k: stlInfo ? k / J.mm : 1 };
    default: return {};
  }
}
const CACHE_GEO = new Map();
function geoEsfera(r, a, b) { return new THREE.SphereGeometry(r, a, b); }
function geoTorno(perfil, lados) {
  const g = new THREE.LatheGeometry(perfil.map(([x, y]) => new THREE.Vector2(x, y)), lados);
  g.deleteAttribute('uv');
  return g;
}
// Banda cerrada alrededor de la cajita (rectángulo de esquinas redondas en un plano; ancho a lo largo de eje)
function bandaCaja(medio, rr, ancho, espesor, plano) {
  const pts = [], n = 8, rect = medio - rr;
  for (const [cx, cy, a0] of [[rect, rect, 0], [-rect, rect, Math.PI / 2], [-rect, -rect, Math.PI], [rect, -rect, 1.5 * Math.PI]]) {
    for (let k = 0; k <= n; k++) { const a = a0 + Math.PI / 2 * k / n; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  }
  // plano 'yz': vuelta alrededor del eje x; 'xy': alrededor del eje z (siempre en sentido antihorario: el espesor mira afuera)
  const P = pts.map(([u, v]) => (plano === 'yz' ? V(0, u, v) : V(u, v, 0)));
  const eje = plano === 'yz' ? V(1, 0, 0) : V(0, 0, 1);
  const T = tangentes([P[P.length - 1], ...P, P[0]]).slice(1, -1), N = P.map(() => eje.clone()), B = T.map(t => V().crossVectors(t, eje));
  return { P, N, B, T, ancho, espesor };
}
// Lazo del moño: una cinta cerrada en forma de gota alargada, de pie
function lazoMono(largo, alto, ancho, espesor, lado) {
  const P = [];
  for (let k = 0; k < 32; k++) { const a = 2 * Math.PI * k / 32; P.push(V(lado * (largo / 2) * (1 + Math.cos(a)), alto / 2 * Math.sin(a) * (0.75 + 0.25 * Math.cos(a)), 0)); }
  const T = tangentes([P[31], ...P, P[0]]).slice(1, -1), eje = V(0, 0, 1), N = P.map(() => eje.clone()), B = T.map(t => V().crossVectors(t, eje));
  // (en el lazo de la izquierda el recorrido va al revés: se da vuelta para que el espesor mire hacia afuera)
  if (lado < 0) { P.reverse(); T.reverse(); for (const t of T) t.negate(); B.splice(0, B.length, ...T.map(t => V().crossVectors(t, eje))); }
  return { P, N, B, T, ancho, espesor };
}
// Piezas de una forma: [{ geo, mat: 'a' (principal) | 'b' (segundo color), solido: triángulos locales }]
function piezasDe(forma, d, stlGeo) {
  const k = forma + JSON.stringify(d) + (forma === 'stl' ? stlGeo?.uuid : '');
  if (CACHE_GEO.has(k)) return CACHE_GEO.get(k);
  let piezas;
  switch (forma) {
    case 'esfera': case 'perla': piezas = [{ geo: geoEsfera(d.r, 64, 48) }]; break;
    case 'cuenta': piezas = [{ geo: geoEsfera(d.r, 32, 24) }]; break;
    case 'cubo': piezas = [{ geo: new RoundedBoxGeometry(d.s, d.s, d.s, 4, d.rc) }]; break;
    case 'cilindro': {
      const r = d.r, h = d.h, b = 0.12 * r, p = [[0, -h / 2]];
      for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + Math.PI / 2 * i / 6; p.push([r - b + b * Math.cos(a), -h / 2 + b + b * Math.sin(a)]); }
      for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 * i / 6; p.push([r - b + b * Math.cos(a), h / 2 - b + b * Math.sin(a)]); }
      p.push([0, h / 2]);
      piezas = [{ geo: geoTorno(p, 64) }]; break;
    }
    case 'aro': piezas = [{ geo: new THREE.TorusGeometry(d.R, d.t, 28, 112).rotateX(Math.PI / 2) }]; break;
    case 'gema': {
      // talla brillante sencilla: pabellón, filetín y corona con mesa (16 facetas por vuelta)
      const G = d.g, D = 2 * G;
      piezas = [{ geo: geoTorno([[0, -0.43 * D], [0.55 * G, -0.24 * D], [G, -0.015 * D], [G, 0.015 * D], [0.8 * G, 0.09 * D], [0.56 * G, 0.16 * D], [0, 0.16 * D]], 16), plana: true }]; break;
    }
    case 'regalo': {
      const s = d.s, e = 0.022 * s, bw = 0.2 * s, rc = 0.06 * s;
      const dl = 0.02 * e, b1 = bandaCaja(s / 2 + e / 2 + dl, rc + e / 2 + dl, bw, e, 'yz'), b2 = bandaCaja(s / 2 + 1.5 * e + 2 * dl, rc + 1.5 * e + 2 * dl, bw, e, 'xy');
      const tope = s / 2 + 2 * e + 2 * dl, nudo = { w: 0.14 * s, h: 0.09 * s, d: bw * 0.92 };
      const lazos = [1, -1].map(l => {
        const z = lazoMono(0.26 * s, 0.17 * s, bw * 0.8, e, l);
        const m = new THREE.Matrix4().makeRotationZ(l * 0.42);
        z.P = z.P.map(p => p.applyMatrix4(m)); z.T = z.T.map(t => t.transformDirection(m)); z.B = z.B.map(t => t.transformDirection(m));
        // se apoya sobre la cinta de arriba, por fuera del nudo
        let y0 = Infinity, xin = l > 0 ? Infinity : -Infinity;
        for (const p of z.P) { y0 = Math.min(y0, p.y); xin = l > 0 ? Math.min(xin, p.x) : Math.max(xin, p.x); }
        const dy = tope + e * 0.6 + 2 * e - y0, dx = l * (nudo.w / 2 + 2 * e) - xin + l * e;
        z.P = z.P.map(p => p.add(V(dx, dy, 0)));
        return z;
      });
      const caja = new RoundedBoxGeometry(s, s, s, 3, rc);
      const nudoGeo = new RoundedBoxGeometry(nudo.w, nudo.h, nudo.d, 2, nudo.h * 0.3).translate(0, tope + nudo.h / 2 + e * 0.2, 0);
      piezas = [{ geo: caja }, { geo: nudoGeo, mat: 'b' }];
      for (const c of [b1, b2, ...lazos]) piezas.push({ geo: cintaGeometria(c.P, c.N, c.B, c.T, c.ancho, c.espesor, { cerrado: true, uLargo: s }), mat: 'b', banda: c });
      break;
    }
    case 'stl': piezas = [{ geo: stlGeo.clone().scale(d.k, d.k, d.k) }]; break;
    default: piezas = [];
  }
  for (const p of piezas) {
    p.mat = p.mat || 'a';
    if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
    p.geo.computeBoundingSphere();
    p.solido = p.banda ? cintaSolida(p.banda.P, p.banda.N, p.banda.B, p.banda.ancho, p.banda.espesor, true, []) : solidoDe(p.geo);
  }
  const unicos = new Map();
  for (const p of piezas) for (let i = 0; i < p.solido.length; i += 3) unicos.set(`${p.solido[i]},${p.solido[i + 1]},${p.solido[i + 2]}`, i);
  const vertices = new Float32Array(unicos.size * 3); let o = 0;
  for (const k of unicos.keys()) { const [x, y, z] = k.split(',').map(Number); vertices[o++] = x; vertices[o++] = y; vertices[o++] = z; }
  const res = { piezas, vertices, info: infoForma(forma, d, piezas) };
  if (CACHE_GEO.size > 80) CACHE_GEO.clear();
  CACHE_GEO.set(k, res);
  return res;
}
// Sólido para imprimir: vértices soldados, sin triángulos degenerados (los polos del torno), caras hacia afuera
function solidoDe(geo) {
  const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', geo.attributes.position.clone()); if (geo.index) g0.setIndex(geo.index.clone());
  geo.computeBoundingSphere();
  const g = mergeVertices(g0, Math.max(1e-7, geo.boundingSphere.radius * 1e-6)), p = g.attributes.position, ix = g.index, sal = [];
  const a = V(), b = V(), c = V(), ab = V(), ac = V();
  for (let i = 0; i < ix.count; i += 3) {
    const i0 = ix.getX(i), i1 = ix.getX(i + 1), i2 = ix.getX(i + 2);
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() < 1e-14 * geo.boundingSphere.radius ** 2) continue;
    sal.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  // volumen con signo: si sale negativo la geometría venía con las caras hacia adentro (el torno de three) y se dan vuelta
  let vol = 0;
  for (let i = 0; i < sal.length; i += 9) vol += sal[i] * (sal[i + 4] * sal[i + 8] - sal[i + 5] * sal[i + 7]) - sal[i + 1] * (sal[i + 3] * sal[i + 8] - sal[i + 5] * sal[i + 6]) + sal[i + 2] * (sal[i + 3] * sal[i + 7] - sal[i + 4] * sal[i + 6]);
  if (vol < 0) for (let i = 0; i < sal.length; i += 9) for (let k = 0; k < 3; k++) { const t = sal[i + 3 + k]; sal[i + 3 + k] = sal[i + 6 + k]; sal[i + 6 + k] = t; }
  g0.dispose(); g.dispose();
  return sal;
}
// Lo que necesita la coreografía de cada forma: radio que la envuelve, cómo rueda y cuánto le falta para tocar el piso
const MODO_RODAR = { esfera: 'bola', perla: 'bola', cuenta: 'bola', cubo: 'volteo', cilindro: 'rueda', aro: 'rueda', gema: 'rueda', regalo: 'deslizar', stl: 'deslizar' };
function infoForma(forma, d, piezas) {
  let rb = 0, rEje = 0;
  for (const p of piezas) for (let i = 0; i < p.solido.length; i += 3) {
    const x = p.solido[i], y = p.solido[i + 1], z = p.solido[i + 2];
    rb = Math.max(rb, Math.hypot(x, y, z)); rEje = Math.max(rEje, Math.hypot(x, z));
  }
  return { rb, rRueda: rEje, modo: MODO_RODAR[forma] || 'deslizar', bola: MODO_RODAR[forma] === 'bola' };
}
// Lo más bajo de la forma girada por q (respecto de su centro): con esto se apoya exacta en el piso
// (solo la fila y de la rotación: es la altura de cada vértice girado)
function bajoDe(F, q) {
  const x = q.x, y = q.y, z = q.z, w = q.w, a = 2 * (x * y + w * z), b = 1 - 2 * (x * x + z * z), c = 2 * (y * z - w * x), P = F.vertices;
  let m = Infinity;
  for (let i = 0; i < P.length; i += 3) { const h = a * P[i] + b * P[i + 1] + c * P[i + 2]; if (h < m) m = h; }
  return -m;
}
// Postura de reposo en el piso (semilla: el giro alrededor de la vertical; las bolas, cualquier orientación)
function reposo(forma, F, r) {
  if (F.info.bola) return qAzar(r);
  const yaw = qEje(EJE_Y, r() * 2 * Math.PI);
  if (forma === 'gema') return yaw.multiply(qEje(V(1, 0, 0), Math.PI / 2 - Math.atan(1 / 0.86)));   // la gema suelta se recuesta sobre el pabellón y el filetín
  if (forma === 'cubo') return qEje(EJE_Y, Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.5);
  // el STL propio queda como lo subió la joyera (un logo mira a la cámara); la cajita, casi de frente
  if (forma === 'stl') return Q();
  if (forma === 'regalo') return qEje(EJE_Y, (r() - 0.5) * 0.6);
  return yaw;
}

// ---------- STL propio de la joyera ----------
// Se guarda por el contenido (el mismo archivo da el mismo id: al abrir un proyecto se vuelve a registrar igual)
const STLS = new Map();
function hashBytes(u8) { let h = 0x811C9DC5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
export function registrarSTL(datos, nombre = 'mi-stl.stl') {
  const u8 = datos instanceof ArrayBuffer ? new Uint8Array(datos) : ArrayBuffer.isView(datos) ? new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength) : null;
  if (!u8 || u8.length < 15) throw new Error('El archivo STL está vacío.');
  const id = 'stl-' + hashBytes(u8) + '-' + u8.length.toString(36);
  if (!STLS.has(id)) {
    let geo;
    try { geo = new STLLoader().parse(u8.slice().buffer); } catch (e) { throw new Error('No se pudo leer el STL: revisa que sea un archivo STL válido.'); }
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
    const p = geo.attributes.position;
    if (!p || p.count < 3) throw new Error('El STL no tiene triángulos.');
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) throw new Error('El STL tiene coordenadas inválidas.');
    // los programas de joyería guardan el STL con Z hacia arriba (igual que la joya: estudio.cargar)
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(V()); geo.translate(-c.x, -c.y, -c.z); geo.computeBoundingBox();
    const t = geo.boundingBox.getSize(V());
    STLS.set(id, { id, nombre: String(nombre).replace(/[<>]/g, '').slice(0, 60), geo, bytes: u8.slice(), medidas: { x: t.x, y: t.y, z: t.z }, triangulos: p.count / 3 });
  }
  const s = STLS.get(id);
  return { id, nombre: s.nombre, medidas: { ...s.medidas }, triangulos: s.triangulos };
}
export const datosSTL = id => STLS.get(id)?.bytes || null;   // para guardar el archivo con el proyecto
export const infoSTL = id => { const s = STLS.get(id); return s ? { id, nombre: s.nombre, medidas: { ...s.medidas }, triangulos: s.triangulos } : null; };

// ---------- Rebote con coeficiente de restitución (forma cerrada) ----------
// Cae desde H, toca el piso en t1 y rebota con velocidad e·v cada vez hasta quedar quieta exactamente en T
function rebote(H, T, e) { const t1 = T * (1 - e) / (1 + e), g = 2 * H / (t1 * t1); return { H, T, e, t1, g, v1: g * t1 }; }
function alturaRebote(b, tau) {
  if (tau <= 0) return b.H;
  if (tau < b.t1) return b.H - 0.5 * b.g * tau * tau;
  let r = tau - b.t1, v = b.v1 * b.e;
  for (let k = 0; k < 80; k++) { const d = 2 * v / b.g; if (d < 1e-7 * b.T) return 0; if (r < d) return Math.max(0, v * r - 0.5 * b.g * r * r); r -= d; v *= b.e; }
  return 0;
}

// ---------- Planeador: dónde está cada elemento en cada instante ----------
// Cada instancia trae en(t, p, q) → escala (pone la posición y la orientación) y bajo(t) (lo que le falta al centro para
// tocar el piso), rb (esfera que la envuelve) y marco ('escenario' | 'joya').
const LEJOS = 200;   // en radios de la joya: donde esperan los que todavía no caen (fuera de cualquier encuadre)
function colocar(n, F, J, ocupados, r, { h, lado0 = 1, preferir = 'lados', empuje = 0 }) {
  const rb = F.info.rb, res = [], R = J.R;
  for (let i = 0; i < n; i++) {
    const lado = i % 2 === 0 ? lado0 : -lado0;
    let mejor = null, ms = Infinity;
    for (let k = 0; k < 48 && !(mejor && k > 6 && ms < 0.6); k++) {
      const rho = J.rJ + rb + J.gap + empuje + k * 0.45 * rb, M = Math.max(16, Math.ceil(2 * Math.PI * rho / (0.5 * rb)));
      for (let m = 0; m < M; m++) {
        const psi = 2 * Math.PI * (m + 0.5 * r()) / M, cx = Math.cos(psi), sz = Math.sin(psi);
        let pen = (rho - J.rJ) / R + 0.25 * r();
        if (preferir === 'frente') pen += 0.8 * Math.max(0, -sz) + 0.3 * Math.abs(cx);
        else pen += 0.7 * Math.max(0, -lado * cx) + 1.6 * Math.max(0, sz) * Math.exp(-((cx / 0.75) ** 2)) + 0.5 * Math.max(0, -sz);
        if (pen >= ms) continue;
        const p = V(rho * cx, J.suelo + h, rho * sz);
        if (res.some(o => o.distanceTo(p) < 2 * rb + J.gap)) continue;
        if (ocupados.some(o => Math.hypot(o.p.x - p.x, o.p.z - p.z) < rb + o.r + J.gap)) continue;
        ms = pen; mejor = p;
      }
    }
    res.push(mejor || V((J.rJ + rb + J.gap + empuje + (i + 1) * 2.2 * rb) * lado, J.suelo + h, 0));
  }
  return res;
}

function planGrupo(g, J, ctx, empuje = 0) {
  const r = azar(g.semilla * 7919 + 13 + (ctx.indice || 0) * 104729);
  const stlReg = g.forma === 'stl' ? STLS.get(g.stl?.id) : null;
  if (g.forma === 'stl' && !stlReg) return { g, falta: true, instancias: [] };
  const d = medidas(g, J, stlReg), F = piezasDe(g.forma, d, stlReg?.geo);
  F.d = d;
  const plan = { g, F, instancias: [], marco: 'escenario' };
  const rb = F.info.rb, R = J.R, n = g.cantidad, t0g = g.inicio, T = g.duracion;
  const reposos = Array.from({ length: n }, () => reposo(g.forma, F, r));
  const altos = reposos.map(q => bajoDe(F, q));
  const inst = (o) => plan.instancias.push({ rb, marco: 'escenario', ...o });
  switch (g.coreografia) {
    case 'rodar': case 'entrar': {
      const modo = g.coreografia === 'entrar' ? 'deslizar' : F.info.modo;
      const lado0 = r() < 0.5 ? 1 : -1, Tr = Math.max(0.4, T * 0.72), resto = T - Tr, paso = 2 * rb + 1.2 * J.gap;
      const carriles = [];   // profundidades de los carriles: adelante, atrás, más adelante… (sin pasar de la cámara)
      for (let k = 0; carriles.length < 9 && k < 30; k++) { const z = 0.1 * R + empuje + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * paso; if (z < 2.2 * R && z > -2.8 * R) carriles.push(z); }
      if (!carriles.length) carriles.push(0.1 * R + empuje);
      const D0 = 5.2 * R, cuenta = { 1: 0, '-1': 0 };
      const quietos = ctx.ocupados;
      const ad = modo === 'volteo' ? (() => { const a = d.s / 2 - d.rc; return { a, rc: d.rc, avance: 2 * a + d.rc * Math.PI / 2 }; })() : null;
      const D = ad ? Math.max(1, Math.round(D0 / ad.avance)) * ad.avance : D0;
      for (let i = 0; i < n; i++) {
        const s = i % 2 === 0 ? lado0 : -lado0, k = cuenta[s]++, ronda = Math.floor(k / carriles.length), z = carriles[k % carriles.length];
        const libre = Math.sqrt(Math.max(0, (J.rJ + rb + J.gap) ** 2 - z * z));
        let x = s * (Math.max(libre, rb + J.gap) + ronda * paso + 0.5 * rb * r());
        const hR = modo === 'bola' ? d.r : modo === 'rueda' ? F.info.rRueda : modo === 'volteo' ? d.s / 2 : altos[i];
        for (let it = 0; it < 40 && quietos.some(o => o.p.distanceTo(V(x, J.suelo + hR, z)) < rb + o.r + J.gap); it++) x += s * 0.5 * rb;
        const ini = t0g + (n > 1 ? resto * i / (n - 1) : 0), dir = V(-s, 0, 0), eje = V().crossVectors(EJE_Y, dir);
        const q0 = modo === 'rueda' ? Q().setFromUnitVectors(EJE_Y, eje).multiply(qEje(EJE_Y, r() * 2 * Math.PI)) : modo === 'volteo' ? qEje(EJE_Y, 0) : reposos[i];
        const xF = x, rr = modo === 'bola' ? d.r : F.info.rRueda;
        inst({
          fin: V(xF, J.suelo + hR, z), ini, finT: ini + Tr,
          en(t, p, q) {
            const u = (t - ini) / Tr;
            if (modo === 'volteo') {
              const Th = D / ad.avance * Math.PI / 2, th = Th * friccion(u), nq = Math.min(Math.floor(th / (Math.PI / 2)), Math.round(D / ad.avance) - 1), a = th - nq * Math.PI / 2;
              const c = nq * ad.avance + ad.a + ad.rc * a - ad.a * Math.cos(a) + ad.a * Math.sin(a);
              qEje(eje, th, q).multiply(q0);
              p.set(xF + s * D - s * c, J.suelo + bajoDe(F, q), z); return 1;
            }
            if (modo === 'deslizar') {
              const e = salida3(u);
              p.set(xF + s * D * (1 - e), J.suelo + hR, z);
              qEje(EJE_Y, s * (g.coreografia === 'entrar' ? Math.PI / 2 : 0.3) * (1 - e), q).multiply(q0); return 1;
            }
            const dist = D * friccion(u);
            qEje(eje, dist / rr, q).multiply(q0);
            p.set(xF + s * D - s * dist, J.suelo + bajoDe(F, q), z); return 1;
          },
          bajo(t) { if (modo === 'deslizar') return altos[i]; const P = V(), Qq = Q(); this.en(t, P, Qq); return P.y - J.suelo; },
        });
      }
      break;
    }
    case 'rebotar': case 'caer-en-circulo': case 'lluvia': case 'quieto': {
      let pos;
      const lado0 = r() < 0.5 ? 1 : -1;
      if (g.coreografia === 'caer-en-circulo') {
        let rho = Math.max(J.rJ + rb + J.gap + empuje, n > 1 ? (2 * rb + J.gap) / (2 * Math.sin(Math.PI / n)) : 0);
        const a0 = r() * 2 * Math.PI;
        const slots = () => Array.from({ length: n }, (_, i) => V(rho * Math.cos(a0 + 2 * Math.PI * i / n), J.suelo + altos[i], rho * Math.sin(a0 + 2 * Math.PI * i / n)));
        pos = slots();
        for (let it = 0; it < 40 && pos.some(p => ctx.ocupados.some(o => o.p.distanceTo(p) < rb + o.r + J.gap)); it++) { rho += 0.5 * rb; pos = slots(); }
      } else if (g.coreografia === 'lluvia') {
        // en el primer plano, entre la joya y la cámara (desenfocadas con la profundidad de campo)
        pos = [];
        for (let i = 0; i < n; i++) {
          let p = null;
          for (let k = 0; k < 600 && !p; k++) {
            const ancho = 1.1 * R + k * 0.004 * R, c = V((r() * 2 - 1) * ancho, J.suelo + altos[i], J.rJ + rb + J.gap + empuje + r() * (1.5 * R + k * 0.004 * R));
            if (Math.hypot(c.x, c.z) < J.rJ + rb + J.gap) continue;
            if (pos.some(o => o.distanceTo(c) < 2 * rb + J.gap) || ctx.ocupados.some(o => o.p.distanceTo(c) < rb + o.r + J.gap)) continue;
            p = c;
          }
          pos.push(p || V((i - n / 2) * 2.2 * rb, J.suelo + altos[i], J.rJ + 2 * R + empuje));
        }
      } else pos = colocar(n, F, J, ctx.ocupados, r, { h: 0, lado0, empuje }).map((p, i) => p.setY(J.suelo + altos[i]));
      const e = g.coreografia === 'caer-en-circulo' ? 0.32 : g.coreografia === 'lluvia' ? 0.42 : 0.5;
      const Tb = g.coreografia === 'lluvia' ? T * 0.45 : g.coreografia === 'caer-en-circulo' ? T * 0.62 : T * 0.8;
      for (let i = 0; i < n; i++) {
        const P0 = pos[i], qr = reposos[i], H = 6 * R;
        if (g.coreografia === 'quieto') { inst({ fin: P0, ini: t0g, finT: t0g, en(t, p, q) { p.copy(P0); q.copy(qr); return 1; }, bajo: () => altos[i] }); continue; }
        const ini = g.coreografia === 'lluvia' ? t0g + (T - Tb) * r() : t0g + (n > 1 ? (T - Tb) * i / (g.coreografia === 'caer-en-circulo' ? n : n - 1) : 0);
        const b = rebote(H, Tb, e), giro0 = (r() - 0.5) * 3, qt = qAzar(r), qq = Q();
        inst({
          fin: P0, ini, finT: ini + Tb,
          en(t, p, q) {
            const tau = t - ini;
            if (tau < 0) { p.set(P0.x, P0.y + LEJOS * R, P0.z); q.copy(qr); return 0; }
            p.set(P0.x, P0.y + alturaRebote(b, tau), P0.z);
            q.copy(qr);
            if (g.coreografia === 'caer-en-circulo' && tau < b.t1) q.copy(qq.copy(qt).slerp(qr, suave(tau / b.t1)));
            q.premultiply(qEje(EJE_Y, giro0 * 0.5 * salida3(tau / Tb), qq));
            return 1;
          },
          bajo: () => altos[i],
        });
      }
      break;
    }
    case 'fila-flotante': {
      const beta = (r() - 0.5) * 0.5, dirF = V(Math.cos(beta), 0, Math.sin(beta)), A = 0.35 * rb, sep = 2 * rb + Math.max(J.gap, 0.8 * rb);
      const z = (J.rJ + rb + J.gap) / Math.cos(beta) + 0.15 * R + empuje;
      let y = Math.max(J.centro.y - 0.1 * R, J.suelo + rb + A + J.gap);
      const deriva = 0.5 * R;
      for (let it = 0; it < 30; it++) {   // que no pase por lo que ya está en el piso
        const ok = Array.from({ length: n }, (_, i) => V(0, y, z).addScaledVector(dirF, (i - (n - 1) / 2) * sep)).every(c => ctx.ocupados.every(o => Math.hypot(c.x - o.p.x, c.z - o.p.z) > rb + o.r + J.gap + deriva || Math.abs(c.y - o.p.y) > rb + o.r + J.gap + A));
        if (ok) break; y += 0.4 * rb;
      }
      for (let i = 0; i < n; i++) {
        const base = V(0, y, z).addScaledVector(dirF, (i - (n - 1) / 2) * sep), fase = r() * 2 * Math.PI, ejeG = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), w = 0.5 * (0.7 + 0.6 * r()), qr = reposos[i];
        inst({
          fin: base.clone(), ini: t0g, finT: t0g + T, aire: true,
          en(t, p, q) {
            const u = (t - t0g) / T;
            p.copy(base).addScaledVector(dirF, -deriva + 2 * deriva * suave(u)); p.y += A * Math.sin(2 * Math.PI * 0.4 * t + fase);
            qEje(ejeG, w * t, q).multiply(qr); return 1;
          },
          bajo: () => rb,
        });
      }
      break;
    }
    case 'orbitar': {
      const tilt = (r() < 0.5 ? 1 : -1) * M_(12), dirG = r() < 0.5 ? 1 : -1, vueltas = T > 7 ? 2 : 1;
      const rho = Math.max((J.rJ + rb + 2 * J.gap) / Math.cos(tilt) + empuje, n > 1 ? (2 * rb + J.gap) / (2 * Math.sin(Math.PI / n)) : 0);
      const yo = Math.max(J.centro.y, J.suelo + rho * Math.abs(Math.sin(tilt)) + rb + J.gap), f0 = r() * 2 * Math.PI;
      for (let i = 0; i < n; i++) {
        const fi = f0 + 2 * Math.PI * i / n, ejeG = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), qr = reposos[i];
        const pos = (f, p) => p.set(rho * Math.cos(f), yo + rho * Math.sin(f) * Math.sin(tilt), rho * Math.sin(f) * Math.cos(tilt));
        inst({
          fin: pos(fi + dirG * 2 * Math.PI * vueltas, V()), ini: t0g, finT: t0g + T, aire: true,
          en(t, p, q) { const f = fi + dirG * 2 * Math.PI * vueltas * suave5((t - t0g) / T); pos(f, p); qEje(ejeG, (f - fi) * rho / rb * 0.25, q).multiply(qr); return 1; },
          bajo: () => rb,
        });
      }
      break;
    }
    case 'volar': planVolar(g, F, J, ctx, r, plan, empuje); break;
  }
  return plan;
}
const M_ = g => g * Math.PI / 180;

// Vuelo (r6): entra desde un lado, da una o dos vueltas alrededor de la joya (o de un punto) inclinándose en las curvas y
// sale por el otro lado. Varios objetos vuelan en fila por el mismo camino. Estela: destellos que nacen detrás y se apagan.
function planVolar(g, F, J, ctx, r, plan, empuje) {
  const intento = ctx.intento || 0, R = J.R, rb = F.info.rb, s = (r() < 0.5 ? 1 : -1) * (intento % 2 ? -1 : 1), dirG = r() < 0.5 ? 1 : -1, n = g.cantidad, T = g.duracion, t0 = g.inicio;
  const C = aV(ctx.centroVuelo) || J.centro.clone(), vueltas = T > 6 ? 2 : 1;
  let rho = J.rJ + rb + 3 * J.gap + 0.35 * R + empuje, camino = null;
  for (let intento = 0; intento < 8; intento++) {
    const alza = 0.5 * R * Math.floor((intento + 1) / 2), ctrl = [V(-s * 8 * R, 1.4 * R + alza, 1.6 * R), V(-s * 4 * R, 1.0 * R + alza, 1.8 * R)];
    const f0 = Math.atan2(1.6, -s * 1.8);
    for (let j = 0; j <= 10 * vueltas; j++) { const f = f0 + dirG * 2 * Math.PI * j / 10; ctrl.push(V(rho * Math.cos(f), 0.25 * R + 0.35 * R * Math.sin(2 * f), 0.9 * rho * Math.sin(f))); }
    ctrl.push(V(s * 4 * R, 1.3 * R + alza, 1.3 * R), V(s * 8 * R, 1.8 * R + alza, 0.9 * R));
    const { puntos, largo } = remuestrear(curvaB(ctrl.map(p => p.add(C)), 1600), 700);
    const ok = puntos.every(p => (Math.hypot(p.x, p.z) >= J.rJ + rb + 2 * J.gap || p.y - rb > J.yMax + J.gap || p.y + rb < J.yMin - J.gap) && p.y - rb > J.suelo + J.gap);
    camino = { puntos, largo };
    if (ok) break;
    rho *= 1.18; for (const p of camino.puntos) p.y = Math.max(p.y, J.suelo + rb + 2 * J.gap);
  }
  const P = camino.puntos, L = camino.largo, Tg = tangentes(P), ds = L / (P.length - 1);
  // inclinación en las curvas: el «arriba» se ladea hacia el centro de la curva (como un avión), hasta ~35°
  const acel = P.map((p, i) => i === 0 || i === P.length - 1 ? V() : V().addVectors(P[i - 1], P[i + 1]).addScaledVector(p, -2).divideScalar(ds * ds));
  const suav = acel.map((_, i) => { const a = V(); let w = 0; for (let k = -6; k <= 6; k++) { const j = limitar(i + k, 0, P.length - 1), e = Math.exp(-(k * k) / 18); a.addScaledVector(acel[j], e); w += e; } return a.divideScalar(w); });
  const amax = Math.max(1e-9, ...suav.map(a => a.length())), gEf = amax / Math.tan(M_(35));
  const arriba = suav.map((a, i) => { const u = V(0, 1, 0).addScaledVector(a, 1 / gEf); u.addScaledVector(Tg[i], -u.dot(Tg[i])); return u.normalize(); });
  const en = (sg, p, q) => {
    if (sg <= 0) { p.copy(P[0]).addScaledVector(Tg[0], sg); return basis(Tg[0], arriba[0], q); }
    if (sg >= L) { p.copy(P[P.length - 1]).addScaledVector(Tg[P.length - 1], sg - L); return basis(Tg[P.length - 1], arriba[P.length - 1], q); }
    const f = sg / ds, i = Math.min(P.length - 2, Math.floor(f)), u = f - i;
    p.copy(P[i]).lerp(P[i + 1], u);
    return basis(_t1.copy(Tg[i]).lerp(Tg[i + 1], u).normalize(), _t2.copy(arriba[i]).lerp(arriba[i + 1], u).normalize(), q);
  };
  // separación de la fila: la menor que deja a cada par a más de 2·rb en todo el camino (el bucle pasa cerca de sí mismo)
  const posEn = sg => (sg <= 0 ? P[0].clone().addScaledVector(Tg[0], sg) : sg >= L ? P[P.length - 1].clone().addScaledVector(Tg[P.length - 1], sg - L) : P[Math.min(P.length - 1, Math.round(sg / ds))].clone());
  let sep = 3 * rb + 0.3 * R;
  const minimo = 2 * rb + 1.5 * J.gap + ds;
  for (let k = 0; k < 40 && n > 1; k++, sep *= 1.12) {
    let bien = true;
    for (let j = 1; j < n && bien; j++) for (let sg = -j * sep; sg <= L + 2 * R && bien; sg += ds) if (posEn(sg).distanceTo(posEn(sg - j * sep)) < minimo) bien = false;
    if (bien) break;
  }
  const v = L / T;
  plan.vuelo = { P, L, en, v, sep };
  for (let i = 0; i < n; i++) {
    const qr = qEje(EJE_Y, Math.PI / 2 * (r() < 0.5 ? 1 : 0)), sg = t => v * (t - t0) - i * sep;
    plan.instancias.push({
      rb, marco: 'escenario', aire: true, ini: t0, finT: t0 + T + i * sep / v, fin: P[P.length - 1].clone(), vuelo: { sg, i },
      en(t, p, q) { const x = sg(t); en(Math.min(x, L + 6 * R), p, q); q.multiply(qr); return x > L + 6 * R ? 0 : 1; },
      bajo: () => rb,
    });
  }
  if (g.estela > 0) plan.estela = { vida: 0.45 + 0.55 * g.estela, tasa: 36, tam: 0.05 * rb + 0.012 * R, rb };
}
const _t1 = V(), _t2 = V(), _m4 = new THREE.Matrix4();
function basis(adelante, arriba, q) {
  const x = adelante, z = V().crossVectors(x, arriba).normalize(), y = V().crossVectors(z, x);
  return q.setFromRotationMatrix(_m4.makeBasis(x, y, z));
}
// Destello k de la estela de una instancia en el instante t (null: no está vivo)
function destello(plan, inst, k, t, p) {
  const E = plan.estela, V0 = plan.vuelo, n = Math.floor(t * E.tasa) - k, tn = n / E.tasa, edad = t - tn;
  if (edad < 0 || edad > E.vida) return 0;
  const sg = inst.vuelo.sg(tn);
  if (sg < 0.06 * V0.L || sg > 0.94 * V0.L) return 0;
  const qq = Q(); V0.en(sg - 0.8 * E.rb, p, qq);
  const h1 = hashNum(n, inst.vuelo.i * 7 + 1), h2 = hashNum(n, inst.vuelo.i * 7 + 2), h3 = hashNum(n, inst.vuelo.i * 7 + 3), h4 = hashNum(n, inst.vuelo.i * 7 + 4);
  const abre = 0.45 * E.rb * (0.4 + edad / E.vida);
  p.x += (h1 - 0.5) * 2 * abre; p.y += (h2 - 0.5) * 2 * abre - 0.4 * E.rb * edad; p.z += (h3 - 0.5) * 2 * abre;
  return E.tam * (0.45 + 0.55 * h4) * Math.pow(1 - edad / E.vida, 1.3) * (0.75 + 0.25 * Math.sin(17 * edad + 6.28 * h1));
}

// ---------- Cinta de satén (r5) ----------
// Recorridos en unidades propias (alto ≈ 1). wl: ancho de la cinta en esas unidades (para el rizo del corazón).
// enhebre: [desde, hasta] de las marcas donde puede ir la joya; abajo: los dos extremos van abajo (al moño o al piso)
function recorridoLocal(tipo, wl) {
  if (tipo === 'onda') {
    const ctrl = []; for (let i = 0; i <= 10; i++) { const x = -1 + i / 5; ctrl.push(V(x, 0.2 * Math.sin(Math.PI * 1.5 * x), 0.06 * Math.sin(Math.PI * 0.7 * x))); }
    return { ctrl, enhebre: [V(-0.12, 0, 0), V(0.12, 0, 0)], nominal: V(0, 0, 0), escala: 3.2 / 2.2, abajo: false };
  }
  if (tipo === 'espiral') {
    const ctrl = [];
    for (let i = 0; i <= 64; i++) {
      const sg = -0.85 + 1.7 * i / 64, rr = 0.32 * Math.pow(sat((Math.abs(sg) - 0.14) / 0.71), 1.15), f = 2 * Math.PI * 2.2 * sg;
      ctrl.push(V(sg, rr * Math.sin(f), rr * Math.cos(f)));
    }
    return { ctrl, enhebre: [V(-0.02, 0, 0), V(0.02, 0, 0)], nominal: V(0, 0, 0), escala: 1.4, abajo: false };
  }
  if (tipo === 'lazo') {
    const dz = Math.max(1.3 * wl, 0.05);
    const ctrl = [[0.3, -1, 0], [0.16, -0.62, 0], [0.04, -0.36, 0], [-0.14, -0.08, 0], [-0.17, 0.12, 0], [-0.09, 0.28, 0], [0, 0.31, 0], [0.09, 0.28, 0.1], [0.17, 0.12, 0.4], [0.14, -0.08, 0.8], [-0.04, -0.36, 1], [-0.16, -0.62, 1], [-0.3, -1, 1]].map(([x, y, z]) => V(x, y, z * dz));
    return { ctrl, enhebre: [V(-0.05, 0.305, 0), V(0.05, 0.305, 0)], nominal: V(0, 0.31, 0), escala: 3.4 / 1.31, abajo: false };
  }
  // corazón: sube por la derecha, pasa por arriba del lóbulo y baja al centro; ahí da un rizo (una vuelta en el plano del
  // corazón, como la cinta del reel: cruza sobre sí misma un poco adelante) y sigue por el lóbulo izquierdo hasta abajo
  const rc = Math.max(0.04, 1.05 * wl), dz = Math.max(0.9 * wl, 0.03), C = [0, 0.75];
  const ent = [C[0] - 0.866 * rc, C[1] + 0.5 * rc], sal = [C[0] + 0.866 * rc, C[1] + 0.5 * rc];
  const der = [[0.07, 0], [0.17, 0.13], [0.31, 0.31], [0.44, 0.5], [0.52, 0.67], [0.53, 0.83], [0.46, 0.95], [0.34, 1.0], [0.22, 0.97], [0.12, 0.9], [0.05, 0.84]];
  const ctrl = der.map(([x, y]) => V(x, y, 0));
  ctrl.push(V(ent[0], ent[1], 0));
  // la vuelta: de 240° a 480° de rumbo, en sentido antihorario (el centro queda a la izquierda de la marcha)
  for (let k = 1; k <= 14; k++) { const th = (240 + 240 * k / 14) * Math.PI / 180; ctrl.push(V(C[0] + rc * Math.cos(th - Math.PI / 2), C[1] + rc * Math.sin(th - Math.PI / 2), dz * suave(k / 14))); }
  const izq = der.slice().reverse().map(([x, y]) => [-x, y]);
  izq.forEach(([x, y], j) => ctrl.push(V(x, y, dz * (1 - suave((j + 1) / (izq.length * 0.45))))));
  return { ctrl, enhebre: [V(0.52, 0.67, 0), V(0.3, 1.0, 0)], nominal: V(0.5, 0.86, 0), escala: 5.5, abajo: true, rc };
}
function planCinta(g, J, ctx) {
  const R = J.R, avisos = [];
  const w0 = 0.34 * R * g.tamano, e = Math.max(0.035 * w0, 0.12 / J.mm), holgura = Math.max(0.02 * R, 0.6 * e);
  const tri = triangulosJoya(J);
  let ag = g.enhebrar && tri ? buscarAgujero(tri, R) : null, w = w0;
  if (g.enhebrar && !ag) avisos.push(tri ? 'La joya no tiene un agujero por donde pasar la cinta: va por detrás.' : 'Sin la malla de la joya la cinta va por detrás.');
  if (ag) {
    const max = 2 * Math.sqrt(Math.max(0, (ag.radio - holgura) ** 2 - (e / 2) ** 2)) * 0.96;
    if (max < 0.25 * w0) { avisos.push('El agujero de la joya es muy chico para la cinta: va por detrás.'); ag = null; }
    else if (w > max) { w = max; avisos.push('La cinta se angostó para pasar por el agujero de la joya.'); }
  }
  // punto y eje por donde pasa: el agujero, o detrás de la joya en horizontal
  const Ph = ag ? ag.centro.clone() : V(J.centro.x, J.centro.y, J.caja.min.z - 0.8 * w - 2 * J.gap);
  const a = ag ? ag.eje.clone().normalize() : V(1, 0, 0);
  const vista = V(0, 0, 1);
  let nE = vista.clone().addScaledVector(a, -vista.dot(a));
  if (nE.lengthSq() < 0.003) nE = EJE_Y.clone().addScaledVector(a, -EJE_Y.dot(a));
  nE.normalize();
  const ancla = aV(ctx.ancla?.ancla ?? ctx.ancla?.punto ?? ctx.ancla), dirAncla = aV(ctx.ancla?.direccion ?? ctx.direccion) || V(0, 1, 0);
  const nominalK = (tipo, loc) => loc.escala * R * g.largo;
  let k = nominalK(g.recorrido, recorridoLocal(g.recorrido, 0.07));
  let mejor = null;
  for (let pasada = 0; pasada < 2; pasada++) {
    const loc = recorridoLocal(g.recorrido, w / k);
    const crudo = remuestrear(curvaB(loc.ctrl, 1600), 900).puntos;
    // las marcas del enhebre (los puntos de la curva más cerca de cada marca)
    const cerca = m => crudo.reduce((b, p, i) => (p.distanceTo(m) < crudo[b].distanceTo(m) ? i : b), 0);
    const i0 = cerca(loc.enhebre[0]), i1 = cerca(loc.enhebre[1]), iN = cerca(loc.nominal);
    const T = tangentes(crudo);
    mejor = null;
    for (const espejo of [1, -1]) for (const signo of [1, -1]) for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i += Math.max(1, Math.floor(Math.abs(i1 - i0) / 40))) {
      const tl = T[i].clone(); tl.x *= espejo;
      const e1 = tl.normalize(), zl = V(0, 0, 1), e2 = zl.addScaledVector(e1, -zl.dot(e1)).normalize(), e3 = V().crossVectors(e2, e1);
      const f1 = a.clone().multiplyScalar(signo), f2 = nE, f3 = V().crossVectors(f2, f1);
      const Rm = new THREE.Matrix4().makeBasis(f1, f2, f3).multiply(new THREE.Matrix4().makeBasis(e1, e2, e3).transpose());
      const arriba = V(0, 1, 0).applyMatrix4(Rm);
      // la joya en el lóbulo, con el corazón derecho; con moño, que los extremos caigan cerca de él
      const curv = T[Math.max(0, i - 6)].angleTo(T[Math.min(T.length - 1, i + 6)]) / 12;   // radianes por muestra
      let puntaje = arriba.y - 0.4 * Math.abs(i - iN) / crudo.length - 25 * curv;
      if (loc.abajo && ancla) {
        const base = crudo[0].clone().add(crudo[crudo.length - 1]).multiplyScalar(0.5); base.x *= espejo;
        const rel = base.sub(V(crudo[i].x * espejo, crudo[i].y, crudo[i].z)).applyMatrix4(Rm);
        const kk = rel.lengthSq() > 0 ? limitar(V().subVectors(ancla, Ph).dot(rel) / rel.lengthSq(), 0.4 * k, 2.2 * k) : k;
        puntaje -= V().subVectors(ancla, Ph).addScaledVector(rel, -kk).length() / R * 0.6;
      }
      if (!mejor || puntaje > mejor.puntaje) mejor = { puntaje, i, espejo, Rm, crudo, loc };
    }
    // escala: con moño, que los extremos lleguen a él; sin moño, que el corazón se apoye en el piso
    const { crudo: C, i, espejo, Rm } = mejor, ph = V(C[i].x * espejo, C[i].y, C[i].z);
    const mapear = p => V(p.x * espejo, p.y, p.z).sub(ph).applyMatrix4(Rm);
    if (mejor.loc.abajo) {
      const base = mapear(C[0].clone().add(C[C.length - 1]).multiplyScalar(0.5));
      if (ancla && base.lengthSq() > 0) k = limitar(V().subVectors(ancla, Ph).dot(base) / base.lengthSq(), 0.4 * k, 2.2 * k);
      else if (base.y < 0) k = limitar((Ph.y - J.suelo - 0.6 * w - holgura) / -base.y, 0.35 * k, 1.6 * k);
    }
    mejor.mapear = mapear;
  }
  const { crudo: C, i: ih, mapear, loc } = mejor;
  let P = C.map(p => mapear(p).multiplyScalar(k).add(Ph));
  const largoTotal = P.reduce((s, p, i) => (i ? s + p.distanceTo(P[i - 1]) : 0), 0), dS = largoTotal / (P.length - 1);
  const tangH = V().subVectors(P[Math.min(P.length - 1, ih + 1)], P[Math.max(0, ih - 1)]).normalize(), aS = a.clone().multiplyScalar(Math.sign(tangH.dot(a)) || 1);
  // tramo recto por el agujero: por construcción el cilindro del agujero no toca la joya
  let tramo = 0;
  if (ag) {
    let s0 = Infinity, s1 = -Infinity; const v = V(), lim = (ag.radio + 1.2 * w) ** 2;
    for (let i = 0; i < tri.length; i += 3) {
      v.set(tri[i] - ag.centro.x, tri[i + 1] - ag.centro.y, tri[i + 2] - ag.centro.z);
      const sa = v.dot(ag.eje); if (v.lengthSq() - sa * sa > lim) continue;
      s0 = Math.min(s0, sa); s1 = Math.max(s1, sa);
    }
    tramo = (Number.isFinite(s0) ? Math.max(-s0, s1) : ag.medio) + 0.5 * w + holgura;
  }
  const recto = () => {
    if (!ag) return P;
    const l2 = tramo + 2.5 * w;
    return P.map((p, i) => { const sg = (i - ih) * dS, b = suave((Math.abs(sg) - tramo) / (l2 - tramo)); return b >= 1 ? p : V().copy(Ph).addScaledVector(aS, sg).lerp(p, b); });
  };
  let Q2 = recto();
  // extremos al moño: se corren de a poco (cero lejos de las puntas) hasta llegar a ancla ± un poco a cada lado
  if (loc.abajo && ancla) {
    const lado = V().crossVectors(dirAncla.clone().normalize(), nE).normalize(), sep = 0.35 * w + e, n = Q2.length, zona = Math.min(0.12 * n, Math.abs(ih - 0) * 0.6, Math.abs(n - 1 - ih) * 0.6);
    const d0 = V().copy(ancla).addScaledVector(lado, Math.sign(V().subVectors(Q2[0], ancla).dot(lado)) * sep || sep).sub(Q2[0]);
    const d1 = V().copy(ancla).addScaledVector(lado, Math.sign(V().subVectors(Q2[n - 1], ancla).dot(lado)) * sep || -sep).sub(Q2[n - 1]);
    Q2 = Q2.map((p, i) => p.clone().addScaledVector(d0, 1 - suave(i / zona)).addScaledVector(d1, 1 - suave((n - 1 - i) / zona)));
  }
  // nunca bajo el piso: lo que baja de más se recuesta sobre él (curva suave)
  const yMin = J.suelo + 0.5 * w + e + holgura * 0.5, kk = 0.3 * w;
  if (Q2.some(p => p.y < yMin + 3 * kk)) Q2 = Q2.map(p => p.clone().setY(yMin + kk * Math.log1p(Math.exp((p.y - yMin) / kk))));
  const N = 420, { puntos } = remuestrear(Q2, N);
  // índice del agujero en el remuestreo
  const iH = puntos.reduce((b, p, i) => (p.distanceTo(Ph) < puntos[b].distanceTo(Ph) ? i : b), 0);
  const plano = g.recorrido === 'espiral' ? null : nE.clone();
  const marcos = marcosParalelos(puntos, nE.clone().cross(tangentes(puntos)[0]), plano);
  // revisar contra los triángulos de la joya (los cantos y el medio de la cinta); si algo roza, otro intento con más tramo recto
  const rej = tri ? rejillaDe(tri, R) : null;
  let juego = Infinity;
  if (rej) {
    const lado = esquinasCinta(puntos, marcos.N, marcos.B, w, e);
    for (const c of lado) for (let m = 0; m < 4; m++) for (let s = 0; s < 3; s++) juego = Math.min(juego, distanciaJoya(rej, c[m].clone().lerp(c[(m + 1) % 4], s / 3), 4 * holgura));
  }
  return { tipo: 'cinta', g, puntos, marcos, plano, ancho: w, espesor: e, ag, iH, tramo, juego, holgura, avisos, abajo: loc.abajo, ancla: !!ancla };
}
// La cinta en el instante t: el recorrido con el aleteo suave (cero en el agujero, en el rizo y en los extremos atados) y
// hasta dónde está dibujada (tope, en muestras: crece desde el primer extremo)
function cintaEn(c, t) {
  const g = c.g, n = c.puntos.length;
  const u = g.crecer > 0 ? (1 - g.crecer) + g.crecer * salida3((t - g.inicio) / g.duracion) : 1;
  const amp = g.aleteo * 0.3 * c.ancho, P = c.puntos, out = new Array(n), lam = 0.22 * n;
  const zonaH = Math.ceil((c.tramo + 3 * c.ancho) / (P[0].distanceTo(P[1]) || 1));
  for (let i = 0; i < n; i++) {
    let env = suave(Math.min(i, n - 1 - i) / (0.08 * n));
    if (c.ag) env *= suave((Math.abs(i - c.iH) - zonaH) / (0.05 * n));
    if (g.recorrido === 'corazon') env *= suave(Math.abs(i - n / 2) / (0.06 * n) - 1);
    const d = amp * env * Math.sin(2 * Math.PI * (i / lam - 0.45 * t)) * Math.sin(Math.PI * i / n * 3 + 0.8 * t);
    out[i] = P[i].clone().addScaledVector(c.marcos.B[i], d);
  }
  return { P: out, tope: u * (n - 1) };
}
// Lo dibujado de la cinta: los puntos hasta la punta (interpolada) y sus marcos; completo: el resto se junta en la punta
// (mismo número de vértices cada cuadro: el trazador solo reajusta el BVH)
function cintaCortada(c, t, completo) {
  const { P, tope } = cintaEn(c, t), n = P.length, fr = marcosParalelos(P, c.marcos.N[0], c.plano);
  const i0 = Math.min(n - 2, Math.floor(tope)), f = tope - i0;
  const lerp = (L, normal) => { const v = L[i0].clone().lerp(L[i0 + 1], f); return normal ? v.normalize() : v; };
  const punta = { p: lerp(P), N: lerp(fr.N, 1), B: lerp(fr.B, 1), T: lerp(fr.T, 1) };
  if (completo) {
    const Q2 = P.slice(), N = fr.N.slice(), B = fr.B.slice(), T = fr.T.slice();
    for (let i = i0 + 1; i < n; i++) { Q2[i] = punta.p; N[i] = punta.N; B[i] = punta.B; T[i] = punta.T; }
    return { P: Q2, N, B, T, tope };
  }
  const Q2 = P.slice(0, i0 + 1), N = fr.N.slice(0, i0 + 1), B = fr.B.slice(0, i0 + 1), T = fr.T.slice(0, i0 + 1);
  if (f > 1e-3) { Q2.push(punta.p); N.push(punta.N); B.push(punta.B); T.push(punta.T); }
  return { P: Q2, N, B, T, tope };
}

// ---------- Cadena (r7, r8) ----------
const ALEACION = { amarillo: 0xF5C66A, rosa: 0xF0B39A, blanco: 0xE9ECEF, plata: 0xEDEFF1 };
function metalCadena(g, J) {
  if (g.metal !== 'joya') return g.metal;
  const m = String(J.metal || '').toLowerCase();
  return /rosa/.test(m) ? 'rosa' : /plata/.test(m) ? 'plata' : /blanco|platino/.test(m) ? 'blanco' : 'amarillo';
}
// Catenaria entre dos puntos con largo = cuerda·(1 + holgura): puntos parejos por largo, en el plano vertical que los une
function catenaria(P1, P2, holgura, n) {
  const dh = V(P2.x - P1.x, 0, P2.z - P1.z), h = dh.length(), v = P2.y - P1.y, cuerda = P1.distanceTo(P2), L = cuerda * (1 + Math.max(1e-5, holgura));
  if (h < 1e-6 * cuerda) return Array.from({ length: n }, (_, i) => P1.clone().lerp(P2, i / (n - 1)));
  dh.normalize();
  const obj = Math.sqrt(Math.max(L * L - v * v, h * h * (1 + 1e-9)));
  let lo = Math.log(h * 1e-4), hi = Math.log(h * 1e6);
  for (let it = 0; it < 200; it++) { const m = (lo + hi) / 2, a = Math.exp(m); if (2 * a * Math.sinh(h / (2 * a)) > obj) lo = m; else hi = m; }
  const a = Math.exp((lo + hi) / 2), x0 = h / 2 - a * Math.asinh(v / (2 * a * Math.sinh(h / (2 * a))));
  const s0 = Math.sinh(-x0 / a), largo = a * (Math.sinh((h - x0) / a) - s0);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s = largo * i / (n - 1), x = x0 + a * Math.asinh(s / a + s0);
    // y = a·(cosh((x−x0)/a) − cosh(x0/a)), estable con a grande
    const y = 2 * a * Math.sinh((x - x0 - x0) / (2 * a)) * Math.sinh(x / (2 * a));
    pts.push(P1.clone().addScaledVector(dh, x).add(V(0, y, 0)));
  }
  return pts;
}
// Distancia con signo a la superficie de un elemento (para que la cadena se apoye encima sin atravesarlo)
function sdfElemento(forma, d, rb, p) {
  if (forma === 'esfera' || forma === 'perla' || forma === 'cuenta') return p.length() - d.r;
  if (forma === 'cubo') { const a = d.s / 2 - d.rc, q = V(Math.max(Math.abs(p.x) - a, 0), Math.max(Math.abs(p.y) - a, 0), Math.max(Math.abs(p.z) - a, 0)); return q.length() + Math.min(Math.max(Math.abs(p.x) - a, Math.abs(p.y) - a, Math.abs(p.z) - a), 0) - d.rc; }
  if (forma === 'cilindro') { const dx = Math.hypot(p.x, p.z) - d.r, dy = Math.abs(p.y) - d.h / 2; return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)); }
  if (forma === 'aro') return Math.hypot(Math.hypot(p.x, p.z) - d.R, p.y) - d.t;
  return p.length() - rb;
}
// Cadena que se apoya sobre obstáculos: se relaja (posiciones con restricciones de largo, gravedad y contacto) desde la
// catenaria libre; siempre el mismo número de pasos, así da lo mismo en cada cuadro
function relajar(pts, obstaculos, juego, suelo) {
  const n = pts.length, P = pts.map(p => p.clone()), L0 = P[0].distanceTo(P[1]) * 0 + pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0) / (n - 1);
  const empujar = () => {
    let toco = false;
    for (let i = 1; i < n - 1; i++) {
      for (const o of obstaculos) {
        const loc = P[i].clone().sub(o.p).applyQuaternion(o.qi), dd = o.sdf(loc) - juego;
        if (dd < 0) {
          const h = 1e-4 * o.rb, gr = V(o.sdf(loc.clone().setX(loc.x + h)) - o.sdf(loc.clone().setX(loc.x - h)), o.sdf(loc.clone().setY(loc.y + h)) - o.sdf(loc.clone().setY(loc.y - h)), o.sdf(loc.clone().setZ(loc.z + h)) - o.sdf(loc.clone().setZ(loc.z - h))).normalize();
          P[i].addScaledVector(gr.applyQuaternion(o.q), -dd); toco = true;
        }
      }
      if (P[i].y < suelo + juego) P[i].y = suelo + juego;
    }
    return toco;
  };
  if (!empujar()) return { P, toco: false };
  const g = 0.004 * L0;
  for (let it = 0; it < 260; it++) {
    for (let i = 1; i < n - 1; i++) P[i].y -= g;
    for (let pasada = 0; pasada < 6; pasada++) {
      for (let i = 0; i < n - 1; i++) {
        const d = V().subVectors(P[i + 1], P[i]), l = d.length(), c = (l - L0) / (l || 1);
        const wa = i === 0 ? 0 : 1, wb = i + 1 === n - 1 ? 0 : 1, s = wa + wb; if (!s) continue;
        P[i].addScaledVector(d, c * wa / s); P[i + 1].addScaledVector(d, -c * wb / s);
      }
      empujar();
    }
  }
  return { P, toco: true };
}
function planCadena(g, J, ctx) {
  const R = J.R, d = limitar(1.0 * g.tamano, 0.8, 2) / J.mm, avisos = [];
  const estilo = g.estilo, Lo = estilo === 'rolo' ? 4.3 * d : 4.4 * d, Wo = estilo === 'rolo' ? 4.3 * d : 3.3 * d, paso = Lo - 2 * d - 0.04 * d;
  const tri = triangulosJoya(J);
  const anclas = ctx.anclasCadena || {};
  let iz = aV(anclas.izquierda?.punto ?? anclas.izquierda), de = aV(anclas.derecha?.punto ?? anclas.derecha);
  const marco = g.colgar === 'joya' ? 'joya' : 'escenario';
  let base = null, aro = null;
  if (g.colgar === 'joya') {
    // el punto donde cuelga: el que pidió la joyera, o el más alto de la malla (o de la caja)
    base = g.punto ? V(...g.punto) : null;
    if (!base && tri) { let m = -Infinity, k = 0; for (let i = 1; i < tri.length; i += 3) if (tri[i] > m) { m = tri[i]; k = i - 1; } base = V(tri[k], tri[k + 1], tri[k + 2]); }
    if (!base) base = V(J.centro.x, J.yMax, J.centro.z);
    iz = iz || base.clone().add(V(-3.2 * R, 7 * R, 0)); de = de || base.clone().add(V(3.2 * R, 7 * R, 0));
  }
  // obstáculo: el elemento sobre el que se apoya (su primera instancia, donde esté en cada instante)
  const sobre = g.sobre && ctx.planes ? ctx.planes.find(p => p.g.id === g.sobre && p.instancias?.length) : null;
  if (g.colgar !== 'joya') {
    if (sobre) {
      // por delante y por encima del elemento: la cadena le abraza el frente (como la de r8 con la esfera de cristal)
      const c0 = V(), q0 = Q(); sobre.instancias[0].en(sobre.g.inicio + sobre.g.duracion, c0, q0); const rt = sobre.instancias[0].rb;
      iz = iz || c0.clone().add(V(-1.7 * rt, 1.5 * rt, 0.55 * rt)); de = de || c0.clone().add(V(1.7 * rt, 1.5 * rt, 0.55 * rt));
    } else { iz = iz || V(-2.4 * R, J.yMax + 1.4 * R, J.rJ + 0.6 * R); de = de || V(2.4 * R, J.yMax + 1.4 * R, J.rJ + 0.6 * R); }
  }
  // argolla sobre el punto más alto: el dije queda colgado (nada de la argolla baja de ese punto: no toca la joya)
  const tramos = [];
  if (base) {
    // (la serpiente es más gruesa que el alambre: su arco va un poco más arriba)
    const Rc = 3 * d, c = base.clone().add(V(0, Rc + (estilo === 'serpiente' ? 0.65 : 0.5) * d + 0.06 * d, 0));
    const hor = V(de.x - iz.x, 0, de.z - iz.z); if (hor.lengthSq() < 1e-12) hor.set(1, 0, 0); hor.normalize();
    aro = { centro: c, Rc, normal: V().crossVectors(hor, EJE_Y).normalize(), hor };
    for (const [Pq, lado] of [[iz, -1], [de, 1]]) {
      const dir = V().subVectors(Pq, c).normalize(), ang = Math.max(M_(20), Math.acos(limitar(dir.dot(EJE_Y), -1, 1)));
      const radial = V(0, Math.cos(ang), 0).addScaledVector(hor, lado * Math.sin(ang));
      const inicio = estilo === 'serpiente' ? c.clone().addScaledVector(radial, Rc) : c.clone().addScaledVector(radial, Rc - d + Lo / 2 - d / 2);
      tramos.push({ desde: inicio, hasta: Pq, radial });
    }
  } else tramos.push({ desde: iz, hasta: de });
  if (g.sobre && !sobre) avisos.push('La cadena no encontró el elemento sobre el que se apoya.');
  const juego = Wo / 2 + 0.08 * d;
  const forma = (t, vaiven = true) => tramos.map((tr, k) => {
    const n = Math.max(24, Math.ceil(tr.desde.distanceTo(tr.hasta) / (1.4 * paso)));
    let P = catenaria(tr.desde, tr.hasta, g.holgura, n), toco = false;
    const obst = [];
    if (sobre) {
      const ins = sobre.instancias[0], pp = V(), qq = Q(); ins.en(t, pp, qq);
      obst.push({ p: pp, q: qq, qi: qq.clone().invert(), rb: ins.rb, sdf: x => sdfElemento(sobre.g.forma, sobre.F.d, ins.rb, x) });
    }
    // suelta: la joya es un obstáculo (el cilindro que la envuelve en cualquier giro)
    if (g.colgar !== 'joya') obst.push({ p: J.centro.clone().setX(0).setZ(0), q: Q(), qi: Q(), rb: J.R, sdf: x => sdfElemento('cilindro', { r: J.rJ + J.gap, h: J.yMax - J.yMin + 2 * J.gap }, 0, x) });
    if (obst.length) ({ P, toco } = relajar(P, obst, juego, J.suelo));
    if (vaiven && g.vaiven > 0) {
      // la panza de la catenaria gira un poco alrededor de la cuerda (de lado a lado), lejos de donde se apoya
      const eje = V().subVectors(tr.hasta, tr.desde).normalize(), th = g.vaiven * 0.22 * Math.sin(2 * Math.PI * 0.32 * t + 1.7 * k);
      const qv = qEje(eje, th);
      P = P.map((p, i) => {
        if (toco) return p;
        const s = i / (P.length - 1), cu = tr.desde.clone().lerp(tr.hasta, s);
        return cu.add(p.clone().sub(cu).applyQuaternion(qv));
      });
    }
    return P;
  });
  return { tipo: 'cadena', g, marco, d, Lo, Wo, paso, estilo, tramos, aro, forma, metal: metalCadena(g, J), sobre, juego, avisos, dinamica: g.vaiven > 0 || !!sobre };
}
// Eslabones a lo largo de los tramos: centros a una cuerda exacta de paso, alternando 90° (cada uno pasa por el anterior)
function eslabones(c, formas) {
  const lista = [];
  formas.forEach((P, k) => {
    const tr = c.tramos[k];
    const cent = [P[0].clone()];
    let j = 0, cur = P[0].clone();
    while (true) {
      // siguiente punto de la polilínea a distancia «paso» de cur
      let hallado = null;
      for (; j < P.length - 1; j++) {
        const a = P[j], b = P[j + 1];
        if (b.distanceTo(cur) < c.paso) continue;
        // intersección de la esfera (cur, paso) con el segmento a→b
        const dvec = V().subVectors(b, a), f = V().subVectors(a, cur), A = dvec.lengthSq(), B = 2 * f.dot(dvec), C = f.lengthSq() - c.paso * c.paso, disc = B * B - 4 * A * C;
        const u = disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : 1;
        hallado = a.clone().addScaledVector(dvec, sat(u)); break;
      }
      if (!hallado) break;
      cent.push(hallado); cur = hallado;
    }
    const ref = c.aro ? c.aro.normal : V(0, 0, 1);
    cent.forEach((p, i) => {
      const t = V().subVectors(cent[Math.min(cent.length - 1, i + 1)], cent[Math.max(0, i - 1)]).normalize();
      let lado = ref.clone().addScaledVector(t, -ref.dot(t)); if (lado.lengthSq() < 1e-8) lado = V(0, 1, 0).cross(t); lado.normalize();
      // el primero cuelga de la argolla: su plano es perpendicular al de ella; después alternan
      if (i % 2 === 1) lado = V().crossVectors(t, lado).normalize();
      lista.push({ p, t, lado, tramo: k });
    });
  });
  return lista;
}

// ---------- Plan completo ----------
// lista: grupos (se normalizan); op: { joya: { caja, mmPorUnidad, objeto?, triangulos? }, suelo, version, metal, ancla
// (moño de la caja de regalo: { ancla|punto, direccion }), anclasCadena ({ izquierda, derecha }), centroVuelo }
export function planearElementos(lista, op = {}) {
  if (!esObj(op)) op = {};
  const grupos = normalizarElementos(lista), J = describirJoya(op), avisos = [], planes = [];
  const ocupados = [];   // lo que queda quieto en el piso (para acomodar los grupos siguientes)
  for (const [indice, g] of grupos.entries()) {
    if (g.forma === 'cinta') { const c = planCinta(g, J, op); avisos.push(...c.avisos); planes.push({ g, camino: c, instancias: [], marco: 'joya' }); continue; }
    if (g.forma === 'cadena') continue;   // después: puede apoyarse en otro elemento
    let plan = null;
    for (let intento = 0; intento < 7; intento++) {
      plan = planGrupo(g, J, { ...op, ocupados, indice, intento }, intento * 0.7 * J.R);
      if (plan.falta || !planes.length) break;
      if (!chocan(plan, planes, J)) break;
      if (intento === 6) avisos.push(`«${FORMAS_ELEMENTO[g.forma].nombre}» queda muy junto a otro elemento: sepáralos o cambia la coreografía.`);
    }
    if (plan.falta) { avisos.push(`Falta el archivo STL${g.stl?.nombre ? ` «${g.stl.nombre}»` : ''}: vuelve a subirlo.`); continue; }
    planes.push(plan);
    for (const ins of plan.instancias) if (!ins.aire && ins.fin) ocupados.push({ p: ins.fin, r: ins.rb });
  }
  for (const g of grupos) if (g.forma === 'cadena') { const c = planCadena(g, J, { ...op, planes }); avisos.push(...c.avisos); planes.push({ g, camino: c, instancias: [], marco: c.marco }); }
  const tFin = Math.max(0, ...grupos.map(g => g.inicio + g.duracion), ...planes.flatMap(p => p.instancias.map(i => i.finT || 0)));
  const clave = JSON.stringify([grupos, J.caja.min.toArray(), J.caja.max.toArray(), J.mm, J.suelo, J.version, J.metal, aV(op.ancla?.ancla ?? op.ancla?.punto ?? op.ancla)?.toArray(), op.anclasCadena && JSON.stringify(op.anclasCadena), aV(op.centroVuelo)?.toArray(), J.objeto?.uuid]);
  return { grupos, planes, J, avisos: [...new Set(avisos)], tFin, clave };
}
// Instantes donde mirar si algo choca: parejos en toda la duración y los bordes de cada movimiento
function instantes(planes, extra = 0) {
  const ts = new Set();
  let fin = 0;
  for (const p of planes) for (const i of p.instancias) { fin = Math.max(fin, i.finT || 0); for (const t of [i.ini, i.finT]) if (Number.isFinite(t)) ts.add(t); }
  fin += extra + 0.5;
  for (let k = 0; k <= 160; k++) ts.add(fin * k / 160);
  return [...ts].sort((a, b) => a - b);
}
function chocan(plan, otros, J) {
  const ts = instantes([plan, ...otros]), p1 = V(), p2 = V(), q = Q();
  for (const t of ts) {
    const a = plan.instancias.map(i => ({ s: i.en(t, p1, q), p: p1.clone(), r: i.rb })).filter(x => x.s > 0);
    for (const o of otros) {
      if (o.camino) {
        if (o.camino.tipo !== 'cinta') continue;
        // la cinta va con la joya: contra la utilería que gira con el escenario se mira para cualquier giro (anillos)
        for (const x of a) for (let k = 0; k < o.camino.puntos.length; k += 4) { const c = o.camino.puntos[k]; if (Math.hypot(Math.hypot(x.p.x, x.p.z) - Math.hypot(c.x, c.z), x.p.y - c.y) < x.r + o.camino.ancho * 0.75 + J.gap) return true; }
        continue;
      }
      for (const i of o.instancias) { if (!(i.en(t, p2, q) > 0)) continue; for (const x of a) if (x.p.distanceTo(p2) < x.r + i.rb + 0.5 * J.gap) return true; }
    }
  }
  return false;
}
// Posiciones de todo en el instante t (para las pruebas): [{ id, i, p, q, rb, marco, bajo }]
export function posesEn(plan, t) {
  const sal = [];
  for (const pl of plan.planes) pl.instancias.forEach((ins, i) => { const p = V(), q = Q(); const s = ins.en(t, p, q); sal.push({ id: pl.g.id, forma: pl.g.forma, i, p, q, s, rb: ins.rb, marco: ins.marco, bajo: ins.bajo(t), aire: !!ins.aire }); });
  return sal;
}

// ---------- STL: los elementos como quedan en el instante t (mm) ----------
// solo: id de un grupo (p. ej. solo la cadena). Cada pieza es un sólido cerrado (las piezas que se tocan no comparten vértices)
export function exportarSTLElementos(lista, op = {}) {
  if (!esObj(op)) op = {};
  const plan = planearElementos(lista, op), t = typeof op.t === 'number' && Number.isFinite(op.t) ? op.t : plan.tFin, mm = plan.J.mm, sal = [];
  const p = V(), q = Q(), m = new THREE.Matrix4(), v = V(), uno = V(1, 1, 1);
  const poner = (tri, mat) => { for (let i = 0; i < tri.length; i += 3) { v.set(tri[i], tri[i + 1], tri[i + 2]).applyMatrix4(mat).multiplyScalar(mm); sal.push(v.x, v.y, v.z); } };
  for (const pl of plan.planes) {
    if (op.solo && pl.g.id !== op.solo) continue;
    if (pl.camino?.tipo === 'cinta') {
      const c = pl.camino, k = cintaCortada(c, t, false);
      if (k.P.length < 2) continue;
      const tri = cintaSolida(k.P, k.N, k.B, c.ancho, c.espesor, false, []);
      for (let i = 0; i < tri.length; i++) sal.push(tri[i] * mm);
      continue;
    }
    if (pl.camino?.tipo === 'cadena') { for (const x of cadenaSolida(pl.camino, t)) sal.push(x * mm); continue; }
    for (const ins of pl.instancias) {
      const s = ins.en(t, p, q); if (!(s > 0)) continue;
      m.compose(p, q, uno);
      for (const pz of pl.F.piezas) poner(pz.solido, m);
    }
  }
  return escribirSTL(sal, 'Atelier & Co - elementos en mm');
}
export function nombreSTLElementos(lista) {
  const g = normalizarElementos(lista);
  return g.length === 1 ? `atelier-${g[0].forma}.stl` : 'atelier-elementos.stl';
}
function cadenaSolida(c, t) {
  const sal = [], formas = c.forma(t), m = new THREE.Matrix4(), v = V();
  if (c.estilo === 'serpiente') {
    const P = [...formas[0]].reverse().concat(c.aro ? arcoArgolla(c) : [], formas[1] || []);
    const { puntos } = remuestrear(P, Math.max(40, P.length));
    const fr = marcosParalelos(puntos, V(0, 0, 1)), geo = tubo(puntos, fr.N, fr.B, 0.65 * c.d, 12, false);
    return solidoDe(geo);
  }
  const plantilla = solidoDe(eslabonGeo(c.Lo, c.Wo, c.d, 10, 28));
  for (const e of eslabones(c, formas)) {
    m.makeBasis(e.t, e.lado, V().crossVectors(e.t, e.lado)).setPosition(e.p);
    for (let i = 0; i < plantilla.length; i += 3) { v.set(plantilla[i], plantilla[i + 1], plantilla[i + 2]).applyMatrix4(m); sal.push(v.x, v.y, v.z); }
  }
  if (c.aro) for (const x of solidoArgolla(c)) sal.push(x);
  return sal;
}
function argollaGeo(c) {
  const n = 40, P = [], { centro, Rc, normal, hor } = c.aro;
  for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; P.push(centro.clone().addScaledVector(hor, Rc * Math.cos(a)).addScaledVector(EJE_Y, Rc * Math.sin(a))); }
  const T = tangentes([P[n - 1], ...P, P[0]]).slice(1, -1), N = P.map(p => V().subVectors(p, centro).normalize()), B = T.map((t, i) => V().crossVectors(t, N[i]));
  return tubo(P, N, B, c.d / 2, 10, true);
}
const solidoArgolla = c => solidoDe(argollaGeo(c));
// tramo de la serpiente que pasa por arriba del punto donde cuelga el dije
function arcoArgolla(c) {
  const { centro, Rc, hor } = c.aro, pts = [];
  for (let k = 1; k < 12; k++) { const a = Math.PI + Math.PI * k / 12; pts.push(centro.clone().addScaledVector(hor, Rc * Math.cos(a)).addScaledVector(EJE_Y, Rc * Math.sin(a))); }
  return pts.reverse().map(p => p);
}

// ---------- Materiales ----------
const TEX = {};
function lienzoRuido(N, f) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const [r, g, b] = f(i % N, Math.floor(i / N)); img.data[4 * i] = r; img.data[4 * i + 1] = g; img.data[4 * i + 2] = b; img.data[4 * i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function ruidoValor(N, celdas, semilla) {
  const r = azar(semilla), g = Float32Array.from({ length: celdas * celdas }, r), sal = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * celdas, fy = y / N * celdas, i = Math.floor(fx), j = Math.floor(fy), u = suave(fx - i), v = suave(fy - j);
    const at = (a, b) => g[(b % celdas) * celdas + (a % celdas)];
    sal[y * N + x] = (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  return sal;
}
function normalDesdeAlto(N, alto, fuerza) {
  return lienzoRuido(N, (x, y) => {
    const h = (a, b) => alto[((b + N) % N) * N + ((a + N) % N)];
    const gx = (h(x + 1, y) - h(x - 1, y)) * fuerza, gy = (h(x, y + 1) - h(x, y - 1)) * fuerza, l = Math.hypot(gx, gy, 1);
    return [(-gx / l * 0.5 + 0.5) * 255, (gy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
}
// Texturas que se generan una vez (grises: el color lo pone el material)
function texturas(tipo) {
  if (!hayDOM()) return null;
  if (TEX[tipo]) return TEX[tipo];
  const N = 512;
  if (tipo === 'piedra') {
    const a = ruidoValor(N, 6, 3), b = ruidoValor(N, 48, 4), c = ruidoValor(N, 160, 5);
    const alto = a.map((v, i) => 0.3 * v + 0.35 * b[i] + 0.35 * c[i]);
    const color = lienzoRuido(N, (x, y) => { const i = y * N + x, v = 236 + 19 * (a[i] - 0.5) * 2 + 8 * (b[i] - 0.5); return [v, v, v]; });
    color.colorSpace = THREE.SRGBColorSpace;
    const rug = lienzoRuido(N, (x, y) => { const v = 200 + 50 * (c[y * N + x] - 0.5); return [v, v, v]; });
    TEX[tipo] = { map: color, normalMap: normalDesdeAlto(N, alto, 3.5), roughnessMap: rug };
  } else if (tipo === 'nacar') {
    const a = ruidoValor(N, 10, 7), b = ruidoValor(N, 70, 8);
    TEX[tipo] = { normalMap: normalDesdeAlto(N, a.map((v, i) => 0.7 * v + 0.3 * b[i]), 1.2) };
  } else if (tipo === 'saten') {
    // hilos a lo largo de la cinta (u): brillos alargados como el satén
    const b = ruidoValor(N, 32, 9), alto = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) alto[y * N + x] = 0.5 + 0.35 * Math.sin(2 * Math.PI * y / N * 64) + 0.15 * b[y * N + x];
    TEX[tipo] = { normalMap: normalDesdeAlto(N, alto, 1.1) };
  } else return null;
  return TEX[tipo];
}
function colorMetal(hex) {
  // el oro de la marca es oscuro para un reflejo de metal: se aclara hacia el color de una aleación de verdad
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), Math.max(hsl.l, 0.62));
}
export function materialElemento(tipo, colorHex, { tamano = 1, metalHex = null, tinte = 0.18 } = {}) {
  const color = new THREE.Color(colorHex), m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0 });
  const tx = texturas(tipo);
  switch (tipo) {
    case 'piedra':
      Object.assign(m, { roughness: 0.82, specularIntensity: 0.4 });
      if (tx) { m.map = tx.map; m.normalMap = tx.normalMap; m.roughnessMap = tx.roughnessMap; m.normalScale.set(0.35, 0.35); m.roughness = 1; }
      break;
    case 'laca': Object.assign(m, { roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 }); break;
    case 'brillante': Object.assign(m, { roughness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.03 }); break;
    case 'nacar':
      // nácar: brillo suave que se desliza, un velo rosado en el borde y la iridiscencia de las capas
      Object.assign(m, { roughness: 0.17, clearcoat: 0.85, clearcoatRoughness: 0.1, sheen: 0.75, sheenRoughness: 0.38, iridescence: 0.6, iridescenceIOR: 1.33, specularIntensity: 0.9 });
      m.color.multiplyScalar(0.86);
      m.iridescenceThicknessRange = [220, 560];
      m.sheenColor.set(0xFFE4EA).lerp(color, 0.3);
      if (tx) { m.normalMap = tx.normalMap; m.normalScale.set(0.06, 0.06); }
      break;
    case 'metal':
      Object.assign(m, { metalness: 1, roughness: 0.13 });
      m.color.copy(metalHex != null ? new THREE.Color(metalHex) : colorMetal(colorHex)); break;
    case 'cristal':
      // vidrio de verdad: refracta (la esfera invierte lo que hay detrás), canto brillante; el color es un tinte suave
      // (thickness solo lo usa el motor rápido, que refracta en pantalla: con el diámetro entero la muestra cae fuera de la
      // imagen y la esfera se ve negra; ~0,6 del radio da el vidrio macizo creíble. El trazador usa la geometría de verdad)
      Object.assign(m, { transmission: 1, ior: 1.5, thickness: 0.6 * tamano, roughness: 0, metalness: 0, specularIntensity: 1, envMapIntensity: 1.3 });
      m.color.set(0xffffff).lerp(color, tinte);
      m.attenuationColor.copy(color).lerp(new THREE.Color(0xffffff), 1 - tinte); m.attenuationDistance = (tinte > 0.5 ? 1.2 : 6) * tamano;
      break;
    case 'saten':
      Object.assign(m, { roughness: 0.26, sheen: 0.9, sheenRoughness: 0.28, specularIntensity: 0.75, side: THREE.FrontSide });
      m.color.multiplyScalar(0.84);
      m.sheenColor.copy(color).lerp(new THREE.Color(0xffffff), 0.4);
      if (tx) { m.normalMap = tx.normalMap; m.normalScale.set(0.32, 0.32); }
      break;
  }
  return m;
}

// ---------- La clase que va en el estudio ----------
export class Elementos {
  constructor() {
    this.grupo = new THREE.Group(); this.grupo.name = 'elementos';             // motor rápido (va en estudio.escena)
    this.escenario = new THREE.Group(); this.escenario.name = 'elementos-escenario'; this.grupo.add(this.escenario);   // gira con girar(az)
    this.joya = new THREE.Group(); this.joya.name = 'elementos-joya'; this.grupo.add(this.joya);                       // quieto (con la joya)
    this.grupoPT = new THREE.Group(); this.grupoPT.name = 'elementosPT';         // trazador: en estudio.escenaPT (quieto)
    this.grupoJoyaPT = new THREE.Group(); this.grupoJoyaPT.name = 'elementosJoyaPT';   // trazador: dentro de estudio.tornamesaPT
    this.plan = null; this.clave = null; this.mallas = []; this.t = null; this.ptSucio = false; this.limites = null; this.avisos = [];
  }
  get vacio() { return !this.plan || !this.plan.planes.length; }

  // lista: grupos de elementos; op: { joya: { caja, mmPorUnidad, objeto? }, suelo, version, metal?, ancla?, anclasCadena?, centroVuelo? }
  armar(lista, op = {}) {
    const plan = planearElementos(lista, op);
    if (plan.clave === this.clave) return this.resultado();
    this.limpiar();
    this.plan = plan; this.clave = plan.clave; this.avisos = plan.avisos;
    const J = plan.J;
    for (const pl of plan.planes) {
      const g = pl.g;
      if (pl.camino?.tipo === 'cinta') { this.armarCinta(pl); continue; }
      if (pl.camino?.tipo === 'cadena') { this.armarCadena(pl); continue; }
      const mats = { a: materialElemento(g.material, g.color, { tamano: pl.instancias[0]?.rb || J.R, tinte: g.forma === 'gema' || g.forma === 'cuenta' ? 0.85 : 0.18 }), b: materialElemento(g.forma === 'regalo' ? 'saten' : g.material, g.color2) };
      if (g.forma === 'gema' && g.material === 'cristal') mats.a.flatShading = true;
      for (const ins of pl.instancias) {
        const hacer = () => { const o = new THREE.Group(); for (const pz of pl.F.piezas) { const m = new THREE.Mesh(pz.geo, mats[pz.mat]); m.castShadow = m.receiveShadow = true; o.add(m); } return o; };
        const rapido = hacer(), pt = hacer();
        this.escenario.add(rapido); this.grupoPT.add(pt);
        const mancha = ins.aire ? null : this.mancha(ins.rb);
        if (mancha) this.escenario.add(mancha);
        this.mallas.push({ ins, rapido, pt, mancha, mats, J });
      }
      if (pl.estela) this.armarEstela(pl);
    }
    this.t = null; this.actualizar(0);
    this.ptSucio = true;
    this.limites = this.calcularLimites();
    return this.resultado();
  }
  resultado() { return { grupo: this.grupo, grupoPT: this.grupoPT, grupoJoyaPT: this.grupoJoyaPT, limites: this.limites, avisos: this.avisos, plan: this.plan }; }

  // mancha de contacto bajo cada elemento del piso (solo motor rápido; el trazador hace la suya sola)
  mancha(rb) {
    if (!hayDOM()) return null;
    if (!TEX.mancha) {
      const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
      const x = c.getContext('2d'), gr = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#bbb'); gr.addColorStop(0.7, '#3a3a3a'); gr.addColorStop(1, '#000');
      x.fillStyle = gr; x.fillRect(0, 0, N, N);
      TEX.mancha = new THREE.CanvasTexture(c); TEX.mancha.colorSpace = THREE.NoColorSpace;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: TEX.mancha, transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; m.userData.rb = rb;
    return m;
  }
  armarEstela(pl) {
    const geo = new THREE.IcosahedronGeometry(1, 1), mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xFFF1D2, emissiveIntensity: 5, roughness: 1 });
    const K = Math.ceil(pl.estela.vida * pl.estela.tasa) + 1;
    for (const ins of pl.instancias) for (let k = 0; k < K; k++) {
      const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
      this.escenario.add(a); this.grupoPT.add(b);
      this.mallas.push({ destello: { pl, ins, k }, rapido: a, pt: b });
    }
  }
  armarCinta(pl) {
    const c = pl.camino, g = pl.g, fr = c.marcos;
    const geo = cintaGeometria(c.puntos, fr.N, fr.B, fr.T, c.ancho, c.espesor, { uLargo: c.ancho * 6 });
    geo.userData.tapas = true;
    const mat = materialElemento(g.material, g.color);
    const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
    a.castShadow = a.receiveShadow = true;
    this.joya.add(a); this.grupoJoyaPT.add(b);
    this.mallas.push({ cinta: pl, geo, rapido: a, pt: b });
  }
  armarCadena(pl) {
    const c = pl.camino, mat = materialElemento('metal', HEX.oro, { metalHex: ALEACION[c.metal] });
    mat.roughness = 0.16;
    const plantilla = c.estilo === 'serpiente' ? null : eslabonGeo(c.Lo, c.Wo, c.d, 10, 28);
    const geo = new THREE.BufferGeometry();
    const objs = [];
    const hacer = (g) => { const a = new THREE.Mesh(g, mat), b = new THREE.Mesh(g, mat); a.castShadow = true; return [a, b]; };
    const [a, b] = hacer(geo); objs.push(a, b);
    if (c.aro && c.estilo !== 'serpiente') {
      const ga = argollaGeo(c), [x, y] = hacer(ga);
      (c.marco === 'joya' ? this.joya : this.escenario).add(x); (c.marco === 'joya' ? this.grupoJoyaPT : this.grupoPT).add(y);
      this.mallas.push({ fijo: true, geo: ga, rapido: x, pt: y });
    }
    (c.marco === 'joya' ? this.joya : this.escenario).add(a); (c.marco === 'joya' ? this.grupoJoyaPT : this.grupoPT).add(b);
    const malla = { cadena: pl, geo, plantilla, rapido: a, pt: b, firma: null };
    this.mallas.push(malla);
    this.ponerCadena(malla, 0);
  }
  // los eslabones van todos en una sola geometría (el trazador no sabe de instancias): se reescriben si la cadena se mueve
  ponerCadena(malla, t) {
    const c = malla.cadena.camino, formas = c.forma(t);
    if (c.estilo === 'serpiente') {
      const P = [...formas[0]].reverse().concat(c.aro ? arcoArgolla(c) : [], formas[1] || []), { puntos } = remuestrear(P, Math.max(40, P.length));
      const fr = marcosParalelos(puntos, V(0, 0, 1)), nueva = tubo(puntos, fr.N, fr.B, 0.65 * c.d, 12, false);
      this.copiarGeo(malla.geo, nueva); nueva.dispose(); return;
    }
    const lista = eslabones(c, formas), tp = malla.plantilla.attributes.position, tn = malla.plantilla.attributes.normal, ti = malla.plantilla.index;
    const nv = tp.count, ni = ti.count, total = lista.length;
    let pos = malla.geo.attributes.position, nor = malla.geo.attributes.normal;
    if (!pos || pos.count !== nv * total) {
      pos = new THREE.BufferAttribute(new Float32Array(nv * total * 3), 3); nor = new THREE.BufferAttribute(new Float32Array(nv * total * 3), 3);
      const idx = new Uint32Array(ni * total);
      for (let k = 0; k < total; k++) for (let i = 0; i < ni; i++) idx[k * ni + i] = ti.getX(i) + k * nv;
      malla.geo.setAttribute('position', pos); malla.geo.setAttribute('normal', nor); malla.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    const m = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = V();
    lista.forEach((e, k) => {
      m.makeBasis(e.t, e.lado, V().crossVectors(e.t, e.lado)).setPosition(e.p); n3.getNormalMatrix(m);
      for (let i = 0; i < nv; i++) {
        v.fromBufferAttribute(tp, i).applyMatrix4(m); pos.setXYZ(k * nv + i, v.x, v.y, v.z);
        v.fromBufferAttribute(tn, i).applyMatrix3(n3).normalize(); nor.setXYZ(k * nv + i, v.x, v.y, v.z);
      }
    });
    pos.needsUpdate = nor.needsUpdate = true; malla.geo.computeBoundingSphere(); malla.geo.computeBoundingBox();
  }
  copiarGeo(dest, src) {
    if (!dest.attributes.position || dest.attributes.position.count !== src.attributes.position.count) {
      for (const k of ['position', 'normal']) dest.setAttribute(k, src.attributes[k].clone());
      dest.setIndex(src.index.clone());
    } else { dest.attributes.position.copy(src.attributes.position); dest.attributes.normal.copy(src.attributes.normal); dest.attributes.position.needsUpdate = dest.attributes.normal.needsUpdate = true; }
    dest.computeBoundingSphere(); dest.computeBoundingBox();
  }

  // Cada cuadro: pone todo donde va en el instante t. Devuelve true si algo se movió (y deja ptSucio para el trazador)
  actualizar(t) {
    if (!this.plan || !Number.isFinite(t) || t === this.t) return false;
    const antes = this.t; this.t = t;
    let movio = false;
    const p = V(), q = Q();
    for (const m of this.mallas) {
      if (m.cinta) {
        const c = m.cinta.camino, g = c.g;
        const dinamica = g.aleteo > 0 || (g.crecer > 0 && (antes === null || Math.min(antes, t) < g.inicio + g.duracion));
        if (antes !== null && !dinamica) continue;
        const k = cintaCortada(c, t, true);
        cintaActualizar(m.geo, k.P, k.N, k.B, k.T, c.ancho, c.espesor); movio = true; continue;
      }
      if (m.fijo) continue;
      if (m.cadena) { if (antes === null || m.cadena.camino.dinamica) { this.ponerCadena(m, t); movio = true; } continue; }
      if (m.destello) {
        const s = destello(m.destello.pl, m.destello.ins, m.destello.k, t, p);
        for (const o of [m.rapido, m.pt]) { if (s > 0) o.position.copy(p); o.scale.setScalar(Math.max(s, 1e-6)); o.updateMatrix(); }
        m.rapido.visible = s > 0; movio = true; continue;
      }
      const s = m.ins.en(t, p, q), e = Math.max(s, 1e-6);
      for (const o of [m.rapido, m.pt]) {
        if (!o.position.equals(p) || !o.quaternion.equals(q) || o.scale.x !== e) { o.position.copy(p); o.quaternion.copy(q); o.scale.setScalar(e); movio = true; }
      }
      m.rapido.visible = s > 0;
      if (m.mancha) {
        const h = Math.max(0, p.y - m.J.suelo - m.ins.bajo(t)), rb = m.mancha.userData.rb;
        m.mancha.position.set(p.x, m.J.suelo + 0.002 * m.J.R, p.z);
        m.mancha.scale.setScalar(2.1 * rb * (1 + 1.2 * h / rb));
        m.mancha.material.opacity = 0.55 * (1 - suave(h / (2.5 * rb)));
        m.mancha.visible = h < 3 * rb;
      }
    }
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true); this.grupoJoyaPT.updateMatrixWorld(true);
    if (movio) this.ptSucio = true;
    return movio;
  }
  // Mismo giro de tornamesa que Escenario3D.girar: la utilería del piso gira con la cámara (motor rápido)
  girar(az) { if (this.escenario.rotation.y !== az) { this.escenario.rotation.y = az; this.escenario.updateMatrixWorld(true); } }

  calcularLimites() {
    const c = new THREE.Box3(), fin = this.plan.tFin, p = V(), q = Q();
    for (const m of this.mallas) {
      if (m.ins) { m.ins.en(fin, p, q); c.expandByPoint(p.clone().addScalar(m.ins.rb)); c.expandByPoint(p.clone().addScalar(-m.ins.rb)); }
      else if (m.cinta || m.cadena || m.fijo) { m.geo.computeBoundingBox(); if (!m.geo.boundingBox.isEmpty()) c.union(m.geo.boundingBox); }
    }
    return c.isEmpty() ? null : c;
  }
  limpiar() {
    // (las geometrías de las formas se comparten entre armados: quedan en su caché; las propias se botan)
    const mats = new Set(), geos = new Set();
    for (const m of this.mallas) {
      for (const o of [m.rapido, m.pt, m.mancha]) { if (!o) continue; o.removeFromParent(); o.traverse(h => { if (h.isMesh) mats.add(h.material); }); }
      if (m.geo) geos.add(m.geo);
      if (m.plantilla) geos.add(m.plantilla);
      if (m.mancha) geos.add(m.mancha.geometry);
      if (m.destello) geos.add(m.rapido.geometry);
    }
    for (const x of mats) x.dispose();
    for (const x of geos) x.dispose();
    this.mallas = []; this.plan = null; this.clave = null; this.limites = null;
  }
  vaciar() { this.limpiar(); this.t = null; this.ptSucio = true; }
}

// (para las pruebas)
export const _interno = { describirJoya, buscarAgujero, triangulosJoya, rejillaDe, distanciaJoya, piezasDe, medidas, solidoDe, cintaEn, cintaCortada, cintaSolida, catenaria, eslabones, eslabonGeo, argollaGeo, cadenaSolida, destello, sdfElemento, alturaRebote, rebote, STLS };
