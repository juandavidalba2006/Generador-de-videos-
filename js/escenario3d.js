// Escenario 3D: la superficie donde se apoya la joya (pedestal, bloque, losa, escalones, cojín o el piso), el fondo y la
// luz principal con sombras de ventana (gobo). Se arma con una escena de escenas.js y con el tamaño de la joya: todas las
// medidas salen del radio de la pieza, así se ve igual con un arete que con un collar.
// Hay dos copias, una por motor:
//  · motor rápido: la luz es un foco con un «cookie» (la ventana dibujada y difuminada) y un mapa de sombras para la joya
//    y el pedestal; una mancha suave bajo la pieza hace de sombra de contacto.
//  · trazado de rayos: la ventana es geometría de verdad entre la luz y la escena (de una sola cara, mirando a la luz:
//    el trazador la usa para las sombras pero la cámara la atraviesa) y la luz tiene tamaño, así la penumbra es física.
// Los dos usan el mismo dibujo de la ventana en el plano de la joya: el patrón cae igual en la vista previa y en el video.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PhysicalSpotLight, ShapedAreaLight } from 'three-gpu-pathtracer';
import { mapaNormalDesde } from './texturas.js';
import { normalizarEscena } from './escenas.js';

const M = THREE.MathUtils;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const suav = t => t * t * (3 - 2 * t);
const lienzo = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx2d = c => c.getContext('2d', { willReadFrequently: true });

// Medidas fijas del escenario, en radios de la joya
const ANCHO = 70, FRENTE = 60, ALTO_FONDO = 70;   // el fondo y el piso son enormes: con cualquier zoom o giro no se ve el borde
const DIST_LUZ = 80, DIST_VENTANA = 40;           // la ventana queda siempre más lejos que la cámara (con zoom 0,4 y textos: ~38 r)
const MEDIO_COOKIE = 12;                          // el foco cubre ±12 r alrededor de la joya (todo lo que puede verse)
const EPS = 2e-4;                                 // el pedestal queda una nada más abajo: la joya lo toca sin pelear por el mismo plano

// ---------- Azar y ruido que se repite sin costuras ----------
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Ruido de valor con cx × cy celdas (enteras: el borde derecho empalma con el izquierdo)
function ruido(N, cx, cy, semilla, sal = new Float32Array(N * N), peso = 1) {
  const R = azar(semilla), g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const x0 = new Int32Array(N), x1 = new Int32Array(N), tx = new Float32Array(N);
  for (let x = 0; x < N; x++) { const f = x / N * cx, i = Math.floor(f); x0[x] = i % cx; x1[x] = (i + 1) % cx; tx[x] = suav(f - i); }
  for (let y = 0; y < N; y++) {
    const f = y / N * cy, j = Math.floor(f), ty = suav(f - j), a = (j % cy) * cx, b = ((j + 1) % cy) * cx, o = y * N;
    for (let x = 0; x < N; x++) {
      const p = g[a + x0[x]] + (g[a + x1[x]] - g[a + x0[x]]) * tx[x], q = g[b + x0[x]] + (g[b + x1[x]] - g[b + x0[x]]) * tx[x];
      sal[o + x] += (p + (q - p) * ty) * peso;
    }
  }
  return sal;
}
// Suma de octavas (fbm) normalizada a 0..1; estirar = [ex, ey] alarga el grano en un eje (bandas, vetas de madera)
function fbm(N, celdas, octavas, semilla, { ganancia = 0.5, estirar = [1, 1] } = {}) {
  const sal = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (let o = 0; o < octavas; o++) {
    const c = celdas * (1 << o);
    ruido(N, Math.max(1, Math.round(c * estirar[0])), Math.max(1, Math.round(c * estirar[1])), semilla + o * 101, sal, amp);
    total += amp; amp *= ganancia;
  }
  for (let i = 0; i < sal.length; i++) sal[i] /= total;
  return sal;
}
// Puntos (poros, granos) que dan la vuelta por los bordes
function puntos(N, cantidad, semilla, { rx = [1, 3], ry = [1, 3], fuerza = [0.5, 1] } = {}) {
  const R = azar(semilla), sal = new Float32Array(N * N);
  for (let k = 0; k < cantidad; k++) {
    const cx = R() * N, cy = R() * N, ax = rx[0] + R() * (rx[1] - rx[0]), ay = ry[0] + R() * (ry[1] - ry[0]), f = fuerza[0] + R() * (fuerza[1] - fuerza[0]);
    for (let y = Math.floor(cy - ay - 1); y <= cy + ay + 1; y++) for (let x = Math.floor(cx - ax - 1); x <= cx + ax + 1; x++) {
      const d = ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2;
      if (d >= 1) continue;
      const i = ((y % N) + N) % N * N + ((x % N) + N) % N;
      sal[i] = Math.max(sal[i], f * (1 - d));
    }
  }
  return sal;
}

// ---------- Materiales ----------
// T: lado de una repetición de la textura, en radios de la joya; N: píxeles; rug: rugosidad (mín, máx)
const TIPOS = {
  yeso:         { T: 3.2, N: 1024, rug: [0.84, 0.96], relieve: 0.14 },
  travertino:   { T: 6,   N: 1024, rug: [0.55, 0.85], relieve: 0.8 },
  marmolBlanco: { T: 8,   N: 1024, rug: [0.1, 0.2],   relieve: 0.06, capa: 0.5 },
  marmolNegro:  { T: 8,   N: 1024, rug: [0.08, 0.18], relieve: 0.06, capa: 0.6 },
  concreto:     { T: 5,   N: 1024, rug: [0.5, 0.78],  relieve: 0.8 },
  terciopelo:   { T: 3,   N: 512,  rug: [0.92, 1],    relieve: 0.3, brillo: 1 },
  lino:         { T: 1.2, N: 512,  rug: [0.8, 0.95],  relieve: 1.4, brillo: 0.25 },
  arena:        { T: 1.8, N: 1024, rug: [0.88, 1],    relieve: 1.5 },
  madera:       { T: 7,   N: 1024, rug: [0.42, 0.62], relieve: 0.35, capa: 0.15 },
  acrilico:     { T: 10,  N: 256,  rug: [0.035, 0.05], relieve: 0, capa: 1, espejo: true },
};

// Patrón de cada material, en gris (se guarda: cambiar el color solo vuelve a teñir).
// alto: relieve (0..1); varia: brillo del color (≈1); rug: rugosidad (0..1); veta: máscara de vetas (mármol)
const PATRONES = new Map();
function patron(tipo) {
  if (PATRONES.has(tipo)) return PATRONES.get(tipo);
  const { N } = TIPOS[tipo], n = N * N;
  const alto = new Float32Array(n), varia = new Float32Array(n).fill(1), rug = new Float32Array(n).fill(0.5);
  let veta = null;
  if (tipo === 'yeso') {
    // yeso de estudio: casi liso, con un grano finísimo y manchas suaves de la mano del yesero
    const fino = fbm(N, 160, 2, 11), mancha = fbm(N, 3, 4, 12), poro = puntos(N, 260, 13, { rx: [0.6, 1.3], ry: [0.6, 1.3], fuerza: [0.2, 0.6] });
    for (let i = 0; i < n; i++) {
      alto[i] = 0.55 + 0.3 * (fino[i] - 0.5) + 0.08 * (mancha[i] - 0.5) - 0.3 * poro[i];
      varia[i] = 1 + 0.045 * (mancha[i] - 0.5) + 0.02 * (fino[i] - 0.5) - 0.03 * poro[i];
      rug[i] = fino[i];
    }
  } else if (tipo === 'travertino') {
    // travertino: vetas horizontales de color (capas de sedimento) y poros alargados en el sentido de las capas, unos
    // pocos marcados y muchos apenas insinuados (rellenos de resina, como en el travertino pulido)
    const banda = fbm(N, 2, 5, 21, { estirar: [1, 7] }), banda2 = fbm(N, 3, 3, 24, { estirar: [0.5, 9] }), fino = fbm(N, 64, 3, 22);
    const poro = puntos(N, 240, 23, { rx: [2, 9], ry: [0.7, 1.6], fuerza: [0.3, 1] }), poroSuave = puntos(N, 700, 25, { rx: [1.5, 6], ry: [0.6, 1.4], fuerza: [0.1, 0.4] });
    for (let i = 0; i < n; i++) {
      const b = banda[i], p = Math.max(poro[i], poroSuave[i]);
      alto[i] = 0.6 + 0.08 * (b - 0.5) + 0.1 * (fino[i] - 0.5) - 0.3 * p;
      varia[i] = 0.93 + 0.26 * (b - 0.5) + 0.12 * (banda2[i] - 0.5) + 0.04 * (fino[i] - 0.5) - 0.1 * p;
      rug[i] = Math.min(1, 0.45 * fino[i] + 0.5 * p + 0.2);
    }
  } else if (tipo === 'marmolBlanco' || tipo === 'marmolNegro') {
    const negro = tipo === 'marmolNegro', turb = fbm(N, 3, 6, negro ? 41 : 31), turb2 = fbm(N, 5, 5, negro ? 42 : 32), nube = fbm(N, 4, 4, negro ? 43 : 33);
    veta = new Float32Array(n);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = x / N, v = y / N;
      // vetas: valles de una onda torcida por el ruido (frecuencias enteras: la textura empalma)
      const v1 = Math.abs(Math.sin(Math.PI * (u * 2 + v * 1) + 7 * turb[i]));
      const v2 = Math.abs(Math.sin(Math.PI * (u * 3 - v * 4) + 9 * turb2[i]));
      const fina = Math.pow(1 - v1, negro ? 26 : 18), segunda = Math.pow(1 - v2, 40) * 0.6;
      veta[i] = Math.min(1, fina + segunda);
      varia[i] = 1 - (negro ? 0.1 : 0.07) * (nube[i] - 0.5) * 2;
      alto[i] = 0.5 - 0.06 * veta[i];
      rug[i] = 0.3 * nube[i] + 0.5 * veta[i];
    }
  } else if (tipo === 'concreto') {
    const mancha = fbm(N, 4, 5, 51), fino = fbm(N, 128, 2, 52), poro = puntos(N, 2500, 53, { rx: [0.7, 2.2], ry: [0.7, 2.2], fuerza: [0.4, 1] });
    for (let i = 0; i < n; i++) {
      alto[i] = 0.55 + 0.25 * (fino[i] - 0.5) + 0.15 * (mancha[i] - 0.5) - 0.5 * poro[i];
      varia[i] = 0.92 + 0.22 * (mancha[i] - 0.5) + 0.05 * (fino[i] - 0.5) - 0.2 * poro[i];
      rug[i] = 0.6 * fino[i] + 0.4 * mancha[i];
    }
  } else if (tipo === 'terciopelo') {
    const aplastado = fbm(N, 5, 4, 61), fibra = fbm(N, 128, 2, 62);
    for (let i = 0; i < n; i++) {
      alto[i] = 0.5 + 0.3 * (fibra[i] - 0.5) + 0.2 * (aplastado[i] - 0.5);
      varia[i] = 0.93 + 0.16 * (aplastado[i] - 0.5) + 0.04 * (fibra[i] - 0.5);
      rug[i] = fibra[i];
    }
  } else if (tipo === 'lino') {
    const hilos = 48, R = azar(71), grosorX = Array.from({ length: hilos }, () => 0.75 + 0.5 * R()), grosorY = Array.from({ length: hilos }, () => 0.75 + 0.5 * R());
    const fino = fbm(N, 64, 2, 72);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = x / N * hilos, v = y / N * hilos, cx = Math.floor(u), cy = Math.floor(v), fx = u - cx, fy = v - cy;
      // tejido plano: en cada cruce va arriba la urdimbre o la trama, alternando como un tablero
      const urdimbre = Math.pow(Math.sin(Math.PI * fx), 0.6) * grosorX[cx], trama = Math.pow(Math.sin(Math.PI * fy), 0.6) * grosorY[cy];
      const arriba = (cx + cy) % 2 === 0;
      const h = arriba ? urdimbre * (0.7 + 0.3 * Math.sin(Math.PI * fy)) : trama * (0.7 + 0.3 * Math.sin(Math.PI * fx));
      alto[i] = 0.25 + 0.6 * h + 0.1 * (fino[i] - 0.5);
      varia[i] = 0.84 + 0.2 * h + 0.06 * (fino[i] - 0.5);
      rug[i] = 0.5 + 0.5 * fino[i];
    }
  } else if (tipo === 'arena') {
    const grano = fbm(N, 220, 2, 81, { ganancia: 0.6 }), medio = fbm(N, 40, 3, 82), oscuros = puntos(N, 6000, 83, { rx: [0.8, 1.8], ry: [0.8, 1.8], fuerza: [0.4, 1] }), claros = puntos(N, 4000, 84, { rx: [0.8, 1.6], ry: [0.8, 1.6], fuerza: [0.4, 1] });
    for (let i = 0; i < n; i++) {
      // (el relieve mediano va suave: con el sol rasante se veían manchas grandes en el piso cercano)
      alto[i] = 0.5 + 0.55 * (grano[i] - 0.5) + 0.1 * (medio[i] - 0.5) + 0.2 * claros[i] - 0.15 * oscuros[i];
      varia[i] = 0.92 + 0.16 * (grano[i] - 0.5) + 0.08 * (medio[i] - 0.5) + 0.16 * claros[i] - 0.3 * oscuros[i];
      rug[i] = grano[i];
    }
  } else if (tipo === 'madera') {
    const anillo = fbm(N, 2, 5, 91, { estirar: [0.5, 5] }), veta2 = fbm(N, 6, 3, 92, { estirar: [0.25, 12] }), fino = fbm(N, 96, 2, 93, { estirar: [0.3, 3] });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, v = y / N;
      const g = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 9 + 3 * anillo[i]));
      const linea = Math.pow(g, 6);
      alto[i] = 0.55 - 0.12 * linea + 0.15 * (fino[i] - 0.5);
      varia[i] = 0.95 - 0.16 * linea + 0.1 * (veta2[i] - 0.5) + 0.05 * (fino[i] - 0.5);
      rug[i] = 0.4 * fino[i] + 0.6 * linea;
    }
  } else {
    // acrílico: liso, con una ondulación mínima para que el reflejo no se vea de computador
    const onda = fbm(N, 3, 2, 99);
    for (let i = 0; i < n; i++) { alto[i] = 0.5 + 0.02 * (onda[i] - 0.5); rug[i] = onda[i]; }
  }
  const p = { N, alto, varia, rug, veta, normal: null, rugTex: null };
  PATRONES.set(tipo, p);
  return p;
}

const enLienzo = (N, f) => {
  const c = lienzo(N), x = ctx2d(c), img = x.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) { const [r, g, b] = f(i); d[4 * i] = r; d[4 * i + 1] = g; d[4 * i + 2] = b; d[4 * i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
};
const repetir = (tex, aniso = 8) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = aniso; tex.needsUpdate = true; return tex; };
const sRGB = hex => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// Texturas de un material con su color (el mapa de color se tiñe aquí: las vetas del mármol negro son más claras que su color)
function texturas(tipo, color) {
  const p = patron(tipo), { N } = p, base = sRGB(color);
  const vetaColor = tipo === 'marmolNegro' ? [226, 214, 196] : tipo === 'marmolBlanco' ? base.map(v => v * 0.52) : null;
  const mapa = repetir(new THREE.CanvasTexture(enLienzo(N, i => {
    const k = p.varia[i];
    let c = base.map(v => v * k);
    if (vetaColor) { const t = p.veta[i] * (tipo === 'marmolNegro' ? 0.85 : 0.7); c = c.map((v, j) => v + (vetaColor[j] - v) * t); }
    return c.map(v => limitar(Math.round(v), 0, 255));
  })));
  mapa.colorSpace = THREE.SRGBColorSpace;
  if (!p.normal) {
    const alto = enLienzo(N, i => { const v = limitar(Math.round(p.alto[i] * 255), 0, 255); return [v, v, v]; });
    p.normal = mapaNormalDesde(alto, TIPOS[tipo].relieve);
    p.normal.anisotropy = 8;
  }
  if (!p.rugTex) {
    const [a, b] = TIPOS[tipo].rug;
    p.rugTex = repetir(new THREE.CanvasTexture(enLienzo(N, i => { const v = limitar(Math.round((a + (b - a) * p.rug[i]) * 255), 0, 255); return [v, v, v]; })));
    p.rugTex.colorSpace = THREE.NoColorSpace;
  }
  return { mapa, normal: p.normal, rug: p.rugTex };
}

// Material físico (sirve para los dos motores: el trazador lee color, mapas, rugosidad, brillo y capa de laca)
function crearMaterial(tipo, color) {
  const def = TIPOS[tipo] || TIPOS.yeso, tx = texturas(tipo, color);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: tx.mapa, roughnessMap: tx.rug, roughness: 1, metalness: 0,
    normalMap: def.relieve > 0 ? tx.normal : null, normalScale: new THREE.Vector2(1, 1),
    // el pedestal queda un pelo detrás de la joya en el búfer de profundidad: si la pieza tiene la base plana no titila
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  if (def.capa) { m.clearcoat = def.capa; m.clearcoatRoughness = def.espejo ? 0.02 : 0.08; }
  if (def.brillo) {   // terciopelo y lino: brillo aterciopelado en los bordes (sheen)
    m.sheen = def.brillo; m.sheenRoughness = tipo === 'terciopelo' ? 0.32 : 0.7;
    m.sheenColor.set(color).lerp(new THREE.Color(0xffffff), tipo === 'terciopelo' ? 0.18 : 0.5);
    // la tela casi no tiene reflejo especular (sin esto el terciopelo se ve gris, como plástico mate)
    m.specularIntensity = tipo === 'terciopelo' ? 0.08 : 0.3;
  }
  if (def.espejo) { m.ior = 2; m.specularIntensity = 1; }   // acrílico: refleja bastante más que un plástico común
  m.userData.tipo = tipo;
  return m;
}

// ---------- Geometría ----------
// Torno con coordenadas de textura en unidades del mundo: lo plano usa (x, z) y lo vertical (vuelta, altura).
// perfil: [{ r, y, nr, ny, corte?, plano? }] (corte: no se une con el anterior; se usa para cambiar de proyección sin estirar)
function torno(perfil, segmentos, escalaUV) {
  const pos = [], nor = [], uv = [], idx = [];
  let s = 0, previo = null, filaPrevia = 0;
  const filas = [];
  for (const p of perfil) {
    if (previo && !p.corte) s += Math.hypot(p.r - previo.r, p.y - previo.y);
    const fila = pos.length / 3, vueltas = Math.max(1, Math.round(2 * Math.PI * p.r / escalaUV));   // u entero por vuelta: sin costura
    for (let j = 0; j <= segmentos; j++) {
      const t = j / segmentos, a = t * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(p.r * c, p.y, p.r * sn); nor.push(p.nr * c, p.ny, p.nr * sn);
      if (p.plano) uv.push(p.r * c / escalaUV, p.r * sn / escalaUV); else uv.push(t * vueltas, -s / escalaUV);
    }
    if (previo && !p.corte) filas.push([filaPrevia, fila]);
    filaPrevia = fila; previo = p;
  }
  for (const [a, b] of filas) for (let j = 0; j < segmentos; j++) {
    // el perfil va de arriba (centro) hacia abajo: los triángulos miran hacia afuera
    idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// Puntos de un cuarto de círculo (de un borde redondeado) en el perfil del torno
function bisel(perfil, cr, cy, radio, desde, hasta, pasos, plano) {
  for (let i = 1; i <= pasos; i++) {
    const f = desde + (hasta - desde) * i / pasos, nr = Math.cos(f), ny = Math.sin(f);
    perfil.push({ r: cr + radio * nr, y: cy + radio * ny, nr, ny, plano });
  }
}
// Pedestal redondo con el borde de arriba redondeado (como el de la foto). Arriba en y = 0
function perfilCilindro(R, H, b, perfil = [], { tapa = true, fondo = -H } = {}) {
  if (tapa) perfil.push({ r: 0, y: 0, nr: 0, ny: 1, plano: true });
  perfil.push({ r: R - b, y: 0, nr: 0, ny: 1, plano: true, corte: !tapa });
  bisel(perfil, R - b, -b, b, Math.PI / 2, Math.PI / 4, 4, true);
  // cambio de proyección a mitad del bisel (mismo punto, otra coordenada de textura)
  const medio = perfil[perfil.length - 1];
  perfil.push({ ...medio, plano: false, corte: true });
  bisel(perfil, R - b, -b, b, Math.PI / 4, 0, 4, false);
  perfil.push({ r: R, y: fondo, nr: 1, ny: 0, plano: false });
  return perfil;
}

// Bloque con las aristas redondeadas, indexado (RoundedBoxGeometry viene sin índice y así no se le pueden calcular tangentes)
function caja(w, h, d, segmentos, radio) {
  const g0 = new RoundedBoxGeometry(w, h, d, segmentos, radio);
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0); g0.dispose();
  return g;
}
// Proyección de caja por vértice (bloques y losas): cada vértice usa el eje dominante de su normal
function uvCaja(g, escalaUV) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [a, b] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[2 * i] = a / escalaUV; uv[2 * i + 1] = b / escalaUV;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Solo posición, normal y uv (para poder unir geometrías de distinto origen)
const limpia = g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
const rect = (x0, y0, x1, y1) => { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; };

// Pedestal según la forma. u = radio de la joya, hu = media huella de la pieza en el piso. Arriba en y = 0.
// Devuelve la geometría, su alto y lo que ocupa (para el piso y el fondo)
function pedestal(sup, u, hu, escalaUV) {
  const t = sup.tamano, a = sup.altura;
  switch (sup.forma) {
    case 'cubo': {
      const L = t * (0.95 * hu + 0.75 * u), H = a * 1.6 * u;
      const g = caja(2 * L, H + 0.02 * u, 2 * L, 5, Math.min(L, H) * 0.06);
      g.translate(0, -H / 2 - 0.01 * u, 0);
      return { geo: uvCaja(g, escalaUV), H, alcanceZ: L, huellaPiso: { tipo: 'caja', x: L, z: L, radio: Math.min(L, H) * 0.06 }, tapa: { tipo: 'caja', x: L * 0.97, z: L * 0.97 } };
    }
    case 'losa': {
      const X = t * (1.05 * hu + 0.8 * u), Z = X * 0.72, H = a * 1.2 * u, re = Math.min(H * 0.25, 0.08 * u);
      const g = caja(2 * X, H + 0.02 * u, 2 * Z, 4, re);
      g.translate(0, -H / 2 - 0.01 * u, 0);
      return { geo: uvCaja(g, escalaUV), H, alcanceZ: Z, huellaPiso: { tipo: 'caja', x: X, z: Z, radio: re }, tapa: { tipo: 'caja', x: X - re, z: Z - re } };
    }
    case 'escalones': {
      const R1 = t * (0.9 * hu + 0.7 * u), paso = t * 0.75 * u, h = a * 0.6 * u, b = Math.min(0.05 * u, h * 0.2);
      const p = perfilCilindro(R1, h, b, [], { fondo: -h });
      for (const [R, y0] of [[R1 + paso, -h], [R1 + 2 * paso, -2 * h]]) {
        // escalón: la huella plana desde el escalón de arriba, el borde redondeado y la contrahuella
        p.push({ r: R - paso, y: y0, nr: 0, ny: 1, plano: true, corte: true });
        p.push({ r: R - b, y: y0, nr: 0, ny: 1, plano: true });
        bisel(p, R - b, y0 - b, b, Math.PI / 2, Math.PI / 4, 3, true);
        p.push({ ...p[p.length - 1], plano: false, corte: true });
        bisel(p, R - b, y0 - b, b, Math.PI / 4, 0, 3, false);
        p.push({ r: R, y: y0 - h, nr: 1, ny: 0, plano: false });
      }
      p[p.length - 1].y -= 0.01 * u;
      return { geo: torno(p, 160, escalaUV), H: 3 * h, alcanceZ: R1 + 2 * paso, huellaPiso: { tipo: 'disco', r: R1 + 2 * paso }, tapa: { tipo: 'disco', r: R1 - b } };
    }
    case 'cojin': {
      const X = t * (1.0 * hu + 0.9 * u), H = a * 1.1 * u;
      const g0 = new RoundedBoxGeometry(2 * X, H, 2 * X, 10, H * 0.46);
      g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
      const g = mergeVertices(g0); g0.dispose();   // indexada: las normales salen suaves al inflarlo
      // cojín: los lados se inflan y el centro queda apenas más alto (ahí descansa la joya)
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), fx = 1 - (x / X) ** 2, fz = 1 - (z / X) ** 2, fy = 1 - (2 * y / H) ** 2;
        const infla = 1 + 0.06 * Math.max(0, fy);
        p.setXYZ(i, x * infla, y + (y > 0 ? 0.12 * H * Math.max(0, fx) * Math.max(0, fz) : 0), z * infla);
      }
      g.computeVertexNormals();
      g.translate(0, -H / 2 - 0.12 * H, 0);
      return { geo: uvCaja(g, escalaUV), H: H + 0.12 * H, alcanceZ: X * 1.06, huellaPiso: { tipo: 'caja', x: X * 1.02, z: X * 1.02, radio: H * 0.4 } };
    }
    case 'piso': return { geo: null, H: 0, alcanceZ: 0, huellaPiso: null };
    default: {   // cilindro
      const R = t * (1.0 * hu + 0.9 * u), H = a * 1.5 * u, b = Math.min(0.045 * R, 0.25 * H);
      const p = perfilCilindro(R, H, b, []);
      p[p.length - 1].y -= 0.01 * u;
      return { geo: torno(p, 192, escalaUV), H, alcanceZ: R, huellaPiso: { tipo: 'disco', r: R }, tapa: { tipo: 'disco', r: R - b } };
    }
  }
}

// Coordenadas de una rejilla de a hasta b: finas cerca de la joya y cada vez más gruesas hacia el borde.
// (los triángulos enormes se sombrean mal: al interpolar por vértice la luz del foco salta y se ve una raya)
function graduada(a, b, u, extra = []) {
  const v = new Set([a, b, ...extra.filter(x => x > a && x < b)]);
  for (const signo of [1, -1]) {
    let x = 0, paso = 1.2 * u;
    while (x < Math.max(Math.abs(a), Math.abs(b))) {
      const p = signo * x;
      if (p > a && p < b) v.add(p);   // (el tramo puede no pasar por el centro: los muros a los lados del arco)
      x += paso; if (x > 14 * u) paso = Math.min(paso * 1.3, 8 * u);
    }
  }
  return [...v].sort((m, n) => m - n);
}
// Malla de rejilla: columnas × filas; punto(i, j) → { p: [x, y, z], n: [nx, ny, nz], uv: [u, v] }
function rejilla(columnas, filas, punto, { unir = () => true } = {}) {
  const pos = [], nor = [], uv = [], idx = [], C = columnas, F = filas;
  for (let j = 0; j < F; j++) for (let i = 0; i < C; i++) { const q = punto(i, j); pos.push(...q.p); nor.push(...q.n); uv.push(...q.uv); }
  for (let j = 0; j + 1 < F; j++) {
    if (!unir(j)) continue;
    for (let i = 0; i + 1 < C; i++) { const a = j * C + i, b = a + C; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// Tira extruida a lo ancho (eje x) de un perfil en (z, y): el piso que sube hasta el fondo.
// Un punto con corte no se une con el anterior (esquina viva: el mismo punto con otra normal)
function barrido(perfil, xs, escalaUV) {
  let s = 0;
  const largo = perfil.map((p, i) => (i && !p.corte ? (s += Math.hypot(p.z - perfil[i - 1].z, p.y - perfil[i - 1].y)) : s));
  return rejilla(xs.length, perfil.length, (i, j) => {
    const p = perfil[j], x = xs[i];
    return { p: [x, p.y, p.z], n: [0, p.ny, p.nz], uv: [x / escalaUV, largo[j] / escalaUV] };
  }, { unir: j => !perfil[j + 1].corte });
}
// Muro vertical en z = 0 entre x0 y x1 con la base en y = base(x) (para el muro con el arco)
function muro(xs, base, Ht, u, escalaUV) {
  const filas = 18;
  return rejilla(xs.length, filas, (i, j) => {
    const x = xs[i], y0 = base(x), t = j / (filas - 1), y = y0 + (Ht - y0) * Math.pow(t, 1.8);   // filas más juntas abajo
    return { p: [x, y, 0], n: [0, 0, 1], uv: [x / escalaUV, y / escalaUV] };
  });
}
const soloBasicos = limpia;

// Piso y fondo. B: distancia del fondo detrás de la joya; piso en y = 0 (se sube después)
function fondo(f, B, u, escalaUV, alcanceZ) {
  const W = ANCHO * u, F = FRENTE * u, Ht = ALTO_FONDO * u, xs = graduada(-W, W, u);
  const filasHasta = (z0, z1) => graduada(-F, F, u).map(z => -z).filter(z => z < z1 && z > z0).concat([z0, z1]).sort((a, b) => b - a);
  if (f.forma === 'pared') {
    // pared y piso con una esquina viva: el piso hasta la pared y la pared hacia arriba
    const perfil = filasHasta(-B, F).map(z => ({ z, y: 0, ny: 1, nz: 0 }));
    perfil.push({ z: -B, y: 0, ny: 0, nz: 1, corte: true });
    for (let h = 1.2 * u, paso = 1.2 * u; h < Ht; h += paso, paso = Math.min(paso * 1.3, 8 * u)) perfil.push({ z: -B, y: h, ny: 0, nz: 1 });
    perfil.push({ z: -B, y: Ht, ny: 0, nz: 1 });
    perfil[perfil.length - 1].z = -B;
    return { geo: barrido(perfil, xs, escalaUV), esquina: { z: -B } };
  }
  if (f.forma === 'arco') {
    // pared con un nicho en arco detrás de la joya: el piso entra al nicho
    const A = Math.max(1.7 * u, alcanceZ * 1.05 + 0.5 * u), Hs = Math.max(2.2 * u, A * 1.1), N = 1.6 * u * Math.max(0.8, f.distancia);
    const piso = barrido(filasHasta(-B - N, F).map(z => ({ z, y: 0, ny: 1, nz: 0 })), xs, escalaUV);
    const bajo = -0.06 * u, arcoY = x => Hs + Math.sqrt(Math.max(0, A * A - x * x));
    // (los muros de los lados entran una nada sobre el del arco: sus filas no coinciden en la junta y quedarían rendijas)
    const solape = 0.01 * u;
    const izq = muro(graduada(-W, -A + solape, u, [-A + solape]), () => bajo, Ht, u, escalaUV), der = muro(graduada(A - solape, W, u, [A - solape]), () => bajo, Ht, u, escalaUV);
    // (las columnas del muro sobre el arco usan los mismos puntos del arco que el nicho: no quedan rendijas)
    const xsArco = Array.from({ length: 49 }, (_, i) => A * Math.cos(Math.PI * (48 - i) / 48)), centro = muro(xsArco, arcoY, Ht, u, escalaUV);
    for (const g of [izq, der, centro]) g.translate(0, 0, -B);
    const fondoNicho = new THREE.Shape(); fondoNicho.moveTo(-A, -0.02 * u); fondoNicho.lineTo(A, -0.02 * u); fondoNicho.lineTo(A, Hs); fondoNicho.absarc(0, Hs, A, 0, Math.PI, false); fondoNicho.lineTo(-A, -0.02 * u);
    const atras = soloBasicos(new THREE.ShapeGeometry(fondoNicho, 48));
    { const p = atras.attributes.position, t = atras.attributes.uv; for (let i = 0; i < p.count; i++) t.setXY(i, p.getX(i) / escalaUV, p.getY(i) / escalaUV); }
    atras.translate(0, 0, -B - N);
    // paredes y bóveda del nicho: el contorno del arco extruido hacia atrás, con la normal hacia adentro
    const contorno = [[A, -0.02 * u, -1, 0], [A, Hs, -1, 0]];
    for (let i = 1; i <= 48; i++) { const a = Math.PI * i / 48; contorno.push([A * Math.cos(a), Hs + A * Math.sin(a), -Math.cos(a), -Math.sin(a)]); }
    contorno.push([-A, -0.02 * u, 1, 0]);
    let s = 0;
    const largo = contorno.map((c, i) => (i ? (s += Math.hypot(c[0] - contorno[i - 1][0], c[1] - contorno[i - 1][1])) : 0));
    const lados = rejilla(4, contorno.length, (i, j) => {
      const c = contorno[j], z = -B + 0.01 * u - (N + 0.01 * u) * i / 3;
      return { p: [c[0], c[1], z], n: [c[2], c[3], 0], uv: [largo[j] / escalaUV, z / escalaUV] };
    });
    // (la rejilla de los lados queda al revés del resto: se dan vuelta los triángulos para que miren hacia adentro)
    const ix = lados.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    return { geo: mergeGeometries([piso, izq, der, centro, atras, lados].map(soloBasicos)), nicho: { A, Hs, N } };
  }
  // fondo curvo sin esquinas (como un rollo de papel de estudio). La curva no es un cuarto de círculo: su curvatura crece y
  // vuelve a cero en las dos puntas (el ángulo sigue un «smootherstep»); con un círculo el sombreado cambia de golpe donde
  // la curva toca la pared y se ve una raya horizontal en el fondo
  const Rc = Math.max(0.6 * u, Math.min(4.5 * u, 0.9 * (B - alcanceZ)));
  const n = 48, angulo = t => Math.PI / 2 * t * t * t * (t * (6 * t - 15) + 10);
  let avance = 0; for (let i = 0; i < n; i++) avance += Math.cos(angulo((i + 0.5) / n)) / n;   // recorrido horizontal por unidad de largo
  const ds = Rc / avance / n, perfil = filasHasta(-B + Rc, F).map(z => ({ z, y: 0, ny: 1, nz: 0 }));
  let z = -B + Rc, y = 0;
  for (let i = 0; i < n; i++) {
    const a = angulo((i + 0.5) / n); z -= Math.cos(a) * ds; y += Math.sin(a) * ds;
    const b = angulo((i + 1) / n);
    perfil.push({ z, y, ny: Math.cos(b), nz: Math.sin(b) });
  }
  // (la curva sube lo mismo que avanza: termina en z = -B)
  for (let h = y + 1.2 * u, paso = 1.2 * u; h < Ht; h += paso, paso = Math.min(paso * 1.3, 8 * u)) perfil.push({ z, y: h, ny: 0, nz: 1 });
  perfil.push({ z, y: Ht, ny: 0, nz: 1 });
  return { geo: barrido(perfil, xs, escalaUV), curva: Rc };
}

// ---------- Gobos: el dibujo de la ventana en el plano de la joya (en radios, mirando desde la luz) ----------
// pared: una pared opaca con huecos (por donde entra la luz); siluetas: formas opacas sueltas (hojas).
// El dibujo se piensa en el fondo: proy(x, y) dice dónde cae en el plano del gobo el punto (x, y) del fondo que se ve
// detrás de la joya (en radios, la joya en 0, 0). Así los parales, el arco o las hojas se ven siempre en el cuadro, venga
// de donde venga la luz, y la joya queda en un vidrio iluminado. lado: −1 si la luz viene de la izquierda, 1 si de la derecha.
const LIBRE = 1.3;   // radio alrededor de la joya que ningún paral ni hoja tapa
function gobo(tipo, proy, lado = -1) {
  const X = (x, y = 1.5) => proy(x, y).x, Y = (x, y) => proy(x, y).y;
  // un paral nunca pasa sobre la joya: se corre hasta dejarla libre
  const fuera = (v, ancho) => (Math.abs(v) - ancho >= LIBRE ? v : Math.sign(v || lado) * (LIBRE + ancho));
  if (tipo === 'ventana') {
    // ventana de vidrios: con la cámara normal el fondo visible va de la base de la joya a ~1,6 radios de alto y ±1,8 a los
    // lados; ahí caen el paral vertical (del lado de la luz) y el travesaño (en diagonal, justo encima de la joya). Al
    // alejarse se ve además el borde de arriba de la ventana
    const ax = 0.36 * Math.abs(X(1) - X(0)), ay = 0.36 * Math.abs(Y(0, 1) - Y(0, 0));
    const mx = fuera(X(lado * 1.0), ax), my = fuera(Y(0, 1.2), ay);
    const lejosX = X(lado * 4.5), cercaX = X(-lado * 4.5);
    const x0 = Math.min(lejosX, cercaX, -2.8), x1 = Math.max(lejosX, cercaX, 2.8);
    const y0 = Math.min(Y(0, -3), -2.9), y1 = Math.max(Y(0, 2.9), my + ay + 1);
    // un travesaño más abajo cruza el borde de adelante del pedestal (una franja de sombra como en las fotos de estudio)
    const yb = -(LIBRE + ay + 0.5);
    const cortes = [[x0, mx - ax], [mx + ax, x1]], filas = [[y0, yb - ay], [yb + ay, my - ay], [my + ay, y1]], huecos = [];
    for (const [a, b] of cortes) for (const [c, d] of filas) if (b > a && d > c) huecos.push(rect(a, c, b, d));
    return { pared: true, huecos };
  }
  if (tipo === 'persiana') {
    // persiana: franjas en diagonal sobre el fondo (unas tres en el cuadro); la joya queda en el centro de una franja de luz
    const periodo = 0.62 * Math.abs(Y(0, 1) - Y(0, 0)), lama = 0.45 * periodo;
    const x0 = Math.min(X(-6), X(6), -3), x1 = Math.max(X(-6), X(6), 3), y0 = Math.min(Y(0, -4), -3.5), y1 = Math.max(Y(0, 7), 3.5);
    const huecos = [];
    for (let k = Math.floor(y0 / periodo) - 1; k * periodo < y1; k++) {
      const c = k * periodo;   // centro de un hueco (k = 0: el de la joya)
      huecos.push(rect(x0, c - (periodo - lama) / 2, x1, c + (periodo - lama) / 2));
    }
    return { pared: true, huecos };
  }
  if (tipo === 'arco') {
    // ventana con arco y un paral al centro: la cima del arco cae en el fondo a ~1,5 radios de alto, la curva cruza el
    // cuadro y la joya queda dentro de la ventana (se agranda el arco hasta que la deje libre)
    const am = 0.16 * Math.abs(X(1) - X(0)), cx = fuera(X(lado * 0.9), am), cima = Y(0, 1.5), base = Math.min(Y(0, -3), -3);
    let A = Math.abs(cx) + LIBRE + 0.2, sy = cima - A;
    const dentro = () => Math.abs(cx) <= A - LIBRE && (sy >= LIBRE || Math.hypot(cx, sy) <= A - LIBRE);
    for (let i = 0; i < 40 && !dentro(); i++) { A += 0.25; sy = cima - A; }
    const mitad = (izq) => {
      const s = new THREE.Shape(), d = Math.asin(Math.min(0.9, am / A));
      if (izq) { s.moveTo(cx - A, base); s.lineTo(cx - am, base); s.lineTo(cx - am, sy + A * Math.cos(d)); s.absarc(cx, sy, A, Math.PI / 2 + d, Math.PI, false); }
      else { s.moveTo(cx + am, base); s.lineTo(cx + A, base); s.lineTo(cx + A, sy); s.absarc(cx, sy, A, 0, Math.PI / 2 - d, false); }
      s.closePath();
      return s;
    };
    return { pared: true, huecos: [mitad(true), mitad(false)] };
  }
  if (tipo === 'hojas') return { pared: false, siluetas: hojasDePalma(proy, lado) };
  return null;   // ninguno y foco no llevan ventana
}
// Hojas de palmera: un tallo curvo con folíolos finos a los dos lados. Las frondas se ubican en el fondo (entran desde los
// bordes del cuadro) y se pasan al plano del gobo; los folíolos se dibujan allá, con un largo medido en el fondo
function hojasDePalma(proy, lado) {
  const R = azar(7), formas = [];
  const P = (x, y) => { const q = proy(lado * x, y); return new THREE.Vector2(q.x, q.y); };
  const escala = Math.abs(proy(1, 0).x - proy(0, 0).x);
  const fronda = (desde, curva, hasta, largo, densidad = 0.13) => {
    const c = new THREE.QuadraticBezierCurve(P(...desde), P(...curva), P(...hasta));
    const L = c.getLength(), n = Math.floor(L / densidad / escala), l0 = largo * escala;
    // tallo
    const tallo = new THREE.Shape(), puntosT = c.getSpacedPoints(24), g = 0.05 * escala;
    puntosT.forEach((p, i) => { const t = c.getTangentAt(i / 24), nx = -t.y * g, ny = t.x * g; i ? tallo.lineTo(p.x + nx, p.y + ny) : tallo.moveTo(p.x + nx, p.y + ny); });
    for (let i = 24; i >= 0; i--) { const p = puntosT[i], t = c.getTangentAt(i / 24); tallo.lineTo(p.x + t.y * g, p.y - t.x * g); }
    formas.push(tallo);
    for (let i = 1; i < n; i++) {
      const s = i / n, p = c.getPointAt(s), t = c.getTangentAt(s), l = l0 * Math.sin(Math.PI * (0.15 + 0.7 * s)) * (0.75 + 0.35 * R());
      for (const ladoF of [-1, 1]) {
        // folíolo: una lanza fina que sale hacia adelante y se dobla un poco por su peso
        const ang = Math.atan2(t.y, t.x) + ladoF * (0.75 + 0.3 * R()), dx = Math.cos(ang), dy = Math.sin(ang), w = (0.07 + 0.04 * R()) * escala;
        const f = new THREE.Shape(), punta = [p.x + dx * l, p.y + dy * l - 0.15 * l], medio = [p.x + dx * l * 0.5 - dy * w, p.y + dy * l * 0.5 + dx * w];
        f.moveTo(p.x, p.y); f.quadraticCurveTo(medio[0], medio[1], punta[0], punta[1]);
        f.quadraticCurveTo(p.x + dx * l * 0.5 + dy * w, p.y + dy * l * 0.5 - dx * w, p.x, p.y);
        formas.push(f);
      }
    }
  };
  // (x positivo = el lado de donde viene la luz). Las frondas entran desde los bordes y dejan un claro de sol sobre la joya
  // (con la cámara normal el fondo se ve entre ~0,3 y 1,6 radios de alto —más abajo lo tapa el pedestal— y ±1,7 a los lados)
  fronda([3.0, 1.7], [2.0, 1.2], [0.8, 0.95], 0.75);
  fronda([-3.0, 1.3], [-2.0, 0.85], [-0.9, 0.7], 0.7);
  fronda([-2.2, 3.2], [-1.4, 2.2], [-0.5, 1.35], 0.75);
  fronda([1.9, 3.4], [1.5, 2.4], [1.0, 1.6], 0.7);
  fronda([3.2, 0.2], [2.4, 0.5], [1.4, 0.35], 0.6);
  // ninguna hoja sobre la joya: se quitan los folíolos que caigan en el claro
  return formas.filter(f => !f.getPoints(8).some(p => Math.hypot(p.x, p.y) < LIBRE * 0.85));
}

// Penumbra del patrón en el plano de la joya (en radios) según la suavidad
const penumbra = s => 0.1 + 2.4 * Math.pow(s, 1.5);

// Cookie del motor rápido: el patrón visto desde la luz, difuminado con la misma penumbra que el trazado de rayos
function dibujarCookie(g, suavidad, N = 2048) {
  const c = lienzo(N), x = ctx2d(c), k = N / (2 * MEDIO_COOKIE), pasar = (s) => {
    const pts = s.extractPoints(24);
    const camino = (lista) => lista.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, N / 2 + p.x * k, N / 2 - p.y * k));
    camino(pts.shape); x.closePath();
    for (const h of pts.holes) { camino(h); x.closePath(); }
  };
  x.fillStyle = g.pared ? '#000' : '#fff'; x.fillRect(0, 0, N, N);
  x.fillStyle = g.pared ? '#fff' : '#000';
  x.beginPath(); for (const s of g.pared ? g.huecos : g.siluetas) pasar(s); x.fill('nonzero');
  // desenfoque de caja en tres pasadas (≈ gaussiano), hecho a mano: ctx.filter no existe en Safari
  const sigma = penumbra(suavidad) * k / 2.6;
  if (sigma > 0.4) desenfocar(x, N, sigma);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function desenfocar(x, N, sigma) {
  const img = x.getImageData(0, 0, N, N), d = img.data, a = new Float32Array(N * N), b = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = d[4 * i];
  const r = Math.max(1, Math.round(Math.sqrt(12 * sigma * sigma / 3 + 1) / 2));   // radio de cada caja para 3 pasadas
  const pasada = (src, dst, horiz) => {
    for (let l = 0; l < N; l++) {
      let suma = 0;
      const at = i => src[horiz ? l * N + limitar(i, 0, N - 1) : limitar(i, 0, N - 1) * N + l];
      for (let i = -r; i <= r; i++) suma += at(i);
      for (let i = 0; i < N; i++) {
        dst[horiz ? l * N + i : i * N + l] = suma / (2 * r + 1);
        suma += at(i + r + 1) - at(i - r);
      }
    }
  };
  for (let k = 0; k < 3; k++) { pasada(a, b, true); pasada(b, a, false); }
  for (let i = 0; i < N * N; i++) { const v = Math.round(a[i]); d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; }
  x.putImageData(img, 0, 0);
}

// Color de la luz según la calidez (-1 fría, 0 neutra, 1 cálida de atardecer), con el mismo brillo
function colorLuz(calidez) {
  const fria = new THREE.Color(0xD6E2FF), neutra = new THREE.Color(0xFFF6EE), calida = new THREE.Color(0xFFD3A6);
  const c = calidez < 0 ? neutra.clone().lerp(fria, -calidez) : neutra.clone().lerp(calida, calidez);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(1 / lum);
}

// ---------- Mancha de contacto bajo la joya (solo motor rápido; el trazador la calcula sola) ----------
function manchaContacto(joya, base, radio, huella) {
  const v = new THREE.Vector3(), alto = radio * 0.1, ancho = radio * 0.22, cerca = [];
  joya.updateMatrixWorld(true);
  // los puntos de la pieza cerca de la superficie (con su peso: más pegados, más sombra)
  let lejos = radio * 0.1;
  joya.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position, paso = Math.max(1, Math.floor(p.count / 150000));
    for (let i = 0; i < p.count; i += paso) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const h = v.y - base; if (h > alto * 5 || !Number.isFinite(h)) continue;
      cerca.push(v.x, v.z, Math.exp(-h / alto) * paso);
      lejos = Math.max(lejos, Math.abs(v.x), Math.abs(v.z));
    }
  });
  // la textura cubre los puntos más tres veces el desenfoque ancho: la mancha se apaga antes del borde (sin cuadro visible)
  const N = 256, ext = Math.min(Math.max(huella, radio) * 3, lejos + 3.2 * ancho), k = N / (2 * ext), acum = new Float32Array(N * N);
  for (let i = 0; i < cerca.length; i += 3) {
    const x = Math.floor(N / 2 + cerca[i] * k), z = Math.floor(N / 2 + cerca[i + 1] * k);
    if (x >= 0 && z >= 0 && x < N && z < N) acum[z * N + x] += cerca[i + 2];
  }
  // dos desenfoques: el contacto apretado y una sombra ambiental más ancha
  const c = lienzo(N), x = ctx2d(c), img = x.createImageData(N, N);
  let max = 0; for (const a of acum) max = Math.max(max, a);
  for (let i = 0; i < N * N; i++) { const t = max ? Math.min(1, acum[i] / max * 6) : 0; img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = t * 255; img.data[4 * i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const apretado = lienzo(N), xa = ctx2d(apretado); xa.drawImage(c, 0, 0); desenfocar(xa, N, radio * 0.035 * k);
  const amplio = lienzo(N), xb = ctx2d(amplio); xb.drawImage(c, 0, 0); desenfocar(xb, N, ancho * k);
  const da = xa.getImageData(0, 0, N, N).data, db = xb.getImageData(0, 0, N, N).data, sal = x.createImageData(N, N);
  let ma = 1, mb = 1; for (let i = 0; i < N * N; i++) { ma = Math.max(ma, da[4 * i]); mb = Math.max(mb, db[4 * i]); }
  const borde = i => { const t = Math.max(Math.abs(i % N - N / 2 + 0.5), Math.abs(Math.floor(i / N) - N / 2 + 0.5)) / (N / 2); return 1 - suav(limitar((t - 0.8) / 0.2, 0, 1)); };
  for (let i = 0; i < N * N; i++) {
    const t = Math.min(1, 0.75 * Math.min(1, 1.6 * da[4 * i] / ma) + 0.4 * Math.min(1, 1.3 * db[4 * i] / mb)) * borde(i);
    sal.data[4 * i] = sal.data[4 * i + 1] = sal.data[4 * i + 2] = Math.round(t * 255); sal.data[4 * i + 3] = 255;
  }
  x.putImageData(sal, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  return { tex, ext };
}
// Sombra suave del pedestal sobre el piso (motor rápido): la forma de su base difuminada
function manchaPiso(h, u) {
  const N = 256, ext = (h.tipo === 'disco' ? h.r : Math.max(h.x, h.z)) + 1.6 * u, k = N / (2 * ext), c = lienzo(N), x = ctx2d(c);
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.fillStyle = '#fff'; x.beginPath();
  if (h.tipo === 'disco') x.arc(N / 2, N / 2, h.r * k * 1.02, 0, Math.PI * 2);
  else { const w = h.x * k * 1.02, d = h.z * k * 1.02; x.roundRect(N / 2 - w, N / 2 - d, 2 * w, 2 * d, h.radio * k); }
  x.fill();
  desenfocar(x, N, 0.45 * u * k);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  return { tex, ext };
}

// ---------- Reflejo del acrílico (solo motor rápido; el trazador refleja de verdad) ----------
// Un espejo sobre la cara de arriba del pedestal: dibuja la escena vista desde abajo del plano y la mezcla con el
// acrílico según el ángulo (Fresnel: casi nada mirando de frente, mucho mirando rasante), como un acrílico de vitrina
const SOMBREADOR_ESPEJO = {
  name: 'EspejoAcrilico',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, fuerza: { value: 0.5 } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vMundo;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vMundo = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float fuerza;
    varying vec4 vUv;
    varying vec3 vMundo;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec3 v = normalize( cameraPosition - vMundo );
      float f = fuerza * ( 0.35 + 0.65 * pow( 1.0 - clamp( v.y, 0.0, 1.0 ), 4.0 ) );
      gl_FragColor = vec4( texture2DProj( tDiffuse, vUv ).rgb, f );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
function espejo(tapa, alto, renderer) {
  let geo;
  if (tapa.tipo === 'disco') geo = new THREE.CircleGeometry(tapa.r, 96);
  else geo = new THREE.PlaneGeometry(2 * tapa.x, 2 * tapa.z);
  const tam = new THREE.Vector2(1024, 1024);
  renderer?.getDrawingBufferSize(tam);
  const r = new Reflector(geo, { shader: SOMBREADOR_ESPEJO, textureWidth: tam.x, textureHeight: tam.y, multisample: 4, clipBias: 0.0005 });
  Object.assign(r.material, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  r.rotation.x = -Math.PI / 2; r.position.y = alto;
  // el lienzo puede cambiar de tamaño (formato del video): el reflejo se dibuja siempre a la resolución de la imagen
  const antes = r.onBeforeRender;
  r.onBeforeRender = function (rend, escena, cam, ...resto) {
    rend.getDrawingBufferSize(tam);
    const rt = r.getRenderTarget();
    if (rt.width !== tam.x || rt.height !== tam.y) rt.setSize(tam.x, tam.y);
    antes.call(this, rend, escena, cam, ...resto);
  };
  return r;
}

// ---------- El escenario ----------
export class Escenario3D {
  constructor() {
    this.grupo = new THREE.Group(); this.grupo.name = 'escenario';           // motor rápido: gira con la cámara
    this.grupoPT = new THREE.Group(); this.grupoPT.name = 'escenarioPT';     // trazado de rayos: gira con la cámara
    this.contacto = new THREE.Group(); this.contacto.name = 'contacto';      // mancha bajo la joya: queda quieta, como la joya
    this.cfg = null; this.medidas = null; this.claves = {}; this.limites = null;
    this.mats = {}; this.desechos = [];
  }

  // cfg: escena normalizada (no 'ninguna'); m: { radio, base, huella, joya (grupo con las mallas en su lugar) }
  armar(cfg, m) {
    cfg = normalizarEscena(cfg);
    if (cfg.id === 'ninguna') { this.vaciar(); return false; }
    const u = Math.max(1e-6, m.radio), hu = Math.max(m.huella || u, 0.15 * u), s = cfg.superficie, f = cfg.fondo, l = cfg.luz;
    const medidas = `${u.toPrecision(6)}|${hu.toPrecision(6)}|${(m.base || 0).toPrecision(6)}`;
    // qué hay que rehacer: la geometría (formas, medidas y el material, que da la escala de la textura), la luz (y su
    // ventana) o solo los colores. El relleno (ambiente) no rehace nada: lo aplica el estudio en cada cuadro
    const kGeo = JSON.stringify([s.forma, s.tamano, s.altura, s.material, f.forma, f.distancia, f.material, medidas]);
    const kLuz = JSON.stringify([l, s.tamano, kGeo]), kMat = JSON.stringify([s.material, s.color, f.material, f.color]);
    const cambioGeo = kGeo !== this.claves.geo, cambioLuz = kLuz !== this.claves.luz, cambioMat = kMat !== this.claves.mat;
    this.cfg = cfg;
    const kJoya = `${m.version ?? m.joya?.uuid}|${medidas}`;
    if (!cambioGeo && !cambioLuz && !cambioMat && this.claves.joya === kJoya) return false;

    if (cambioMat || !this.mats.sup) {
      const viejos = { sup: this.mats.sup, fondo: this.mats.fondo };
      this.mats.sup = crearMaterial(s.material, s.color);
      this.mats.fondo = crearMaterial(f.material, f.color);
      this.mats.fondo.normalScale.setScalar(0.6);   // el fondo es grande y queda desenfocado: su grano va más suave
      // solo cambió el color: las mallas que ya están toman los materiales nuevos
      for (const g of [this.grupo, this.grupoPT]) for (const o of g.children) {
        if (o.material === viejos.sup) o.material = this.mats.sup; else if (o.material === viejos.fondo) o.material = this.mats.fondo;
      }
      for (const k of ['sup', 'fondo']) if (viejos[k]) { viejos[k].map?.dispose(); viejos[k].dispose(); }
    }
    const tope = (m.base || 0) - EPS * u;
    if (cambioGeo) {
      this.limpiarGrupo('geo');
      const ped = pedestal(s, u, hu, TIPOS[s.material].T * u);
      const piso = tope - ped.H;
      const B = s.forma === 'piso' ? (1.5 + 3 * f.distancia) * u : ped.alcanceZ + (0.8 + 2.2 * f.distancia) * u;
      const fd = fondo(f, B, u, TIPOS[f.material].T * u, ped.alcanceZ);
      fd.geo.translate(0, piso, 0);
      const piezas = [];
      if (ped.geo) { ped.geo.translate(0, tope, 0); ped.geo.computeTangents(); piezas.push([ped.geo, this.mats.sup, true]); }
      fd.geo.computeTangents();
      piezas.push([fd.geo, this.mats.fondo, false]);
      for (const [geo, mat, sombra] of piezas) {
        const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
        a.castShadow = sombra; a.receiveShadow = true; a.userData.parte = 'geo'; b.userData.parte = 'geo';
        this.grupo.add(a); this.grupoPT.add(b);
      }
      // acrílico: reflejo de la joya y del fondo en la cara de arriba
      if (s.material === 'acrilico' && ped.tapa) {
        const e = espejo(ped.tapa, tope + EPS * u * 0.5, m.renderer);
        e.userData.parte = 'geo'; e.renderOrder = 0.5;   // antes que la mancha de contacto
        this.grupo.add(e);
      }
      // sombra suave del pedestal sobre el piso (el trazador la calcula sola)
      if (ped.huellaPiso) {
        const { tex, ext } = manchaPiso(ped.huellaPiso, u);
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext, 2 * ext), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        d.rotation.x = -Math.PI / 2; d.position.y = piso + 0.004 * u; d.renderOrder = 1; d.userData.parte = 'geo';
        this.grupo.add(d);
      }
      this.limites = { tope, piso, alto: ped.H, fondo: B, alcance: Math.hypot(ANCHO, FRENTE, ALTO_FONDO) * u, radioSup: ped.alcanceZ, forma: s.forma, curva: fd.curva || 0 };
    }
    if (cambioLuz || cambioGeo) { this.limpiarGrupo('luz'); this.armarLuz(cfg, u); }
    // la mancha de contacto depende de la joya: se rehace si cambió la pieza, su orientación o el pedestal
    if (cambioGeo || this.claves.joya !== kJoya) {
      this.limpiarGrupo('contacto', this.contacto);
      if (m.joya && s.forma !== 'cojin') {   // en el terciopelo la pieza se hunde un poco: la sombra la pone la luz
        const { tex, ext } = manchaContacto(m.joya, m.base || 0, u, hu);
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext, 2 * ext), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        d.rotation.x = -Math.PI / 2; d.position.y = tope + 0.002 * u; d.renderOrder = 1; d.userData.parte = 'contacto';
        this.contacto.add(d);
      }
    }
    this.claves = { geo: kGeo, luz: kLuz, mat: kMat, joya: kJoya };
    this.ambiente = cfg.ambiente;
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true);
    return true;
  }

  // Luz principal: dirección, color, fuerza, gobo y su penumbra. Las dos luces (rápida y trazada) dan la misma irradiancia
  armarLuz(cfg, u) {
    const l = cfg.luz;
    // la luz no puede venir de detrás del fondo (la taparía): de ±90° en adelante queda rasante por el costado
    const az = M.degToRad(limitar(l.angulo, -90, 90)), el = M.degToRad(limitar(l.elevacion, 10, 80));
    const L = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // dónde cae en el dibujo del gobo cada punto del fondo que se ve detrás de la joya (ejes de la cámara de sombras del
    // foco). El fondo está en z = −B; el punto se lleva al plano de la joya a lo largo de la luz
    const ex = new THREE.Vector3(0, 1, 0).cross(L).normalize(), ey = L.clone().cross(ex), B = this.limites.fondo / u, q = new THREE.Vector3();
    const proy = (x, y) => { q.set(x, y, -B); return { x: q.dot(ex), y: q.dot(ey) }; };
    const g = gobo(l.gobo, proy, L.x < 0 ? -1 : 1);
    const color = colorLuz(l.calidez), E = 2.6 * l.intensidad;   // irradiancia en la joya (la escala la da la exposición)
    const foco = l.gobo === 'foco', sinGobo = l.gobo === 'ninguno';
    // D: distancia del disco de la luz (en el trazador) = vértice del foco del motor rápido; así el patrón y el cono coinciden
    const D = (foco || sinGobo ? 34 : DIST_LUZ) * u;
    const medio = foco ? (2.3 + 0.9 * cfg.superficie.tamano) * u : sinGobo ? 36 * u : MEDIO_COOKIE * u;
    const angulo = Math.atan(medio / D), pen = foco ? 0.3 + 0.55 * l.suavidad : sinGobo ? 0.35 : 0.25;
    // --- motor rápido: foco con cookie y mapa de sombras ---
    const sl = new THREE.SpotLight(color, E * D * D, 0, angulo, pen, 2);
    sl.position.copy(L).multiplyScalar(D); sl.castShadow = true;
    sl.shadow.mapSize.set(2048, 2048);
    sl.shadow.camera.near = Math.max(u, D - 45 * u); sl.shadow.camera.far = D + 45 * u;
    sl.shadow.bias = -0.0004; sl.shadow.normalBias = 0.015 * u;
    // la sombra de la joya: más suave cuanto más difusa la luz (el trazador la hace con el tamaño de la luz)
    sl.shadow.radius = 1.5 + (sinGobo ? 7 : 4) * l.suavidad;
    // (las sombras nítidas —hojas, persiana— necesitan el doble de resolución; las suaves no y así se dibujan más rápido)
    if (g) sl.map = dibujarCookie(g, l.suavidad, penumbra(l.suavidad) < 0.3 ? 2048 : 1024);
    const tgt = new THREE.Object3D(); sl.target = tgt;
    for (const o of [sl, tgt]) { o.userData.parte = 'luz'; this.grupo.add(o); }
    // --- trazado de rayos ---
    let lp;
    const Do = DIST_VENTANA * u;
    if (sinGobo) {
      // sin ventana: una caja de luz redonda y grande (sombras suaves); el trazador la refleja en el metal
      const S = (2 + 22 * l.suavidad) * u;
      lp = new ShapedAreaLight(color, E * D * D / (Math.PI * S * S / 4), S, S);
      lp.isCircular = true; lp.position.copy(L).multiplyScalar(D); lp.lookAt(0, 0, 0);
    } else {
      // foco físico con radio (penumbra de verdad en la joya y en la ventana)
      // radio: el borde del patrón queda con la penumbra pedida en el plano de la joya (semejanza de triángulos)
      const radio = foco ? (0.15 + 1.6 * l.suavidad) * u : penumbra(l.suavidad) * u * (D - Do) / (2 * Do);
      lp = new PhysicalSpotLight(color, E * D * D, 0, angulo, pen, 2);
      lp.radius = radio;
      // el trazador pone el disco delante de la posición de la luz (a radio / tan(ángulo)): se corre para que el disco quede en D
      lp.position.copy(L).multiplyScalar(D + radio / Math.tan(angulo));
      const t2 = new THREE.Object3D(); lp.target = t2; t2.userData.parte = 'luz'; this.grupoPT.add(t2);
    }
    lp.userData.parte = 'luz'; this.grupoPT.add(lp);
    // la ventana de verdad (solo en el trazado de rayos): un plano de una cara que mira a la luz
    if (g) {
      const k = (D - Do) / D;   // del plano de la joya al plano de la ventana, visto desde el centro de la luz
      let formas;
      if (g.pared) {
        const borde = MEDIO_COOKIE * 1.6, muro = rect(-borde, -borde, borde, borde);
        for (const h of g.huecos) muro.holes.push(new THREE.Path(h.getPoints(24)));
        formas = [muro];
      } else formas = g.siluetas;
      const geo = new THREE.ShapeGeometry(formas, 16);
      geo.scale(k * u, k * u, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1, side: THREE.FrontSide });
      const v = new THREE.Mesh(geo, mat);
      // mismos ejes que la cámara de sombras del foco (derecha = arriba × L): así el patrón coincide con el cookie
      const z = L.clone(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
      v.matrixAutoUpdate = false;
      v.matrix.makeBasis(x, y, z).setPosition(L.clone().multiplyScalar(Do));
      v.userData.parte = 'luz';
      this.grupoPT.add(v);
    }
    this.luz = { L, D, angulo, E, sl, lp };
  }

  // La escena del motor rápido gira con la cámara (como el estudio): el fondo siempre queda detrás y la joya gira sobre el
  // pedestal. La del trazador queda quieta: allá gira la joya (tornamesa del estudio), que da la misma imagen
  girar(az) {
    if (this.grupo.rotation.y !== az) { this.grupo.rotation.y = az; this.grupo.updateMatrixWorld(true); }
  }

  // Altura mínima de la cámara a una distancia horizontal ρ del eje: nunca por debajo de la superficie donde está la joya
  alturaMinima() { return this.limites ? this.limites.tope : -Infinity; }

  limpiarGrupo(parte, g = null) {
    for (const grupo of g ? [g] : [this.grupo, this.grupoPT]) {
      for (const o of [...grupo.children]) {
        if (o.userData.parte !== parte) continue;
        grupo.remove(o);
        o.traverse?.(h => {
          if (h.isReflector) { h.dispose(); h.geometry.dispose(); return; }
          if (h.isMesh && h.geometry) this.desechar(h.geometry);
          if (h.isMesh && h.material && h.material !== this.mats.sup && h.material !== this.mats.fondo) { h.material.alphaMap?.dispose(); h.material.map?.dispose(); this.desechar(h.material); }
          if (h.isLight) { h.map?.dispose(); h.shadow?.map?.dispose(); h.dispose?.(); }
        });
      }
    }
  }
  desechar(x) { if (!this.desechos.includes(x)) { this.desechos.push(x); x.dispose(); } if (this.desechos.length > 64) this.desechos.length = 0; }

  vaciar() {
    for (const p of ['geo', 'luz']) this.limpiarGrupo(p);
    this.limpiarGrupo('contacto', this.contacto);
    for (const k of ['sup', 'fondo']) if (this.mats[k]) { this.mats[k].map?.dispose(); this.mats[k].dispose(); this.mats[k] = null; }
    this.cfg = null; this.claves = {}; this.limites = null; this.luz = null;
  }
}

// (para las pruebas)
export const _interno = { TIPOS, gobo, penumbra, pedestal, patron };
