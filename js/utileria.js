// Utilería: estuches, cajas de regalo, bandeja y pilas de cajas que acompañan a la joya en el video y que se pueden
// exportar como STL (en milímetros, cada parte un sólido cerrado) para imprimirlos en 3D.
//  · Todo se mide con la joya: la caja de su contorno (en unidades del estudio) y cuántos mm es una unidad. El STL que
//    sube la joyera ya viene en mm (el estudio no lo escala), así que normalmente mmPorUnidad = 1.
//  · La geometría es paramétrica y cerrada: cada pieza es un «torno» sobre un rectángulo redondeado (paredes, biseles,
//    tapas) o una «losa» que sigue un camino (cintas, moño). Con eso la misma malla sirve para el video y para imprimir.
//  · La joya no se mueve: la caja se arma alrededor de ella, con la joya apoyada en su asiento (ranura, almohada o el
//    piso de la bandeja). Al abrir, se mueve solo la tapa (o la funda del cajón).
//  · Dos copias de la escena, como el escenario: `grupo` (motor rápido) y `grupoPT` (trazado de rayos), con las mismas
//    geometrías y materiales (solo lo que three-gpu-pathtracer entiende: color, mapas, brillo de tela, laca).
// Este módulo también funciona en Node (sin DOM): ahí no hay texturas, pero la geometría, el STL y los choques sí.
import * as THREE from 'three';
import { escribirSTL } from './stl.js';
import { LOGO_D, LOGO_W, LOGO_H } from './marca.js';

const PI = Math.PI;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suav = t => t * t * (3 - 2 * t);
const escalon = (a, b, x) => suav(limitar((x - a) / (b - a), 0, 1));
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const T_UV = 10;   // mm por unidad de textura en todas las piezas (cada material escala su dibujo con repeat)
const HAY_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';

// ---------- Catálogo ----------
// abre: cómo se abre (bisagra, tapa suelta que sube, cajón que sale); posiciones: dónde puede ir respecto a la joya
export const UTILERIA = {
  ninguna:          { nombre: 'Sin estuche', descripcion: 'La joya sola, sin caja ni estuche.' },
  'estuche-anillo': { nombre: 'Estuche de anillo', descripcion: 'Estuche redondeado con tapa de bisagra dorada y cojín de terciopelo con ranura: el anillo queda parado, medio hundido.', abre: 'bisagra', material: 'cuero' },
  'caja-regalo':    { nombre: 'Caja de regalo', descripcion: 'Caja cuadrada con tapa suelta, cinta de satén cruzada y moño. Al abrir, la tapa sube y se inclina.', abre: 'tapa', material: 'papel', posiciones: ['asiento', 'al-lado', 'escenario'] },
  'estuche-aretes': { nombre: 'Estuche de aretes', descripcion: 'Estuche cuadrado y plano con bisagra y un inserto con dos ranuras para el par.', abre: 'bisagra', material: 'cuero' },
  'estuche-collar': { nombre: 'Estuche de collar', descripcion: 'Estuche rectangular y plano con bisagra; la pieza descansa sobre un inserto forrado en satén.', abre: 'bisagra', material: 'cuero' },
  cofre:            { nombre: 'Cofre de tapa alta', descripcion: 'Caja de esquinas suaves con tapa profunda, botón metálico al frente y forro de satén con almohada.', abre: 'bisagra', material: 'cuero' },
  cajon:            { nombre: 'Caja de cajón', descripcion: 'Funda y cajón que se desliza hacia afuera, con cojín de terciopelo adentro.', abre: 'cajon', material: 'cuero' },
  bandeja:          { nombre: 'Bandeja', descripcion: 'Bandeja redonda y baja, forrada en terciopelo, donde descansa la pieza.', abre: null, material: 'laca' },
  'pila-cajas':     { nombre: 'Pila de cajas', descripcion: 'Torres de cajas cerradas a lado y lado de la joya, como una ciudad; de sus cimas puede colgar una cadena.', abre: null, material: 'papel', posiciones: ['asiento'] },
};
export const MATERIALES_UTILERIA = { cuero: 'Cuero', terciopelo: 'Terciopelo', laca: 'Laca brillante', papel: 'Papel de lujo', saten: 'Satén' };
export const POSICIONES_UTILERIA = { asiento: 'La joya va adentro', 'al-lado': 'Al lado, de adorno', escenario: 'Escenario gigante' };
// Colores de la marca (los de estilos.css): las muestras del panel
export const COLORES_MARCA = [
  ['#1E1B15', 'Tinta'], ['#17150F', 'Bosque'], ['#1E5B4B', 'Esmeralda'], ['#8E2F3A', 'Granate'],
  ['#C9A3A8', 'Rosa'], ['#F1EFEA', 'Perla'], ['#FCFBF8', 'Papel'], ['#B8871F', 'Oro'],
];
// Estilos de marca listos (nunca el azul de otra casa)
export const ESTILOS_UTILERIA = {
  tinta:     { nombre: 'Tinta y oro', color: '#1E1B15', interior: '#F1EFEA', cinta: '#B8871F', material: 'cuero' },
  perla:     { nombre: 'Perla y oro', color: '#F1EFEA', interior: '#F1EFEA', cinta: '#B8871F', material: 'papel' },
  esmeralda: { nombre: 'Terciopelo esmeralda', color: '#1E5B4B', interior: '#F1EFEA', cinta: '#B8871F', material: 'terciopelo' },
  granate:   { nombre: 'Laca granate', color: '#8E2F3A', interior: '#F1EFEA', cinta: '#B8871F', material: 'laca' },
  bosque:    { nombre: 'Bosque y oro', color: '#17150F', interior: '#1E5B4B', cinta: '#B8871F', material: 'cuero' },
  rosa:      { nombre: 'Rosa empolvado', color: '#C9A3A8', interior: '#FCFBF8', cinta: '#B8871F', material: 'papel' },
};
export const RANGOS_UTILERIA = { tamano: { min: 0.7, max: 2.5, def: 1 }, angulo: { min: -180, max: 180, def: 0 }, semilla: { min: 1, max: 9999, def: 7 } };
export const MAX_GRABADO = 24;
export const UTILERIA_INICIAL = 'estuche-anillo';

const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : def);
const clave = (lista, v, def) => (typeof v === 'string' && Object.hasOwn(lista, v) ? v : def);
function limpiarGrabado(v) {
  if (typeof v !== 'string') return '';
  // sin caracteres de control ni saltos; espacios simples; como mucho MAX_GRABADO letras
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, MAX_GRABADO).join('').trim();
}

// Configuración completa y válida (nunca falla: lo que no sirve vuelve a su valor por defecto)
export function normalizarUtileria(cfg) {
  let c = cfg;
  if (typeof c === 'string') c = { tipo: c };
  if (!esObj(c)) c = {};
  const tipo = clave(UTILERIA, c.tipo, 'ninguna'), def = UTILERIA[tipo], e = ESTILOS_UTILERIA.tinta;
  const posiciones = def.posiciones || ['asiento', 'al-lado'];
  const posicion = posiciones.includes(c.posicion) ? c.posicion : posiciones[0];
  const R = RANGOS_UTILERIA, num = (v, k) => (typeof v === 'number' && Number.isFinite(v) ? limitar(v, R[k].min, R[k].max) : R[k].def);
  // abierta por defecto si la joya va adentro (se ve); cerrada como escenario, en la pila o la caja de regalo de adorno
  const abiertaPorDefecto = def.abre && posicion !== 'escenario' && !(tipo === 'caja-regalo' && posicion === 'al-lado');
  let ang = typeof c.angulo === 'number' && Number.isFinite(c.angulo) ? c.angulo : 0;
  ang = ((ang % 360) + 540) % 360 - 180; if (ang === -180) ang = 180;
  return {
    tipo,
    color: color(c.color, e.color), interior: color(c.interior, e.interior), cinta: color(c.cinta, e.cinta),
    material: clave(MATERIALES_UTILERIA, c.material, def.material || 'cuero'),
    apertura: typeof c.apertura === 'number' && Number.isFinite(c.apertura) ? limitar(c.apertura, 0, 1) : abiertaPorDefecto ? 1 : 0,
    logo: typeof c.logo === 'boolean' ? c.logo : true,
    grabado: limpiarGrabado(c.grabado),
    posicion,
    angulo: Math.round(ang * 10) / 10,
    tamano: Math.round(num(c.tamano, 'tamano') * 100) / 100,
    mono: typeof c.mono === 'boolean' ? c.mono : posicion !== 'escenario',
    semilla: Math.round(num(c.semilla, 'semilla')),
    frente: typeof c.frente === 'boolean' ? c.frente : true,
  };
}
// Una pieza del catálogo con un estilo de marca (para el chat y el panel)
export function utileriaDe(tipo, estilo = 'tinta', extra = {}) {
  const e = ESTILOS_UTILERIA[estilo] || ESTILOS_UTILERIA.tinta, def = UTILERIA[tipo] || {};
  // la caja de regalo y la pila llevan papel; el resto, el material del estilo
  const material = tipo === 'caja-regalo' || tipo === 'pila-cajas' ? (e.material === 'cuero' ? 'papel' : e.material) : tipo === 'bandeja' && e.material === 'papel' ? 'laca' : e.material;
  return normalizarUtileria({ ...extra, tipo, color: e.color, interior: e.interior, cinta: e.cinta, material: extra.material || material || def.material });
}
// Estilo de marca que coincide con los colores de ahora (para marcarlo en el panel), o null
export function estiloDe(cfg) {
  const n = normalizarUtileria(cfg);
  for (const [id, e] of Object.entries(ESTILOS_UTILERIA)) if (e.color === n.color && e.interior === n.interior && e.cinta === n.cinta) return id;
  return null;
}

// Partes que se pueden bajar como STL (el panel arma el selector con esto)
export function partesSTL(cfg) {
  const n = normalizarUtileria(cfg), t = n.tipo;
  if (t === 'ninguna') return [];
  const L = [{ id: 'todo', nombre: 'Todo junto (cerrado)' }];
  if (t === 'pila-cajas') {
    const k = cajasDePila(n).length;
    for (let i = 1; i <= k; i++) L.push({ id: `caja-${i}`, nombre: `Caja ${i}` });
    L.push({ id: 'cinta', nombre: 'Cintas' });
    return L;
  }
  if (t === 'bandeja') return L;
  L.push({ id: 'base', nombre: t === 'cajon' ? 'Cajón' : 'Base' }, { id: 'tapa', nombre: t === 'cajon' ? 'Funda' : 'Tapa' });
  if (!(t === 'caja-regalo' && n.posicion === 'escenario')) L.push({ id: 'inserto', nombre: 'Cojín o inserto' });
  if (t === 'caja-regalo') L.push({ id: 'cinta', nombre: n.mono ? 'Cinta y moño' : 'Cinta' });
  return L;
}
export const nombreSTL = (cfg, parte = 'todo') => {
  const n = normalizarUtileria(cfg), p = String(parte || 'todo').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `atelier-${n.tipo}${p && p !== 'todo' ? '-' + p : ''}.stl`;
};

// ---------- La joya en milímetros ----------
const ANILLO_DEMO = { min: [-10.3, -12, -3.2], max: [10.3, 13.7, 3.2] };   // el anillo de ejemplo (js/demo.js)
function medirJoya(joya = {}) {
  const j = esObj(joya) ? joya : {};
  const k = typeof j.mmPorUnidad === 'number' && Number.isFinite(j.mmPorUnidad) && j.mmPorUnidad > 0 ? j.mmPorUnidad : 1;
  const cj = j.caja, ok = cj && cj.min && cj.max && ['x', 'y', 'z'].every(e => Number.isFinite(cj.min[e]) && Number.isFinite(cj.max[e]) && cj.max[e] - cj.min[e] >= 0);
  let min = ok ? [cj.min.x * k, cj.min.y * k, cj.min.z * k] : ANILLO_DEMO.min.slice(), max = ok ? [cj.max.x * k, cj.max.y * k, cj.max.z * k] : ANILLO_DEMO.max.slice();
  // una joya de verdad mide entre medio milímetro y dos metros (lo demás se lleva a esos límites)
  for (let e = 0; e < 3; e++) {
    const c = (min[e] + max[e]) / 2, m = limitar(max[e] - min[e], 0.5, 2000) / 2;
    min[e] = limitar(c, -1e5, 1e5) - m; max[e] = limitar(c, -1e5, 1e5) + m;
  }
  const size = max.map((v, e) => v - min[e]), c = max.map((v, e) => (v + min[e]) / 2);
  const [sx, sy, sz] = size;
  // parada (un anillo, un arete): alta y delgada en un sentido. Va en una ranura; lo demás se acuesta en un cojín
  const erguida = sy > 0.55 * Math.max(sx, sz) && Math.min(sx, sz) < 0.5 * Math.max(sx, sz);
  const eje = sx >= sz ? 'x' : 'z';
  const par = esObj(j.par) && j.par.separacion > 0 ? { separacion: j.par.separacion * k } : null;
  const J = { k, min, max, size, c, sx, sy, sz, erguida, eje, par, banda: eje === 'x' ? sz : sx, centroBanda: eje === 'x' ? c[2] : c[0] };
  // lo que se hunde en la ranura: algo menos de la mitad del aro (como en las fotos de estuches)
  J.hundir = erguida ? limitar(0.42 * Math.min(eje === 'x' ? sx : sz, sy), 0.8, 0.5 * sy) : 0;
  if (erguida && j.objeto?.isObject3D) medirBanda(j.objeto, J);
  else if (erguida && typeof j.banda === 'number' && j.banda > 0) J.banda = Math.min(J.banda, j.banda * k);
  return J;
}
// Ancho real de lo que entra en la ranura (los vértices de la joya por debajo del borde del cojín)
function medirBanda(objeto, J) {
  const v = new THREE.Vector3(), lim = J.min[1] + J.hundir + 0.3, e = J.eje === 'x' ? 'z' : 'x';
  let a = Infinity, b = -Infinity;
  objeto.updateMatrixWorld(true);
  objeto.traverse(o => {
    const p = o.isMesh && o.geometry?.attributes?.position; if (!p) return;
    const paso = Math.max(1, Math.floor(p.count / 200000));
    for (let i = 0; i < p.count; i += paso) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).multiplyScalar(J.k);
      if (v.y < lim) { a = Math.min(a, v[e]); b = Math.max(b, v[e]); }
    }
  });
  if (b > a) { J.banda = b - a; J.centroBanda = (a + b) / 2; }
}

// ---------- Geometría: torno sobre un rectángulo redondeado ----------
// Contorno de un rectángulo redondeado (semiancho a en x, semifondo b en z, radio r): n.c segmentos por esquina y n.x, n.z
// divisiones de los lados rectos. Todos los anillos de una pieza tienen los mismos puntos (se unen de a cuadritos)
function contorno(a, b, r, n) {
  const p = [], lado = [], cx = a - r, cz = b - r;
  const centros = [[cx, cz], [-cx, cz], [-cx, -cz], [cx, -cz]], nombres = ['z+', 'x-', 'z-', 'x+'];
  for (let q = 0; q < 4; q++) {
    const [ox, oz] = centros[q], f0 = q * PI / 2;
    for (let i = 0; i < n.c; i++) { const f = f0 + PI / 2 * i / n.c; p.push(ox + r * Math.cos(f), oz + r * Math.sin(f)); lado.push('e'); }
    const m = q % 2 === 0 ? n.x : n.z;
    if (!m) continue;
    const f1 = f0 + PI / 2, [px, pz] = centros[(q + 1) % 4];
    const x0 = ox + r * Math.cos(f1), z0 = oz + r * Math.sin(f1), x1 = px + r * Math.cos(f1), z1 = pz + r * Math.sin(f1);
    for (let i = 0; i < m; i++) { const t = i / m; p.push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t); lado.push(nombres[q]); }
  }
  const M = lado.length, seg = new Float64Array(M);
  let largo = 0;
  for (let i = 0; i < M; i++) { const j = (i + 1) % M; seg[i] = Math.hypot(p[2 * j] - p[2 * i], p[2 * j + 1] - p[2 * i + 1]); largo += seg[i]; }
  return { p, lado, seg, largo, M };
}

// Sólido de revolución sobre un rectángulo redondeado. perfil: [{ k, y, tramo?, corte? }] con k = cuánto se mete el anillo
// desde el contorno de afuera; recorrido en sentido antihorario en el plano (−k, y) (así las caras miran hacia afuera).
// tramo: el material desde ese punto en adelante; corte: arista viva. tapaInicio/tapaFin: cierra con un abanico al centro.
// lados: { 'z-': { tramo, desde, hasta } } manda un lado recto a otro material (el logo en la funda del cajón).
// Devuelve un Map tramo → BufferGeometry (todas juntas son un sólido cerrado).
function torno({ a, b = a, r = 0, perfil, circulo = false, nc = 10, paso = 4, tapaInicio = null, tapaFin = null, cerrado = false, lados = null, planos = null, deformar = null }) {
  const n = circulo ? { c: nc, x: 0, z: 0 } : { c: nc, x: Math.max(1, Math.ceil(2 * (a - r) / paso)), z: Math.max(1, Math.ceil(2 * (b - r) / paso)) };
  const anillos = perfil.map(pt => {
    const ak = a - pt.k, bk = (circulo ? a : b) - pt.k;
    if (!(ak > 0.02 && bk > 0.02)) throw new Error(`perfil fuera del contorno (a=${a.toFixed(2)} b=${b.toFixed(2)} k=${pt.k.toFixed(2)})`);
    const rk = circulo ? ak : limitar(r - pt.k, Math.min(0.3, Math.min(ak, bk) * 0.5), Math.min(ak, bk) - 0.02);
    return contorno(ak, bk, rk, n);
  });
  const M = anillos[0].M, nPts = perfil.length;
  const V = [0];
  for (let j = 1; j < nPts; j++) V.push(V[j - 1] + Math.hypot(perfil[j].k - perfil[j - 1].k, perfil[j].y - perfil[j - 1].y));
  const ref = anillos.reduce((m, A) => (A.largo > m.largo ? A : m), anillos[0]), vueltas = Math.max(1, Math.round(ref.largo / T_UV));
  const tramos = new Map(), esPlano = nombre => !!planos && planos.includes(nombre);
  const G = nombre => { let g = tramos.get(nombre); if (!g) { g = { pos: [], uv: [], idx: [], claves: new Map(), costuras: [] }; tramos.set(nombre, g); } return g; };
  // vértices del anillo j en un tramo (M + 1: el último repite el primero para la costura de la textura)
  const anillo = (nombre, j, cl) => {
    const g = G(nombre), key = j + '|' + cl;
    if (g.claves.has(key)) return g.claves.get(key);
    const A = anillos[j], y = perfil[j].y, base = g.pos.length / 3, plano = esPlano(nombre);
    let s = 0;
    for (let i = 0; i <= M; i++) {
      const q = i % M, x = A.p[2 * q], z = A.p[2 * q + 1];
      if (i > 0) s += A.seg[i - 1];
      g.pos.push(x, y, z);
      if (plano) g.uv.push(x / T_UV, z / T_UV); else g.uv.push(s / A.largo * vueltas, V[j] / T_UV);
    }
    g.costuras.push([base, base + M]);
    g.claves.set(key, base);
    return base;
  };
  const nSeg = cerrado ? nPts : nPts - 1;
  let tr = perfil[0].tramo || 'exterior', corrida = 0;
  const tramo0 = tr;
  for (let j = 0; j < nSeg; j++) {
    const j1 = (j + 1) % nPts;
    if (j > 0) { const nuevo = perfil[j].tramo || tr; if (perfil[j].corte || nuevo !== tr) corrida++; tr = nuevo; }
    let c1 = corrida;
    if (cerrado && j1 === 0) c1 = !perfil[0].corte && tr === tramo0 ? 0 : 'cierre';
    const r0 = anillo(tr, j, corrida), r1 = anillo(tr, j1, c1);
    for (let i = 0; i < M; i++) {
      let nombre = tr, a0 = r0, a1 = r1;
      const L = lados && lados[anillos[0].lado[i]];
      if (L && j >= L.desde && j < L.hasta) { nombre = L.tramo; a0 = anillo(nombre, j, 'l' + corrida); a1 = anillo(nombre, j1, 'l' + c1); }
      G(nombre).idx.push(a0 + i, a1 + i, a0 + i + 1, a0 + i + 1, a1 + i, a1 + i + 1);
    }
  }
  // tapas en abanico (si el tramo ya tiene ese anillo, lo comparte: sin arista donde no hace falta)
  const tapa = (nombre, j, cl, alFinal) => {
    const g = G(nombre), key = j + '|' + cl;
    let base;
    if (g.claves.has(key)) base = g.claves.get(key);
    else { base = g.pos.length / 3; const A = anillos[j]; for (let i = 0; i < M; i++) { const x = A.p[2 * i], z = A.p[2 * i + 1]; g.pos.push(x, perfil[j].y, z); g.uv.push(x / T_UV, z / T_UV); } }
    const c = g.pos.length / 3; g.pos.push(0, perfil[j].y, 0); g.uv.push(0, 0);
    for (let i = 0; i < M; i++) { const p = base + i, q = base + (i + 1) % M; if (alFinal) g.idx.push(c, q, p); else g.idx.push(c, p, q); }
  };
  if (tapaInicio) tapa(tapaInicio, 0, tapaInicio === tramo0 ? 0 : 't0', false);
  if (tapaFin) tapa(tapaFin, nPts - 1, tapaFin === tr ? corrida : 't1', true);
  if (deformar) for (const g of tramos.values()) for (let i = 0; i < g.pos.length; i += 3) {
    const v = deformar(g.pos[i], g.pos[i + 1], g.pos[i + 2]); g.pos[i] = v[0]; g.pos[i + 1] = v[1]; g.pos[i + 2] = v[2];
  }
  return cerrar(tramos);
}
// Arco del perfil con centro (rc, yc) en el plano (r = −k, y), sin el punto de partida
function arco(P, rc, yc, rho, f0, f1, n) {
  for (let i = 1; i <= n; i++) { const f = f0 + (f1 - f0) * i / n; P.push({ k: -(rc + rho * Math.cos(f)), y: yc + rho * Math.sin(f) }); }
}

// Losa que sigue un camino: punto(i, j, cara) con i a lo largo (0..nu), j a lo ancho (0..nv), cara 0 (abajo) o 1 (arriba).
// Cerrada en todas sus caras (o periódica a lo largo: un aro). Para cintas, moños y bandas
function losa({ nu, nv = 1, periodico = false, punto, largo = 10, ancho = 10, tramo = 'cinta' }) {
  const g = { pos: [], uv: [], idx: [], costuras: [] };
  const P = (i, j, c) => punto(periodico && i === nu ? 0 : i, j, c);
  const quad = (a, b, c, d, inv) => { if (inv) g.idx.push(a, c, b, a, d, c); else g.idx.push(a, b, c, a, c, d); };
  const cara = (c, inv) => {
    const base = g.pos.length / 3, V = (i, j) => base + i * (nv + 1) + j;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { g.pos.push(...P(i, j, c)); g.uv.push(i / nu * largo / T_UV, j / nv * ancho / T_UV); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) quad(V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1), inv);
    if (periodico) for (let j = 0; j <= nv; j++) g.costuras.push([V(0, j), V(nu, j)]);
  };
  cara(1, false); cara(0, true);
  const costado = (j, inv) => {
    const base = g.pos.length / 3, V = (i, c) => base + 2 * i + c;
    for (let i = 0; i <= nu; i++) for (let c = 0; c < 2; c++) { g.pos.push(...P(i, j, c)); g.uv.push(i / nu * largo / T_UV, c * 0.04); }
    for (let i = 0; i < nu; i++) quad(V(i, 0), V(i + 1, 0), V(i + 1, 1), V(i, 1), inv);
    if (periodico) for (let c = 0; c < 2; c++) g.costuras.push([V(0, c), V(nu, c)]);
  };
  costado(0, false); costado(nv, true);
  if (!periodico) {
    const punta = (i, inv) => {
      const base = g.pos.length / 3, V = (j, c) => base + 2 * j + c;
      for (let j = 0; j <= nv; j++) for (let c = 0; c < 2; c++) { g.pos.push(...P(i, j, c)); g.uv.push(j / nv * ancho / T_UV, c * 0.04); }
      for (let j = 0; j < nv; j++) quad(V(j, 0), V(j + 1, 0), V(j + 1, 1), V(j, 1), inv);
    };
    punta(0, true); punta(nu, false);
  }
  return cerrar(new Map([[tramo, g]]));
}

// Arma las geometrías de un sólido: lo da vuelta si quedó al revés (volumen negativo) y calcula normales suaves
function cerrar(tramos) {
  const geos = new Map();
  for (const [nombre, g] of tramos) {
    if (!g.idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.userData.costuras = g.costuras;
    geos.set(nombre, geo);
  }
  let vol = 0;
  for (const geo of geos.values()) vol += volumen(geo);
  if (vol < 0) for (const geo of geos.values()) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  for (const geo of geos.values()) normales(geo);
  return geos;
}
function volumen(geo, m = null) {
  const p = geo.attributes.position, ix = geo.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]); b.fromBufferAttribute(p, ix[i + 1]); c.fromBufferAttribute(p, ix[i + 2]);
    if (m) { a.applyMatrix4(m); b.applyMatrix4(m); c.applyMatrix4(m); }
    v += a.dot(b.cross(c)) / 6;
  }
  return v;
}
function normales(geo) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const [i, j] of geo.userData.costuras || []) { v.fromBufferAttribute(n, i); w.fromBufferAttribute(n, j); v.add(w).normalize(); n.setXYZ(i, v.x, v.y, v.z); n.setXYZ(j, v.x, v.y, v.z); }
  delete geo.userData.costuras;
}
const mover = (geos, m) => { for (const g of geos.values()) g.applyMatrix4(m); return geos; };
const desplazar = (geos, x, y, z) => mover(geos, new THREE.Matrix4().makeTranslation(x, y, z));
// coordenadas de textura de una cara plana (logo): u de izquierda a derecha y v = 1 donde va la parte de arriba del dibujo
function uvRect(geo, arriba) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv, w = bb.max.x - bb.min.x || 1, d = bb.max.z - bb.min.z || 1;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / w, arriba === '-z' ? (bb.max.z - p.getZ(i)) / d : (p.getZ(i) - bb.min.z) / d);
  uv.needsUpdate = true;
  return { ancho: w, fondo: d };
}

// ---------- Perfiles ----------
// Base abierta arriba: fondo, pared con biseles, borde, pared de adentro y piso
function perfilBase({ H, t, tf, bi, bs, bf = 0.5, fuera = 'exterior', borde = 'exterior', dentro = 'forro', nb = 5 }) {
  const P = [{ k: bi, y: 0, tramo: fuera }];
  arco(P, -bi, bi, bi, -PI / 2, 0, nb);
  P.push({ k: 0, y: H - bs });
  arco(P, -bs, H - bs, bs, 0, PI / 2, 4);
  P[P.length - 1].tramo = borde;
  P.push({ k: t - bs, y: H, tramo: dentro });
  arco(P, -(t - bs), H - bs, bs, PI / 2, PI, 4);
  P.push({ k: t, y: tf + bf });
  arco(P, -(t + bf), tf + bf, bf, 0, -PI / 2, 3);
  return P;
}
// Tapa (una caja abierta abajo): techo por dentro en anillos (ahí va el logo del forro), pared de adentro, borde de abajo,
// pared de afuera, bisel grande arriba y la cara de arriba en anillos (para el domo y el logo de afuera). y = 0 abajo
function perfilTapa({ Hl, t, tt, bs, bt, kmax, bf = 0.6, techo, dentro = 'forro', borde = 'exterior', fuera = 'exterior', arriba, nTop = 6, nb = 7 }) {
  const P = [], k0 = t + bf, nT = 5;
  for (let i = 0; i <= nT; i++) P.push({ k: kmax + (k0 - kmax) * i / nT, y: Hl - tt });
  P[0].tramo = techo; P[nT].tramo = dentro;
  arco(P, -(t + bf), Hl - tt - bf, bf, PI / 2, 0, 3);
  P.push({ k: t, y: bs });
  arco(P, -(t - bs), bs, bs, PI, 3 * PI / 2, 3);
  P[P.length - 1].tramo = borde;
  P.push({ k: bs, y: 0, tramo: fuera });
  arco(P, -bs, bs, bs, -PI / 2, 0, 3);
  P.push({ k: 0, y: Hl - bt });
  arco(P, -bt, Hl - bt, bt, 0, PI / 2, nb);
  P[P.length - 1].tramo = arriba;
  for (let i = 1; i <= nTop; i++) P.push({ k: bt + (kmax - bt) * i / nTop, y: Hl });
  return P;
}
// Bloque cerrado con aristas redondeadas (cajas lisas, bisagras, botones). y de 0 a h
function bloque({ a, b = a, r = 0, h, bev, nc = 6, paso = 6, tramo = 'exterior', circulo = false }) {
  bev = Math.min(bev, h * 0.45, Math.min(a, b) * 0.45);
  const P = [{ k: bev, y: 0, tramo }];
  arco(P, -bev, bev, bev, -PI / 2, 0, 3);
  P.push({ k: 0, y: h - bev });
  arco(P, -bev, h - bev, bev, 0, PI / 2, 3);
  return torno({ a, b, r: circulo ? a : r, circulo, perfil: P, nc, paso, tapaInicio: tramo, tapaFin: tramo });
}
// Cojín: rectángulo redondeado inflado, con el borde de arriba muy redondo y un domo suave en el centro
function cojin({ cx, cz, hx, hz, r, y0, alto, bisel, domo = 0, nc = 8, paso = 4, tramo = 'interior' }) {
  bisel = Math.min(bisel, alto * 0.9, Math.min(hx, hz) * 0.45);
  const kmax = Math.min(hx, hz) - 0.5, P = [{ k: 0.4, y: y0, tramo }];
  arco(P, -0.4, y0 + 0.4, 0.4, -PI / 2, 0, 2);
  P.push({ k: 0, y: y0 + alto - bisel });
  arco(P, -bisel, y0 + alto - bisel, bisel, 0, PI / 2, 7);
  if (kmax > bisel + 0.2) for (let i = 1; i <= 5; i++) P.push({ k: bisel + (kmax - bisel) * i / 5, y: y0 + alto });
  const deformar = domo ? (x, y, z) => {
    const f = Math.max(0, 1 - (x / hx) ** 2) * Math.max(0, 1 - (z / hz) ** 2);
    return [x, y + domo * f * escalon(y0 + alto - bisel, y0 + alto, y), z];
  } : null;
  return desplazar(torno({ a: hx, b: hz, r: limitar(r, 0.3, Math.min(hx, hz) - 0.05), perfil: P, nc, paso, tapaInicio: tramo, tapaFin: tramo, deformar }), cx, 0, cz);
}

// ---------- Cintas y moño ----------
// Cinta plana que sigue un perfil en un plano vertical: pts [{ u, y, nu, ny }] (u: coordenada a lo largo del eje 'x' o 'z',
// n: normal hacia afuera); ancho centrado en c0 en el otro eje; se aparta gap de la superficie y tiene grosor e
function cinchaPerfil(pts, eje, c0, ancho, e, gap) {
  let largo = 0;
  for (let i = 1; i < pts.length; i++) largo += Math.hypot(pts[i].u - pts[i - 1].u, pts[i].y - pts[i - 1].y);
  return losa({
    nu: pts.length - 1, nv: 1, largo, ancho,
    punto: (i, j, c) => {
      const p = pts[i], d = gap + c * e, u = p.u + p.nu * d, y = p.y + p.ny * d, w = c0 + (j - 0.5) * ancho;
      return eje === 'x' ? [u, y, w] : [w, y, u];
    },
  });
}
// Camino de una cinta que sube por una pared (u = ±A), pasa el bisel de radio bt y corre por arriba (y = H) hasta u = hasta
function caminoTapa(A, H, y0, bt, lado, hasta) {
  const pts = [], s = lado;
  pts.push({ u: s * A, y: y0, nu: s, ny: 0 });
  pts.push({ u: s * A, y: H - bt, nu: s, ny: 0 });
  for (let i = 1; i <= 6; i++) { const f = PI / 2 * i / 6; pts.push({ u: s * (A - bt + bt * Math.cos(f)), y: H - bt + bt * Math.sin(f), nu: s * Math.cos(f), ny: Math.sin(f) }); }
  const u0 = s * (A - bt), n = Math.max(2, Math.ceil(Math.abs(hasta - u0) / 4));
  for (let i = 1; i <= n; i++) pts.push({ u: u0 + (hasta - u0) * i / n, y: H, nu: 0, ny: 1 });
  return pts;
}
// Curva cerrada 2D (puntos [x, y]) → normales hacia afuera (según el sentido de giro)
function normales2D(c) {
  let area = 0;
  for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const s = area >= 0 ? 1 : -1;
  return c.map((_, i) => {
    const p = c[(i + c.length - 1) % c.length], q = c[(i + 1) % c.length], tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1;
    return [s * ty / l, -s * tx / l];
  });
}
// Moño: nudo, dos lazadas grandes, dos chicas y dos colas con corte en V, sobre el centro de la tapa. y0: arriba de la
// cinta; w: ancho de la cinta; W: ancho de la tapa; franja: semiancho de las cintas de la tapa (para que las colas no las pisen)
function mono({ y0, w, e, gap, W, superficie }) {
  const piezas = [];
  const hk = 0.5 * w, dk = 0.42 * w, wk = 0.92 * w, yk = y0 + gap + hk + e;
  // nudo: una banda corta que envuelve las lazadas
  {
    const C = contorno(dk, hk, Math.min(dk, hk) * 0.55, { c: 6, x: 2, z: 2 }), cur = [];
    for (let i = 0; i < C.M; i++) cur.push([C.p[2 * i], C.p[2 * i + 1]]);
    const nor = normales2D(cur);
    piezas.push(losa({ nu: cur.length, nv: 2, periodico: true, largo: C.largo, ancho: wk, punto: (i, j, c) => {
      const p = cur[i], n = nor[i]; return [(j / 2 - 0.5) * wk, yk + p[1] + n[1] * c * e, p[0] + n[0] * c * e];
    } }));
  }
  // lazadas: una gota cerrada en un plano inclinado (se ve el satén de afuera y el hueco), angosta en el nudo
  const lazada = (s, L, H, beta, gamma, ancho) => {
    const N = 72, cur = [];
    for (let i = 0; i < N; i++) {
      const th = 2 * PI * i / N, p = L * (1 - Math.cos(th)) / 2, forma = 0.3 + 0.7 * (1 - Math.cos(th)) / 2;
      const q = (th < PI ? H : 0.32 * H) * Math.sin(th) * forma;
      cur.push([p, q]);
    }
    const nor = normales2D(cur);
    const pg = new THREE.Vector3(s * Math.cos(gamma), Math.sin(gamma), 0).normalize();
    const q0 = new THREE.Vector3(0, Math.sin(beta), -Math.cos(beta)), qg = q0.sub(pg.clone().multiplyScalar(q0.dot(pg))).normalize();
    const ax = pg.clone().cross(qg).normalize(), O = new THREE.Vector3(-s * 0.15 * w, yk, 0);
    return losa({ nu: N, nv: 2, periodico: true, largo: 2 * L, ancho, punto: (i, j, c) => {
      const p = cur[i], n = nor[i], th = 2 * PI * i / N, fr = 0.5 + 0.5 * Math.sin(th / 2), v = (j / 2 - 0.5) * ancho * fr;
      const x = p[0] + n[0] * c * e, y = p[1] + n[1] * c * e;
      return [O.x + pg.x * x + qg.x * y + ax.x * v, O.y + pg.y * x + qg.y * y + ax.y * v, O.z + pg.z * x + qg.z * y + ax.z * v];
    } });
  };
  for (const s of [-1, 1]) {
    piezas.push(lazada(s, 0.3 * W, 0.15 * W, 0.78, 0.2, 0.86 * w));
    piezas.push(lazada(s, 0.19 * W, 0.1 * W, 1.12, 0.42, 0.7 * w));
  }
  // colas: salen del nudo hacia adelante, a los lados, se apoyan sobre la tapa (o sobre la cinta) y terminan en V
  for (const s of [-1, 1]) {
    const L = 0.3 * W, wt = 0.8 * w, dir = new THREE.Vector3(s * Math.sin(0.62), 0, Math.cos(0.62)), lado = new THREE.Vector3(dir.z, 0, -dir.x);
    const alto = (x, z) => superficie(x, z);
    const ctrl = [0, 0.18, 0.45, 0.75, 1].map((f, i) => {
      const p = dir.clone().multiplyScalar(f * L);
      let y = 0;
      for (const d of [-0.5, 0, 0.5]) y = Math.max(y, alto(p.x + lado.x * d * wt, p.z + lado.z * d * wt));
      y += gap + 0.12 * wt;   // margen para la torsión de la cola
      if (i === 0) y = yk; else if (i === 1) y = Math.max(y, yk - 0.6 * hk);
      return new THREE.Vector3(p.x, y, p.z);
    });
    const curva = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'), nu = 40, nv = 4, corte = 0.45 * wt;
    const marco = t => {
      const P = curva.getPointAt(t), T = curva.getTangentAt(t), W2 = new THREE.Vector3(0, 1, 0).cross(T).normalize(), N = T.clone().cross(W2).normalize();
      const giro = s * 0.24 * Math.sin(PI * t);
      return { P, W: W2.clone().multiplyScalar(Math.cos(giro)).addScaledVector(N, Math.sin(giro)), N: N.clone().multiplyScalar(Math.cos(giro)).addScaledVector(W2, -Math.sin(giro)) };
    };
    piezas.push(losa({ nu, nv, largo: L, ancho: wt, punto: (i, j, c) => {
      const v = j / nv - 0.5, fin = 1 - corte / L * (1 - Math.abs(2 * v)), m = marco(i / nu * fin);
      return [m.P.x + m.W.x * v * wt + m.N.x * c * e, m.P.y + m.W.y * v * wt + m.N.y * c * e, m.P.z + m.W.z * v * wt + m.N.z * c * e];
    } }));
  }
  return { piezas, ancla: new THREE.Vector3(0, yk + hk + e, 0) };
}

// ---------- Cajas ----------
// Medidas de los estuches de bisagra: margen alrededor de la joya [mm fijos, fracción], mínimo, alto/ancho, radios…
const BISAGRA = {
  'estuche-anillo': { margen: [6, 0.4], minimo: 38, alto: 0.9, C: 0.22, bi: 0.08, bt: 0.34, domo: 0.03, oro: true, tapaMin: 0.3, fBase: 0.46 },
  'estuche-aretes': { margen: [7, 0.24], minimo: 44, alto: 0.42, C: 0.12, bi: 0.05, bt: 0.3, domo: 0.012, oro: true, tapaMin: 0.16, fBase: 0.5 },
  'estuche-collar': { margen: [9, 0.12], minimo: 64, alto: 0.24, C: 0.06, bi: 0.03, bt: 0.32, domo: 0.008, oro: true, tapaMin: 0.09, fBase: 0.5, rect: 1.3 },
  cofre:            { margen: [6, 0.2], minimo: 48, alto: 0.94, C: 0.1, bi: 0.035, bt: 0.07, domo: 0, oro: false, tapaMin: 0.4, fBase: 0.2, boton: true },
};

// Celdas de cojín de una cavidad (semiancho ai, semifondo bi, radio ri) partida por las ranuras
function cojinesRanura({ ai, bi, ri, t, y0, alto, J, o = 0.25, paso, tramo = 'interior' }) {
  const g = J.banda + 0.5, cb = J.centroBanda, cortes = J.par ? [-J.par.separacion / 2, J.par.separacion / 2] : [0];
  const xs = [], zs = [];
  if (J.eje === 'x') {
    // la ranura corre a lo largo de x; con el par, un separador al medio
    if (J.par) xs.push([-(ai + o), -0.4], [0.4, ai + o]); else xs.push([-(ai + o), ai + o]);
    zs.push([-(bi + o), cb - g / 2], [cb + g / 2, bi + o]);
  } else {
    let x = -(ai + o);
    for (const c of cortes) { xs.push([x, c + cb - g / 2]); x = c + cb + g / 2; }
    xs.push([x, ai + o]); zs.push([-(bi + o), bi + o]);
  }
  const piezas = [], rmin = Math.max(1.2, (Math.SQRT2 * (ri + o) - ri - t + 0.3) / (Math.SQRT2 - 1));
  for (const [x0, x1] of xs) for (const [z0, z1] of zs) {
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    if (hx < 0.9 || hz < 0.9) continue;
    piezas.push(cojin({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx, hz, r: Math.min(rmin, Math.min(hx, hz) - 0.1), y0, alto, bisel: Math.min(0.42 * alto, 0.42 * Math.min(hx, hz)), domo: 0.05 * alto, paso, tramo }));
  }
  return piezas;
}

// Estuche de bisagra (anillo, aretes, collar, cofre)
function planBisagra(n, J) {
  const P = BISAGRA[n.tipo], tam = n.tamano;
  const ext = Math.max(J.sx, J.sz), margen = Math.max(4.5, (P.margen[0] + P.margen[1] * ext) * tam);
  let W = Math.max(P.minimo * Math.min(1, tam), J.sx + 2 * margen), D = Math.max(P.minimo * Math.min(1, tam), J.sz + 2 * margen);
  if (P.rect) { W = Math.max(W, D * P.rect); } else if (n.tipo !== 'estuche-collar') W = D = Math.max(W, D);
  // el collar siempre descansa sobre el inserto; lo demás parado va en ranura y acostado sobre un cojín
  const modo = n.tipo === 'estuche-collar' ? 'plano' : J.erguida ? 'ranura' : n.tipo === 'estuche-aretes' ? 'plano' : 'almohada';
  const hundir = modo === 'ranura' ? J.hundir : modo === 'almohada' ? 0.7 : 0.4;
  const medidas = W0 => {
    const t = limitar((n.tipo === 'cofre' ? 0.04 : 0.055) * W0, 1.5, 4.5), tf = t, costura = limitar(0.004 * W0, 0.15, 0.5), cl = 1 + 0.02 * W0;
    const hc0 = modo === 'ranura' ? J.hundir + Math.max(3, 0.07 * W0) : modo === 'almohada' ? Math.max(5, 0.1 * W0) : Math.max(3.5, 0.06 * W0);
    const gRim = modo === 'ranura' ? 0.6 : modo === 'almohada' ? 1 : 1.2;
    const tt = t, rk = limitar(0.035 * W0, 1, 2.6);
    let hc = hc0;
    const calcular = () => {
      const yTop = tf + hc, pie = yTop - hundir, Hb = yTop + gRim;
      const hin = Math.max(pie + J.sy + cl - (Hb + costura), P.tapaMin * W0 - tt);
      return { yTop, pie, Hb, Hl: hin + tt };
    };
    let v = calcular();
    // proporciones del estuche: si queda bajito, se reparte lo que falta entre el cojín y la tapa
    const Ht = P.alto * W0, H = v.Hb + costura + v.Hl;
    if (H < Ht) {
      const falta = Ht - H, baseObjetivo = P.fBase * Ht;
      const aBase = n.tipo === 'cofre' ? Math.max(0, baseObjetivo - v.Hb) : falta * 0.45;
      hc += Math.min(aBase, falta); v = calcular();
      const extra = Ht - (v.Hb + costura + v.Hl); if (extra > 0) v.Hl += extra;
    }
    return { t, tf, costura, cl, tt, rk, hc, ...v };
  };
  // la tapa gira hacia atrás: el frente de su pared barre un arco alrededor del eje. La joya (sobre todo su esquina de
  // adelante y arriba) tiene que quedar más cerca del eje que esa pared: si no, se agranda el fondo del estuche
  let m = medidas(W);
  for (let i = 0; i < 30; i++) {
    const ya = m.Hb + m.costura / 2, za = -D / 2 - m.rk - 0.15;
    const h = m.pie + J.sy - ya, q = J.sz / 2 - za, lejos = D / 2 - m.t - za - 1.2;
    if (h <= 0 || Math.hypot(q, h) <= lejos) break;
    D += Math.max(1, Math.hypot(q, h) - lejos);
    if (!P.rect && n.tipo !== 'estuche-collar') W = D;
    m = medidas(W);
  }
  const a = W / 2, b = D / 2, C = limitar(P.C * Math.min(W, D), m.t + 0.6, Math.min(a, b) - 1);
  const bi = limitar(P.bi * Math.min(W, D), 0.5, m.Hb * 0.4), bs = Math.min(0.32 * m.t, 0.9);
  const bt = limitar(P.bt * m.Hl, 0.6, Math.min(m.Hl * 0.6, Math.min(a, b) * 0.4)), domo = P.domo * Math.min(W, D);
  const nc = 10, paso = limitar(Math.min(W, D) / 12, 2.5, 8), piezas = [];
  // base
  piezas.push({ parte: 'base', geos: torno({ a, b, r: C, perfil: perfilBase({ H: m.Hb, t: m.t, tf: m.tf, bi, bs, borde: P.oro ? 'oro' : 'exterior' }), nc, paso, tapaInicio: 'exterior', tapaFin: 'forro' }) });
  // tapa (en su lugar, cerrada)
  const y0 = m.Hb + m.costura, kmax = Math.min(a, b) - 1.2, yTop = y0 + m.Hl;
  const pl = perfilTapa({ Hl: m.Hl, t: m.t, tt: m.tt, bs, bt, kmax, techo: 'foil:techo', borde: P.oro ? 'oro' : 'exterior', arriba: 'foil:tapa' }).map(p => ({ ...p, y: p.y + y0 }));
  const deformar = domo ? (x, y, z) => [x, y + domo * Math.max(0, 1 - (x / a) ** 2) * Math.max(0, 1 - (z / b) ** 2) * escalon(yTop - bt, yTop, y), z] : null;
  const tapa = torno({ a, b, r: C, perfil: pl, nc, paso, tapaInicio: 'foil:techo', tapaFin: 'foil:tapa', planos: ['foil:techo', 'foil:tapa'], deformar });
  const foils = { 'foil:tapa': { arriba: '-z', base: 'exterior', dibujo: n.tipo === 'estuche-collar' ? 'linea' : 'sello', ...uvRect(tapa.get('foil:tapa'), '-z') }, 'foil:techo': { arriba: '+z', base: 'forro', dibujo: 'forro', ...uvRect(tapa.get('foil:techo'), '+z') } };
  piezas.push({ parte: 'tapa', movil: true, geos: tapa });
  // cojín o inserto
  const ai = a - m.t, bin = b - m.t, ri = Math.max(C - m.t, 0.5), yC = m.tf - 0.1, alto = m.yTop - yC;
  const tramoIns = modo === 'ranura' || n.tipo === 'estuche-anillo' || n.tipo === 'estuche-aretes' ? 'interior' : 'forro';
  if (modo === 'ranura') for (const g of cojinesRanura({ ai, bi: bin, ri, t: m.t, y0: yC, alto, J: { ...J, centroBanda: J.centroBanda - J.c[J.eje === 'x' ? 2 : 0] }, paso, tramo: tramoIns })) piezas.push({ parte: 'inserto', geos: g });
  else {
    const domoC = modo === 'almohada' ? 0.2 * alto : 0.08 * alto;
    piezas.push({ parte: 'inserto', geos: cojin({ cx: 0, cz: 0, hx: ai + 0.25, hz: bin + 0.25, r: ri + 0.25, y0: yC, alto: alto - domoC, bisel: modo === 'almohada' ? 0.42 * alto : 0.4 * alto, domo: domoC, paso, tramo: tramoIns }) });
  }
  // bisagra dorada atrás: nudillos en el eje (los de los lados en la base, el del medio en la tapa) y sus placas
  const eje = { y: m.Hb + m.costura / 2, z: -b - m.rk - 0.15 }, rk = m.rk;
  const centros = W > 90 ? [-W / 4, W / 4] : [0];
  for (const xc of centros) {
    const L = limitar(0.3 * Math.min(W, 70), 8, 26), g = 0.2;
    const tramosB = [[xc - L / 2, xc - L / 6 - g / 2, false], [xc - L / 6 + g / 2, xc + L / 6 - g / 2, true], [xc + L / 6 + g / 2, xc + L / 2, false]];
    for (const [x0, x1, deTapa] of tramosB) {
      const cil = mover(bloque({ a: rk, h: x1 - x0, bev: 0.25 * rk, circulo: true, nc: 6, tramo: 'oro' }), new THREE.Matrix4().makeTranslation(x0, eje.y, eje.z).multiply(new THREE.Matrix4().makeRotationZ(-PI / 2)));
      piezas.push({ parte: deTapa ? 'tapa' : 'base', movil: deTapa, geos: cil });
      const hP = 2.3 * rk, placa = bloque({ a: (x1 - x0) / 2, b: 0.32, r: 0.25, h: hP, bev: 0.12, nc: 3, paso: 20, tramo: 'oro' });
      desplazar(placa, (x0 + x1) / 2, deTapa ? eje.y + 0.3 * rk : eje.y - 0.3 * rk - hP, -b - 0.13);
      piezas.push({ parte: deTapa ? 'tapa' : 'base', movil: deTapa, geos: placa });
    }
  }
  // botón metálico al frente (cofre)
  if (P.boton) {
    const rb = limitar(0.022 * W, 1, 2.2), bt2 = bloque({ a: rb, h: 1.1, bev: 0.35, circulo: true, nc: 6, tramo: 'oro' });
    mover(bt2, new THREE.Matrix4().makeTranslation(0, m.Hb * 0.5, b - 0.45).multiply(new THREE.Matrix4().makeRotationX(PI / 2)));
    piezas.push({ parte: 'base', geos: bt2 });
  }
  // ángulo máximo: la parte de atrás de la tapa no puede bajar del piso (en el cofre, de tapa alta, se queda en ~100°)
  let maxAng = 105;
  for (; maxAng > 80; maxAng--) {
    const th = maxAng * PI / 180, dz = m.rk + 0.15, dy = m.Hl + m.costura / 2;
    if (eje.y + dz * Math.sin(th) + dy * Math.cos(th) - bt * 0.25 >= 0.3) break;
  }
  const pivote = new THREE.Vector3(0, eje.y, eje.z);
  return {
    W, D, H: m.Hb + m.costura + m.Hl, piezas, foils, modo, hundir,
    asiento: new THREE.Vector3(0, m.pie, 0), alto: m.Hb + m.costura + m.Hl + domo,
    pose: u => new THREE.Matrix4().makeTranslation(pivote.x, pivote.y, pivote.z).multiply(new THREE.Matrix4().makeRotationX(-u * maxAng * PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-pivote.x, -pivote.y, -pivote.z)),
    abre: 'bisagra', angulo: maxAng, medidas: { ...m, C, bt, domo },
  };
}

// Caja con tapa suelta (caja de regalo y cajas de la pila): base abierta, tapa que entra por encima, cintas opcionales
function cajaConTapa({ W, D, Hb, Hl, C, t, holgura, cintas = null, conMono = false, techo = 'foil:techo', nc = 8, paso = 6, liso = false }) {
  const a = W / 2, b = D / 2, piezas = [], bi = limitar(0.012 * W, 0.4, 1.6), bs = Math.min(0.3 * t, 0.7);
  piezas.push({ parte: 'base', geos: torno({ a, b, r: C, perfil: perfilBase({ H: Hb, t, tf: t, bi, bs, bf: 0.4 }), nc, paso, tapaInicio: 'exterior', tapaFin: 'forro' }) });
  const al = a + holgura + t, bl = b + holgura + t, Cl = C + holgura + t, tt = t, bt = limitar(0.012 * W, 0.4, 1.8);
  const yL = Hb + 0.1 - (Hl - tt), kmax = Math.min(al, bl) - 1.2;
  const pl = perfilTapa({ Hl, t, tt, bs, bt, kmax, bf: 0.4, techo, arriba: 'exterior', nb: 4, nTop: 3 }).map(p => ({ ...p, y: p.y + yL }));
  const tapa = torno({ a: al, b: bl, r: Cl, perfil: pl, nc, paso, tapaInicio: techo, tapaFin: 'exterior', planos: [techo] });
  piezas.push({ parte: 'tapa', movil: true, geos: tapa });
  const foils = {};
  if (techo.startsWith('foil:')) foils[techo] = { arriba: '-z', base: 'forro', dibujo: 'forro', ...uvRect(tapa.get(techo), '-z') };
  const yTapa = yL + Hl;
  let ancla = null;
  if (cintas) {
    const { w, e, gap } = cintas, y0 = yL + Math.max(bs, 0.4) + 0.15, dz = w / 2 + 0.02;
    // tapa: una cinta entera de lado a lado en x, y dos mitades en z que terminan junto a ella (sin pisarse)
    piezas.push({ parte: 'cinta', movil: true, geos: cinchaPerfil([...caminoTapa(al, yTapa, y0, bt, -1, 0), ...caminoTapa(al, yTapa, y0, bt, 1, 0).reverse().slice(1)], 'x', 0, w, e, gap) });
    for (const s of [-1, 1]) piezas.push({ parte: 'cinta', movil: true, geos: cinchaPerfil(caminoTapa(bl, yTapa, y0, bt, s, s * dz), 'z', 0, w, e, gap) });
    // base: tiras en las cuatro paredes, desde el bisel de abajo hasta poco antes del borde de la tapa cerrada
    const yb0 = bi + 0.2, yb1 = yL - 0.35;
    if (yb1 - yb0 > 1) for (const [eje, A] of [['x', a], ['z', b]]) for (const s of [-1, 1]) {
      const pts = [{ u: s * A, y: yb0, nu: s, ny: 0 }, { u: s * A, y: (yb0 + yb1) / 2, nu: s, ny: 0 }, { u: s * A, y: yb1, nu: s, ny: 0 }];
      piezas.push({ parte: 'cinta', geos: cinchaPerfil(pts, eje, 0, w, e, gap) });
    }
    if (conMono) {
      const top = yTapa + gap + e;
      const sup = (x, z) => (Math.abs(x) < w / 2 + 0.3 || Math.abs(z) < w / 2 + 0.3 ? top : yTapa);
      const mn = mono({ y0: top, w, e, gap, W: 2 * al, superficie: sup });
      for (const g of mn.piezas) piezas.push({ parte: 'cinta', movil: true, geos: g });
      ancla = mn.ancla;
    }
  }
  return { piezas, foils, yL, yTapa, al, bl, ancla, liso };
}

function planRegalo(n, J, opc) {
  const escenario = n.posicion === 'escenario', tam = n.tamano;
  if (escenario) {
    // caja gigante: la cara de arriba de la tapa es un escenario varias veces más ancho que la joya
    const Jm = Math.max(J.sx, J.sy, J.sz), W = Math.max(90, 7 * Jm) * tam, D = W, t = limitar(0.012 * W, 1.5, 8);
    const Hb = 0.6 * W, Hl = 0.16 * W, cintas = { w: 0.15 * W, e: limitar(0.0035 * W, 0.35, 3), gap: limitar(0.0012 * W, 0.05, 1) };
    const caja = cajaConTapa({ W, D, Hb, Hl, C: limitar(0.012 * W, 1.2, 10) + t, t, holgura: limitar(0.003 * W, 0.3, 2), cintas, conMono: n.mono, paso: W / 16 });
    const cruce = caja.yTapa + cintas.gap + cintas.e;
    // la joya en el cruce de las cintas (o, con moño, en el cuadrante de adelante a la derecha, sobre el papel)
    const asiento = n.mono ? new THREE.Vector3(caja.al / 2, caja.yTapa - 0.02, caja.bl / 2) : new THREE.Vector3(0, cruce - 0.02, 0);
    return { W, D, H: caja.yTapa, piezas: caja.piezas, foils: caja.foils, asiento, alto: caja.yTapa + (n.mono ? 0.2 * W : cintas.gap + cintas.e), pose: () => new THREE.Matrix4(), abre: null, modo: 'escenario', hundir: 0.02, escenario: { ancho: 2 * caja.al, fondo: 2 * caja.bl, alto: caja.yTapa, cintas }, ancla: caja.ancla };
  }
  const ext = Math.max(J.sx, J.sz), margen = Math.max(4.5, (6 + 0.28 * ext) * tam);
  const W = Math.max(40 * Math.min(1, tam), Math.max(J.sx, J.sz) + 2 * margen), D = W;
  const t = limitar(0.035 * W, 1.4, 3), cl = 1 + 0.02 * W, modo = J.erguida ? 'ranura' : 'almohada', hundir = modo === 'ranura' ? J.hundir : 0.7;
  let hc = modo === 'ranura' ? J.hundir + Math.max(3, 0.07 * W) : Math.max(5, 0.1 * W);
  // la tapa se apoya en el borde de la base: la joya cabe entera por debajo del borde
  let Hb = t + hc - hundir + J.sy + cl;
  if (Hb < 0.62 * W) { hc += 0.62 * W - Hb; Hb = 0.62 * W; }
  const Hl = Math.max(0.26 * Hb, 0.14 * W, 8), cintas = { w: 0.13 * W, e: limitar(0.006 * W, 0.3, 1.2), gap: 0.03 + 0.0015 * W };
  const C = limitar(0.025 * W, 0.6, 3) + t, caja = cajaConTapa({ W, D, Hb, Hl, C, t, holgura: 0.3 + 0.002 * W, cintas, conMono: n.mono, paso: limitar(W / 12, 3, 8) });
  const piezas = caja.piezas, yTop = t + hc, ai = W / 2 - t, yC = t - 0.1;
  if (modo === 'ranura') for (const g of cojinesRanura({ ai, bi: ai, ri: C - t, t, y0: yC, alto: yTop - yC, J: { ...J, centroBanda: J.centroBanda - J.c[J.eje === 'x' ? 2 : 0] }, paso: 4 })) piezas.push({ parte: 'inserto', geos: g });
  else { const alto = yTop - yC, dm = 0.2 * alto; piezas.push({ parte: 'inserto', geos: cojin({ cx: 0, cz: 0, hx: ai + 0.25, hz: ai + 0.25, r: C - t + 0.25, y0: yC, alto: alto - dm, bisel: 0.4 * alto, domo: dm, paso: 4 }) }); }
  // abrir: la tapa sube 1,3 veces la altura, se corre hacia atrás y se inclina con el frente arriba (empieza ya despegada)
  const Htot = caja.yTapa, c = new THREE.Vector3(0, caja.yL + Hl / 2, 0);
  const pose = u => new THREE.Matrix4().makeTranslation(0, 1.3 * Htot * u, -0.22 * D * u)
    .multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeRotationX(-18 * PI / 180 * escalon(0.2, 1, u))).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  return { W, D, H: Htot, piezas, foils: caja.foils, asiento: new THREE.Vector3(0, yTop - hundir, 0), alto: Htot + (n.mono ? 0.16 * W : 0), pose, abre: 'tapa', modo, hundir, ancla: caja.ancla };
}

// Caja de cajón: funda (un tubo abierto adelante y atrás) y cajón con cojín; al abrir, la funda se corre hacia atrás
function planCajon(n, J) {
  const tam = n.tamano, ext = Math.max(J.sx, J.sz), margen = Math.max(4.5, (6 + 0.25 * ext) * tam);
  const W = Math.max(44 * Math.min(1, tam), J.sx + 2 * margen), Ds = Math.max(0.8 * W, J.sz + 2 * margen);
  const ts = limitar(0.04 * W, 1.4, 3), td = limitar(0.035 * W, 1.2, 2.5), cd = 0.35, cl = 1 + 0.02 * W;
  const modo = J.erguida ? 'ranura' : 'almohada', hundir = modo === 'ranura' ? J.hundir : 0.7;
  let hc = modo === 'ranura' ? J.hundir + Math.max(3, 0.07 * W) : Math.max(4.5, 0.08 * W);
  const yd0 = ts + cd;
  let Hs = yd0 + td + hc - hundir + J.sy + cl + ts;
  if (Hs < 0.42 * W) { hc += 0.42 * W - Hs; Hs = 0.42 * W; }
  const Hd = Hs - 2 * ts - 2 * cd, ad = W / 2 - ts - cd, bd = Ds / 2 - 0.3, zd = 0.3, piezas = [];
  // funda: torno cerrado alrededor del eje z (se arma en y y se gira); la cara de arriba lleva el logo
  const be = Math.min(0.5, ts * 0.3), L = Ds, Cs = limitar(0.08 * Hs, 0.8, 4);
  const pf = [{ k: 0, y: -L / 2 + be, tramo: 'exterior', corte: true }, { k: 0, y: L / 2 - be }];
  arco(pf, -be, L / 2 - be, be, 0, PI / 2, 3);
  pf.push({ k: ts - be, y: L / 2 });
  arco(pf, -(ts - be), L / 2 - be, be, PI / 2, PI, 3);
  pf.push({ k: ts, y: -L / 2 + be });
  arco(pf, -(ts - be), -L / 2 + be, be, PI, 3 * PI / 2, 3);
  pf.push({ k: be, y: -L / 2 });
  arco(pf, -be, -L / 2 + be, be, 3 * PI / 2, 2 * PI - 1e-9, 2);
  pf.pop();   // (el último punto del arco es el primero del perfil: el torno cierra solo)
  const funda = torno({ a: W / 2, b: Hs / 2, r: Cs, perfil: pf, cerrado: true, nc: 8, paso: limitar(W / 12, 3, 8), lados: { 'z-': { tramo: 'foil:sobre', desde: 0, hasta: 1 } }, planos: ['foil:sobre'] });
  mover(funda, new THREE.Matrix4().makeTranslation(0, Hs / 2, 0).multiply(new THREE.Matrix4().makeRotationX(PI / 2)));
  piezas.push({ parte: 'tapa', movil: true, geos: funda });
  const foils = { 'foil:sobre': { arriba: '-z', base: 'exterior', dibujo: 'sobre', ...uvRect(funda.get('foil:sobre'), '-z') } };
  // cajón
  const Cd = limitar(0.03 * W, 0.8, 2.2) + td;
  piezas.push({ parte: 'base', geos: desplazar(torno({ a: ad, b: bd, r: Cd, perfil: perfilBase({ H: Hd, t: td, tf: td, bi: 0.5, bs: Math.min(0.3 * td, 0.6), bf: 0.4 }), nc: 6, paso: limitar(W / 12, 3, 8), tapaInicio: 'exterior', tapaFin: 'forro' }), 0, yd0, zd) });
  // tirador dorado al frente
  const rt = limitar(0.06 * Hd, 1.2, 3), tir = bloque({ a: rt, h: 1.4 * rt, bev: 0.5 * rt, circulo: true, nc: 6, tramo: 'oro' });
  mover(tir, new THREE.Matrix4().makeTranslation(0, yd0 + Hd * 0.55, zd + bd - 0.3).multiply(new THREE.Matrix4().makeRotationX(PI / 2)));
  piezas.push({ parte: 'base', geos: tir });
  // cojín del cajón
  const yC = yd0 + td - 0.1, yTop = yd0 + td + hc, ai = ad - td, bin = bd - td;
  if (modo === 'ranura') for (const g of cojinesRanura({ ai, bi: bin, ri: Cd - td, t: td, y0: yC, alto: yTop - yC, J: { ...J, centroBanda: J.centroBanda - J.c[J.eje === 'x' ? 2 : 0] }, paso: 4 })) piezas.push({ parte: 'inserto', geos: desplazar(g, 0, 0, zd) });
  else { const alto = yTop - yC, dm = 0.18 * alto; piezas.push({ parte: 'inserto', geos: cojin({ cx: 0, cz: zd, hx: ai + 0.25, hz: bin + 0.25, r: Cd - td + 0.25, y0: yC, alto: alto - dm, bisel: 0.4 * alto, domo: dm, paso: 4 }) }); }
  return { W, D: Ds, H: Hs, piezas, foils, asiento: new THREE.Vector3(0, yTop - hundir, zd), alto: Hs, pose: u => new THREE.Matrix4().makeTranslation(0, 0, -0.7 * Ds * u), abre: 'cajon', modo, hundir };
}

// Bandeja redonda: pared inclinada, borde redondo dorado y piso de terciopelo (con la marca en arco)
function planBandeja(n, J) {
  const rj = Math.hypot(J.sx, J.sz) / 2, Rf = rj + Math.max(5, (4 + 0.25 * rj) * n.tamano);
  const t = limitar(0.06 * Rf, 1.6, 3.2), H = Math.max(7, 0.22 * Rf + t), tf = Math.max(2, 0.7 * t), rr = t / 2, al = 18 * PI / 180, bb = 1.2, bf = 1.5;
  const sa = Math.sin(al), ca = Math.cos(al);
  const geom = R => {
    const T1 = [R - rr + rr * ca, H - rr - rr * sa], T2 = [R - rr - rr * ca, H - rr + rr * sa];
    const s1 = (T1[1] - bb + bb * sa) / ca, Cb = [T1[0] - s1 * sa - bb * ca, bb];
    const s2 = (T2[1] - (tf + bf - bf * sa)) / ca, Cf = [T2[0] - s2 * sa - bf * ca, tf + bf];
    return { T1, T2, Cb, Cf };
  };
  let R = Rf + 10;
  for (let i = 0; i < 4; i++) R += Rf - geom(R).Cf[0];
  const g = geom(R), P = [], K = x => R - x;
  P.push({ k: K(g.Cb[0]), y: 0, tramo: 'exterior' });
  for (let i = 1; i <= 4; i++) { const f = -PI / 2 + (PI / 2 - al) * i / 4; P.push({ k: K(g.Cb[0] + bb * Math.cos(f)), y: bb + bb * Math.sin(f) }); }
  P.push({ k: K(g.T1[0]), y: g.T1[1], tramo: 'oro' });
  for (let i = 1; i <= 10; i++) { const f = -al + PI * i / 10; P.push({ k: K(R - rr + rr * Math.cos(f)), y: H - rr + rr * Math.sin(f) }); }
  P[P.length - 1].tramo = 'exterior';
  P.push({ k: K(g.Cf[0] + bf * ca), y: g.Cf[1] - bf * sa, tramo: 'interior' });
  for (let i = 1; i <= 4; i++) { const f = -al + (-PI / 2 + al) * i / 4; P.push({ k: K(g.Cf[0] + bf * Math.cos(f)), y: g.Cf[1] + bf * Math.sin(f) }); }
  const geos = torno({ a: R, circulo: true, perfil: P, nc: 18, tapaInicio: 'exterior', tapaFin: 'foil:bandeja', planos: ['foil:bandeja'] });
  const foils = { 'foil:bandeja': { arriba: '-z', base: 'interior', dibujo: 'arco', ...uvRect(geos.get('foil:bandeja'), '-z') } };
  return { W: 2 * R, D: 2 * R, H, piezas: [{ parte: 'base', geos }], foils, asiento: new THREE.Vector3(0, tf - 0.3, 0), alto: H, pose: () => new THREE.Matrix4(), abre: null, modo: 'bandeja', hundir: 0.3 };
}

// ---------- Pila de cajas (r7): torres a los lados de la joya, una caja baja atrás y otra adelante ----------
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Lista de cajas (medidas relativas a la joya: s = 1). Solo depende de la semilla: el panel sabe cuántas partes hay
function cajasDePila(n) {
  const R = azar(n.semilla * 7919 + 11), entre = (a, b) => a + (b - a) * R(), lista = [];
  for (const lado of [-1, 1]) {
    const k = 3 + (R() < 0.5 ? 1 : 0);
    const tams = [[entre(1.6, 2), entre(1.4, 1.9)], [entre(1.35, 1.65), entre(1.1, 1.5)], [entre(1.15, 1.4), entre(0.9, 1.3)], [entre(0.95, 1.15), entre(0.6, 0.9)]];
    for (let i = 0; i < k; i++) lista.push({ grupo: lado < 0 ? 'izquierda' : 'derecha', lado, piso: i, w: tams[i][0], h: tams[i][1], d: tams[i][0] * entre(0.85, 1.05), giro: entre(-4, 4) * PI / 180, corre: entre(0, 0.08), tapa: R() < 0.65, cinta: R() < 0.4, tono: Math.floor(R() * 3) });
  }
  lista.push({ grupo: 'atras', w: 0, h: 0, d: entre(1.2, 1.5), giro: entre(-2, 2) * PI / 180, tapa: true, cinta: R() < 0.5, tono: 1 });
  if (n.frente) lista.push({ grupo: 'frente', w: entre(3.2, 3.9), h: entre(0.5, 0.65), d: entre(1.1, 1.3), giro: entre(-5, 5) * PI / 180, corre: entre(-0.3, 0.3), tapa: R() < 0.5, cinta: false, tono: 2 });
  return lista;
}
function planPila(n, J, opc) {
  const s = Math.max(J.sx, J.sy, J.sz) * n.tamano, piso = Number.isFinite(opc.suelo) ? opc.suelo * J.k : J.min[1] - 1.6 * s;
  const lista = cajasDePila(n), cajas = [], piezas = [], anclas = {};
  const borde = J.sx / 2 + 1.1 * s, tope = J.max[1] + 3 * s, alturas = { izquierda: piso, derecha: piso };
  for (const c of lista) {
    let W = c.w * s, D = c.d * s, H = c.h * s, x, z, y;
    if (c.grupo === 'izquierda' || c.grupo === 'derecha') {
      // en la torre: la última caja llega por encima de la joya (para colgar la cadena)
      const torre = lista.filter(o => o.grupo === c.grupo), ultima = torre[torre.length - 1] === c;
      if (ultima) H = Math.max(H, tope - alturas[c.grupo]);
      const holgura = (D / 2) * Math.abs(Math.sin(c.giro)) + (W / 2) * (1 - Math.cos(c.giro));
      x = J.c[0] + c.lado * (borde + W / 2 + holgura + c.corre * s); z = J.c[2] - 0.15 * s; y = alturas[c.grupo];
      alturas[c.grupo] += H + 0.02;
    } else if (c.grupo === 'atras') {
      W = 2 * borde + 0.4 * s; H = Math.max(0.35 * s, J.min[1] - 0.3 * s - piso);
      x = J.c[0]; z = J.c[2] - J.sz / 2 - 0.9 * s - D / 2; y = piso;
    } else { x = J.c[0] + c.corre * s; z = J.c[2] + J.sz / 2 + 2.4 * s + D / 2; y = piso; }
    const t = limitar(0.03 * W, 1, 6), C = limitar(0.03 * W, 0.6, 6) + t, i = cajas.length;
    const Hl = Math.max(0.24 * H, 0.12 * W), cintas = c.cinta ? { w: 0.12 * W, e: limitar(0.005 * W, 0.3, 2), gap: 0.03 + 0.001 * W } : null;
    let pz;
    if (c.tapa) pz = cajaConTapa({ W, D, Hb: H - 0.1 - t, Hl, C, t, holgura: 0.3 + 0.002 * W, cintas, techo: 'forro', nc: 5, paso: W / 6 }).piezas;
    else pz = [{ parte: 'base', geos: bloque({ a: W / 2, b: D / 2, r: C, h: H, bev: limitar(0.012 * W, 0.5, 3), nc: 5, paso: W / 6, tramo: 'exterior' }) }];
    const tono = ['exterior', 'exterior2', 'exterior3'][c.tono || 0];
    for (const p of pz) {
      for (const [k, g] of [...p.geos]) if (k === 'exterior') { p.geos.delete(k); p.geos.set(tono, g); }
      p.movil = false; p.caja = i; piezas.push(p);
    }
    const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(c.giro));
    cajas.push({ matriz: m, W, D, H, grupo: c.grupo });
    if (c.grupo === 'izquierda' || c.grupo === 'derecha') {
      // ancla: el borde de arriba que mira a la joya, un poco hacia adentro
      const a = new THREE.Vector3(-c.lado * (W / 2 - 0.08 * s), H, 0).applyMatrix4(m);
      anclas[c.grupo] = a;
    }
  }
  return { cajas, piezas, anclas, piso, foils: {}, abre: null, modo: 'pila' };
}

// ---------- Plan completo: piezas en milímetros, en el marco de la joya ----------
// opc.suelo (unidades del estudio): el piso bajo una joya que flota (al lado o escenario) o el piso de la pila
function planificar(n, J, opc = {}) {
  const suelo = Number.isFinite(opc.suelo) ? opc.suelo * J.k : null;
  if (n.tipo === 'pila-cajas') {
    const p = planPila(n, J, opc);
    return { ...p, sigueJoya: true, base: p.piso, asientoJoya: new THREE.Vector3(J.c[0], J.min[1], J.c[2]), cajasSTL: p.cajas.map(c => c.matriz) };
  }
  const p = n.tipo === 'caja-regalo' ? planRegalo(n, J, opc) : n.tipo === 'cajon' ? planCajon(n, J) : n.tipo === 'bandeja' ? planBandeja(n, J) : planBisagra(n, J);
  let m, sigue = true;
  const asientoJoya = new THREE.Vector3(J.c[0], J.min[1], J.c[2]);
  if (n.posicion === 'al-lado') {
    sigue = false;
    const gira = new THREE.Matrix4().makeRotationY(n.angulo * PI / 180), libre = suelo !== null ? J.min[1] - suelo : 0;
    const margen = 0.25 * Math.max(J.sx, J.sy, J.sz);
    if (suelo !== null && altoMaximo(p, 0) + margen <= libre) {
      // la joya flota encima: la caja va justo debajo (como el moño del que sale la cinta en r5). Si al abrirse la tapa
      // llegaría a la joya, la apertura se queda en el punto más alto posible (la línea de tiempo puede animarla)
      m = new THREE.Matrix4().makeTranslation(J.c[0], suelo, J.c[2]).multiply(gira);
      if (p.abre && altoMaximo(p, 1) + margen > libre) {
        let a = 0, b = 1;
        for (let i = 0; i < 18; i++) { const c = (a + b) / 2; if (altoMaximo(p, c) + margen <= libre) a = c; else b = c; }
        const pose0 = p.pose; p.aperturaMax = a; p.pose = u => pose0(Math.min(u, a));
      }
    } else {
      const R = Math.hypot(p.W, p.D) / 2;
      m = new THREE.Matrix4().makeTranslation(J.c[0] + J.sx / 2 + R + 0.12 * Math.max(p.W, 20), suelo ?? J.min[1], J.c[2] - 0.3 * p.D).multiply(gira);
    }
  } else if (n.posicion === 'escenario' && suelo !== null) {
    m = new THREE.Matrix4().makeTranslation(J.c[0] - p.asiento.x, suelo - p.escenario.alto, J.c[2] - p.asiento.z);
  } else {
    // la joya en su asiento: el asiento de la caja va al pie de la joya
    m = new THREE.Matrix4().makeTranslation(J.c[0] - p.asiento.x, J.min[1] - p.asiento.y, J.c[2] - p.asiento.z);
    asientoJoya.set(J.c[0], J.min[1] + p.hundir, J.c[2]);
  }
  for (const pz of p.piezas) pz.caja = 0;
  const base = new THREE.Vector3(0, 0, 0).applyMatrix4(m).y;
  return { ...p, cajas: [{ matriz: m, W: p.W, D: p.D, H: p.H }], sigueJoya: sigue, base, asientoJoya, cajasSTL: [new THREE.Matrix4()], anclaMono: p.ancla || null };
}

// Lo más alto que llega la caja (en su marco) con cualquier apertura
function altoMaximo(p, hasta = 1) {
  let h = 0;
  const us = p.abre ? [0, 0.25, 0.5, 0.75, 1].map(u => u * hasta) : [0], id = new THREE.Matrix4();
  for (const pz of p.piezas) for (const geo of pz.geos.values()) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    for (const u of pz.movil ? us : [0]) h = Math.max(h, geo.boundingBox.clone().applyMatrix4(pz.movil && p.pose ? p.pose(u) : id).max.y);
  }
  return h;
}
// Matriz de una pieza en el marco de la joya (mm) con la caja abierta u
function matrizPieza(plan, pz, u) {
  const m = plan.cajas[pz.caja].matriz.clone();
  if (pz.movil && plan.pose) m.multiply(plan.pose(u));
  return m;
}
// Triángulos (9 números cada uno) de un grupo de geometrías, transformados por m
function triangulos(geos, m, sal = []) {
  const v = new THREE.Vector3();
  for (const geo of geos.values()) {
    const p = geo.attributes.position, ix = geo.index.array;
    for (let i = 0; i < ix.length; i++) { v.fromBufferAttribute(p, ix[i]).applyMatrix4(m); sal.push(v.x, v.y, v.z); }
  }
  return sal;
}

// ---------- STL ----------
// Binario en mm, con Z hacia arriba (como lo esperan los programas de impresión y el propio estudio al subir un STL),
// apoyado en z = 0 y centrado. Las partes salen siempre en el mismo marco: la base y la tapa bajadas por separado encajan
export function exportarSTL(cfg, { joya, partes = 'todo', apertura = 0, suelo } = {}) {
  const n = normalizarUtileria(cfg);
  if (n.tipo === 'ninguna') return escribirSTL([], 'Atelier & Co - sin estuche');
  const plan = planificar(n, medirJoya(joya), { suelo });
  const u = limitar(Number.isFinite(apertura) ? apertura : 0, 0, 1), sel = String(partes || 'todo');
  const marco = (pz, uu) => { const m = (plan.cajasSTL[pz.caja] || plan.cajasSTL[0]).clone(); if (pz.movil && plan.pose) m.multiply(plan.pose(uu)); return m; };
  // marco común: el de todo cerrado (centro de la huella y el piso)
  const todo = [];
  for (const pz of plan.piezas) triangulos(pz.geos, marco(pz, 0), todo);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < todo.length; i++) { const e = i % 3; min[e] = Math.min(min[e], todo[i]); max[e] = Math.max(max[e], todo[i]); }
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2, y0 = min[1];
  const elegidas = plan.piezas.filter((pz, i) => sel === 'todo' || pz.parte === sel || (sel.startsWith('caja-') && pz.caja === +sel.slice(5) - 1));
  const tri = [];
  for (const pz of elegidas) triangulos(pz.geos, marco(pz, u), tri);
  const sal = new Float32Array(tri.length);
  for (let i = 0; i < tri.length; i += 3) { sal[i] = tri[i] - cx; sal[i + 1] = -(tri[i + 2] - cz); sal[i + 2] = tri[i + 1] - y0; }
  return escribirSTL(sal, `Atelier & Co - ${n.tipo} - ${sel} - mm`);
}
// Baja el STL en el navegador (con el nombre de siempre)
export function descargarSTL(cfg, opciones = {}) {
  const buf = exportarSTL(cfg, opciones), nombre = nombreSTL(cfg, opciones.partes);
  const url = URL.createObjectURL(new Blob([buf], { type: 'model/stl' })), a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { nombre, bytes: buf.byteLength };
}

// ---------- Choques (pruebas numéricas) ----------
// Para u de 0 a 1: ninguna pared, tapa, cinta o funda toca la caja que envuelve a la joya; los cojines solo la tocan
// por debajo del borde del asiento (la ranura); con todo cerrado, la joya queda adentro
export function comprobarUtileria(cfg, { joya, pasos = 21, suelo } = {}) {
  const n = normalizarUtileria(cfg), J = medirJoya(joya), sal = { ok: true, choques: [], dentro: null, triangulos: 0 };
  if (n.tipo === 'ninguna') return sal;
  const plan = planificar(n, J, { suelo });
  const caja = new THREE.Box3(new THREE.Vector3(...J.min), new THREE.Vector3(...J.max));
  const pie = caja.clone(); pie.min.y = Math.min(pie.max.y, J.min[1] + (plan.hundir || 0) + 0.05);   // lo que puede tocar el piso de la bandeja o el cojín
  const sobreAsiento = caja.clone(); sobreAsiento.min.y = Math.min(caja.max.y, J.min[1] + (plan.hundir || 0) + 0.3);
  const tri = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const choca = (pz, m, box) => {
    let k = 0;
    for (const geo of pz.geos.values()) {
      const p = geo.attributes.position, ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        a.fromBufferAttribute(p, ix[i]).applyMatrix4(m); b.fromBufferAttribute(p, ix[i + 1]).applyMatrix4(m); c.fromBufferAttribute(p, ix[i + 2]).applyMatrix4(m);
        if (Math.max(a.x, b.x, c.x) < box.min.x || Math.min(a.x, b.x, c.x) > box.max.x || Math.max(a.y, b.y, c.y) < box.min.y || Math.min(a.y, b.y, c.y) > box.max.y || Math.max(a.z, b.z, c.z) < box.min.z || Math.min(a.z, b.z, c.z) > box.max.z) continue;
        tri.set(a, b, c); if (box.intersectsTriangle(tri)) k++;
      }
    }
    return k;
  };
  for (const pz of plan.piezas) for (const geo of pz.geos.values()) sal.triangulos += geo.index.count / 3;
  const us = plan.abre ? Array.from({ length: pasos }, (_, i) => i / (pasos - 1)) : [0];
  for (const pz of plan.piezas) {
    const box = n.posicion === 'al-lado' || n.tipo === 'pila-cajas' ? caja : pz.parte === 'inserto' ? sobreAsiento : pz.movil && n.posicion === 'asiento' ? caja : pie;
    for (const u of pz.movil && n.posicion !== 'escenario' ? us : [0]) {
      const k = choca(pz, matrizPieza(plan, pz, u), box);
      if (k) { sal.ok = false; sal.choques.push({ u: +u.toFixed(3), parte: pz.parte, triangulos: k }); }
    }
  }
  // con la caja cerrada, la joya queda adentro de su contorno (bandeja y escenario no se cierran sobre la joya)
  if (n.posicion === 'asiento' && plan.abre) {
    const lim = new THREE.Box3();
    for (const pz of plan.piezas) for (const geo of pz.geos.values()) { geo.computeBoundingBox(); lim.union(geo.boundingBox.clone().applyMatrix4(matrizPieza(plan, pz, 0))); }
    sal.dentro = lim.containsBox(caja);
    if (!sal.dentro) sal.ok = false;
  }
  sal.medidas = { W: +plan.W?.toFixed?.(2), D: +plan.D?.toFixed?.(2), H: +plan.H?.toFixed?.(2), modo: plan.modo, angulo: plan.angulo };
  return sal;
}

// ---------- Texturas y materiales (solo en el navegador) ----------
const lienzo = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function ruido(N, celdas, semilla, sal = new Float32Array(N * N), peso = 1) {
  const R = azar(semilla), g = new Float32Array(celdas * celdas);
  for (let i = 0; i < g.length; i++) g[i] = R();
  for (let y = 0; y < N; y++) {
    const fy = y / N * celdas, j = Math.floor(fy), ty = suav(fy - j), a = (j % celdas) * celdas, b = ((j + 1) % celdas) * celdas;
    for (let x = 0; x < N; x++) {
      const fx = x / N * celdas, i = Math.floor(fx), tx = suav(fx - i), i0 = i % celdas, i1 = (i + 1) % celdas;
      const p = g[a + i0] + (g[a + i1] - g[a + i0]) * tx, q = g[b + i0] + (g[b + i1] - g[b + i0]) * tx;
      sal[y * N + x] += (p + (q - p) * ty) * peso;
    }
  }
  return sal;
}
// Patrón de cada material (alto, variación del color y rugosidad), que se repite sin costuras. T: mm que cubre
const PATRONES = {};
function patron(tipo) {
  if (PATRONES[tipo]) return PATRONES[tipo];
  const cfg = { cuero: [512, 9], papel: [512, 14], terciopelo: [256, 7], saten: [256, 5], laca: [256, 30] }[tipo] || [256, 10];
  const [N, T] = cfg, n = N * N, alto = new Float32Array(n), varia = new Float32Array(n).fill(1), rug = new Float32Array(n).fill(0.5);
  if (tipo === 'cuero') {
    // grano de cuero: celdas de Worley (granitos abombados con pliegues entre ellos) y un ruido fino encima
    const celdas = 13, R = azar(31), pts = [];
    for (let j = 0; j < celdas; j++) for (let i = 0; i < celdas; i++) pts.push((i + 0.15 + 0.7 * R()) / celdas, (j + 0.15 + 0.7 * R()) / celdas);
    const fino = ruido(N, 96, 33), mancha = ruido(N, 4, 34);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, ci = Math.floor(u * celdas), cj = Math.floor(v * celdas);
      let f1 = 9, f2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + celdas) % celdas, jj = (cj + dj + celdas) % celdas, k = 2 * (jj * celdas + ii);
        let dx = pts[k] - u, dy = pts[k + 1] - v; dx -= Math.round(dx); dy -= Math.round(dy);
        const d = Math.hypot(dx, dy) * celdas;
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const i = y * N + x, borde = escalon(0, 0.32, f2 - f1);
      alto[i] = 0.35 + 0.45 * borde - 0.12 * f1 + 0.12 * (fino[i] - 0.5);
      varia[i] = 0.93 + 0.07 * borde + 0.05 * (mancha[i] - 0.5);
      rug[i] = 0.62 - 0.14 * borde + 0.06 * (fino[i] - 0.5);
    }
  } else if (tipo === 'papel') {
    const fino = ruido(N, 128, 41), medio = ruido(N, 24, 42), fibra = ruido(N, 160, 43);
    for (let i = 0; i < n; i++) {
      alto[i] = 0.5 + 0.25 * (fino[i] - 0.5) + 0.15 * (medio[i] - 0.5) + 0.12 * (fibra[i] - 0.5);
      varia[i] = 0.97 + 0.04 * (medio[i] - 0.5) + 0.02 * (fino[i] - 0.5);
      rug[i] = 0.82 + 0.08 * (fino[i] - 0.5);
    }
  } else if (tipo === 'terciopelo') {
    const fibra = ruido(N, 96, 51), aplastado = ruido(N, 5, 52);
    for (let i = 0; i < n; i++) { alto[i] = 0.5 + 0.22 * (fibra[i] - 0.5) + 0.1 * (aplastado[i] - 0.5); varia[i] = 0.96 + 0.06 * (aplastado[i] - 0.5); rug[i] = 0.95; }
  } else if (tipo === 'saten') {
    const fino = ruido(N, 64, 61);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, hilo = 0.5 + 0.5 * Math.sin(2 * PI * y / N * 48);
      alto[i] = 0.5 + 0.15 * hilo + 0.05 * (fino[i] - 0.5); varia[i] = 0.97 + 0.03 * hilo; rug[i] = 0.3 + 0.05 * (fino[i] - 0.5);
    }
  } else {
    const piel = ruido(N, 6, 71);
    for (let i = 0; i < n; i++) { alto[i] = 0.5 + 0.04 * (piel[i] - 0.5); rug[i] = 0.3; }
  }
  return (PATRONES[tipo] = { N, T, alto, varia, rug });
}
const RELIEVE = { cuero: 2.2, papel: 0.8, terciopelo: 0.7, saten: 0.35, laca: 0.25 };
// Normales (en un ImageData) a partir de un alto: diferencias con vecinos, dando la vuelta por los bordes si se repite
function normalesDe(alto, W, H, fuerza, img, repite = true) {
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xm = repite ? (x + W - 1) % W : Math.max(0, x - 1), xp = repite ? (x + 1) % W : Math.min(W - 1, x + 1);
    const ym = repite ? (y + H - 1) % H : Math.max(0, y - 1), yp = repite ? (y + 1) % H : Math.min(H - 1, y + 1);
    const gx = (alto[y * W + xp] - alto[y * W + xm]) / 2, gy = (alto[yp * W + x] - alto[ym * W + x]) / 2;
    // la fila 0 del lienzo es v = 1: hacia abajo en la imagen es −v
    const nx = -gx * fuerza, ny = gy * fuerza, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = 4 * (y * W + x);
    d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
}
const TEXTURAS = {};
function texturasPatron(tipo) {
  if (TEXTURAS[tipo]) return TEXTURAS[tipo];
  const p = patron(tipo), { N } = p, hacer = f => {
    const c = lienzo(N), x = c.getContext('2d'), img = x.createImageData(N, N);
    f(img.data); x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(T_UV / p.T, T_UV / p.T);
    return t;
  };
  const mapa = hacer(d => { for (let i = 0; i < N * N; i++) { const v = Math.round(limitar(p.varia[i], 0, 1) * 255); d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; } });
  mapa.colorSpace = THREE.SRGBColorSpace;
  const orm = hacer(d => { for (let i = 0; i < N * N; i++) { d[4 * i] = 255; d[4 * i + 1] = Math.round(limitar(p.rug[i], 0, 1) * 255); d[4 * i + 2] = 0; d[4 * i + 3] = 255; } });
  orm.colorSpace = THREE.NoColorSpace;
  const normal = hacer(d => normalesDe(p.alto, N, N, RELIEVE[tipo] * N / 64, { data: d }));
  normal.colorSpace = THREE.NoColorSpace;
  return (TEXTURAS[tipo] = { mapa, orm, normal });
}
const aclarar = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
// Propiedades físicas de cada material (las mismas en los dos motores)
function propiedades(tipo, hex) {
  const c = new THREE.Color(hex);
  switch (tipo) {
    // terciopelo: más oscuro de frente y con brillo en los bordes (así se lee la forma del cojín y la ranura)
    case 'terciopelo': return { color: c.clone().multiplyScalar(0.7), roughness: 1, sheen: 1, sheenRoughness: 0.32, sheenColor: aclarar(hex, 0.4), specularIntensity: 0.05, normalScale: 0.5 };
    case 'laca': return { color: c, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.035, specularIntensity: 0.5, normalScale: 0.3 };
    case 'papel': return { color: c, roughness: 1, specularIntensity: 0.35, sheen: 0.12, sheenRoughness: 0.6, sheenColor: aclarar(hex, 0.5), normalScale: 0.6 };
    case 'saten': return { color: c, roughness: 1, sheen: 0.75, sheenRoughness: 0.24, sheenColor: aclarar(hex, 0.35), specularIntensity: 0.65, normalScale: 0.35 };
    default: return { color: c, roughness: 1, clearcoat: 0.12, clearcoatRoughness: 0.4, specularIntensity: 0.7, normalScale: 0.75 };   // cuero
  }
}
function crearMaterial(tipo, hex) {
  const pr = propiedades(tipo, hex), m = new THREE.MeshPhysicalMaterial({ metalness: 0 });
  for (const [k, v] of Object.entries(pr)) if (k !== 'normalScale') { if (v && v.isColor) m[k].copy(v); else m[k] = v; }
  if (HAY_DOM) { const tx = texturasPatron(tipo); m.map = tx.mapa; m.roughnessMap = tx.orm; m.normalMap = tx.normal; m.normalScale.setScalar(pr.normalScale); }
  else m.roughness = { cuero: 0.6, papel: 0.82, terciopelo: 0.95, saten: 0.3, laca: 0.3 }[tipo] ?? 0.6;
  m.userData.tipo = tipo;
  return m;
}

// ---------- El logo en dorado (foil) ----------
const SERIF = "'Bodoni Moda', Didot, 'Times New Roman', serif";
let pathLogo = null;
const logoPath = () => pathLogo || (pathLogo = typeof Path2D !== 'undefined' ? new Path2D(LOGO_D) : null);
// texto con espaciado entre letras, centrado en (x, y)
function textoEspaciado(ctx, texto, x, y, sep) {
  const letras = Array.from(texto), anchos = letras.map(l => ctx.measureText(l).width), total = anchos.reduce((s, w) => s + w, 0) + sep * (letras.length - 1);
  let cx = x - total / 2;
  letras.forEach((l, i) => { ctx.fillText(l, cx, y); cx += anchos[i] + sep; });
  return total;
}
// La marca: escarabajo + ATELIER&CO (y el grabado), en blanco sobre negro (máscara del dorado)
function dibujarMarca(ctx, W, H, dibujo, logo, grabado) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const escarabajo = (cx, cy, h) => { const p = logoPath(); if (!p) return; const k = h / LOGO_H; ctx.save(); ctx.translate(cx - LOGO_W * k / 2, cy - h / 2); ctx.scale(k, k); ctx.fill(p, 'evenodd'); ctx.restore(); };
  const marca = (cx, y, t) => {
    // ATELIER & CO con la «&» más chica, como en la página
    ctx.font = `500 ${t}px ${SERIF}`; const s = 0.16 * t, w1 = medir(ctx, 'ATELIER', s); ctx.font = `500 ${0.72 * t}px ${SERIF}`; const w2 = medir(ctx, '&', 0); ctx.font = `500 ${t}px ${SERIF}`; const w3 = medir(ctx, 'CO', s);
    const total = w1 + w2 + w3 + 2 * 0.22 * t; let x = cx - total / 2;
    textoEspaciado(ctx, 'ATELIER', x + w1 / 2, y, s); x += w1 + 0.22 * t;
    ctx.font = `500 ${0.72 * t}px ${SERIF}`; ctx.fillText('&', x, y); x += w2 + 0.22 * t;
    ctx.font = `500 ${t}px ${SERIF}`; textoEspaciado(ctx, 'CO', x + w3 / 2, y, s);
    return total;
  };
  const m = Math.min(W, H);
  if (dibujo === 'arco') {
    // en la bandeja: la marca en arco por delante de la pieza y el grabado por detrás, siguiendo el borde
    const cx = W / 2, cy = H / 2, R = 0.4 * m, arcoTexto = (txt, t, abajo) => {
      ctx.font = `500 ${t}px ${SERIF}`; const letras = Array.from(txt), sep = 0.25 * t, an = letras.map(l => ctx.measureText(l).width + sep), tot = an.reduce((s, w) => s + w, 0) - sep;
      let ang = -tot / 2 / R;
      for (let i = 0; i < letras.length; i++) {
        const a = ang + an[i] / 2 / R; ctx.save();
        if (abajo) { ctx.translate(cx + R * Math.sin(a), cy + R * Math.cos(a)); ctx.rotate(-a); } else { ctx.translate(cx + R * Math.sin(a), cy - R * Math.cos(a)); ctx.rotate(a); }
        ctx.fillText(letras[i], -an[i] / 2 + sep / 2, abajo ? 0 : t * 0.7); ctx.restore(); ang += an[i] / R;
      }
    };
    if (logo) arcoTexto('ATELIER & CO', 0.055 * m, true);
    if (grabado) { ctx.font = `italic 500 ${0.05 * m}px ${SERIF}`; arcoTexto(grabado, 0.05 * m, false); }
    return;
  }
  if (dibujo === 'linea') {
    // estuche de collar (ancho): escarabajo a la izquierda y la marca a la derecha
    // (todo el conjunto cabe en el 60 % del ancho: se mide con un tamaño de prueba y se escala)
    ctx.font = `500 100px ${SERIF}`;
    const k = Math.min(0.17 * H, 100 * 0.6 * W / (medir(ctx, 'ATELIER & CO', 16) + 30 + (2 * LOGO_W / LOGO_H + 0.7) * 100));
    const h = 2 * k, t = k;
    ctx.font = `500 ${t}px ${SERIF}`;
    const wm = medir(ctx, 'ATELIER & CO', 0.16 * t) + 0.3 * t, wl = h * LOGO_W / LOGO_H, gap = 0.35 * h, x0 = W / 2 - (wl + gap + wm) / 2;
    if (logo) { escarabajo(x0 + wl / 2, H / 2, h); marca(x0 + wl + gap + wm / 2, H / 2 + 0.36 * t, t); }
    if (grabado) { ctx.font = `italic 500 ${0.11 * H}px ${SERIF}`; textoEspaciado(ctx, grabado, W / 2, H * (logo ? 0.82 : 0.55), 0.02 * H); }
    return;
  }
  // sello (arriba de la tapa), forro (dentro de la tapa) y sobre (funda del cajón): escarabajo, marca y grabado apilados
  const h = (dibujo === 'sello' ? 0.26 : 0.2) * m, t = (dibujo === 'sello' ? 0.075 : 0.062) * m;
  let y = H / 2 - (grabado ? 0.12 * m : 0.06 * m);
  if (logo) { escarabajo(W / 2, y - 0.06 * m, h); marca(W / 2, y + h / 2 + 0.03 * m + t * 0.7, t); y += h / 2 + 0.05 * m + 1.6 * t; }
  else y = H / 2;
  if (grabado) { ctx.font = `italic 500 ${0.06 * m}px ${SERIF}`; textoEspaciado(ctx, grabado, W / 2, y + 0.02 * m, 0.01 * m); }
}
function medir(ctx, txt, sep) { const l = Array.from(txt); return l.reduce((s, c) => s + ctx.measureText(c).width, 0) + sep * (l.length - 1); }
// Texturas de una cara con logo: color (material + dorado), rugosidad/metal (verde/azul) y normales (grano + hundido del
// dorado). El grano se calcula en mm, igual que el de las paredes: no se nota dónde empieza la cara
function texturasFoil(f, tipoBase, hexBase, logo, grabado) {
  const p = patron(tipoBase), N = 1024, W = f.ancho >= f.fondo ? N : Math.max(64, Math.round(N * f.ancho / f.fondo)), H = f.fondo >= f.ancho ? N : Math.max(64, Math.round(N * f.fondo / f.ancho));
  const mascara = lienzo(W, H), mx = mascara.getContext('2d', { willReadFrequently: true });
  dibujarMarca(mx, W, H, f.dibujo, logo, grabado);
  const md = mx.getImageData(0, 0, W, H).data, mk = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) mk[i] = md[4 * i] / 255;
  // borde suave del hundido (dos pasadas de caja de 1 px)
  const blur = new Float32Array(mk);
  for (let k = 0; k < 2; k++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; blur[i] = (mk[i] * 4 + mk[i - 1] + mk[i + 1] + mk[i - W] + mk[i + W]) / 8; }
  const base = new THREE.Color(hexBase), pr = propiedades(tipoBase, hexBase), oro = new THREE.Color('#E2B65E'), lin = new THREE.Color();
  if (pr.color) base.copy(pr.color);
  const color = lienzo(W, H), orm = lienzo(W, H), nor = lienzo(W, H), brillo = lienzo(W, H);
  const ic = color.getContext('2d').createImageData(W, H), io = orm.getContext('2d').createImageData(W, H), inn = nor.getContext('2d').createImageData(W, H), ib = brillo.getContext('2d').createImageData(W, H);
  const alto = new Float32Array(W * H), mmx = f.ancho / W, mmy = f.fondo / H, kT = p.N / p.T, s = new THREE.Color();
  // el grano se muestrea en mm: la pendiente por píxel cambia con el tamaño del píxel (la fuerza la compensa)
  const fuerza = RELIEVE[tipoBase] * p.N / 64 / Math.max(1e-3, mmx * kT), hundido = 1.1 / fuerza;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, px = ((Math.floor(x * mmx * kT) % p.N) + p.N) % p.N, py = ((Math.floor(y * mmy * kT) % p.N) + p.N) % p.N, j = py * p.N + px, m = mk[i];
    alto[i] = p.alto[j] * (1 - m) - hundido * blur[i];
    lin.copy(base).multiplyScalar(Math.pow(p.varia[j], 2.2)).lerp(oro, m);   // (el color del material ya es lineal)
    s.copy(lin).convertLinearToSRGB();
    ic.data[4 * i] = s.r * 255; ic.data[4 * i + 1] = s.g * 255; ic.data[4 * i + 2] = s.b * 255; ic.data[4 * i + 3] = 255;
    io.data[4 * i] = 255; io.data[4 * i + 1] = limitar(p.rug[j] * (1 - m) + 0.26 * m, 0, 1) * 255; io.data[4 * i + 2] = m * 255; io.data[4 * i + 3] = 255;
    const b = Math.round((1 - m) * 255); ib.data[4 * i] = ib.data[4 * i + 1] = ib.data[4 * i + 2] = b; ib.data[4 * i + 3] = 255;
  }
  normalesDe(alto, W, H, fuerza, inn, false);
  for (const [c, d] of [[color, ic], [orm, io], [nor, inn], [brillo, ib]]) c.getContext('2d').putImageData(d, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };
  return { mapa: tex(color, true), orm: tex(orm), normal: tex(nor), brillo: tex(brillo, true) };
}
function materialFoil(f, tipoBase, hexBase, logo, grabado) {
  const pr = propiedades(tipoBase, hexBase), m = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 1, color: 0xffffff });
  for (const [k, v] of Object.entries(pr)) if (k !== 'normalScale' && k !== 'color') { if (v && v.isColor) m[k].copy(v); else m[k] = v; }
  const tx = texturasFoil(f, tipoBase, hexBase, logo, grabado);
  m.map = tx.mapa; m.roughnessMap = tx.orm; m.metalnessMap = tx.orm; m.normalMap = tx.normal; m.normalScale.setScalar(Math.max(0.6, pr.normalScale));
  if (m.sheen) m.sheenColorMap = tx.brillo;   // el terciopelo no brilla sobre el dorado
  m.userData.foil = true;
  return m;
}

// Sombra suave bajo cada caja apoyada en el piso (solo motor rápido: el trazador hace la suya)
function manchaSombra(W, D, rad) {
  const N = 128, m = 0.18 * Math.max(W, D), ext = [W / 2 + m, D / 2 + m], c = lienzo(N), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.filter = `blur(${Math.round(N * 0.05)}px)`; x.fillStyle = '#fff';
  const kx = N / (2 * ext[0]), kz = N / (2 * ext[1]);
  x.beginPath(); x.roundRect(N / 2 - W / 2 * kx, N / 2 - D / 2 * kz, W * kx, D * kz, Math.min(rad * kx, N / 4)); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext[0], 2 * ext[1]), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  malla.rotation.x = -PI / 2; malla.renderOrder = 1;
  return malla;
}

// ---------- La utilería en la escena ----------
export class Utileria {
  constructor({ alCambiarPT = null } = {}) {
    this.grupo = new THREE.Group(); this.grupo.name = 'utileria';           // motor rápido
    this.grupoPT = new THREE.Group(); this.grupoPT.name = 'utileriaPT';     // trazado de rayos (va en la raíz de escenaPT)
    this.alCambiarPT = alCambiarPT; this.sucioPT = false;
    this.cfg = normalizarUtileria(null); this.plan = null; this.resultado = null; this.claves = {};
    this.mats = {}; this.moviles = []; this.apertura = -1; this.az = 0; this.giroPT = 0;
  }
  get activa() { return !!this.plan; }

  // cfg: configuración (se normaliza). joya: { caja (Box3 en unidades del estudio), mmPorUnidad, objeto?, par? };
  // suelo: altura del piso bajo una joya que flota (unidades del estudio). Devuelve el resultado (null si no hay utilería)
  armar(cfg, { joya, version, suelo } = {}) {
    const n = normalizarUtileria(cfg);
    this.cfg = n;
    if (n.tipo === 'ninguna') { this.vaciar(); return null; }
    const J = medirJoya(joya), cj = J.min.concat(J.max).map(v => v.toFixed(3)).join(',');
    const kGeo = JSON.stringify([n.tipo, n.posicion, n.tamano, n.angulo, n.mono, n.semilla, n.frente, cj, J.k, J.banda.toFixed(3), J.par?.separacion, suelo, version]);
    const kMat = JSON.stringify([n.color, n.interior, n.cinta, n.material]), kFoil = JSON.stringify([kMat, n.logo, n.grabado, kGeo]);
    if (kGeo !== this.claves.geo) {
      this.limpiarMallas();
      this.plan = planificar(n, J, { suelo });
      this.J = J;
      this.crearMallas();
      this.apertura = -1;
    }
    if (kMat !== this.claves.mat || kFoil !== this.claves.foil) this.materiales(n, kMat !== this.claves.mat, kFoil !== this.claves.foil);
    this.claves = { geo: kGeo, mat: kMat, foil: kFoil };
    this.ponerApertura(n.apertura);
    this.girar(this.az, this.giroPT, true);
    this.sucioPT = true; this.alCambiarPT?.();
    return this.resultado;
  }

  crearMallas() {
    const plan = this.plan, k = this.J.k;
    this.grupo.scale.setScalar(1 / k); this.grupoPT.scale.setScalar(1 / k);
    this.mallas = []; this.moviles = [];
    plan.cajas.forEach((c, i) => {
      const nodos = [this.grupo, this.grupoPT].map(g => {
        const caja = new THREE.Group(); caja.matrixAutoUpdate = false; caja.matrix.copy(c.matriz); g.add(caja);
        const movil = new THREE.Group(); movil.matrixAutoUpdate = false; caja.add(movil);
        return { caja, movil };
      });
      this.moviles.push(...nodos.map(o => o.movil));
      for (const pz of plan.piezas.filter(p => p.caja === i)) for (const [tramo, geo] of pz.geos) for (const o of nodos) {
        const malla = new THREE.Mesh(geo, null); malla.userData.tramo = tramo; malla.castShadow = malla.receiveShadow = true;
        (pz.movil ? o.movil : o.caja).add(malla); this.mallas.push(malla);
      }
      // sombra de contacto (motor rápido) bajo las cajas que tocan el piso
      if (HAY_DOM && (plan.modo !== 'pila' || c.grupo === 'atras' || c.grupo === 'frente' || new THREE.Vector3().setFromMatrixPosition(c.matriz).y <= plan.base + 0.01)) {
        const s = manchaSombra(c.W, c.D, plan.modo === 'bandeja' ? c.W / 2 : 0.1 * Math.min(c.W, c.D)); s.position.y = 0.02; s.userData.sombra = true; nodos[0].caja.add(s);
      }
    });
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true);
    let tri = 0; for (const p of plan.piezas) for (const g of p.geos.values()) tri += g.index.count / 3;
    this.triangulos = tri;
  }

  materiales(n, colores, foil) {
    const M = this.mats, viejos = [];
    if (colores || !M.exterior) {
      for (const k of ['exterior', 'exterior2', 'exterior3', 'forro', 'interior', 'cinta', 'oro']) if (M[k]) viejos.push(M[k]);
      M.exterior = crearMaterial(n.material, n.color);
      // en la pila, tres tonos del mismo color para que se lean las cajas una detrás de otra
      M.exterior2 = crearMaterial(n.material, '#' + new THREE.Color(n.color).offsetHSL(0, 0, -0.035).getHexString());
      M.exterior3 = crearMaterial(n.material, '#' + new THREE.Color(n.color).offsetHSL(0, 0, 0.04).getHexString());
      M.forro = crearMaterial('saten', n.interior);
      M.interior = crearMaterial('terciopelo', n.interior);
      // cinta de satén con un toque metálico: brillos largos en los dobleces (un color plano se ve de papel)
      M.cinta = crearMaterial('saten', n.cinta); M.cinta.color.multiplyScalar(0.86); M.cinta.metalness = 0.45; M.cinta.roughness = HAY_DOM ? 1.05 : 0.32; M.cinta.sheen = 0.55;
      M.oro = new THREE.MeshPhysicalMaterial({ color: 0xF1C46B, metalness: 1, roughness: 0.2 });
    }
    if (foil || colores || !M.foils) {
      for (const m of Object.values(M.foils || {})) viejos.push(m);
      M.foils = {};
      const hay = n.logo || !!n.grabado;
      for (const [k, f] of Object.entries(this.plan.foils || {})) {
        const tipoBase = f.base === 'exterior' ? n.material : f.base === 'forro' ? 'saten' : 'terciopelo', hex = f.base === 'exterior' ? n.color : n.interior;
        // en la bandeja la marca va siempre por delante y el grabado por detrás; en la tapa de afuera, solo el logo
        const grabado = f.dibujo === 'sello' ? '' : n.grabado, logo = n.logo;
        M.foils[k] = HAY_DOM && (logo || grabado) && hay ? materialFoil(f, tipoBase, hex, logo, grabado) : M[f.base];
      }
    }
    // la marca va en Bodoni Moda: si la fuente todavía no llegó, se redibuja el dorado cuando llegue
    if (HAY_DOM && document.fonts && !this.esperaFuente && Object.keys(M.foils).length && !document.fonts.check(`500 40px ${SERIF}`)) {
      this.esperaFuente = true;
      document.fonts.load(`500 40px ${SERIF}`).then(() => {
        if (this.plan && document.fonts.check(`500 40px 'Bodoni Moda'`)) { this.materiales(this.cfg, false, true); this.alCambiarPT?.(); }
      }).catch(() => {});
    }
    for (const malla of this.mallas || []) {
      const t = malla.userData.tramo;
      malla.material = t.startsWith('foil:') ? M.foils[t] || M.exterior : M[t] || M.exterior;
    }
    for (const m of viejos) if (!Object.values(M).includes(m) && !Object.values(M.foils).includes(m)) { if (m.userData.foil) for (const k of ['map', 'roughnessMap', 'normalMap', 'sheenColorMap']) m[k]?.dispose(); m.dispose(); }
    this.sucioPT = true;
  }

  // Apertura de 0 (cerrada) a 1: la tapa gira hasta ~105°, la de regalo sube y se inclina, la funda del cajón se corre
  ponerApertura(u, forzar = false) {
    if (!this.plan) return;
    u = limitar(Number.isFinite(u) ? u : 0, 0, 1);
    if (!forzar && Math.abs(u - this.apertura) < 1e-5) return;
    this.apertura = u;
    if (this.plan.pose) { const m = this.plan.pose(u); for (const o of this.moviles) { o.matrix.copy(m); o.matrixWorldNeedsUpdate = true; } }
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true);
    this.actualizarResultado();
    if (this.plan.abre) { this.sucioPT = true; this.alCambiarPT?.(); }
  }

  // Giro de la tornamesa (az, como Escenario3D.girar) y giro del trazador (giroPT: el de estudio.prepararPT, 0 sin escena).
  // Dentro (o como escenario) la caja sigue a la joya; al lado, sigue al escenario
  girar(az = 0, giroPT = az, forzar = false) {
    this.az = Number.isFinite(az) ? az : 0; this.giroPT = Number.isFinite(giroPT) ? giroPT : this.az;
    if (!this.plan) return;
    const sigue = this.plan.sigueJoya, r = sigue ? 0 : this.az, rPT = (sigue ? 0 : this.az) - this.giroPT;
    if (this.grupo.rotation.y !== r || forzar) { this.grupo.rotation.y = r; this.grupo.updateMatrixWorld(true); }
    if (this.grupoPT.rotation.y !== rPT || forzar) { this.grupoPT.rotation.y = rPT; this.grupoPT.updateMatrixWorld(true); this.sucioPT = true; }
    this.actualizarAnclas();
  }

  actualizarResultado() {
    const plan = this.plan, k = this.J.k, lim = new THREE.Box3(), cerr = new THREE.Box3();
    for (const pz of plan.piezas) for (const geo of pz.geos.values()) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      lim.union(geo.boundingBox.clone().applyMatrix4(matrizPieza(plan, pz, this.apertura)));
      cerr.union(geo.boundingBox.clone().applyMatrix4(matrizPieza(plan, pz, 0)));
    }
    const esc = 1 / k, r = this.resultado || (this.resultado = { grupo: this.grupo, grupoPT: this.grupoPT, anclas: {} });
    r.limites = new THREE.Box3(lim.min.clone().multiplyScalar(esc), lim.max.clone().multiplyScalar(esc));
    r.limitesCerrado = new THREE.Box3(cerr.min.clone().multiplyScalar(esc), cerr.max.clone().multiplyScalar(esc));
    r.base = plan.base * esc;
    let h = 0; for (const x of [r.limites.min.x, r.limites.max.x]) for (const z of [r.limites.min.z, r.limites.max.z]) h = Math.max(h, Math.hypot(x, z));
    r.huella = h;
    r.asiento = new THREE.Matrix4().makeTranslation(plan.asientoJoya.x * esc, plan.asientoJoya.y * esc, plan.asientoJoya.z * esc);
    r.sigueJoya = plan.sigueJoya; r.tipo = this.cfg.tipo; r.posicion = this.cfg.posicion; r.triangulos = this.triangulos;
    const tc = cerr.getSize(new THREE.Vector3());
    r.medidas = { ancho: +tc.x.toFixed(1), fondo: +tc.z.toFixed(1), alto: +tc.y.toFixed(1) };   // mm, cerrada
    if (plan.escenario) {
      const c = new THREE.Vector3(0, plan.escenario.alto, 0).applyMatrix4(plan.cajas[0].matriz).multiplyScalar(esc);
      r.suelo = c.y;
      r.escenario = { centro: c, ancho: plan.escenario.ancho * esc, fondo: plan.escenario.fondo * esc, cintas: { ancho: plan.escenario.cintas.w * esc, grosor: (plan.escenario.cintas.e + plan.escenario.cintas.gap) * esc } };
    } else { r.suelo = r.base; r.escenario = null; }
    this.actualizarAnclas();
  }

  // Anclas en tres marcos: punto/direccion (padre de grupo, motor rápido), puntoPT/direccionPT (padre de grupoPT) y
  // local/direccionLocal (marco de la joya, sin giro). En unidades del estudio
  actualizarAnclas() {
    const r = this.resultado, plan = this.plan; if (!r || !plan) return;
    const esc = 1 / this.J.k, an = {};
    const poner = (nombre, pLocal, dLocal) => {
      const loc = pLocal.clone().multiplyScalar(esc), dl = dLocal.clone().normalize();
      const ry = this.grupo.rotation.y, ryPT = this.grupoPT.rotation.y, Y = new THREE.Vector3(0, 1, 0);
      an[nombre] = {
        local: loc, direccionLocal: dl,
        punto: loc.clone().applyAxisAngle(Y, ry), direccion: dl.clone().applyAxisAngle(Y, ry),
        puntoPT: loc.clone().applyAxisAngle(Y, ryPT), direccionPT: dl.clone().applyAxisAngle(Y, ryPT),
      };
    };
    if (plan.anclaMono) {
      const m = plan.cajas[0].matriz.clone(); if (plan.pose) m.multiply(plan.pose(this.apertura));
      const p = plan.anclaMono.clone().applyMatrix4(m), d = new THREE.Vector3(0, 1, 0).transformDirection(m);
      poner('mono', p, d);
    }
    for (const [k, v] of Object.entries(plan.anclas || {})) poner(k, v, new THREE.Vector3(0, 1, 0));
    r.anclas = an;
  }

  limpiarMallas() {
    for (const g of [this.grupo, this.grupoPT]) for (const c of [...g.children]) { g.remove(c); c.traverse(o => { if (o.userData?.sombra) { o.material.alphaMap?.dispose(); o.material.dispose(); o.geometry.dispose(); } }); }
    if (this.plan) for (const p of this.plan.piezas) for (const geo of p.geos.values()) geo.dispose();
    this.mallas = []; this.moviles = []; this.plan = null;
  }
  // Luz de relleno de los materiales en el motor rápido (con escena: la sala del estudio, como el pedestal)
  ponerEntorno({ envMap = null, intensidad = 1, rotacion = null } = {}) {
    const lista = [...Object.entries(this.mats).filter(([k]) => k !== 'foils').map(([, m]) => m), ...Object.values(this.mats.foils || {})];
    for (const m of new Set(lista)) {
      if (!m?.isMaterial) continue;
      if (m.envMap !== envMap) { m.envMap = envMap; m.needsUpdate = true; }
      m.envMapIntensity = intensidad; if (rotacion) m.envMapRotation.copy(rotacion);
    }
  }
  vaciar() {
    this.limpiarMallas();
    const M = this.mats;
    for (const [k, m] of Object.entries(M)) if (k !== 'foils' && m?.dispose) m.dispose();
    for (const m of Object.values(M.foils || {})) if (m?.userData?.foil) { for (const k of ['map', 'roughnessMap', 'normalMap', 'sheenColorMap']) m[k]?.dispose(); m.dispose(); }
    this.mats = {}; this.claves = {}; this.resultado = null; this.apertura = -1;
    this.sucioPT = true;
  }
}

// (para las pruebas)
export const _interno = { medirJoya, planificar, matrizPieza, triangulos, torno, losa, contorno, cajasDePila, BISAGRA };
