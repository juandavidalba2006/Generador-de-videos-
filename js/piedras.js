import * as THREE from 'three';

// Mismo reconocimiento de piedras que usa el visor 3D de la página de la joyería
// Autovalores de una matriz simétrica 3×3 (de mayor a menor)
function autovalores(a, b, c, d, e, f) {
  const p1 = d * d + e * e + f * f;
  if (p1 < 1e-18) return [a, b, c].sort((x, y) => y - x);
  const q = (a + b + c) / 3, p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
  const A = (a - q) / p, B = (b - q) / p, C = (c - q) / p, D = d / p, E = e / p, Fq = f / p;
  const r = (A * (B * C - E * E) - D * (D * C - E * Fq) + Fq * (D * E - B * Fq)) / 2;
  const phi = r <= -1 ? Math.PI / 3 : r >= 1 ? 0 : Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
  return [e1, 3 * q - e1 - e3, e3];
}
export function separarPiedras(geo) {
  const pos = geo.attributes.position, nT = pos.count / 3;
  if (nT > 700000) return null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, diag = bb.max.distanceTo(bb.min) || 1, q = diag * 2e-5;
  const ids = new Map(), padre = [];
  const raiz = a => { while (padre[a] !== a) { padre[a] = padre[padre[a]]; a = padre[a]; } return a; };
  const A = pos.array;
  const vid = i => { const k = Math.round(A[3 * i] / q) + ',' + Math.round(A[3 * i + 1] / q) + ',' + Math.round(A[3 * i + 2] / q); let id = ids.get(k); if (id === undefined) { id = padre.length; ids.set(k, id); padre.push(id); } return id; };
  const triV = new Int32Array(nT * 3);
  for (let t = 0; t < nT; t++) {
    const a = vid(3 * t), b = vid(3 * t + 1), c = vid(3 * t + 2); triV[3 * t] = a; triV[3 * t + 1] = b; triV[3 * t + 2] = c;
    const ra = raiz(a), rb = raiz(b), rc = raiz(c); padre[rb] = ra; padre[raiz(c)] = ra; void rc;
  }
  const comp = new Map();
  for (let t = 0; t < nT; t++) {
    const r = raiz(triV[3 * t]); let c = comp.get(r);
    if (!c) { c = { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; comp.set(r, c); }
    c.tris.push(t);
    for (let k = 0; k < 3; k++) { const i = 3 * t + k; for (let e = 0; e < 3; e++) { const v = A[3 * i + e]; if (v < c.min[e]) c.min[e] = v; if (v > c.max[e]) c.max[e] = v; } }
  }
  if (comp.size < 2) return null;
  const esPiedra = c => {
    const ext = [0, 1, 2].map(e => c.max[e] - c.min[e]), d = Math.hypot(...ext);
    if (d > diag * 0.45) return false;                                   // el aro o una pieza grande
    if (c.tris.length < 8) return false;
    // forma de la pieza por componentes principales: las garras y rieles son alargados aunque estén inclinados
    let n = 0, mx = 0, my = 0, mz = 0; const paso = Math.max(1, Math.floor(c.tris.length / 1500)), P = [];
    for (let k = 0; k < c.tris.length; k += paso) for (let v = 0; v < 3; v++) { const i = 3 * c.tris[k] + v; P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    n = P.length / 3; for (let k = 0; k < n; k++) { mx += P[3 * k]; my += P[3 * k + 1]; mz += P[3 * k + 2]; } mx /= n; my /= n; mz /= n;
    let xx = 0, yy = 0, zz = 0, xy = 0, yz = 0, xz = 0;
    for (let k = 0; k < n; k++) { const x = P[3 * k] - mx, y = P[3 * k + 1] - my, z = P[3 * k + 2] - mz; xx += x * x; yy += y * y; zz += z * z; xy += x * y; yz += y * z; xz += x * z; }
    const [e1, e2, e3] = autovalores(xx / n, yy / n, zz / n, xy / n, yz / n, xz / n);
    // piedra: ancha en sus dos medidas mayores (redonda, oval, pera…); garra o riel: alargada como una línea; lámina: muy plana
    return Math.sqrt(e1 / Math.max(e2, 1e-12)) < 2.6 && Math.sqrt(e1 / Math.max(e3, 1e-12)) < 8;
  };
  const piedra = [], metal = [];
  comp.forEach(c => { const destino = esPiedra(c) ? piedra : metal; for (let k = 0; k < c.tris.length; k++) destino.push(c.tris[k]); });   // sin '...': en modelos grandes desbordaría la pila
  if (!piedra.length || !metal.length) return null;
  const hacer = lista => { const arr = new Float32Array(lista.length * 9); for (let k = 0; k < lista.length; k++) arr.set(A.subarray(9 * lista[k], 9 * lista[k] + 9), 9 * k); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g; };
  return { metal: hacer(metal), piedras: hacer(piedra) };
}
