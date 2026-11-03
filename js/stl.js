// STL binario y revisión de mallas para imprimir en 3D (estuches, cajas y elementos de la escena).
// Módulo puro (sin three.js ni DOM): trabaja con listas de triángulos en milímetros (9 números por triángulo).
//  · escribirSTL: el archivo binario (80 bytes de cabecera, cantidad, y por triángulo normal + 3 vértices).
//  · leerSTL: lo contrario (para las pruebas y para revisar lo que se exporta).
//  · revisarMalla: suelda los vértices y mira que la malla sea un sólido cerrado: cada arista entre exactamente dos
//    triángulos y recorrida una vez en cada sentido (caras bien orientadas), sin triángulos degenerados ni NaN.

const TOL = 1e-4;   // mm: dos vértices a menos de esto son el mismo (las piezas se arman con las mismas cuentas)

// Normal de un triángulo (sin normalizar si el área es 0)
function normal(t, i) {
  const ax = t[i + 3] - t[i], ay = t[i + 4] - t[i + 1], az = t[i + 5] - t[i + 2];
  const bx = t[i + 6] - t[i], by = t[i + 7] - t[i + 1], bz = t[i + 8] - t[i + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l] : [0, 0, 0];
}

// Archivo STL binario. triangulos: Float32Array/Array con 9 números por triángulo (mm). La cabecera no empieza con
// «solid» (algunos programas creerían que es un STL de texto)
export function escribirSTL(triangulos, cabecera = 'Atelier & Co - STL en milimetros') {
  const n = Math.floor(triangulos.length / 9), buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  const txt = String(cabecera).replace(/^\s*solid/i, 'Solido').slice(0, 80);
  for (let i = 0; i < txt.length; i++) dv.setUint8(i, txt.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let k = 0; k < n; k++) {
    const i = 9 * k, nn = normal(triangulos, i);
    for (const v of nn) { dv.setFloat32(o, v, true); o += 4; }
    for (let j = 0; j < 9; j++) { dv.setFloat32(o, triangulos[i + j], true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

// Triángulos de un STL binario (Float32Array, 9 por triángulo)
export function leerSTL(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  if (dv.byteLength < 84) return new Float32Array(0);
  const n = dv.getUint32(80, true), sal = new Float32Array(9 * Math.min(n, Math.floor((dv.byteLength - 84) / 50)));
  for (let k = 0, o = 84; k < sal.length / 9; k++, o += 50) for (let j = 0; j < 9; j++) sal[9 * k + j] = dv.getFloat32(o + 12 + 4 * j, true);
  return sal;
}

// Suelda los vértices (por posición, con tolerancia): índices de 3 por triángulo y la lista de posiciones únicas
export function soldar(triangulos, tol = TOL) {
  const mapa = new Map(), pos = [], idx = new Uint32Array(triangulos.length / 3);
  const q = v => Math.round(v / tol);
  for (let i = 0; i < triangulos.length; i += 3) {
    const k = `${q(triangulos[i])},${q(triangulos[i + 1])},${q(triangulos[i + 2])}`;
    let j = mapa.get(k);
    if (j === undefined) { j = pos.length / 3; mapa.set(k, j); pos.push(triangulos[i], triangulos[i + 1], triangulos[i + 2]); }
    idx[i / 3] = j;
  }
  return { idx, pos: new Float32Array(pos) };
}

// Revisión completa de una malla cerrada. Devuelve números (para las pruebas) y `cerrada` (todo bien)
export function revisarMalla(triangulos, { tol = TOL, areaMinima = 1e-9 } = {}) {
  const n = Math.floor(triangulos.length / 9);
  let nan = 0;
  for (let i = 0; i < 9 * n; i++) if (!Number.isFinite(triangulos[i])) nan++;
  const { idx, pos } = soldar(triangulos, tol);
  const aristas = new Map();   // arista sin sentido → [usos, usos a→b con a<b, usos b→a]
  let degenerados = 0, volumen = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
    const i = 9 * t, nn = normal(triangulos, i);
    const ax = triangulos[i + 3] - triangulos[i], ay = triangulos[i + 4] - triangulos[i + 1], az = triangulos[i + 5] - triangulos[i + 2];
    const bx = triangulos[i + 6] - triangulos[i], by = triangulos[i + 7] - triangulos[i + 1], bz = triangulos[i + 8] - triangulos[i + 2];
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    if (a === b || b === c || a === c || !(area > areaMinima) || nn.every(v => v === 0)) degenerados++;
    // volumen con signo (teorema de la divergencia): positivo si las caras miran hacia afuera
    volumen += (triangulos[i] * (triangulos[i + 4] * triangulos[i + 8] - triangulos[i + 5] * triangulos[i + 7])
      - triangulos[i + 1] * (triangulos[i + 3] * triangulos[i + 8] - triangulos[i + 5] * triangulos[i + 6])
      + triangulos[i + 2] * (triangulos[i + 3] * triangulos[i + 7] - triangulos[i + 4] * triangulos[i + 6])) / 6;
    for (let j = 0; j < 9; j++) { const e = j % 3; min[e] = Math.min(min[e], triangulos[i + j]); max[e] = Math.max(max[e], triangulos[i + j]); }
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = p < q ? p * 4294967296 + q : q * 4294967296 + p;
      let e = aristas.get(k);
      if (!e) { e = [0, 0, 0]; aristas.set(k, e); }
      e[0]++; if (p < q) e[1]++; else e[2]++;
    }
  }
  let abiertas = 0, noManifold = 0, malOrientadas = 0;
  for (const e of aristas.values()) {
    if (e[0] === 1) abiertas++; else if (e[0] !== 2) noManifold++;
    else if (e[1] !== 1) malOrientadas++;
  }
  const conchas = contarConchas(idx, pos.length / 3, n);
  return {
    triangulos: n, vertices: pos.length / 3, aristas: aristas.size, abiertas, noManifold, malOrientadas, degenerados, nan,
    volumen, conchas, caja: { min, max, tam: max.map((v, i) => v - min[i]) },
    cerrada: n > 0 && abiertas === 0 && noManifold === 0 && malOrientadas === 0 && degenerados === 0 && nan === 0 && volumen > 0,
  };
}

// Sólidos separados (grupos de triángulos que comparten vértices)
function contarConchas(idx, nv, n) {
  const padre = new Int32Array(nv).map((_, i) => i);
  const raiz = x => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  for (let t = 0; t < n; t++) {
    const a = raiz(idx[3 * t]), b = raiz(idx[3 * t + 1]), c = raiz(idx[3 * t + 2]);
    padre[b] = a; padre[raiz(c)] = a;
  }
  const s = new Set();
  for (let t = 0; t < n; t++) s.add(raiz(idx[3 * t]));
  return s.size;
}
