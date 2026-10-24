// Analizador de videos de referencia (un reel de Instagram que la joyera quiere replicar): lee los cuadros del video, encuentra
// los cortes y sus transiciones, mide el movimiento de la cámara plano por plano, saca los colores de la escena y escoge
// fotogramas para que la IA mire la joya y el fondo. Todo pasa en el equipo: el video no se sube a ningún lado.
// Las cuentas son puras (sin DOM) y se exportan para probarlas en Node; leerCuadros, fotogramasClave y analizarVideo
// necesitan el navegador (un <video> y un lienzo).

export const FPS_ANALISIS = 10;     // cuadros por segundo que se miran (los cortes se afinan después al cuadro exacto)
export const ANCHO_ANALISIS = 160;  // ancho de la imagen de luminancia con la que se mide el movimiento
export const ANCHO_COLOR = 48;      // ancho de la imagen de color (histogramas, colores de la escena, dónde está la joya)
export const MAX_SEGUNDOS = 60;     // un video más largo se analiza solo hasta aquí (y se avisa)
const PLANO_MIN = 0.25;             // un plano dura al menos esto: dos cortes más cerca son uno solo

// Cuánto de la imagen ocupa la joya en la app con zoom 1 (la esfera que la envuelve llena el 92 % del ancho en 9:16;
// la silueta real es algo menor). Con esto se pasa del tamaño medido en el video a un zoom de la app.
export const TAM_ZOOM_1 = 0.78;
// Una vuelta de tornamesa: el frente de la pieza recorre su radio por cada radián. K corrige que, en promedio, los puntos
// visibles de una pieza 3D se mueven algo menos que el frente (se calibró con videos exportados desde la misma app).
export const K_GIRO = 1;
export const K_INCLINACION = 1;

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const r3 = x => Math.round(x * 1000) / 1000;
const r2 = x => Math.round(x * 100) / 100;
const oculto = (obj, k, v) => { Object.defineProperty(obj, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; };
const GRADOS = 180 / Math.PI;

function mediana(lista) {
  const n = lista.length; if (!n) return 0;
  const s = Float64Array.from(lista).sort(), m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentil(lista, p) {
  const n = lista.length; if (!n) return 0;
  const s = Float64Array.from(lista).sort(), x = limitar(p, 0, 1) * (n - 1), i = Math.floor(x), f = x - i;
  return i + 1 < n ? s[i] * (1 - f) + s[i + 1] * f : s[i];
}
const cancelar = cancelado => { if (cancelado?.()) throw new DOMException('Cancelado', 'AbortError'); };
const pausa = () => new Promise(r => setTimeout(r, 0));

// =====================================================================================================
// ---------- Cuadros (puro) ----------
// =====================================================================================================
// Un cuadro del análisis: { t, w, h, lum: Uint8Array(w·h), wc, hc, rgb: Uint8ClampedArray(wc·hc·3) }.
// datos: píxeles RGBA (canales = 4, lo que da getImageData) o RGB (canales = 3, lo que da ffmpeg en las pruebas).
export function cuadroDesdePixeles(datos, w, h, t, { canales = 4, anchoColor = ANCHO_COLOR } = {}) {
  const n = w * h, lum = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += canales) lum[i] = (54 * datos[j] + 183 * datos[j + 1] + 19 * datos[j + 2] + 128) >> 8;   // luma Rec. 709
  // la imagen de color sale promediando bloques (como un «área» al achicar): sin dientes ni ruido
  const wc = Math.min(anchoColor, w), hc = Math.max(1, Math.round(h * wc / w)), rgb = new Uint8ClampedArray(wc * hc * 3);
  for (let y = 0; y < hc; y++) {
    const y0 = Math.floor(y * h / hc), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / hc));
    for (let x = 0; x < wc; x++) {
      const x0 = Math.floor(x * w / wc), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / wc));
      let r = 0, g = 0, b = 0, k = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const j = (yy * w + xx) * canales; r += datos[j]; g += datos[j + 1]; b += datos[j + 2]; k++; }
      const o = (y * wc + x) * 3; rgb[o] = r / k; rgb[o + 1] = g / k; rgb[o + 2] = b / k;
    }
  }
  return { t, w, h, lum, wc, hc, rgb };
}

// Pirámide de la luminancia: nivel 0 (el cuadro), 1 (mitad), 2 (cuarto), 3 (octavo). Se guarda en un caché pequeño:
// los niveles finos de todos los cuadros de un minuto ocuparían cientos de MB.
function reducir(src, w, h) {
  const w2 = w >> 1, h2 = h >> 1, d = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const a = 2 * y * w, b = a + w;
    for (let x = 0; x < w2; x++) { const i = a + 2 * x, j = b + 2 * x; d[y * w2 + x] = (src[i] + src[i + 1] + src[j] + src[j + 1]) * 0.25; }
  }
  return { d, w: w2, h: h2 };
}
function integral({ d, w, h }) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) { fila += d[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + fila; }
  }
  return I;
}
const sumaRect = (I, w, x, y, bw, bh) => { const W = w + 1; return I[(y + bh) * W + x + bw] - I[y * W + x + bw] - I[(y + bh) * W + x] + I[y * W + x]; };

const cachePiramides = new Map();
function piramide(c) {
  let p = cachePiramides.get(c);
  if (p) { cachePiramides.delete(c); cachePiramides.set(c, p); return p; }   // (el Map recuerda el orden: lo usado va al final)
  const n0 = { d: c.lum, w: c.w, h: c.h }, n1 = reducir(n0.d, n0.w, n0.h), n2 = reducir(n1.d, n1.w, n1.h), n3 = reducir(n2.d, n2.w, n2.h);
  p = [n0, n1, n2, n3].map(n => ({ ...n, I: integral(n) }));
  cachePiramides.set(c, p);
  while (cachePiramides.size > 6) cachePiramides.delete(cachePiramides.keys().next().value);
  return p;
}
// los niveles gruesos (2 y 3) son chicos y se usan para los cortes: se guardan en el cuadro
function nivelesGruesos(c) {
  if (c._gruesos) return c._gruesos;
  const n1 = reducir(c.lum, c.w, c.h), n2 = reducir(n1.d, n1.w, n1.h), n3 = reducir(n2.d, n2.w, n2.h);
  return oculto(c, '_gruesos', [n2, n3]);
}

// =====================================================================================================
// ---------- Rasgos de cada cuadro (para los cortes) ----------
// =====================================================================================================
// Histograma de color conjunto 4×4×4 con reparto suave entre casillas vecinas (un color en el borde de una casilla no
// salta de una a otra con el ruido), brillo medio, cuánto es casi blanco o casi negro, y nitidez en x y en y.
export function rasgos(c) {
  if (c._rasgos) return c._rasgos;
  const { rgb, wc, hc, lum, w, h } = c, n = wc * hc, hist = new Float32Array(64);
  for (let i = 0; i < n; i++) {
    const p = [rgb[3 * i] / 255 * 3, rgb[3 * i + 1] / 255 * 3, rgb[3 * i + 2] / 255 * 3];
    const b0 = p.map(v => Math.min(2, Math.floor(v))), f = p.map((v, k) => v - b0[k]);
    for (let m = 0; m < 8; m++) {
      const dr = m & 1, dg = (m >> 1) & 1, db = (m >> 2) & 1;
      const peso = (dr ? f[0] : 1 - f[0]) * (dg ? f[1] : 1 - f[1]) * (db ? f[2] : 1 - f[2]);
      if (peso > 0) hist[(b0[0] + dr) * 16 + (b0[1] + dg) * 4 + b0[2] + db] += peso;
    }
  }
  for (let k = 0; k < 64; k++) hist[k] /= n;
  let suma = 0, blancos = 0, negros = 0, gx = 0, gy = 0;
  for (let i = 0; i < w * h; i++) { const v = lum[i]; suma += v; if (v > 232) blancos++; if (v < 24) negros++; }
  // nitidez: diferencia media entre vecinos (en x y en y) en la mitad del tamaño; un barrido borra la de x
  const { d, w: w1, h: h1 } = reducir(lum, w, h);
  for (let y = 1; y < h1 - 1; y++) for (let x = 1; x < w1 - 1; x++) { const i = y * w1 + x; gx += Math.abs(d[i + 1] - d[i - 1]); gy += Math.abs(d[i + w1] - d[i - w1]); }
  const m = (w1 - 2) * (h1 - 2);
  const [n2] = nivelesGruesos(c);
  let desv = 0; const media2 = n2.d.reduce((a, v) => a + v, 0) / n2.d.length;
  for (const v of n2.d) desv += Math.abs(v - media2);
  return oculto(c, '_rasgos', { hist, media: suma / (w * h), blancos: blancos / (w * h), negros: negros / (w * h), gx: gx / m, gy: gy / m, desv: desv / n2.d.length });
}

// Diferencia de colores entre dos cuadros (0 = mismos colores, 1 = nada en común)
function difHistograma(a, b) {
  const A = rasgos(a).hist, B = rasgos(b).hist;
  let s = 0; for (let k = 0; k < 64; k++) s += Math.abs(A[k] - B[k]);
  return s / 2;
}

// Diferencia de forma después de alinear (la mejor traslación): en un mismo plano, aunque la cámara se mueva, casi todo
// coincide; después de un corte no coincide nada aunque los colores sean los mismos (mismo fondo, otro encuadre).
// 0 = iguales; ~1 o más = sin relación.
export function residuoAlineado(a, b) {
  const [A2, A3] = nivelesGruesos(a), [B2, B3] = nivelesGruesos(b);
  // primero en el nivel 3 (±4 px = ±32 px del cuadro de análisis), luego se afina en el nivel 2
  const buscarEn = (A, B, cx, cy, r, m) => {
    const { w, h } = A; let mejor = Infinity, bx = 0, by = 0;
    let ma = 0, k = 0;
    for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) { ma += A.d[y * w + x]; k++; }
    ma /= k;
    for (let dy = cy - r; dy <= cy + r; dy++) for (let dx = cx - r; dx <= cx + r; dx++) {
      let mb = 0;
      for (let y = m; y < h - m; y++) { const fb = (y + dy) * w + dx; for (let x = m; x < w - m; x++) mb += B.d[fb + x]; }
      mb /= k;
      let s = 0;
      for (let y = m; y < h - m; y++) {
        const fa = y * w, fb = (y + dy) * w + dx;
        for (let x = m; x < w - m; x++) { const d = A.d[fa + x] - ma - B.d[fb + x] + mb; s += d < 0 ? -d : d; }
      }
      if (s < mejor) { mejor = s; bx = dx; by = dy; }
    }
    return { dx: bx, dy: by, err: mejor / k };
  };
  const g = buscarEn(A3, B3, 0, 0, 4, 4);
  const f = buscarEn(A2, B2, 2 * g.dx, 2 * g.dy, 1, 9);
  const ra = rasgos(a).desv, rb = rasgos(b).desv;
  return { residuo: f.err / ((ra + rb) / 2 + 2), dx: f.dx * 4, dy: f.dy * 4 };
}

// =====================================================================================================
// ---------- Cortes ----------
// =====================================================================================================
// Pares de cuadros seguidos: cuánto cambia el color y la forma, y el brillo/nitidez de cada cuadro
export function diferenciasCuadros(cuadros) {
  const pares = [];
  for (let i = 0; i + 1 < cuadros.length; i++) {
    const a = cuadros[i], b = cuadros[i + 1], ra = rasgos(a), rb = rasgos(b), al = residuoAlineado(a, b);
    pares.push({ i, t: b.t, hist: difHistograma(a, b), forma: al.residuo, brillo: Math.abs(rb.media - ra.media) / 255 });
  }
  return pares;
}

// Puntaje de cambio entre dos cuadros: el color o la forma, el que más diga
const puntaje = p => Math.max(1.7 * p.hist, 0.62 * p.forma);

// Cortes del video: [{ t, transicion: 'seco'|'flash'|'negro'|'barrido', confianza (0..1), zona: [t0, t1] }].
// t es el primer cuadro del plano nuevo (en un flash, el cuadro más blanco; en un fundido, el más oscuro). zona: los cuadros
// que tapa la transición (no sirven para medir el movimiento).
export function detectarCortes(cuadros, { planoMin = PLANO_MIN } = {}) {
  const n = cuadros.length;
  if (n < 3) return [];
  const R = cuadros.map(rasgos), pares = diferenciasCuadros(cuadros), s = pares.map(puntaje);
  const dt = (cuadros[n - 1].t - cuadros[0].t) / (n - 1) || 0.1;
  const candidatos = [];

  // 1) Destellos blancos y fundidos a negro: unos pocos cuadros mucho más claros (u oscuros) que lo que los rodea. El salto
  // se mide contra lo que queda por subir (o bajar): sobre el fondo perla de la marca un destello sube solo ~30 niveles
  // brillo y contraste de referencia a cada lado de i (sin los cuadros vecinos): el destello tiene que ser más claro que los
  // dos lados (entre un plano claro y uno oscuro, el claro no es un destello)
  const lado = (i, a, b) => { const v = [], d = []; for (let k = i + a; k <= i + b; k++) if (k >= 0 && k < n) { v.push(R[k].media); d.push(R[k].desv); } return v.length ? { media: mediana(v), desv: mediana(d) } : null; };
  const base = i => {
    const A = lado(i, -6, -3), B = lado(i, 3, 6), L = [A, B].filter(Boolean);
    if (!L.length) return { claro: R[i].media, oscuro: R[i].media, desv: R[i].desv };
    return { claro: Math.max(...L.map(x => x.media)), oscuro: Math.min(...L.map(x => x.media)), desv: Math.min(...L.map(x => x.desv)) };
  };
  const masClaro = (r, b, f = 1) => r.media - b.claro > Math.max(12, 0.4 * (255 - b.claro)) * f;
  const masOscuro = (r, b, f = 1) => b.oscuro - r.media > Math.max(20, 0.4 * b.oscuro) * f;
  const marcados = new Set();
  for (const tipo of ['flash', 'negro']) {
    for (let i = 0; i < n; i++) {
      if (marcados.has(i)) continue;
      const r = R[i], b = base(i);
      // un destello lava la imagen (casi blanca, sin contraste); un fundido la apaga
      const es = tipo === 'flash' ? masClaro(r, b) && (r.blancos > 0.5 || r.media > 200) && r.desv < 0.75 * b.desv + 2 : masOscuro(r, b) && r.media < 50 && r.negros > 0.5;
      if (!es) continue;
      // el grupo de cuadros seguidos con la misma transición (como mucho ~0,6 s)
      let j = i;
      while (j + 1 < n && !marcados.has(j + 1) && (tipo === 'flash' ? masClaro(R[j + 1], b, 0.6) : masOscuro(R[j + 1], b, 0.6) && R[j + 1].media < 70)) j++;
      if ((j - i + 1) * dt > 0.65) { i = j; continue; }   // un tramo largo blanco o negro no es una transición
      let pico = i;
      for (let k = i; k <= j; k++) if (tipo === 'flash' ? R[k].media > R[pico].media : R[k].media < R[pico].media) pico = k;
      // un fundido a negro al final (o al principio) del video no separa dos planos
      if (j >= n - 1 || i === 0) { for (let k = i; k <= j; k++) marcados.add(k); continue; }
      for (let k = i; k <= j; k++) marcados.add(k);
      // ¿cambió el plano? (los cuadros justo antes y después del destello)
      const antes = cuadros[Math.max(0, i - 1)], despues = cuadros[Math.min(n - 1, j + 1)];
      const cambio = Math.max(1.7 * difHistograma(antes, despues), 0.62 * residuoAlineado(antes, despues).residuo);
      candidatos.push({ k: pico, t: cuadros[pico].t, transicion: tipo, confianza: limitar(0.55 + cambio, 0.5, 1), zona: [cuadros[Math.max(0, i - 1)].t, cuadros[Math.min(n - 1, j + 1)].t], ini: i, fin: j });
    }
  }

  // 1b) Destellos (o fundidos) que el muestreo no alcanza: si el flash cae entre dos cuadros mirados, el que sigue muestra el
  // plano nuevo apenas lavado (~20 % de blanco) y el corte parece un movimiento rápido (dos pares seguidos que cambian
  // mucho). Un cuadro más claro (u oscuro) que sus dos vecinos, sin más contraste, entre dos cuadros de planos distintos, es
  // la cola de la transición. El instante exacto lo busca refinarCorte con los cuadros seguidos del video.
  const saltoEntre = (a, c) => Math.max(1.7 * difHistograma(a, c), 0.62 * residuoAlineado(a, c).residuo);
  for (let i = 1; i + 1 < n; i++) {
    if (marcados.has(i - 1) || marcados.has(i) || marcados.has(i + 1)) continue;
    const r = R[i], A = R[i - 1], C = R[i + 1], claro = Math.max(A.media, C.media), oscuro = Math.min(A.media, C.media);
    const sinContraste = r.desv <= Math.max(A.desv, C.desv) + 1;
    const lavado = r.media - claro > Math.max(8, 0.1 * (255 - claro)) && r.blancos >= Math.max(A.blancos, C.blancos) - 0.005;
    const apagado = oscuro - r.media > Math.max(10, 0.15 * oscuro) && r.negros >= Math.max(A.negros, C.negros) - 0.005;
    if (!sinContraste || !(lavado || apagado)) continue;
    // los dos pares cambian (el de antes y el de después del cuadro lavado) y los dos lados son planos distintos
    if (Math.min(s[i - 1], s[i]) < 0.25) continue;
    const vecinos = [];
    for (let q = i - 5; q <= i + 4; q++) if ((q < i - 1 || q > i) && q >= 0 && q + 1 < n && !marcados.has(q) && !marcados.has(q + 1)) vecinos.push(s[q]);
    const fondo = vecinos.length ? percentil(vecinos, 0.7) : 0, salto = saltoEntre(cuadros[i - 1], cuadros[i + 1]);
    if (salto < Math.max(0.3, 2 * fondo + 0.1)) continue;
    marcados.add(i);
    candidatos.push({ k: i, t: cuadros[i].t, transicion: lavado ? 'flash' : 'negro', confianza: limitar(0.45 + salto - fondo, 0.4, 0.9), zona: [cuadros[i - 1].t, cuadros[i + 1].t], ini: i, fin: i });
  }

  // 2) Barridos: uno o dos cuadros borrosos (mucho menos nítidos que los de los dos lados) entre dos planos distintos. El
  // cambio queda repartido en dos pares de cuadros, así que se compara el cuadro de antes con el de después
  const nitidez = k => R[k].gx + R[k].gy;
  for (let i = 1; i + 1 < n; i++) {
    if (marcados.has(i) || marcados.has(i - 1)) continue;
    let j = i;
    if (j + 2 < n && nitidez(j + 1) < 0.65 * nitidez(j + 2) && nitidez(j + 1) < 0.65 * nitidez(i - 1)) j++;   // dos cuadros borrosos
    if (j + 1 >= n || marcados.has(j + 1)) continue;
    const ref = Math.min(nitidez(i - 1), nitidez(j + 1)), borr = Math.max(...Array.from({ length: j - i + 1 }, (_, q) => nitidez(i + q)));
    if (!(borr < 0.65 * ref)) continue;
    const a = cuadros[i - 1], c = cuadros[j + 1];
    const salto = Math.max(1.7 * difHistograma(a, c), 0.62 * residuoAlineado(a, c).residuo);
    // el salto entre los dos lados tiene que ser el de un corte (y no el de un paneo rápido que se puede alinear)
    const vecinos = [];
    for (let q = i - 5; q <= j + 5; q++) if ((q < i - 1 || q > j) && q >= 0 && q + 1 < n && !marcados.has(q) && !marcados.has(q + 1)) vecinos.push(s[q]);
    const fondo = vecinos.length ? percentil(vecinos, 0.7) : 0;
    if (salto < Math.max(0.3, 2 * fondo + 0.1)) continue;
    // el corte: el primer cuadro borroso que ya muestra el plano nuevo (el que más se parece al cuadro de después)
    let k = i;
    for (let q = i; q <= j; q++) { const ra = residuoAlineado(cuadros[q], a).residuo, rc = residuoAlineado(cuadros[q], c).residuo; if (rc <= ra) { k = q; break; } k = q + 1; }
    for (let q = i; q <= j; q++) marcados.add(q);
    candidatos.push({ k, t: cuadros[k].t, transicion: 'barrido', confianza: limitar(0.5 + salto - fondo, 0.5, 1), zona: [a.t, c.t], ini: i, fin: j });
  }

  // 3) Cortes de imagen: un salto aislado (mucho mayor que lo de alrededor). Un paneo rápido cambia mucho varios cuadros
  // seguidos; un corte, uno solo.
  for (let i = 0; i < pares.length; i++) {
    const k = i + 1;   // primer cuadro del plano nuevo
    if (marcados.has(i) || marcados.has(k)) continue;
    const v = s[i];
    const vecinos = [];
    for (let j = i - 4; j <= i + 4; j++) if (j !== i && j >= 0 && j < pares.length && !marcados.has(j) && !marcados.has(j + 1)) vecinos.push(s[j]);
    const fondo = vecinos.length ? percentil(vecinos, 0.7) : 0;
    const cerca = Math.max(i > 0 ? s[i - 1] : 0, i + 1 < s.length ? s[i + 1] : 0);
    const umbral = Math.max(0.42, 2.2 * fondo + 0.12);
    if (v < umbral) continue;
    if (v < 1.6 * cerca && v < 0.9) continue;   // no es un pico aislado: movimiento rápido
    candidatos.push({ k, t: cuadros[k].t, transicion: 'seco', confianza: limitar((v - umbral) / umbral + 0.5, 0.3, 1), zona: [cuadros[i].t, cuadros[k].t], ini: k, fin: k, puntaje: v });
  }

  // un corte seco con el cuadro de un lado más borroso que los de su propio plano también es un barrido (cada lado se
  // compara con su plano: el plano nuevo puede ser un macro mucho más nítido que el anterior, y eso no es un barrido)
  for (const c of candidatos) {
    if (c.transicion !== 'seco') continue;
    const lado = (ks) => mediana(ks.filter(k => k >= 0 && k < n).map(nitidez));
    const refViejo = lado([c.k - 4, c.k - 3, c.k - 2]), refNuevo = lado([c.k + 1, c.k + 2, c.k + 3]);
    const borroViejo = c.k - 1 >= 0 && refViejo > 0 && nitidez(c.k - 1) < 0.62 * refViejo;
    const borroNuevo = refNuevo > 0 && nitidez(c.k) < 0.62 * refNuevo;
    if (borroViejo || borroNuevo) {
      c.transicion = 'barrido';
      c.zona = [cuadros[Math.max(0, c.k - (borroViejo ? 2 : 1))].t, cuadros[Math.min(n - 1, c.k + (borroNuevo ? 1 : 0))].t];
    }
  }

  // 4) Planos de al menos planoMin: entre dos cortes muy juntos queda el más seguro
  candidatos.sort((a, b) => a.t - b.t);
  const cortes = [];
  for (const c of candidatos) {
    if (c.t - cuadros[0].t < planoMin * 0.999 || cuadros[n - 1].t - c.t < planoMin * 0.5) continue;
    const ult = cortes[cortes.length - 1];
    if (ult && c.t - ult.t < planoMin * 0.999) { if (prioridad(c) > prioridad(ult)) cortes[cortes.length - 1] = c; continue; }
    cortes.push(c);
  }
  return cortes.map(c => ({ t: r3(c.t), transicion: c.transicion, confianza: r2(c.confianza), zona: [r3(c.zona[0]), r3(c.zona[1])] }));
}
const prioridad = c => (c.transicion === 'seco' || c.transicion === 'barrido' ? 0 : 0.5) + c.confianza;

// Afina un corte con cuadros más seguidos (todos los del video entre el último cuadro del plano viejo y el primero del nuevo):
// el instante exacto (el cuadro con el mayor salto, el más blanco o el más oscuro) y si había un destello que el muestreo
// a 10 cuadros por segundo no alcanzó a ver. densos: cuadros ordenados que incluyen los dos extremos.
export function refinarCorte(corte, densos) {
  if (!Array.isArray(densos) || densos.length < 3) return corte;
  const R = densos.map(rasgos), primero = R[0], ultimo = R[R.length - 1];
  const ref = Math.max(primero.media, ultimo.media), refN = Math.min(primero.media, ultimo.media);
  let blanco = -1, negro = -1;
  for (let k = 1; k < densos.length - 1; k++) {
    if (R[k].media - ref > 30 && (R[k].blancos > 0.2 || R[k].media > 195) && (blanco < 0 || R[k].media > R[blanco].media)) blanco = k;
    if (refN - R[k].media > 30 && R[k].media < 45 && (negro < 0 || R[k].media < R[negro].media)) negro = k;
  }
  const nuevo = { ...corte };
  if (blanco > 0 && corte.transicion !== 'negro') { nuevo.transicion = 'flash'; nuevo.t = r3(densos[blanco].t); return nuevo; }
  if (negro > 0 && corte.transicion !== 'flash') { nuevo.transicion = 'negro'; nuevo.t = r3(densos[negro].t); return nuevo; }
  if (corte.transicion === 'flash' || corte.transicion === 'negro') return nuevo;
  // corte seco o barrido: el par con el mayor cambio; el corte es el primer cuadro del plano nuevo
  let mejor = -1, k = 0;
  for (let i = 0; i + 1 < densos.length; i++) { const v = Math.max(1.7 * difHistograma(densos[i], densos[i + 1]), 0.62 * residuoAlineado(densos[i], densos[i + 1]).residuo); if (v > mejor) { mejor = v; k = i + 1; } }
  nuevo.t = r3(densos[k].t);
  return nuevo;
}

// =====================================================================================================
// ---------- Dónde está la joya (lo que sobresale del fondo) ----------
// =====================================================================================================
// Los colores del borde del cuadro son el fondo (pared, pedestal, piso): se agrupan en 3 colores. Lo que se aleja de todos
// ellos (en color, sin contar mucho las sombras) o tiene mucho detalle fino es la pieza.
// Devuelve { x, y (centro, 0..1), w, h (caja, 0..1), tam (lado mayor / lado menor del cuadro), llena, masa } o null.
export function objetoEn(c) {
  if (c._objeto !== undefined) return c._objeto;
  const { rgb, wc, hc, lum, w, h } = c, n = wc * hc;
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2], y = 0.299 * r + 0.587 * g + 0.114 * b;
    Y[i] = y; Cb[i] = b - y; Cr[i] = r - y;
  }
  // detalle fino: cuánto varía la luminancia dentro de cada píxel de la imagen de color
  const det = new Float32Array(n), sx = w / wc, sy = h / hc;
  for (let yy = 0; yy < hc; yy++) for (let xx = 0; xx < wc; xx++) {
    const x0 = Math.floor(xx * sx), x1 = Math.max(x0 + 2, Math.floor((xx + 1) * sx)), y0 = Math.floor(yy * sy), y1 = Math.max(y0 + 2, Math.floor((yy + 1) * sy));
    let s = 0, k = 0;
    for (let y = y0; y < Math.min(y1, h - 1); y++) for (let x = x0; x < Math.min(x1, w - 1); x++) { const i = y * w + x; s += Math.abs(lum[i + 1] - lum[i]) + Math.abs(lum[i + w] - lum[i]); k++; }
    det[yy * wc + xx] = k ? s / k : 0;
  }
  // borde: dos píxeles alrededor
  const borde = [];
  for (let yy = 0; yy < hc; yy++) for (let xx = 0; xx < wc; xx++) if (xx < 2 || yy < 2 || xx >= wc - 2 || yy >= hc - 2) borde.push(yy * wc + xx);
  // k-medias (3 grupos) en (Y/2, Cb, Cr)
  const dist = (i, cc) => { const dy = (Y[i] - cc[0]) * 0.5, db = Cb[i] - cc[1], dr = Cr[i] - cc[2]; return dy * dy + db * db + dr * dr; };
  let centros = [0, Math.floor(borde.length / 3), Math.floor(2 * borde.length / 3)].map(k => [Y[borde[k]], Cb[borde[k]], Cr[borde[k]]]);
  for (let it = 0; it < 6; it++) {
    const acc = centros.map(() => [0, 0, 0, 0]);
    for (const i of borde) { let m = 0, dm = Infinity; centros.forEach((cc, k) => { const d = dist(i, cc); if (d < dm) { dm = d; m = k; } }); const a = acc[m]; a[0] += Y[i]; a[1] += Cb[i]; a[2] += Cr[i]; a[3]++; }
    centros = centros.map((cc, k) => acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : cc);
  }
  const dc = new Float32Array(n);
  for (let i = 0; i < n; i++) { let dm = Infinity; for (const cc of centros) dm = Math.min(dm, dist(i, cc)); dc[i] = Math.sqrt(dm); }
  // escala de "normal" según el borde (mediana y desviación robusta), para color y detalle
  const escala = arr => { const v = borde.map(i => arr[i]), m = mediana(v), d = mediana(v.map(x => Math.abs(x - m))) * 1.4826; return [m, Math.max(d, 1.5)]; };
  const [mc, sc] = escala(dc), [md, sd] = escala(det);
  const sal = new Float32Array(n);
  for (let i = 0; i < n; i++) sal[i] = Math.max((dc[i] - mc) / sc / 4, (det[i] - md) / sd / 6);
  // se queda lo que sobresale con claridad y tiene vecinos que también (fuera los píxeles sueltos)
  const peso = new Float32Array(n);
  let masa = 0;
  for (let yy = 1; yy < hc - 1; yy++) for (let xx = 1; xx < wc - 1; xx++) {
    const i = yy * wc + xx; if (sal[i] < 1) continue;
    let v = 0; for (const o of [-1, 1, -wc, wc]) if (sal[i + o] >= 1) v++;
    if (v >= 2) { peso[i] = Math.min(3, sal[i]); masa += peso[i]; }
  }
  // ¿la pieza llena el cuadro? (macro: el borde mismo tiene mucho detalle)
  const detBorde = mediana(borde.map(i => det[i]));
  const llena = detBorde > 9;
  if (masa < n * 0.004) return oculto(c, '_objeto', llena ? { x: 0.5, y: 0.5, w: 1, h: 1, tam: Math.max(w, h) / Math.min(w, h), llena: true, masa: 0 } : null);
  let mx = 0, my = 0;
  const xs = [], ys = [], ps = [];
  for (let i = 0; i < n; i++) if (peso[i] > 0) { const x = (i % wc + 0.5) / wc, y = (Math.floor(i / wc) + 0.5) / hc; mx += x * peso[i]; my += y * peso[i]; xs.push(x); ys.push(y); ps.push(peso[i]); }
  mx /= masa; my /= masa;
  const pctPeso = (vals, p) => {
    const orden = vals.map((v, k) => [v, ps[k]]).sort((a, b) => a[0] - b[0]);
    let acc = 0; const meta = p * masa;
    for (const [v, q] of orden) { acc += q; if (acc >= meta) return v; }
    return orden[orden.length - 1][0];
  };
  const x0 = pctPeso(xs, 0.03), x1 = pctPeso(xs, 0.97), y0 = pctPeso(ys, 0.03), y1 = pctPeso(ys, 0.97);
  const bw = Math.max(1 / wc, x1 - x0 + 1 / wc), bh = Math.max(1 / hc, y1 - y0 + 1 / hc);
  const tam = Math.max(bw * w, bh * h) / Math.min(w, h);
  const obj = { x: r3(mx), y: r3(my), cx: r3((x0 + x1) / 2), cy: r3((y0 + y1) / 2), w: r3(bw), h: r3(bh), tam: r3(tam), llena: llena || bw * bh > 0.7, masa: r3(masa / n) };
  oculto(obj, 'peso', { d: peso, w: wc, h: hc });   // dónde está la pieza, píxel a píxel (en la imagen de color)
  return oculto(c, '_objeto', obj);
}

// =====================================================================================================
// ---------- Movimiento entre dos cuadros ----------
// =====================================================================================================
// Bloques con textura en las dos direcciones (en una superficie lisa o en una raya sola el bloque «encaja» en cualquier lado)
function texturaBloque(N, x, y, b) {
  const { d, w } = N; let sxx = 0, syy = 0, sxy = 0;
  for (let j = 1; j < b - 1; j++) for (let i = 1; i < b - 1; i++) {
    const k = (y + j) * w + x + i, gx = (d[k + 1] - d[k - 1]) / 2, gy = (d[k + w] - d[k - w]) / 2;
    sxx += gx * gx; syy += gy * gy; sxy += gx * gy;
  }
  const m = (b - 2) * (b - 2), a = sxx / m, c = syy / m, e = sxy / m;
  return (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + e * e);   // el valor propio menor del tensor de estructura
}

const bufSad = new Float64Array(15 * 15);
// Dónde quedó en B el bloque de A (esquina x, y; lado b), buscando ±r alrededor de (px, py). Compara sin el brillo medio
// de cada bloque (un cambio de luz no es movimiento). Devuelve el desplazamiento con decimales (parábola en el mínimo).
function buscarBloque(NA, NB, x, y, b, px, py, r) {
  const { d: A, w, h } = NA, B = NB.d, n = b * b, ma = sumaRect(NA.I, w, x, y, b, b) / n;
  const cx = Math.round(px), cy = Math.round(py), lado = 2 * r + 1;
  let mejor = Infinity, mi = -1;
  for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) {
    const bx = x + cx - r + i, by = y + cy - r + j;
    if (bx < 0 || by < 0 || bx + b > w || by + b > h) { bufSad[j * lado + i] = Infinity; continue; }
    const k = sumaRect(NB.I, w, bx, by, b, b) / n - ma;
    let s = 0;
    for (let yy = 0; yy < b; yy++) {
      const fa = (y + yy) * w + x, fb = (by + yy) * w + bx;
      for (let xx = 0; xx < b; xx++) { const dd = A[fa + xx] - B[fb + xx] + k; s += dd < 0 ? -dd : dd; }
    }
    bufSad[j * lado + i] = s;
    if (s < mejor) { mejor = s; mi = j * lado + i; }
  }
  if (mi < 0) return null;
  const i = mi % lado, j = Math.floor(mi / lado);
  if (i === 0 || j === 0 || i === lado - 1 || j === lado - 1) return null;   // en el borde de la búsqueda: el bloque se fue más lejos
  const sub = (a, c, e) => { const den = a - 2 * c + e; return den > 1e-9 && Number.isFinite(den) ? limitar(0.5 * (a - e) / den, -0.5, 0.5) : 0; };
  const ox = sub(bufSad[mi - 1], mejor, bufSad[mi + 1]), oy = sub(bufSad[mi - lado], mejor, bufSad[mi + lado]);
  // qué tan claro es el mínimo: promedio de los vecinos a 2 px contra el mejor
  let vec = 0, kv = 0;
  for (const [a, c] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) { const ii = i + a, jj = j + c; if (ii >= 0 && jj >= 0 && ii < lado && jj < lado && Number.isFinite(bufSad[jj * lado + ii])) { vec += bufSad[jj * lado + ii]; kv++; } }
  const claridad = kv ? (vec / kv) / Math.max(mejor, n * 0.5) : 1;
  return { dx: cx - r + i + ox, dy: cy - r + j + oy, err: mejor / n, claridad };
}

// Traslación de una región entera (búsqueda completa en un nivel grueso): punto de partida de los bloques
function traslacionRegion(NA, NB, dentro, r, cx = 0, cy = 0) {
  const { d: A, w, h } = NA, B = NB.d;
  let ma = 0, k = 0;
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) if (dentro(x / w, y / h)) { ma += A[y * w + x]; k++; }
  if (k < 12) return null;
  ma /= k;
  let mejor = Infinity, bx = 0, by = 0;
  for (let dy = cy - r; dy <= cy + r; dy++) for (let dx = cx - r; dx <= cx + r; dx++) {
    let mb = 0, s = 0;
    for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) if (dentro(x / w, y / h)) { const yy = limitar(y + dy, 0, h - 1), xx = limitar(x + dx, 0, w - 1); mb += B[yy * w + xx]; }
    mb /= k;
    for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) if (dentro(x / w, y / h)) {
      const yy = limitar(y + dy, 0, h - 1), xx = limitar(x + dx, 0, w - 1), dd = A[y * w + x] - ma - B[yy * w + xx] + mb;
      s += dd < 0 ? -dd : dd;
    }
    if (s < mejor) { mejor = s; bx = dx; by = dy; }
  }
  return { dx: bx, dy: by };
}

// Ajuste robusto (mínimos cuadrados con pesos de Tukey) de un movimiento afín: u = a0 + a1·x + a2·y, v = b0 + b1·x + b2·y,
// con x, y medidos desde el centro del cuadro. puntos: [{ x, y, u, v, p (peso) }]
export function ajusteAfin(puntos, { iteraciones = 6, similitud = false } = {}) {
  const P = puntos.filter(q => esNum(q.u) && esNum(q.v));
  if (P.length < (similitud ? 3 : 4)) return null;
  // se parte de la traslación mediana (no la arrastra un grupo que se mueve distinto, mientras sea menos de la mitad)
  let sol = { a: [mediana(P.map(q => q.u)), 0, 0], b: [mediana(P.map(q => q.v)), 0, 0] }, pesos = null, escala = 1;
  for (let it = 0; it <= iteraciones; it++) {
    const res = P.map(q => { const [u, v] = evaluarAfin(sol, q.x, q.y); return Math.hypot(u - q.u, v - q.v); });
    escala = Math.max(0.2, 1.4826 * mediana(res));
    const c = 4.685 * escala;
    pesos = P.map((q, k) => { const r = res[k] / c; return r >= 1 ? 0 : (q.p ?? 1) * (1 - r * r) ** 2; });
    if (it === iteraciones) break;
    const nueva = similitud ? resolverSimilitud(P, pesos) : resolverAfin(P, pesos);
    if (!nueva) return it ? { ...sol, n: pesos.filter(p => p > 0.05).length, total: P.length, error: escala } : null;
    sol = nueva;
  }
  const buenos = pesos.filter(p => p > 0.05).length;
  return { ...sol, n: buenos, total: P.length, error: escala };
}
export const evaluarAfin = (s, x, y) => [s.a[0] + s.a[1] * x + s.a[2] * y, s.b[0] + s.b[1] * x + s.b[2] * y];

function resolver3(M, v) {
  // eliminación de Gauss con pivote para un sistema 3×3 (o 4×4)
  const n = v.length, A = M.map((f, i) => [...f, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let f = c + 1; f < n; f++) if (Math.abs(A[f][c]) > Math.abs(A[p][c])) p = f;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let f = 0; f < n; f++) if (f !== c) { const k = A[f][c] / A[c][c]; for (let j = c; j <= n; j++) A[f][j] -= k * A[c][j]; }
  }
  return A.map((f, i) => f[n] / f[i]);
}
function resolverAfin(P, pesos) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], vu = [0, 0, 0], vv = [0, 0, 0];
  P.forEach((q, k) => {
    const w = pesos[k]; if (!(w > 0)) return;
    const f = [1, q.x, q.y];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += w * f[i] * f[j]; vu[i] += w * f[i] * q.u; vv[i] += w * f[i] * q.v; }
  });
  // un poco de regularización: con puntos casi alineados la escala no se dispara
  for (let i = 1; i < 3; i++) M[i][i] += 1e-3 * (M[0][0] || 1) * 25;
  const a = resolver3(M, vu), b = resolver3(M, vv);
  return a && b ? { a, b } : null;
}
function resolverSimilitud(P, pesos) {
  // u = tx + p·x − q·y ; v = ty + q·x + p·y
  const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0];
  P.forEach((q, k) => {
    const w = pesos[k]; if (!(w > 0)) return;
    for (const [f, o] of [[[1, 0, q.x, -q.y], q.u], [[0, 1, q.y, q.x], q.v]]) {
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) M[i][j] += w * f[i] * f[j]; v[i] += w * f[i] * o; }
    }
  });
  for (let i = 2; i < 4; i++) M[i][i] += 1e-3 * (M[0][0] || 1) * 25;
  const s = resolver3(M, v);
  return s ? { a: [s[0], s[2], -s[3]], b: [s[1], s[3], s[2]] } : null;
}
// Escala (en x y en y) y giro de la imagen de un ajuste afín
export function descomponer(s) {
  const a11 = 1 + s.a[1], a12 = s.a[2], a21 = s.b[1], a22 = 1 + s.b[2];
  return { sx: a11, sy: a22, escala: Math.sqrt(Math.max(1e-6, a11 * a22 - a12 * a21)), rot: Math.atan2(a21 - a12, a11 + a22) * GRADOS };
}

// Umbral de textura (valor propio menor, en niveles² de luminancia): por debajo, el bloque es liso o una raya
const TEXTURA_MIN = 6;

// Afinado subpíxel de un bloque (Lucas-Kanade): la parábola sobre el SAD se «pega» a los píxeles enteros y un zoom o un
// giro lento (décimas de píxel por cuadro) se mediría de menos. Parte del desplazamiento entero y corrige con los gradientes.
function refinarLK(NA, NB, x, y, b, dx, dy) {
  const { d: A, w, h } = NA, B = NB.d;
  let sxx = 0, syy = 0, sxy = 0;
  const gx = new Float32Array(b * b), gy = new Float32Array(b * b);
  for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) {
    const xx = limitar(x + i, 1, w - 2), yy = limitar(y + j, 1, h - 2), k = yy * w + xx;
    const a = (A[k + 1] - A[k - 1]) / 2, c = (A[k + w] - A[k - w]) / 2;
    gx[j * b + i] = a; gy[j * b + i] = c; sxx += a * a; syy += c * c; sxy += a * c;
  }
  const det = sxx * syy - sxy * sxy;
  if (det < 1e-6) return { dx, dy };
  let ux = dx, uy = dy;
  for (let it = 0; it < 4; it++) {
    // diferencia (sin el brillo medio) con B muestreada en (p + u) por interpolación bilineal
    let ex = 0, ey = 0, mA = 0, mB = 0;
    const res = new Float32Array(b * b);
    for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) {
      const px = x + i + ux, py = y + j + uy;
      if (px < 0 || py < 0 || px > w - 1.001 || py > h - 1.001) return { dx, dy };
      const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0, k = y0 * w + x0;
      const v = (B[k] * (1 - fx) + B[k + 1] * fx) * (1 - fy) + (B[k + w] * (1 - fx) + B[k + w + 1] * fx) * fy;
      res[j * b + i] = v; mB += v; mA += A[(y + j) * w + x + i];
    }
    const k0 = (mB - mA) / (b * b);
    for (let j = 0; j < b; j++) for (let i = 0; i < b; i++) {
      const e = res[j * b + i] - A[(y + j) * w + x + i] - k0, q = j * b + i;
      ex += gx[q] * e; ey += gy[q] * e;
    }
    const ddx = -(syy * ex - sxy * ey) / det, ddy = -(sxx * ey - sxy * ex) / det;
    if (!Number.isFinite(ddx) || !Number.isFinite(ddy) || Math.hypot(ddx, ddy) > 1.5) return { dx, dy };
    ux += ddx; uy += ddy;
    if (Math.hypot(ddx, ddy) < 0.01) break;
  }
  if (Math.abs(ux - dx) > 1 || Math.abs(uy - dy) > 1) return { dx, dy };
  return { dx: ux, dy: uy };
}

// Movimiento entre los cuadros a y b. Los vectores de los bloques se separan en «capas» que se mueven distinto: la principal
// y, si sobra un grupo grande que va por su lado, una segunda. La pieza es la capa más cerca del centro de la pieza; la otra,
// el fondo. caja: dónde está la pieza en a ({ x0, y0, x1, y1 } en 0..1) o null; centro: { x, y } de la pieza (0..1).
// Devuelve { pieza, fondo, todo, capas, n } (ajustes afines en píxeles del nivel 0, medidos desde el centro del cuadro;
// fondo = null si el fondo no tiene textura para medir). radioPieza: medio ancho y medio alto de la capa de la pieza (px).
export function movimientoEntre(a, b, caja = null, centro = null) {
  const PA = piramide(a), PB = piramide(b), w0 = a.w, h0 = a.h;
  const enCaja = caja ? (x, y) => x >= caja.x0 && x <= caja.x1 && y >= caja.y0 && y <= caja.y1 : () => true;
  const fuera = caja ? (x, y) => !enCaja(x, y) : () => false;
  // 1) traslación gruesa de cada región en el nivel 3 (±4 = ±32 px), afinada en el nivel 2
  const gruesa = dentro => {
    const t3 = traslacionRegion(PA[3], PB[3], dentro, 4); if (!t3) return null;
    const t2 = traslacionRegion(PA[2], PB[2], dentro, 1, 2 * t3.dx, 2 * t3.dy);
    return t2 ? { dx: t2.dx * 4, dy: t2.dy * 4 } : { dx: t3.dx * 8, dy: t3.dy * 8 };
  };
  const g = { centro: gruesa(enCaja), fondo: caja ? gruesa(fuera) : null };
  // 2) bloques en el nivel 1 (8×8 cada 6 px), guiados por la traslación de su región; 3) se afinan en el nivel 0 (16×16)
  const N1 = PA[1], b1 = 8, paso = 6, vectores = [];
  for (let y = 3; y + b1 + 3 <= N1.h; y += paso) for (let x = 3; x + b1 + 3 <= N1.w; x += paso) {
    // (la franja del borde cuenta como fondo aunque la caja de la pieza llegue hasta ahí: si se mueve junto con todo, es la cámara)
    const ux = (x + b1 / 2) / N1.w, uy = (y + b1 / 2) / N1.h, borde = ux < 0.12 || ux > 0.88 || uy < 0.08 || uy > 0.92;
    const region = enCaja(ux, uy) && !borde ? 'centro' : 'fondo';
    if (texturaBloque(N1, x, y, b1) < TEXTURA_MIN * 0.7) continue;
    // se prueba la predicción de su región y, si no encaja, la de la otra (la pieza puede moverse distinto que el fondo)
    let v1 = null;
    for (const pred of [g[region], g[region === 'centro' ? 'fondo' : 'centro'], { dx: 0, dy: 0 }]) {
      if (!pred) continue;
      const v = buscarBloque(N1, PB[1], x, y, b1, pred.dx / 2, pred.dy / 2, 3);
      if (v && v.claridad >= 1.15 && (!v1 || v.err < v1.err)) v1 = v;
      if (v1 && v1.err < 2.5) break;
    }
    if (!v1) continue;
    const x0 = 2 * x, y0 = 2 * y, b0 = 16;
    if (texturaBloque(PA[0], x0, y0, b0) < TEXTURA_MIN) continue;
    const v0 = buscarBloque(PA[0], PB[0], x0, y0, b0, 2 * v1.dx, 2 * v1.dy, 2);
    if (!v0 || v0.claridad < 1.1) continue;
    const f = refinarLK(PA[0], PB[0], x0, y0, b0, Math.round(v0.dx), Math.round(v0.dy));
    vectores.push({ x: x0 + b0 / 2 - w0 / 2, y: y0 + b0 / 2 - h0 / 2, u: f.dx, v: f.dy, p: Math.min(3, v0.claridad - 1), region });
  }
  const ajustar = v => (v.length >= 6 ? ajusteAfin(v, { similitud: v.length < 12 }) : null);
  const vacio = { pieza: null, fondo: null, todo: null, capas: 0, n: vectores.length, vectores };
  let M1 = ajustar(vectores);
  if (!M1) return vacio;
  const dist = (v, M) => { const [u, w] = evaluarAfin(M, v.x, v.y); return Math.hypot(u - v.u, w - v.v); };
  // la capa principal se vuelve a ajustar solo con los suyos: un grupo que se mueve distinto (la pieza girando) no la arrastra
  let umbral = Math.max(0.4, 2.5 * M1.error);
  for (let it = 0; it < 2; it++) {
    const suyos = vectores.filter(v => dist(v, M1) <= umbral);
    if (suyos.length < 6 || suyos.length === vectores.length) break;
    const M = ajustar(suyos); if (!M) break;
    M1 = M; umbral = Math.max(0.4, 2.5 * M1.error);
  }
  const resto = vectores.filter(v => dist(v, M1) > umbral);
  let M2 = null;
  if (resto.length >= Math.max(6, 0.1 * vectores.length)) {
    M2 = ajustar(resto);
    // tiene que ser una capa de verdad: varios bloques que se explican juntos y se mueven claramente distinto de la principal
    if (M2) {
      const propios = resto.filter(v => dist(v, M2) <= Math.max(0.45, 2.5 * M2.error));
      const separacion = mediana(propios.map(v => Math.hypot(...evaluarAfin(M1, v.x, v.y).map((q, k) => q - evaluarAfin(M2, v.x, v.y)[k]))));
      if (propios.length < 6 || separacion < 0.6) M2 = null; else M2.puntos = propios;
    }
  }
  M1.puntos = vectores.filter(v => dist(v, M1) <= umbral);
  const cx = centro ? (centro.x - 0.5) * w0 : 0, cy = centro ? (centro.y - 0.5) * h0 : 0;
  const lejania = M => mediana(M.puntos.map(v => Math.hypot((v.x - cx) / w0, (v.y - cy) / h0)));
  const extension = M => {
    const xs = M.puntos.map(v => v.x), ys = M.puntos.map(v => v.y);
    return { x: (Math.max(...xs) - Math.min(...xs)) / 2 + 8, y: (Math.max(...ys) - Math.min(...ys)) / 2 + 8 };
  };
  if (!M2) {
    // una sola capa: todo se mueve junto (o solo se ve la pieza). El fondo se conoce si hay bloques fuera de la pieza
    const deFondo = M1.puntos.filter(v => v.region === 'fondo').length;
    return { pieza: M1, fondo: deFondo >= 8 ? M1 : null, todo: M1, capas: 1, n: vectores.length, radioPieza: extension(M1), vectores };
  }
  // dos grupos dentro de la pieza (casi sin bloques del fondo) y el grande también se mueve: el chico son brillos que
  // resbalan por el metal o una parte que el ajuste no explica; la pieza es el grande y se mueve como una sola capa.
  // (si el grande está quieto, es el fondo que se ve dentro de la caja y el chico, la pieza que gira: tornamesa)
  const deCentro = M => M.puntos.filter(v => v.region === 'centro').length / M.puntos.length;
  const quieta = M => Math.hypot(...evaluarAfin(M, cx, cy)) < 0.35;
  if (caja && deCentro(M1) > 0.75 && deCentro(M2) > 0.75 && M2.puntos.length < 0.5 * M1.puntos.length && !quieta(M1)) {
    const deFondo = M1.puntos.filter(v => v.region === 'fondo').length;
    return { pieza: M1, fondo: deFondo >= 8 ? M1 : null, todo: M1, capas: 1, n: vectores.length, radioPieza: extension(M1), vectores };
  }
  const [P, F] = lejania(M1) <= lejania(M2) ? [M1, M2] : [M2, M1];
  return { pieza: P, fondo: F, todo: M1, capas: 2, n: vectores.length, radioPieza: extension(P), vectores };
}

// =====================================================================================================
// ---------- Movimiento directo (con los gradientes de toda la región) ----------
// =====================================================================================================
// Los bloques sufren con el borde liso de un aro: a lo largo del borde no se sabe cuánto se corrió (problema de apertura) y
// un ladeo o un zoom se miden de menos. Aquí cada píxel aporta solo lo que sí dice (el movimiento a través de su borde) y
// el modelo paramétrico junta todo (Bergen et al., 1992): de lo grueso a lo fino, con pesos robustos (los brillos que
// resbalan por el metal no mandan). Modelo pseudo-perspectivo de 8 parámetros, con x, y en px desde el centro del cuadro:
//   u = a0 + a1·x + a2·y + (c1·x² + c2·x·y)/f      v = b0 + b1·x + b2·y + (c1·x·y + c2·y²)/f
// c1 y c2 son el «trapecio» que deja girar la cámara (o la pieza) alrededor de un eje vertical u horizontal: lo que se
// acerca crece. Ese término no depende de la forma de la pieza: dice hacia dónde gira aunque la silueta sea simétrica.
// Con modelo 4 es una similitud (traslación, escala, giro de la imagen): para el fondo.
export const FOV_VERTICAL = 30;   // el de la cámara de la app (estudio.js): con él c1 y c2 se vuelven grados de la app

function desenfocar(d, w, h) {
  // binomial 1-2-1 en x y en y: la linealización de los gradientes pide una imagen suave
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = y * w;
    for (let x = 0; x < w; x++) t[f + x] = (d[f + (x > 0 ? x - 1 : 0)] + 2 * d[f + x] + d[f + (x < w - 1 ? x + 1 : x)]) * 0.25;
  }
  for (let y = 0; y < h; y++) {
    const a = (y > 0 ? y - 1 : 0) * w, b = y * w, c = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) o[b + x] = (t[a + x] + 2 * t[b + x] + t[c + x]) * 0.25;
  }
  return o;
}
const cacheSuaves = new Map();
function piramideSuave(c) {
  let p = cacheSuaves.get(c);
  if (p) { cacheSuaves.delete(c); cacheSuaves.set(c, p); return p; }
  p = [{ d: desenfocar(c.lum, c.w, c.h), w: c.w, h: c.h }];
  for (let k = 1; k < 4; k++) { const r = reducir(p[k - 1].d, p[k - 1].w, p[k - 1].h); p.push({ d: desenfocar(r.d, r.w, r.h), w: r.w, h: r.h }); }
  cacheSuaves.set(c, p);
  while (cacheSuaves.size > 6) cacheSuaves.delete(cacheSuaves.keys().next().value);
  return p;
}

// u, v (px del nivel 0) del modelo en (x, y)
export function flujoModelo(p, x, y, f) {
  return [p[0] + p[1] * x + p[2] * y + (p[6] * x * x + p[7] * x * y) / f, p[3] + p[4] * x + p[5] * y + (p[6] * x * y + p[7] * y * y) / f];
}

let bufDirecto = new Float32Array(0);
// a, b: cuadros; dentro(ux, uy) (0..1) elige la región en a. p0: punto de partida [a0, a1, a2, b0, b1, b2, c1, c2].
// Devuelve { p, n (píxeles con peso), error (residuo robusto, niveles de gris) } o null si la región no tiene con qué medir.
export function movimientoDirecto(a, b, dentro, { modelo = 8, p0 = null, f = null, pesoPixel = null } = {}) {
  const PA = piramideSuave(a), PB = piramideSuave(b), W0 = a.w, H0 = a.h;
  const F = f || (H0 / 2) / Math.tan(FOV_VERTICAL * Math.PI / 360);
  const p = p0 ? p0.slice(0, 8) : [0, 0, 0, 0, 0, 0, 0, 0];
  while (p.length < 8) p.push(0);
  const np = modelo === 8 ? 8 : modelo === 6 ? 6 : 4, n = np + 1;   // (+1: el cambio de brillo entre los dos cuadros)
  const M = new Float64Array(n * n), V = new Float64Array(n), J = new Float64Array(n);
  let usados = 0, error = 0;
  for (let L = 3; L >= 0; L--) {
    const A = PA[L], B = PB[L], s = 1 / (1 << L), w = A.w, h = A.h;
    if (bufDirecto.length < w * h * 5) bufDirecto = new Float32Array(w * h * 5);
    const buf = bufDirecto;
    const iteraciones = L === 0 ? 3 : 5;
    for (let it = 0; it < iteraciones; it++) {
      // 1) residuos de cada píxel con gradiente, con B muestreada donde el modelo dice que fue a parar
      let k = 0;
      for (let y = 1; y < h - 1; y++) {
        const uy = (y + 0.5) / h, Y = (y + 0.5) / s - H0 / 2;
        for (let x = 1; x < w - 1; x++) {
          const ux = (x + 0.5) / w;
          if (!dentro(ux, uy)) continue;
          const i = y * w + x, gx = (A.d[i + 1] - A.d[i - 1]) * 0.5, gy = (A.d[i + w] - A.d[i - w]) * 0.5;
          if (gx * gx + gy * gy < 2) continue;
          const X = (x + 0.5) / s - W0 / 2;
          const u = p[0] + p[1] * X + p[2] * Y + (p[6] * X * X + p[7] * X * Y) / F, v = p[3] + p[4] * X + p[5] * Y + (p[6] * X * Y + p[7] * Y * Y) / F;
          const bx = x + u * s, by = y + v * s;
          if (bx < 0 || by < 0 || bx > w - 1.001 || by > h - 1.001) continue;
          const x0 = bx | 0, y0 = by | 0, fx = bx - x0, fy = by - y0, j = y0 * w + x0;
          const vb = (B.d[j] * (1 - fx) + B.d[j + 1] * fx) * (1 - fy) + (B.d[j + w] * (1 - fx) + B.d[j + w + 1] * fx) * fy;
          buf[k] = X; buf[k + 1] = Y; buf[k + 2] = gx * s; buf[k + 3] = gy * s; buf[k + 4] = vb - A.d[i];
          k += 5;
        }
      }
      const m = k / 5;
      if (m < 40) { if (L === 0 && !usados) return null; break; }
      // 2) escala robusta del residuo (mediana de una muestra) y pesos de Tukey
      const muestra = [], salto = Math.max(1, Math.floor(m / 800));
      for (let q = 0; q < m; q += salto) muestra.push(Math.abs(buf[q * 5 + 4]));
      error = 1.4826 * mediana(muestra) + 0.4;
      const c = 4.685 * error;
      M.fill(0); V.fill(0);
      let suma = 0;
      for (let q = 0; q < k; q += 5) {
        const e = buf[q + 4], z = Math.abs(e) / c;
        if (z >= 1) continue;
        let wq = (1 - z * z) * (1 - z * z);
        if (pesoPixel) wq *= pesoPixel((buf[q] + W0 / 2) / W0, (buf[q + 1] + H0 / 2) / H0);
        if (!(wq > 0)) continue;
        const X = buf[q], Y = buf[q + 1], Gx = buf[q + 2], Gy = buf[q + 3];
        if (np === 4) { J[0] = Gx; J[1] = Gy; J[2] = Gx * X + Gy * Y; J[3] = -Gx * Y + Gy * X; J[4] = 1; }
        else {
          J[0] = Gx; J[1] = Gx * X; J[2] = Gx * Y; J[3] = Gy; J[4] = Gy * X; J[5] = Gy * Y;
          if (np === 8) { J[6] = (Gx * X * X + Gy * X * Y) / F; J[7] = (Gx * X * Y + Gy * Y * Y) / F; }
          J[np] = 1;
        }
        for (let r = 0; r < n; r++) { const jr = wq * J[r]; V[r] -= jr * e; for (let cc = r; cc < n; cc++) M[r * n + cc] += jr * J[cc]; }
        suma += wq;
      }
      usados = suma;
      for (let r = 0; r < n; r++) for (let cc = 0; cc < r; cc++) M[r * n + cc] = M[cc * n + r];
      for (let r = 0; r < n; r++) M[r * n + r] = M[r * n + r] * 1.0001 + 1e-9;
      const filas = [], vec = [];
      for (let r = 0; r < n; r++) { filas.push(Array.from(M.subarray(r * n, r * n + n))); vec.push(V[r]); }
      const d = resolver3(filas, vec);
      if (!d || d.some(x => !Number.isFinite(x))) break;
      if (np === 4) { p[0] += d[0]; p[3] += d[1]; p[1] += d[2]; p[5] += d[2]; p[2] -= d[3]; p[4] += d[3]; }
      else for (let r = 0; r < np; r++) p[r] += d[r];
      if (Math.abs(d[0]) + Math.abs(np === 4 ? d[1] : d[3]) < 0.02 / s && it > 1) break;
    }
  }
  if (!usados || p.some(x => !Number.isFinite(x))) return null;
  return { p, n: Math.round(usados), error, f: F };
}
// Escalas en x y en y, giro de la imagen (grados, + = horario en pantalla) y trapecios (grados de la app) de un modelo directo
export function leerModelo(r) {
  const p = r.p;
  return { sx: 1 + p[1], sy: 1 + p[5], rot: Math.atan2(p[4] - p[2], 2 + p[1] + p[5]) * GRADOS, c1: p[6] * GRADOS, c2: p[7] * GRADOS };
}

// =====================================================================================================
// ---------- Movimiento de cada plano ----------
// =====================================================================================================
// Curvas de la app (las mismas fórmulas de proyecto.js): cada plano se resume con la que mejor siga su perfil
const CURVAS_AJUSTE = {
  lineal: u => u,
  suave: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  entrada: u => u * u * u,
  salida: u => 1 - Math.pow(1 - u, 3),
};
// perfil: [{ u (0..1 del tiempo), v (0..1 del recorrido) }] → { curva, error }
export function ajustarCurva(perfil) {
  let mejor = { curva: 'lineal', error: Infinity };
  if (!perfil || perfil.length < 3) return { curva: 'lineal', error: 0 };
  for (const [curva, fn] of Object.entries(CURVAS_AJUSTE)) {
    let e = 0; for (const p of perfil) e += (fn(p.u) - p.v) ** 2;
    e = Math.sqrt(e / perfil.length);
    // las curvas con aceleración necesitan ganar con claridad: con ruido, lineal o suave es lo más honesto
    const castigo = curva === 'lineal' ? 0 : curva === 'suave' ? 0.012 : 0.02;
    if (e + castigo < mejor.error + (mejor.castigo || 0)) mejor = { curva, error: e, castigo };
  }
  return { curva: mejor.curva, error: r3(mejor.error) };
}

// Suavizado de una serie (mediana de 3 y promedio de 3): saca los saltos de un cuadro mal medido
function suavizar(v) {
  const n = v.length; if (n < 3) return v.slice();
  const m = v.map((x, i) => (i === 0 || i === n - 1 ? x : mediana([v[i - 1], x, v[i + 1]])));
  return m.map((x, i) => (i === 0 || i === n - 1 ? x : (m[i - 1] + x + m[i + 1]) / 3));
}

// Planos del video (entre cortes) con el movimiento medido en cada uno. Los cuadros que tapa una transición no se usan.
// Devuelve [{ indice, inicio, fin, pasos, movimiento, objeto: { inicio, fin } }]:
//   pasos: [{ t, giro, zoom (factor acumulado), inclinacion, lateral, altura, rodar }] desde el inicio del plano
//   movimiento: { giro:{grados,confianza}, zoom:{desde,hasta,factor}, inclinacion:{delta,confianza}, lateral:{desde,hasta},
//                 altura:{desde,hasta}, rodar:{grados,confianza}, curva, tipo }
export function estimarMovimiento(cuadros, cortes = [], opciones = {}) {
  const it = movimientoPorPasos(cuadros, cortes, opciones);
  let r = it.next(); while (!r.done) r = it.next();
  return r.value;
}
// La misma cuenta, pero cediendo el control cada tanto (en el navegador no congela la página): ver analizarVideo
export async function estimarMovimientoPorPartes(cuadros, cortes = [], { alAvanzar, cancelado, ...opciones } = {}) {
  const it = movimientoPorPasos(cuadros, cortes, opciones);
  let r = it.next(), t0 = Date.now();
  while (!r.done) {
    if (Date.now() - t0 > 40) { alAvanzar?.(r.value); cancelar(cancelado); await pausa(); t0 = Date.now(); }
    r = it.next();
  }
  return r.value;
}

function* movimientoPorPasos(cuadros, cortes, { duracion } = {}) {
  const n = cuadros.length;
  if (!n) return [];
  const D = esNum(duracion) ? duracion : cuadros[n - 1].t + (n > 1 ? cuadros[n - 1].t - cuadros[n - 2].t : 0.1);
  const lista = (cortes || []).filter(c => esNum(c?.t)).sort((a, b) => a.t - b.t);
  const limites = [0, ...lista.map(c => c.t), D];
  const planos = [];
  const tapado = t => lista.some(c => Array.isArray(c.zona) && c.transicion !== 'seco' && t > c.zona[0] + 1e-6 && t < c.zona[1] - 1e-6);
  let hechos = 0;
  for (let p = 0; p + 1 < limites.length; p++) {
    const inicio = limites[p], fin = limites[p + 1];
    // cuadros del plano: desde el corte (incluido) hasta antes del siguiente, sin los que tapa una transición
    const idx = [];
    for (let i = 0; i < n; i++) { const t = cuadros[i].t; if (t >= inicio - 1e-6 && t < fin - 1e-6 && !tapado(t)) idx.push(i); }
    const plano = { indice: p, inicio: r3(inicio), fin: r3(fin) };
    const objs = idx.map(i => objetoEn(cuadros[i]));
    const pasos = [{ t: idx.length ? r3(cuadros[idx[0]].t) : r3(inicio), giro: 0, zoom: 1, inclinacion: 0, lateral: 0, altura: 0, rodar: 0 }];
    const crudos = [];
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = cuadros[idx[k]], b = cuadros[idx[k + 1]], o = objs[k];
      // la caja de la pieza (con un margen) separa los bloques del centro de los del fondo
      // (en un macro la pieza llena el cuadro: el centro y el borde igual se separan para ver si el borde se mueve con ella)
      const pieza = o && !o.llena;
      const caja = pieza ? cajaDilatada(o) : { x0: 0.25, x1: 0.75, y0: 0.25, y1: 0.75 };
      const m = movimientoEntre(a, b, caja, pieza ? o : null);
      // los bloques dan el punto de partida; el ajuste directo, la medida fina de la pieza y del fondo
      const semilla = M => (M ? [M.a[0], M.a[1], M.a[2], M.b[0], M.b[1], M.b[2], 0, 0] : null);
      const enCaja = pieza ? (x, y) => x >= caja.x0 && x <= caja.x1 && y >= caja.y0 && y <= caja.y1 : () => true;
      let dirFondo = null, fuera = null;
      if (pieza) {
        const lejos = cajaDilatada(o, 0.04);
        fuera = (x, y) => !(x >= lejos.x0 && x <= lejos.x1 && y >= lejos.y0 && y <= lejos.y1);
        dirFondo = movimientoDirecto(a, b, fuera, { modelo: 4, p0: semilla(m.fondo && m.fondo !== m.pieza ? m.fondo : m.todo) });
        // un fondo liso (el degradado de la marca) casi no tiene con qué medir: no cuenta
        if (dirFondo && dirFondo.n < 150) dirFondo = null;
      }
      // con un fondo con textura (piso, mármol, sombras de ventana) la caja de un aro es casi toda fondo visto a través de él:
      // la pieza se mide solo sobre su silueta
      const conMascara = pieza && o.peso && dirFondo;
      let dirPieza = movimientoDirecto(a, b, enCaja, { modelo: 8, p0: semilla(m.pieza || m.todo), pesoPixel: conMascara ? mascaraDe(o) : null });
      if (dirPieza && dirPieza.n < 60) dirPieza = null;
      crudos.push({ m, dirPieza, dirFondo, o, dt: b.t - a.t, t: b.t, w: a.w, h: a.h, a, b, fuera });
      hechos++;
      yield hechos / Math.max(1, n);
    }
    plano.objeto = { inicio: resumenObjeto(objs.slice(0, 3)), fin: resumenObjeto(objs.slice(-3)) };
    Object.assign(plano, combinarPasos(crudos, objs, pasos, inicio, fin));
    planos.push(plano);
  }
  return planos;
}

// La silueta de la pieza (de objetoEn), dilatada un píxel: su borde es lo que más dice cómo se mueve
function mascaraDe(o) {
  if (o._mascara) return o._mascara;
  const { d, w, h } = o.peso, sil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!(d[y * w + x] > 0)) continue;
    for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) sil[j * w + i] = 1;
  }
  return oculto(o, '_mascara', (ux, uy) => sil[Math.min(h - 1, Math.floor(uy * h)) * w + Math.min(w - 1, Math.floor(ux * w))]);
}
function cajaDilatada(o, extra = 0) {
  const mx = Math.max(0.06, o.w * 0.15) + extra, my = Math.max(0.04, o.h * 0.15) + extra, cx = o.cx ?? o.x, cy = o.cy ?? o.y;
  return { x0: cx - o.w / 2 - mx, x1: cx + o.w / 2 + mx, y0: cy - o.h / 2 - my, y1: cy + o.h / 2 + my };
}
function resumenObjeto(objs) {
  const v = objs.filter(Boolean);
  if (!v.length) return { x: 0.5, y: 0.5, tam: 1, llena: false, visto: false };
  return { x: r3(mediana(v.map(o => o.x))), y: r3(mediana(v.map(o => o.y))), tam: r3(mediana(v.map(o => o.tam))), llena: v.some(o => o.llena), visto: true };
}

// Ancho aparente de una pieza plana (un aro, un dije) girada θ desde de frente: |cos θ| + ε·|sin θ| (ε: su grosor, con la
// cabeza o la piedra, en proporción al ancho)
const anchoGirado = (th, eps) => { const r = th * Math.PI / 180; return Math.abs(Math.cos(r)) + eps * Math.abs(Math.sin(r)); };
// Ajusta la serie del ancho relativo (ln, el primero = 0) con una pieza que gira de θ0 a θ0 + Δ siguiendo una curva.
// Devuelve { delta (≥ 0, grados), theta0, curva, error } o null. El sentido no sale de aquí (el ancho es simétrico): lo da
// el trapecio. Se prefiere empezar cerca de de frente, recorrer poco y las curvas sencillas.
export function ajustarGiro3D(us, lnA, { th0Min = -85, th0Max = 85 } = {}) {
  const n = us.length;
  if (n < 3) return null;
  const sel = [];
  const salto = Math.max(1, Math.floor(n / 40));
  for (let k = 0; k < n; k += salto) sel.push(k);
  if (sel[sel.length - 1] !== n - 1) sel.push(n - 1);
  let mejor = null;
  for (const eps of [0.1, 0.25, 0.4]) for (const [curva, fn] of Object.entries(CURVAS_AJUSTE)) {
    const castigo = curva === 'lineal' ? 0 : curva === 'suave' ? 0.003 : 0.006;
    const fu = sel.map(k => fn(us[k]));
    for (let th0 = th0Min; th0 <= th0Max; th0 += 5) {
      const g0 = Math.log(anchoGirado(th0, eps));
      for (let D = 2.5; D <= 270; D += 2.5) {
        let e = 0;
        for (let q = 0; q < sel.length; q++) { const d = Math.log(anchoGirado(th0 + D * fu[q], eps)) - g0 - lnA[sel[q]]; e += d * d; }
        e = Math.sqrt(e / sel.length) + castigo + 0.0015 * Math.abs(th0) / 10 + 0.001 * D / 30;
        if (!mejor || e < mejor.error) mejor = { delta: D, theta0: th0, curva, eps, error: e };
      }
    }
  }
  return mejor;
}

// De los ajustes de cada par de cuadros a las pistas de la app
function combinarPasos(crudos, objs, pasos, inicio, fin) {
  const vacio = { pasos, movimiento: movimientoQuieto(objs) };
  if (!crudos.length) return vacio;
  const w = crudos[0].w, h = crudos[0].h;
  // centro de la pieza (en px desde el centro del cuadro), suavizado: el de cada cuadro tiene ruido
  const ox = suavizar(objs.map(o => (o ? (o.x - 0.5) * w : 0))), oy = suavizar(objs.map(o => (o ? (o.y - 0.5) * h : 0)));
  const vistos = objs.filter(o => o && !o.llena).length / objs.length;
  const llena = objs.filter(o => o?.llena).length > objs.length / 2;

  // por paso: traslación de la pieza (en su centro) y del fondo (si se ve), escalas, giro de la imagen y trapecios
  const P = crudos.map((c, k) => {
    const px = ox[k], py = oy[k], m = c.m, dP = c.dirPieza, dF = c.dirFondo;
    // con dos capas en los bloques (la textura de la pieza corre y el resto queda quieto), su traslación es la de la capa:
    // el ajuste directo de toda la caja se quedaría con lo quieto
    const tc = m.capas === 2 && m.pieza ? evaluarAfin(m.pieza, px, py) : dP ? flujoModelo(dP.p, px, py, dP.f) : m.pieza ? evaluarAfin(m.pieza, px, py) : null;
    const tf = dF ? flujoModelo(dF.p, px, py, dF.f) : m.fondo && !dP ? evaluarAfin(m.fondo, px, py) : null;
    const lP = dP ? leerModelo(dP) : m.pieza ? { ...descomponer(m.pieza), c1: 0, c2: 0 } : null;
    const lF = dF ? leerModelo(dF) : m.fondo && !dP ? { ...descomponer(m.fondo), c1: 0, c2: 0 } : null;
    return { tc, tf, capas: m.capas, lP, lF, radio: m.capas === 2 ? m.radioPieza : null, t: c.t, objDx: ox[k + 1] - ox[k], objDy: oy[k + 1] - oy[k] };
  });
  const suma = f => P.reduce((a, p) => a + (f(p) || 0), 0);
  const conPieza = P.filter(p => p.tc).length / P.length;
  const conFondo = P.filter(p => p.tf).length / P.length;
  const dosCapas = P.filter(p => p.capas === 2).length / P.length;
  const Dcx = suma(p => p.tc?.[0]), Dcy = suma(p => p.tc?.[1]);
  // el fondo puede verse solo en algunos pasos (un fondo liso casi no tiene textura): se compara en esos pasos
  const conTf = P.filter(p => p.tf && p.tc), hayFondo = conTf.length >= Math.max(2, 0.25 * P.length);
  const Sfx = hayFondo ? conTf.reduce((a, p) => a + p.tf[0], 0) : null, Sfy = hayFondo ? conTf.reduce((a, p) => a + p.tf[1], 0) : null;
  const Scx = conTf.reduce((a, p) => a + p.tc[0], 0), Scy = conTf.reduce((a, p) => a + p.tc[1], 0);
  const Dox = ox[ox.length - 1] - ox[0], Doy = oy[oy.length - 1] - oy[0];
  // radio de la pieza (px) para pasar de recorrido a ángulo: el de la capa que se mueve (si hay dos) o la mitad de la silueta
  const radiosCapa = P.filter(p => p.radio);
  const radioX = Math.max(8, radiosCapa.length > P.length / 3 ? mediana(radiosCapa.map(p => p.radio.x)) : mediana(objs.filter(o => o && !o.llena).map(o => o.w * w / 2)) || w / 3);
  const radioY = Math.max(8, radiosCapa.length > P.length / 3 ? mediana(radiosCapa.map(p => p.radio.y)) : mediana(objs.filter(o => o && !o.llena).map(o => o.h * h / 2)) || h / 5);

  // ¿La pieza se traslada en la imagen (paneo de cámara, posición) o gira sobre sí misma (tornamesa, órbita)?
  //  · el fondo se mueve con la pieza → la cámara se mueve: traslación
  //  · la pieza se mueve distinto que el fondo (o el fondo no se ve) → si su silueta acompaña, se traslada; si no, gira
  //  · un macro sin fondo a la vista: con una sola capa se toma como movimiento de cámara; con dos, como giro
  const traslada = (Dc, Sc, Sf, Do) => {
    if (Math.abs(Dc) < 1.5) return true;
    if (Sf !== null && Math.abs(Sc) >= 1.5) {
      if (Math.abs(Sf - Sc) < 0.35 * Math.abs(Sc) + 1) return true;   // el fondo va con la pieza
      if (conFondo > 0.6) {
        if (llena || vistos < 0.5) return false;
        const rel = Sc - Sf, relO = Do * conFondo - Sf;
        return Math.sign(relO) === Math.sign(rel) && Math.abs(relO) > 0.5 * Math.abs(rel);
      }
    }
    if (llena || vistos < 0.5) return dosCapas < 0.5;
    return Math.sign(Do) === Math.sign(Dc) && Math.abs(Do) > 0.5 * Math.abs(Dc);
  };
  // en un acercamiento fuerte la textura y la silueta se corren distinto aunque la pieza no gire (el centro del zoom no es
  // el de la pieza y lo que entra o sale del cuadro mueve la silueta): ahí no se lee un giro de ese corrimiento
  // (zoom: las dos escalas crecen o se achican juntas; una silueta que solo se angosta es la pieza girando)
  const lnSx = P.reduce((a, p) => a + (p.lP ? Math.log(limitar(p.lP.sx, 0.5, 2)) : 0), 0), lnSy = P.reduce((a, p) => a + (p.lP ? Math.log(limitar(p.lP.sy, 0.5, 2)) : 0), 0);
  const zoomFuerte = Math.sign(lnSx) === Math.sign(lnSy) && Math.min(Math.abs(lnSx), Math.abs(lnSy)) > 0.18;
  const tx = traslada(Dcx, Scx, Sfx, Dox), ty = zoomFuerte || traslada(Dcy, Scy, Sfy, Doy);

  // Giro 3D de una pieza que no es un disco plano de frente: la silueta se angosta (gira alrededor de un eje vertical) o se
  // achata (eje horizontal) sin que la otra medida cambie igual; el trapecio dice hacia qué lado. Un zoom cambia las dos igual.
  const conLP = P.filter(p => p.lP);
  let lx = 0, ly = 0;
  const serieX = [0], serieY = [0];
  P.forEach(p => { if (p.lP) { lx += Math.log(limitar(p.lP.sx, 0.5, 2)); ly += Math.log(limitar(p.lP.sy, 0.5, 2)); } serieX.push(lx); serieY.push(ly); });
  const Sc1 = conLP.reduce((a, p) => a + p.lP.c1, 0), Sc2 = conLP.reduce((a, p) => a + p.lP.c2, 0);
  const A1 = conLP.reduce((a, p) => a + Math.abs(p.lP.c1), 0), A2 = conLP.reduce((a, p) => a + Math.abs(p.lP.c2), 0);
  const eje = Math.abs(Sc1) >= Math.abs(Sc2) ? 'x' : 'y';
  const serieA = serieX.map((x, k) => (eje === 'x' ? x - serieY[k] : serieY[k] - x));
  const rangoA = Math.max(...serieA) - Math.min(...serieA);
  const Sk = eje === 'x' ? Sc1 : -Sc2, coherenciaK = (eje === 'x' ? Math.abs(Sc1) / Math.max(1e-9, A1) : Math.abs(Sc2) / Math.max(1e-9, A2));
  // con el fondo a la vista y quieto, la cámara no se acercó: lo que cambió la silueta es la pieza girando
  let giro3D = null;
  if (conLP.length >= 3 && rangoA > 0.05 && coherenciaK > 0.4 && Math.abs(Sk) > 4) {
    const t0m = pasosT0(P, pasos), t1m = P[P.length - 1].t;
    const us = [pasos[0].t, ...P.map(p => p.t)].map(t => (t1m > t0m ? (t - t0m) / (t1m - t0m) : 0));
    // la altura de la cámara casi siempre empieza entre un poco por debajo y unos 45° por encima de la pieza: con ese rango
    // no se confunde un recorrido largo cerca de de frente con uno corto visto muy desde arriba
    const aj = ajustarGiro3D(us, serieA, eje === 'y' ? { th0Min: -20, th0Max: 45 } : {});
    if (aj && aj.delta >= 5) giro3D = { ...aj, signo: Math.sign(Sk), eje, us, coherencia: coherenciaK };
  }
  // Con el piso a la vista, el trapecio de la caja lo pone sobre todo el piso que rodea la pieza, no ella. El piso mismo dice
  // hacia dónde fue la cámara: al bajar, lo cercano (abajo) sube y lo lejano baja, la imagen del piso se aplasta en vertical
  // (y no en horizontal, como en un zoom); al subir, se estira. Una pared sola no se deforma: ahí queda el trapecio.
  if (giro3D && giro3D.eje === 'y' && conFondo > 0.6) {
    const an = anisotropiaFondo(crudos);
    if (an !== null && Math.abs(an) > 0.06) giro3D.signo = Math.sign(an);
  }
  // sin silueta que cambie, un trapecio fuerte y parejo también es un giro (una pieza redonda que rota, vista de lado)
  // (no con un acercamiento grande ni con el piso a la vista: acercarse a un piso también lo deforma en trapecio)
  const lnEscala = conLP.reduce((a, p) => a + 0.5 * Math.log(limitar(p.lP.sx * p.lP.sy, 0.25, 4)), 0);
  if (!giro3D && conLP.length >= 3 && coherenciaK > 0.7 && Math.abs(Sk) > 15 && conFondo < 0.3 && Math.abs(lnEscala) < 0.15 && (eje === 'x' ? !tx || Math.abs(Dcx) < 0.05 * w : !ty || Math.abs(Dcy) < 0.05 * h)) {
    giro3D = { delta: Math.abs(Sk), theta0: 0, curva: null, signo: Math.sign(Sk), eje, porTrapecio: true, coherencia: coherenciaK };
  }

  // zoom de cada paso: la escala del eje que no gira (la silueta se angosta al girar, la altura no), o la media
  const escalaPaso = p => {
    const d = p.lP; if (!d) return 1;
    if (giro3D && !giro3D.porTrapecio) return giro3D.eje === 'x' ? d.sy : d.sx;
    if (!tx && ty) return d.sy;
    if (tx && !ty) return d.sx;
    return Math.sqrt(Math.max(1e-6, d.sx * d.sy));
  };
  const acc = { giro: 0, zoom: 1, inclinacion: 0, lateral: 0, altura: 0, rodar: 0 };
  const vel = [];
  P.forEach((p, k) => {
    const cx = p.tc ? p.tc[0] : p.objDx, cy = p.tc ? p.tc[1] : p.objDy;
    let dl, da, dg = 0, di = 0;
    // girando, el frente de la pieza corre a la izquierda cuando la cámara rodea hacia la derecha (giro positivo en la app)
    if (tx) dl = cx / (w / 2); else { dg = -(cx - p.objDx) / (K_GIRO * radioX) * GRADOS; dl = p.objDx / (w / 2); }
    if (ty) da = -cy / (h / 2); else { di = (cy - p.objDy) / (K_INCLINACION * radioY) * GRADOS; da = -p.objDy / (h / 2); }
    if (giro3D) {
      // el giro 3D manda en su eje: lo que traía el corrimiento de la textura se reemplaza por el del modelo
      const paso = giro3D.porTrapecio ? (giro3D.eje === 'x' ? p.lP?.c1 || 0 : -(p.lP?.c2 || 0))
        : giro3D.signo * giro3D.delta * (CURVAS_AJUSTE[giro3D.curva](giro3D.us[k + 1]) - CURVAS_AJUSTE[giro3D.curva](giro3D.us[k]));
      if (giro3D.eje === 'x') dg = paso; else di = paso;
    }
    const z = limitar(escalaPaso(p), 0.7, 1.4);
    // roll: el giro de toda la imagen (el del fondo si se ve; si no, el de la pieza). En la app, rodar positivo ladea la
    // cámara a la derecha: la imagen gira al revés del reloj
    // con las dos medidas, las dos tienen que verlo (un roll gira toda la imagen): si no, es la perspectiva del piso o la
    // pieza que gira en 3D, y se toma lo que tienen en común
    const rot = p.lF && p.lP ? (Math.sign(p.lF.rot) === Math.sign(p.lP.rot) ? Math.sign(p.lF.rot) * Math.min(Math.abs(p.lF.rot), Math.abs(p.lP.rot)) : 0) : p.lF ? p.lF.rot : p.lP ? p.lP.rot : 0;
    acc.giro += dg; acc.inclinacion += di; acc.lateral += dl; acc.altura += da; acc.zoom *= z; acc.rodar -= rot;
    pasos.push({ t: r3(p.t), giro: r2(acc.giro), zoom: r3(acc.zoom), inclinacion: r2(acc.inclinacion), lateral: r3(acc.lateral), altura: r3(acc.altura), rodar: r2(acc.rodar) });
    vel.push({ dg, di, dl, da, dz: Math.log(z), rot: -rot });
  });
  // una pieza que gira en 3D, vista sin fondo, «ladea» un poco su silueta (la perspectiva): no es un roll de la cámara
  const sinFondoRot = P.filter(p => p.lF).length < P.length / 2;
  if (giro3D && sinFondoRot && Math.abs(acc.rodar) < 0.35 * giro3D.delta) {
    acc.rodar = 0; pasos.forEach(q => { q.rodar = 0; }); vel.forEach(v => { v.rot = 0; });
  }

  // confianza: cuántos pasos tienen medida, y si el movimiento va siempre hacia el mismo lado
  const coherencia = f => { const tot = vel.reduce((a, v) => a + Math.abs(f(v)), 0), neto = Math.abs(vel.reduce((a, v) => a + f(v), 0)); return tot > 1e-9 ? neto / tot : 0; };
  const conf = (f, mag, ruido) => r2(limitar(conPieza * coherencia(f) * limitar(Math.abs(mag) / ruido, 0, 1), 0, 1));

  // la curva: la del movimiento principal (el que más recorre en proporción a lo que se nota)
  const dominante = principal(acc);
  const serie = pasos.map(p => (dominante === 'zoom' ? Math.log(p.zoom) : p[dominante]));
  const total = serie[serie.length - 1] - serie[0];
  const t0 = pasos[0].t, t1 = pasos[pasos.length - 1].t;
  let curva = 'lineal', errorCurva = 0;
  if (giro3D?.curva && (dominante === 'giro' || dominante === 'inclinacion') && (giro3D.eje === 'x') === (dominante === 'giro')) ({ curva, error: errorCurva } = { curva: giro3D.curva, error: r3(giro3D.error) });
  else if (Math.abs(total) > 1e-6 && t1 > t0) ({ curva, error: errorCurva } = ajustarCurva(pasos.map((p, k) => ({ u: (p.t - t0) / (t1 - t0), v: (serie[k] - serie[0]) / total }))));
  // lo medido va del primer al último cuadro mirado; el plano sigue hasta un cuadro antes del corte (y empieza en el corte):
  // se extiende el recorrido a todo el plano con la forma de la curva (en un «frenar» el final casi no suma)
  const fn = CURVAS_AJUSTE[curva], largo = Math.max(1e-3, fin - 1 / 30 - inicio);
  const fraccion = fn(limitar((t1 - inicio) / largo, 0, 1)) - fn(limitar((t0 - inicio) / largo, 0, 1));
  const k = fraccion > 0.05 ? limitar(1 / fraccion, 1, 1.6) : 1;
  acc.giro *= k; acc.inclinacion *= k; acc.lateral *= k; acc.altura *= k; acc.rodar *= k; acc.zoom = Math.pow(acc.zoom, k);

  const o0 = resumenObjeto(objs.slice(0, 3));
  const zoomDesde = limitar(o0.llena ? 2.6 : o0.tam / TAM_ZOOM_1, 0.4, 4);
  const lat0 = limitar(2 * (o0.x - 0.5), -0.5, 0.5), alt0 = limitar(1 - 2 * o0.y, -0.5, 0.5);
  const confGiro3D = giro3D ? r2(limitar(conPieza * giro3D.coherencia * limitar(giro3D.delta / 20, 0, 1) * (giro3D.porTrapecio ? 0.6 : 1), 0, 1)) : null;
  const movimiento = {
    giro: { grados: r2(acc.giro), confianza: giro3D?.eje === 'x' ? confGiro3D : conf(v => v.dg, acc.giro, 12) },
    zoom: { desde: r2(zoomDesde), hasta: r2(limitar(zoomDesde * acc.zoom, 0.4, 4)), factor: r3(acc.zoom), confianza: conf(v => v.dz, Math.log(acc.zoom), 0.06) },
    inclinacion: { delta: r2(acc.inclinacion), confianza: giro3D?.eje === 'y' ? confGiro3D : conf(v => v.di, acc.inclinacion, 8) },
    lateral: { desde: r3(lat0), hasta: r3(limitar(lat0 + acc.lateral, -0.5, 0.5)), delta: r3(acc.lateral), confianza: conf(v => v.dl, acc.lateral, 0.08) },
    altura: { desde: r3(alt0), hasta: r3(limitar(alt0 + acc.altura, -0.5, 0.5)), delta: r3(acc.altura), confianza: conf(v => v.da, acc.altura, 0.08) },
    rodar: { grados: r2(acc.rodar), confianza: conf(v => v.rot, acc.rodar, 4) },
    tipo: tipoMovimiento(acc),
    fondoVisible: conFondo > 0.6,
    curva, errorCurva, principal: dominante, extension: r2(k),
  };
  if (giro3D) oculto(movimiento, 'giro3D', { eje: giro3D.eje, delta: giro3D.delta, theta0: giro3D.theta0, curva: giro3D.curva, trapecio: r2(Sk), porTrapecio: !!giro3D.porTrapecio });
  if (globalThis.__depurar) console.log({ Dcx, Scx, Sfx, Dox, Dcy, Scy, Sfy, Doy, conFondo, conPieza, dosCapas, vistos, llena, tx, ty, radioX, radioY, Sc1, Sc2, rangoA, eje, coherenciaK, giro3D });
  return { pasos, movimiento };
}
const pasosT0 = (P, pasos) => pasos[0].t;
// Σ ln(sy/sx) del fondo (alrededor de la pieza, con un ajuste afín) en hasta 12 pares del plano, llevado a todo el plano
function anisotropiaFondo(crudos) {
  const sel = crudos.filter(c => c.fuera && c.a);
  if (sel.length < 3) return null;
  const salto = Math.max(1, Math.floor(sel.length / 12));
  let suma = 0, k = 0;
  for (let q = 0; q < sel.length; q += salto) {
    const c = sel[q], r = movimientoDirecto(c.a, c.b, c.fuera, { modelo: 6, p0: c.dirFondo ? c.dirFondo.p : null });
    if (!r || r.n < 150) continue;
    const l = leerModelo(r);
    if (l.sx > 0 && l.sy > 0) { suma += Math.log(l.sy / l.sx); k++; }
  }
  return k >= 3 ? suma * sel.length / k : null;
}

// cuánto se nota cada pista (para escoger la principal): 30° de giro ≈ zoom ×1,25 ≈ 0,15 de corrimiento ≈ 10° de roll
function principal(acc) {
  const notas = { giro: Math.abs(acc.giro) / 30, zoom: Math.abs(Math.log(acc.zoom)) / Math.log(1.25), inclinacion: Math.abs(acc.inclinacion) / 15, lateral: Math.abs(acc.lateral) / 0.15, altura: Math.abs(acc.altura) / 0.15, rodar: Math.abs(acc.rodar) / 10 };
  return Object.entries(notas).sort((a, b) => b[1] - a[1])[0][0];
}
function tipoMovimiento(acc) {
  const p = principal(acc), notas = { giro: Math.abs(acc.giro) / 30, zoom: Math.abs(Math.log(acc.zoom)) / Math.log(1.25), inclinacion: Math.abs(acc.inclinacion) / 15, lateral: Math.abs(acc.lateral) / 0.15, altura: Math.abs(acc.altura) / 0.15, rodar: Math.abs(acc.rodar) / 10 };
  if (notas[p] < 0.25) return 'quieto';
  if (p === 'giro') return 'tornamesa';
  if (p === 'zoom') return acc.zoom > 1 ? 'acercamiento' : 'alejamiento';
  if (p === 'lateral' || p === 'altura') return 'paneo';
  if (p === 'inclinacion') return 'inclinacion';
  return 'roll';
}
function movimientoQuieto(objs) {
  const o0 = resumenObjeto(objs.slice(0, 3));
  const z = limitar(o0.llena ? 2.6 : o0.tam / TAM_ZOOM_1, 0.4, 4), lat = limitar(2 * (o0.x - 0.5), -0.5, 0.5), alt = limitar(1 - 2 * o0.y, -0.5, 0.5);
  return {
    giro: { grados: 0, confianza: 0 }, zoom: { desde: r2(z), hasta: r2(z), factor: 1, confianza: 0 }, inclinacion: { delta: 0, confianza: 0 },
    lateral: { desde: r3(lat), hasta: r3(lat), delta: 0, confianza: 0 }, altura: { desde: r3(alt), hasta: r3(alt), delta: 0, confianza: 0 },
    rodar: { grados: 0, confianza: 0 }, curva: 'lineal', tipo: 'quieto', principal: 'giro',
  };
}

// =====================================================================================================
// ---------- Colores de la escena ----------
// =====================================================================================================
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
const lumRel = ([r, g, b]) => { const l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };

// { fondo:'#hex', superficie:'#hex', oscuro, calidez (-1..1), sombrasDuras, luzDesde:'izquierda'|'derecha'|'arriba'|'frente', contraste }
export function paletaEscena(cuadros, planos = []) {
  // un cuadro por plano (a la mitad), pesado por lo que dura el plano; sin planos, unos cuantos repartidos
  const elegidos = [];
  const cerca = t => cuadros.reduce((m, c) => (Math.abs(c.t - t) < Math.abs(m.t - t) ? c : m), cuadros[0]);
  if (planos.length) for (const p of planos) elegidos.push({ c: cerca((p.inicio + p.fin) / 2), peso: Math.max(0.1, p.fin - p.inicio) });
  else for (let k = 0; k < 5; k++) elegidos.push({ c: cuadros[Math.floor((k + 0.5) / 5 * cuadros.length)], peso: 1 });
  const fondo = [], sup = [], izq = [], der = [], arr = [], aba = [], bordes = [];
  for (const { c, peso } of elegidos) {
    if (!c) continue;
    const { rgb, wc, hc } = c, o = objetoEn(c), caja = o && !o.llena ? cajaDilatada(o) : null;
    const reps = Math.max(1, Math.round(peso * 2));
    for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
      const ux = (x + 0.5) / wc, uy = (y + 0.5) / hc, i = 3 * (y * wc + x), col = [rgb[i], rgb[i + 1], rgb[i + 2]];
      const enPieza = caja && ux >= caja.x0 && ux <= caja.x1 && uy >= caja.y0 && uy <= caja.y1;
      if (enPieza) continue;
      const debajo = caja ? uy > caja.y1 && uy < caja.y1 + 0.3 && ux > caja.x0 - 0.1 && ux < caja.x1 + 0.1 : uy > 0.8;
      const encima = caja ? uy < Math.min(0.45, caja.y0) : uy < 0.4;
      for (let r = 0; r < reps; r++) {
        if (encima) fondo.push(col);
        if (debajo) sup.push(col);
      }
      const l = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2];
      if (ux < 0.33) izq.push(l); else if (ux > 0.67) der.push(l);
      if (uy < 0.3) arr.push(l); else if (uy > 0.7) aba.push(l);
    }
    bordes.push(contrasteFondo(c, caja));
  }
  const medianaColor = lista => (lista.length ? [0, 1, 2].map(k => mediana(lista.map(v => v[k]))) : null);
  const F = medianaColor(fondo) || medianaColor(sup) || [200, 190, 180], S = medianaColor(sup) || F;
  const calidez = limitar(((F[0] - F[2]) / (F[0] + F[2] + 1) + (S[0] - S[2]) / (S[0] + S[2] + 1)) * 3, -1, 1);
  const mI = mediana(izq), mD = mediana(der), mA = mediana(arr), mB = mediana(aba);
  const lado = (mI - mD) / Math.max(20, (mI + mD) / 2);
  const luzDesde = Math.abs(lado) > 0.08 ? (lado > 0 ? 'izquierda' : 'derecha') : (mA - mB) / Math.max(20, (mA + mB) / 2) > 0.12 ? 'arriba' : 'frente';
  const contraste = mediana(bordes);
  return { fondo: hex(F), superficie: hex(S), oscuro: lumRel(F) < 0.12, calidez: r2(calidez), sombrasDuras: contraste > 0.05, luzDesde, contraste: r3(contraste) };
}
// Sombras duras (ventana, persiana, hojas): bordes nítidos y marcados en el fondo, lejos de la pieza
function contrasteFondo(c, caja) {
  const { lum, w, h } = c;
  let fuertes = 0, total = 0;
  for (let y = 2; y < h - 2; y += 2) for (let x = 2; x < w - 2; x += 2) {
    const ux = x / w, uy = y / h;
    if (caja && ux >= caja.x0 && ux <= caja.x1 && uy >= caja.y0 && uy <= caja.y1) continue;
    const i = y * w + x, gx = (lum[i + 2] - lum[i - 2]) / 4, gy = (lum[i + 2 * w] - lum[i - 2 * w]) / 4;
    total++;
    if (Math.hypot(gx, gy) > 6) fuertes++;
  }
  return total ? fuertes / total : 0;
}

// =====================================================================================================
// ---------- Navegador: leer el video ----------
// =====================================================================================================
const esperarEvento = (el, ok, mal = 'error', ms = 15000) => new Promise((resolver, rechazar) => {
  const fin = (f, x) => { clearTimeout(t); el.removeEventListener(ok, a); el.removeEventListener(mal, b); f(x); };
  const a = () => fin(resolver), b = () => fin(rechazar, errorVideo(el));
  const t = setTimeout(() => fin(rechazar, new Error('El video tardó demasiado en responder. Prueba de nuevo o con otro archivo.')), ms);
  el.addEventListener(ok, a); el.addEventListener(mal, b);
});
function errorVideo(v) {
  const e = new Error(v?.error?.code === 4 || v?.error?.code === 3
    ? 'Este navegador no puede leer ese video. Prueba con un MP4 (H.264) o un WebM; en iPhone, expórtalo como «Más compatible» o haz una grabación de pantalla.'
    : 'No se pudo leer el video. Revisa que el archivo esté completo y vuelve a subirlo.');
  e.codigo = 'video';
  return e;
}

// Abre el archivo en un <video> mudo (sirve en iPhone y en Chromium sin ventana)
export async function abrirVideo(fuente) {
  if (typeof document === 'undefined') throw new Error('Leer un video necesita el navegador.');
  if (!fuente || typeof fuente.size !== 'number') throw new Error('No llegó ningún video.');
  if (fuente.type && !/^video\//.test(fuente.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(fuente.name || '')) {
    const e = new Error('Ese archivo no es un video. Sube el reel en MP4, MOV o WebM.'); e.codigo = 'tipo'; throw e;
  }
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  const url = URL.createObjectURL(fuente);
  video.src = url;
  try {
    if (video.readyState < 1) await esperarEvento(video, 'loadedmetadata');
    if (!video.videoWidth || !video.videoHeight) { const e = new Error('Ese archivo no tiene imagen (¿es solo audio?).'); e.codigo = 'tipo'; throw e; }
    // un video grabado con MediaRecorder no trae la duración: se busca muy lejos para que el navegador la calcule
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      video.currentTime = 1e7;
      await esperarEvento(video, 'seeked', 'error', 20000).catch(() => {});
      video.currentTime = 0;
      await esperarEvento(video, 'seeked', 'error', 8000).catch(() => {});
    }
    if (video.readyState < 2) await esperarEvento(video, 'loadeddata', 'error', 15000);
  } catch (e) { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); throw e; }
  return { video, url, cerrar: () => { URL.revokeObjectURL(url); video.removeAttribute('src'); try { video.load(); } catch (e) { /* nada */ } } };
}

// Lleva el video al instante t y espera a que el cuadro esté listo para dibujarse. 'seeked' solo no basta: a veces llega
// antes de que el cuadro nuevo quede presentado y drawImage dibuja el anterior (y los cortes cambiaban de una lectura a
// otra). Por eso también se espera requestVideoFrameCallback, pedido antes de buscar (avisa cuando el cuadro nuevo ya está);
// si no llega (el mismo cuadro de antes, o un navegador sin esa función), se sigue tras una espera corta.
export async function irA(video, t) {
  const destino = limitar(t, 0, Math.max(0, (video.duration || 0) - 1e-3));
  if (Math.abs(video.currentTime - destino) < 1e-4 && video.readyState >= 2 && !video.seeking) return;
  const listo = esperarEvento(video, 'seeked', 'error', 10000);
  let id = null, avisar = null;
  const presentado = typeof video.requestVideoFrameCallback === 'function'
    ? new Promise(r => { avisar = r; id = video.requestVideoFrameCallback(() => { id = null; r(); }); })
    : null;
  video.currentTime = destino;
  try {
    await listo;
    if (presentado) await Promise.race([presentado, new Promise(r => setTimeout(r, 150))]);
  } finally {
    if (id !== null) { try { video.cancelVideoFrameCallback?.(id); } catch (e) { /* nada */ } avisar?.(); }
  }
}

// Lee el video a fps cuadros por segundo: { duracion (lo analizado), duracionVideo, recortado, ancho, alto, cuadros, video }.
// Con más de maxSeg segundos se analiza solo el principio (y recortado = true). video: { video, url, cerrar } (abierto;
// lo usa fotogramasClave y se cierra con cerrar()).
export async function leerCuadros(fuente, { fps = FPS_ANALISIS, ancho = ANCHO_ANALISIS, maxSeg = MAX_SEGUNDOS, alAvanzar, cancelado } = {}) {
  const abierto = await abrirVideo(fuente);
  const { video } = abierto;
  try {
    const duracionVideo = video.duration;
    if (!(duracionVideo > 0.4)) { const e = new Error('El video es demasiado corto para analizarlo (menos de medio segundo).'); e.codigo = 'corto'; throw e; }
    const recortado = duracionVideo > maxSeg + 0.05, duracion = Math.min(duracionVideo, maxSeg);
    const vw = video.videoWidth, vh = video.videoHeight;
    const w = Math.max(16, Math.round(ancho / 2) * 2), h = Math.max(16, Math.round(w * vh / vw / 2) * 2);
    const lienzo = document.createElement('canvas'); lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // tiempos de muestreo: un pelito después de k/fps (así cae en el cuadro k/fps y no en el anterior por redondeo)
    const tiempos = [];
    for (let k = 0; ; k++) { const t = k / fps; if (t > duracion - 0.02) break; tiempos.push(t); }
    if (tiempos.length < 3) for (let k = tiempos.length; k < 3; k++) tiempos.push(Math.min(duracion - 0.02, k * duracion / 3));
    const cuadros = [];
    for (let k = 0; k < tiempos.length; k++) {
      cancelar(cancelado);
      await irA(video, tiempos[k] + 0.002);
      ctx.drawImage(video, 0, 0, w, h);
      const datos = ctx.getImageData(0, 0, w, h).data;
      cuadros.push(cuadroDesdePixeles(datos, w, h, r3(tiempos[k])));
      alAvanzar?.((k + 1) / tiempos.length);
    }
    return { duracion: r3(duracion), duracionVideo: r3(duracionVideo), recortado, ancho: vw, alto: vh, fps, cuadros, video: abierto };
  } catch (e) { abierto.cerrar(); throw e; }
}

// Cuadros de análisis en instantes dados (para afinar los cortes): mismos tamaños que leerCuadros
async function cuadrosEn(lectura, tiempos) {
  const { video } = lectura.video, c0 = lectura.cuadros[0];
  const lienzo = document.createElement('canvas'); lienzo.width = c0.w; lienzo.height = c0.h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const r = [];
  for (const t of tiempos) {
    await irA(video, t + 0.002);
    ctx.drawImage(video, 0, 0, c0.w, c0.h);
    r.push(cuadroDesdePixeles(ctx.getImageData(0, 0, c0.w, c0.h).data, c0.w, c0.h, r3(t)));
  }
  return r;
}

// Afina cada corte al cuadro exacto del video (se asume 30 cuadros por segundo si no se sabe): ver refinarCorte
export async function afinarCortes(lectura, cortes, { fpsVideo = 30, cancelado } = {}) {
  const salida = [];
  for (const c of cortes) {
    cancelar(cancelado);
    const i = lectura.cuadros.findIndex(q => q.t >= c.t - 1e-6);
    if (i <= 0) { salida.push(c); continue; }
    // del último cuadro del plano viejo (antes de la zona de la transición) al primero del nuevo
    const t0 = lectura.cuadros[Math.max(0, i - 1)].t, t1 = lectura.cuadros[Math.min(lectura.cuadros.length - 1, i + (c.transicion === 'seco' ? 0 : 1))].t;
    const tiempos = [];
    for (let t = t0; t <= t1 + 1e-6; t += 1 / fpsVideo) tiempos.push(Math.min(t, lectura.duracion - 0.02));
    if (tiempos.length < 3) { salida.push(c); continue; }
    salida.push(refinarCorte(c, await cuadrosEn(lectura, tiempos)));
  }
  return salida;
}

// Fotogramas para la IA: [{ plano, t, base64 (JPEG sin «data:») }] — 2 por plano si son pocos, 1 si son muchos; en total
// ≤ max y ≤ ~1,2 MB. También devuelve miniaturas chicas (dataURL) de cada plano para la pantalla.
export async function fotogramasClave(video, planos, { ancho = 512, max = 16, maxBytes = 1.2e6, anchoMini = 120 } = {}) {
  const v = video?.video || video;
  if (!v || !planos?.length) return { fotogramas: [], miniaturas: [] };
  const vw = v.videoWidth, vh = v.videoHeight, w = Math.min(ancho, vw), h = Math.round(w * vh / vw);
  const lienzo = document.createElement('canvas'); lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  const mini = document.createElement('canvas'); mini.width = anchoMini; mini.height = Math.round(anchoMini * vh / vw);
  const cm = mini.getContext('2d');
  const dos = planos.length * 2 <= max;
  // con muchos planos: los más largos (en el orden del video)
  const usados = dos ? planos : [...planos].sort((a, b) => (b.fin - b.inicio) - (a.fin - a.inicio)).slice(0, max).sort((a, b) => a.inicio - b.inicio);
  const pedidos = [];
  for (const p of usados) {
    const d = p.fin - p.inicio, margen = Math.min(0.15, d * 0.2);
    if (dos && d > 0.6) pedidos.push({ plano: p.indice, t: p.inicio + margen + (d - 2 * margen) * 0.2 }, { plano: p.indice, t: p.inicio + margen + (d - 2 * margen) * 0.8 });
    else pedidos.push({ plano: p.indice, t: p.inicio + d / 2 });
  }
  const capturas = [], miniaturas = new Array(planos.length).fill(null);
  for (const q of pedidos) {
    await irA(v, q.t);
    ctx.drawImage(v, 0, 0, w, h);
    capturas.push({ ...q, lienzo: copiaLienzo(lienzo) });
    const i = planos.findIndex(p => p.indice === q.plano);
    if (i >= 0 && !miniaturas[i]) { cm.drawImage(lienzo, 0, 0, mini.width, mini.height); miniaturas[i] = mini.toDataURL('image/jpeg', 0.72); }
  }
  // planos sin captura (con muchos planos): su miniatura igual se ve en la tira
  for (let i = 0; i < planos.length; i++) if (!miniaturas[i]) {
    await irA(v, (planos[i].inicio + planos[i].fin) / 2);
    cm.drawImage(v, 0, 0, mini.width, mini.height); miniaturas[i] = mini.toDataURL('image/jpeg', 0.72);
  }
  // calidad JPEG que deje el total por debajo del límite
  let fotogramas = [];
  for (const calidad of [0.82, 0.7, 0.58, 0.46, 0.36]) {
    fotogramas = await Promise.all(capturas.map(async c => ({ plano: c.plano, t: r2(c.t), base64: await base64JPEG(c.lienzo, calidad) })));
    if (fotogramas.reduce((a, f) => a + f.base64.length * 0.75, 0) <= maxBytes) break;
  }
  return { fotogramas, miniaturas };
}
function copiaLienzo(c) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
async function base64JPEG(lienzo, calidad) {
  const blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', calidad));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// =====================================================================================================
// ---------- Todo junto ----------
// =====================================================================================================
// alAvanzar(paso, p): paso = 'leyendo' | 'cortes' | 'movimiento' | 'escena' (p de 0 a 1)
// Devuelve el análisis: { duracion, duracionVideo, recortado, ancho, alto, cortes, planos, paleta, miniaturas, fotogramas }
export async function analizarVideo(fuente, { alAvanzar, cancelado, fps = FPS_ANALISIS } = {}) {
  alAvanzar?.('leyendo', 0);
  const lectura = await leerCuadros(fuente, { fps, cancelado, alAvanzar: p => alAvanzar?.('leyendo', p) });
  try {
    alAvanzar?.('cortes', 0); await pausa();
    let cortes = detectarCortes(lectura.cuadros);
    cortes = await afinarCortes(lectura, cortes, { cancelado });
    alAvanzar?.('cortes', 1);
    alAvanzar?.('movimiento', 0); await pausa();
    const planos = await estimarMovimientoPorPartes(lectura.cuadros, cortes, { duracion: lectura.duracion, cancelado, alAvanzar: p => alAvanzar?.('movimiento', p) });
    alAvanzar?.('movimiento', 1);
    alAvanzar?.('escena', 0); await pausa();
    const paleta = paletaEscena(lectura.cuadros, planos);
    const { fotogramas, miniaturas } = await fotogramasClave(lectura.video, planos);
    alAvanzar?.('escena', 1);
    return {
      duracion: lectura.duracion, duracionVideo: lectura.duracionVideo, recortado: lectura.recortado, ancho: lectura.ancho, alto: lectura.alto,
      cortes: cortes.map(({ t, transicion, confianza }) => ({ t, transicion, confianza })), planos, paleta, miniaturas, fotogramas,
    };
  } finally {
    lectura.video.cerrar();
    cachePiramides.clear(); cacheSuaves.clear();
  }
}
