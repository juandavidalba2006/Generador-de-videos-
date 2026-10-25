// Escenario 3D: la superficie donde se apoya la joya (pedestal, bloque, losa, escalones, cojín o el piso), el fondo y la
// luz principal con sombras de ventana (gobo). Se arma con una escena de escenas.js y con el tamaño de la joya: todas las
// medidas salen del radio de la pieza, así se ve igual con un arete que con un collar.
// Hay dos copias, una por motor:
//  · motor rápido: la luz es un foco con un «cookie» (la ventana dibujada y difuminada) y un mapa de sombras para la joya
//    y el pedestal; una mancha suave bajo la pieza hace de sombra de contacto.
//  · trazado de rayos: la ventana es geometría de verdad entre la luz y la escena (de una sola cara, mirando a la luz:
//    el trazador la usa para las sombras pero la cámara la atraviesa) y la luz tiene tamaño, así la penumbra es física.
// Los dos usan el mismo dibujo de la ventana en el plano de la joya: el patrón cae igual en la vista previa y en el video.
// El acrílico refleja de verdad en el trazado de rayos; en el motor rápido lleva un espejo plano encima.
// El escenario del motor rápido gira con la cámara; el del trazador queda quieto y gira la joya (tornamesa de estudio.js).
// v4: la tela de satén (fondo 'tela': una sola tela que baja del fondo al piso con pliegues suaves, que se pueden mover
// despacio con el tiempo), el degradado de cualquier fondo (colores por vértice: los entienden los dos motores), los
// destellos del aire (puntos desenfocados; en el trazador se dibujan encima del cuadro, ver estudio.js) y los esquemas
// de luz (clave baja, clave alta, contraluz): sus luces de apoyo van en un grupo que gira con la pista «luz».
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
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
  yeso:         { T: 3.2, N: 1024, rug: [0.84, 0.96], relieve: 0.06 },
  travertino:   { T: 6,   N: 1024, rug: [0.55, 0.85], relieve: 0.8 },
  marmolBlanco: { T: 8,   N: 1024, rug: [0.1, 0.2],   relieve: 0.06, capa: 0.5 },
  marmolNegro:  { T: 8,   N: 1024, rug: [0.08, 0.18], relieve: 0.06, capa: 0.6 },
  concreto:     { T: 5,   N: 1024, rug: [0.5, 0.78],  relieve: 0.8 },
  terciopelo:   { T: 3,   N: 512,  rug: [0.92, 1],    relieve: 0.3, brillo: 1 },
  lino:         { T: 1.2, N: 512,  rug: [0.8, 0.95],  relieve: 1.4, brillo: 0.25 },
  arena:        { T: 1.8, N: 1024, rug: [0.88, 1],    relieve: 1.5 },
  madera:       { T: 7,   N: 1024, rug: [0.42, 0.62], relieve: 0.35, capa: 0.15 },
  acrilico:     { T: 10,  N: 256,  rug: [0.035, 0.05], relieve: 0, capa: 1, espejo: true },
  saten:        { T: 2.4, N: 256,  rug: [0.3, 0.36],  relieve: 0, brillo: 1 },   // liso: los brillos los dan los pliegues
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
      alto[i] = 0.55 + 0.2 * (fino[i] - 0.5) + 0.08 * (mancha[i] - 0.5) - 0.3 * poro[i];
      // (el grano casi no cambia el color: a la distancia de la foto el yeso se ve liso, no como arena)
      varia[i] = 1 + 0.045 * (mancha[i] - 0.5) + 0.008 * (fino[i] - 0.5) - 0.015 * poro[i];
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
  } else if (tipo === 'saten') {
    // satén: casi liso; un tornasol muy suave en el color (la trama no se ve: casi siempre queda desenfocada)
    const nube = fbm(N, 3, 3, 111), fino = fbm(N, 64, 2, 112, { estirar: [0.2, 4] });
    for (let i = 0; i < n; i++) { alto[i] = 0.5; varia[i] = 1 + 0.03 * (nube[i] - 0.5) + 0.012 * (fino[i] - 0.5); rug[i] = 0.6 * fino[i] + 0.4 * nube[i]; }
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
  if (tipo === 'saten') {
    // satén: brillo de tela (sheen) del color aclarado y un reflejo especular suave y largo en las crestas de los pliegues
    // (poco brillo de tela: a ras, en el piso, lo lavaba; el brillo del satén es especular, largo, sobre las crestas)
    m.sheen = 0.3; m.sheenRoughness = 0.5; m.sheenColor.set(color).lerp(new THREE.Color(0xffffff), 0.3);
    m.specularIntensity = 1; m.specularColor.set(color).lerp(new THREE.Color(0xffffff), 0.5);
  } else if (def.brillo) {   // terciopelo y lino: brillo aterciopelado en los bordes (sheen)
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
// ext: el escenario se agranda cuando lo que se encuadra es mucho más grande que la joya (una pila de cajas, un par separado)
function fondo(f, B, u, escalaUV, alcanceZ, ext = 1, liso = null) {
  if (f.forma === 'tela') return fondoTela(f, B, u, escalaUV, alcanceZ, ext, liso);
  const W = ANCHO * u * ext, F = FRENTE * u * ext, Ht = ALTO_FONDO * u * ext, xs = graduada(-W, W, u);
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
    // (el muro de encima del arco baja una nada dentro de la boca del nicho y la bóveda pasa una nada detrás del fondo
    // del nicho: las juntas se solapan y no quedan píxeles sueltos por donde se vea el vacío)
    const bajo = -0.06 * u, arcoY = x => Hs + Math.sqrt(Math.max(0, A * A - x * x)) - 0.01 * u;
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
      const c = contorno[j], z = -B + 0.01 * u - (N + 0.03 * u) * i / 3;
      return { p: [c[0], c[1], z], n: [c[2], c[3], 0], uv: [largo[j] / escalaUV, z / escalaUV] };
    });
    // (la rejilla de los lados queda al revés del resto: se dan vuelta los triángulos para que miren hacia adentro)
    const ix = lados.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    // un respaldo detrás de todo: si el rasterizado deja un píxel suelto en alguna junta del arco, se ve el mismo yeso
    const respaldo = soloBasicos(new THREE.PlaneGeometry(2 * W, Ht, 1, 1));
    respaldo.translate(0, Ht / 2, -B - N - 0.2 * u);
    { const p = respaldo.attributes.position, t = respaldo.attributes.uv; for (let i = 0; i < p.count; i++) t.setXY(i, p.getX(i) / escalaUV, p.getY(i) / escalaUV); }
    return { geo: mergeGeometries([piso, izq, der, centro, atras, lados, respaldo].map(soloBasicos)), nicho: { A, Hs, N } };
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

// ---------- Tela de satén: una sola tela que baja del fondo y hace de piso, con pliegues suaves ----------
// Ruido de valor suave (interpolación quíntica: sin quiebres en la curvatura, el brillo del satén no muestra costuras)
function hash2(i, j, k) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const quint = t => t * t * t * (t * (6 * t - 15) + 10);
function ruido2(x, y, k = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = quint(x - i), fy = quint(y - j);
  const a = hash2(i, j, k), b = hash2(i + 1, j, k), c = hash2(i, j + 1, k), d = hash2(i + 1, j + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// Alto del pliegue (en radios) en el punto (x, s) de la tela (s: recorrido desde el frente del piso hacia arriba del fondo).
// Pliegues alargados en diagonal que se tuercen despacio (el ruido estirado a lo largo del pliegue y deformado por otro);
// fase: corrimiento lento con el tiempo (ondas)
function pliegue(x, s, fase = 0) {
  const wx = x + 2.2 * (ruido2(x / 9, s / 9, 3) - 0.5), ws = s + 2.2 * (ruido2(x / 9 + 17, s / 9, 4) - 0.5);
  const th = 0.55 + 0.7 * (ruido2(x / 22, s / 22, 5) - 0.5), c = Math.cos(th), sn = Math.sin(th);
  const a = wx * c + ws * sn, b = -wx * sn + ws * c;
  // crestas: donde el ruido estirado pasa por la mitad (líneas largas a lo largo del pliegue), redondeadas; valles anchos
  const r1 = ruido2(a / 4.6 + 0.35 * fase, b / 15 + fase, 1), c1 = 1 - Math.abs(2 * r1 - 1), h1 = c1 * c1 * (3 - 2 * c1);
  const h2 = ruido2(a / 2.4 + 9 - 0.2 * fase, b / 8 + 4 + 0.6 * fase, 2);
  return (h1 - 0.45) * 2.1 + (h2 - 0.5) * 0.5;
}
// Rejilla fina cerca de la joya (los pliegues necesitan detalle donde se ven) y gruesa lejos
function pasosTela(a, b, u, fino, lejos) {
  const v = [a];
  for (let x = a; x < b;) { const d = Math.min(Math.abs(x), Math.abs(x + 1e-9)); const paso = d < lejos ? fino * u : Math.min(4 * u, fino * u * Math.pow(1.25, (d - lejos) / (fino * u * 4))); x = Math.min(b, x + paso); v.push(x); }
  return v;
}
// liso: radio alrededor de la joya donde el piso queda plano (una joya apoyada no se hunde en un pliegue)
function fondoTela(f, B, u, escalaUV, alcanceZ, ext = 1, liso = null) {
  const W = ANCHO * u * ext, F = FRENTE * u * ext, Ht = ALTO_FONDO * u * ext;
  // la curva es ancha (la tela cae del fondo al piso sin esquina): hasta 6 radios
  const Rc = Math.max(1.2 * u, Math.min(6 * u, 0.9 * (B - alcanceZ)));
  const n = 48, angulo = t => Math.PI / 2 * t * t * t * (t * (6 * t - 15) + 10);
  let avance = 0; for (let i = 0; i < n; i++) avance += Math.cos(angulo((i + 0.5) / n)) / n;
  const ds = Rc / avance / n;
  // perfil (z, y, ny, nz) desde el frente del piso hasta arriba; cada punto con su recorrido s
  const perfil = [];
  for (const z of pasosTela(-F, B - Rc, u, 0.45, 14 * u).map(v => -v)) perfil.push({ z, y: 0, ny: 1, nz: 0 });
  perfil.sort((p, q) => q.z - p.z);   // del frente (cerca de la cámara) hacia el fondo
  let z = -B + Rc, y = 0;
  for (let i = 0; i < n; i++) {
    const a = angulo((i + 0.5) / n); z -= Math.cos(a) * ds; y += Math.sin(a) * ds;
    if (i % 2 === 1 || i === n - 1) { const b = angulo((i + 1) / n); perfil.push({ z, y, ny: Math.cos(b), nz: Math.sin(b) }); }
  }
  for (const h of pasosTela(y, Ht, u, 0.45, 26 * u).slice(1)) perfil.push({ z, y: h, ny: 0, nz: 1 });
  let sAc = 0;
  perfil.forEach((p, i) => { if (i) sAc += Math.hypot(p.z - perfil[i - 1].z, p.y - perfil[i - 1].y); p.s = sAc; });
  const xs = [...new Set([...pasosTela(0, W, u, 0.45, 16 * u).map(x => -x).reverse(), ...pasosTela(0, W, u, 0.45, 16 * u)])].sort((a, b) => a - b);
  const geo = rejilla(xs.length, perfil.length, (i, j) => {
    const p = perfil[j], x = xs[i];
    return { p: [x, p.y, p.z], n: [0, p.ny, p.nz], uv: [x / escalaUV, p.s / escalaUV] };
  });
  // amplitud de cada vértice: el piso queda liso donde va la joya (o su pedestal) y los pliegues crecen hacia afuera; en el
  // fondo los pliegues son más grandes; lejos (donde la rejilla es gruesa y casi nunca se ve) se apagan
  const C = geo.attributes.position.count, amp = new Float32Array(C), sx = new Float32Array(C), ss = new Float32Array(C);
  const plano = liso ?? Math.max(1.5 * u, alcanceZ + 0.6 * u), sCurva = perfil.find(p => p.ny < 0.999)?.s ?? 0;
  for (let j = 0; j < perfil.length; j++) for (let i = 0; i < xs.length; i++) {
    const k = j * xs.length + i, p = perfil[j], x = xs[i];
    const enPiso = p.ny > 0.999, d = Math.hypot(x, p.z), cerca = enPiso ? suav(limitar((d - plano) / (3.2 * u), 0, 1)) : 1;
    const subida = suav(limitar((p.s - sCurva) / (Rc * 1.2), 0, 1));   // del piso (pliegues bajos) al fondo (más altos)
    const lejos = 1 - suav(limitar((Math.abs(x) - 17 * u) / (9 * u), 0, 1));
    const arriba = 1 - suav(limitar((p.y - 25 * u) / (10 * u), 0, 1)), frente = 1 - suav(limitar((p.z - 14 * u) / (8 * u), 0, 1));
    amp[k] = u * (0.62 + 0.75 * subida) * cerca * lejos * arriba * frente;
    sx[k] = x / u; ss[k] = p.s / u;
  }
  const base = geo.attributes.position.array.slice(), nBase = geo.attributes.normal.array.slice();
  return { geo, curva: Rc, tela: { base, nBase, amp, sx, ss, ampPiso: 0.62 * u } };
}
// Pone los pliegues en el instante t (fase lenta con ondas). Devuelve true si la tela cambió
function plegarTela(geo, tela, fase) {
  const P = geo.attributes.position, A = P.array, { base, nBase, amp, sx, ss } = tela;
  for (let k = 0, n = amp.length; k < n; k++) {
    const h = amp[k] ? amp[k] * pliegue(sx[k], ss[k], fase) : 0, i = 3 * k;
    A[i] = base[i] + nBase[i] * h; A[i + 1] = base[i + 1] + nBase[i + 1] * h; A[i + 2] = base[i + 2] + nBase[i + 2] * h;
  }
  P.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
}

// ---------- Degradado: el fondo se oscurece hacia arriba (colores por vértice) ----------
// y0: el piso (en el mundo del escenario); u: radio de la joya. El piso no cambia; desde ~1 radio sobre el piso el fondo
// baja hasta un 12 % de su color con degradado 1. Cuatro componentes: así coincide con lo que el trazador agrega solo
function colorearFondo(geo, degradado, y0, u) {
  const P = geo.attributes.position, C = P.count;
  let col = geo.attributes.color;
  if (!degradado) { if (col) geo.deleteAttribute('color'); return; }
  if (!col || col.count !== C || col.itemSize !== 4) { col = new THREE.BufferAttribute(new Float32Array(C * 4), 4); geo.setAttribute('color', col); }
  for (let i = 0; i < C; i++) {
    const h = (P.getY(i) - y0) / u, k = 1 - degradado * 0.88 * suav(limitar((h - 0.8) / 10, 0, 1));
    col.setXYZW(i, k, k, k, 1);
  }
  col.needsUpdate = true;
}

// ---------- Destellos: brillitos desenfocados que flotan en el aire (r5, r7, r8) ----------
// Puntos con un disco suave cuyo tamaño crece con la distancia al plano de foco (como un bokeh). La posición sale del tiempo
// en el sombreador (deriva lenta hacia arriba y un vaivén): la vista previa y el video dan lo mismo y no cuesta nada por cuadro.
// En el trazado de rayos no son geometría (no se calculan con luz real): estudio.js los dibuja encima del cuadro terminado.
const SOMBREADOR_DESTELLOS = {
  uniforms: { t: { value: 0 }, alto: { value: 960 }, foco: { value: 10 }, caja: { value: new THREE.Vector4() }, piso: { value: 0 }, intensidad: { value: 1 }, color: { value: new THREE.Color(1, 0.95, 0.84) } },
  vertexShader: /* glsl */`
    attribute vec4 datos;   // tamaño, fase, brillo, velocidad
    uniform float t, alto, foco, piso;
    uniform vec4 caja;      // medio ancho, alto, z de atrás, z de adelante
    varying float vBrillo;
    void main() {
      vec3 p = position;
      float vel = datos.w;
      p.y = piso + mod( p.y - piso + vel * t, caja.y );
      p.x += 0.35 * sin( 0.31 * t + datos.y ) * vel * 6.0;
      p.z += 0.25 * cos( 0.23 * t + datos.y * 1.7 ) * vel * 6.0;
      vec4 mv = modelViewMatrix * vec4( p, 1.0 );
      float z = max( -mv.z, 1e-3 );
      float coc = abs( z - foco ) / z;
      gl_PointSize = alto * ( 0.0028 + 0.034 * coc ) * datos.x;
      // titila despacio; el disco grande reparte la misma luz (se ve más tenue)
      float tit = 0.72 + 0.28 * sin( 1.3 * t + datos.y * 5.0 );
      float h = p.y - piso, borde = smoothstep( 0.0, 0.05 * caja.y, h ) * ( 1.0 - smoothstep( 0.85 * caja.y, caja.y, h ) );
      vBrillo = datos.z * tit * borde / ( 1.0 + 9.0 * coc * coc );
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform float intensidad;
    varying float vBrillo;
    void main() {
      vec2 d = gl_PointCoord * 2.0 - 1.0;
      float r = length( d );
      if ( r > 1.0 ) discard;
      float a = smoothstep( 1.0, 0.62, r ) * ( 0.82 + 0.18 * smoothstep( 0.35, 0.9, r ) );
      gl_FragColor = vec4( color * vBrillo * intensidad * a, 1.0 );
    }`,
};
export class Destellos {
  constructor() {
    this.material = new THREE.ShaderMaterial({ ...SOMBREADOR_DESTELLOS, uniforms: THREE.UniformsUtils.clone(SOMBREADOR_DESTELLOS.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.puntos = null; this.clave = '';
  }
  // cantidad: 0..1 (destellos de la escena); u: radio de la joya; piso y fondo (B) del escenario. Devuelve los puntos (o null)
  armar(cantidad, u, piso, B, semilla = 5) {
    const N = Math.round(220 * limitar(cantidad, 0, 1)), k = `${N}|${u}|${piso}|${B}|${semilla}`;
    if (k === this.clave) return this.puntos;
    this.clave = k;
    this.puntos?.geometry.dispose();
    if (!N) { this.puntos?.removeFromParent(); this.puntos = null; return null; }
    const R = azar(semilla * 977 + 13), pos = new Float32Array(N * 3), dat = new Float32Array(N * 4);
    const ancho = 10 * u, alto = 15 * u, atras = -B + 0.5 * u, adelante = 3.2 * u;
    for (let i = 0; i < N; i++) {
      pos[3 * i] = (R() * 2 - 1) * ancho; pos[3 * i + 1] = piso + R() * alto; pos[3 * i + 2] = atras + (adelante - atras) * Math.pow(R(), 0.8);
      dat[4 * i] = 0.55 + 0.9 * R(); dat[4 * i + 1] = R() * 6.283; dat[4 * i + 2] = 0.25 + 0.75 * R() * R(); dat[4 * i + 3] = u * (0.05 + 0.1 * R());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('datos', new THREE.BufferAttribute(dat, 4));
    if (!this.puntos) { this.puntos = new THREE.Points(g, this.material); this.puntos.frustumCulled = false; this.puntos.renderOrder = 5; this.puntos.name = 'destellos'; }
    else this.puntos.geometry = g;
    const U = this.material.uniforms; U.caja.value.set(ancho, alto, atras, adelante); U.piso.value = piso;
    return this.puntos;
  }
  // t: segundos del video; alto: alto del cuadro en píxeles; foco: distancia de la cámara a lo nítido
  poner(t, alto, foco, intensidad = 1) { const U = this.material.uniforms; U.t.value = t; U.alto.value = alto; U.foco.value = foco; U.intensidad.value = intensidad; }
  vaciar() { this.puntos?.removeFromParent(); this.puntos?.geometry.dispose(); this.puntos = null; this.clave = ''; }
}

// ---------- Gobos: el dibujo de la ventana en el plano de la joya (en radios, mirando desde la luz) ----------
// pared: una pared opaca con huecos (por donde entra la luz); siluetas: formas opacas sueltas.
// El dibujo se piensa en el fondo: proy(x, y) dice dónde cae en el plano del gobo el punto (x, y) del fondo que se ve
// detrás de la joya (en radios, la joya en 0, 0). Así los parales o el arco se ven siempre en el cuadro, venga
// de donde venga la luz, y la joya queda en un vidrio iluminado. lado: −1 si la luz viene de la izquierda, 1 si de la derecha.
const LIBRE = 1.3;   // radio alrededor de la joya que ningún paral ni hoja tapa
// proyTope(x, z): lo mismo para un punto de la cara de arriba de la superficie; R: radio de esa cara (en radios)
// suavidad: la de la luz (la persiana agranda sus lamas con ella, ver abajo)
function gobo(tipo, proy, lado = -1, proyTope = null, R = 1.5, suavidad = 0) {
  const X = (x, y = 1.5) => proy(x, y).x, Y = (x, y) => proy(x, y).y;
  // un paral nunca pasa sobre la joya: se corre hasta dejarla libre
  const fuera = (v, ancho) => (Math.abs(v) - ancho >= LIBRE ? v : Math.sign(v || lado) * (LIBRE + ancho));
  if (tipo === 'ventana') {
    // ventana de cuatro vidrios, pensada como la foto de referencia. Visto desde la luz, el fondo que se ve detrás de la
    // joya cae a un lado de ella (el de la luz) y la cara del pedestal alrededor de ella. Así:
    //  · un paral en el borde del cuadro del lado contrario a la luz y otro a un lado de la joya: dos franjas verticales en
    //    el fondo (el primero cruza además el pedestal por detrás de la joya, en diagonal);
    //  · un travesaño que en el fondo pasa en diagonal justo por encima de la joya;
    //  · el marco del lado contrario a la luz roza la joya: su sombra se come el frente del pedestal en diagonal;
    //  · el alféizar baja por el costado del pedestal y el dintel queda arriba (se ven al alejarse: un charco de luz).
    const ax = 0.22, ay = 0.2;   // medio paral y medio travesaño, en radios en el plano de la joya
    const m1 = fuera(X(-lado * 1.55), ax), m2 = fuera(X(lado * 0.8), ax), t1 = fuera(Y(0, 1.15), ay);
    const cerca = -lado * (LIBRE + 0.15);   // el marco que roza la joya (del lado del frente)
    const lejos = lado * Math.max(Math.abs(X(lado * 2.7)), Math.abs(m2) + ax + 0.6, Math.abs(m1) + ax + 0.6);
    const frente = proyTope ? proyTope(0, R).y : -1.5;   // el borde de adelante de la cara del pedestal
    const y0 = Math.min(frente - 0.6, -(LIBRE + 0.4)), y1 = Math.max(Y(0, 3.2), t1 + ay + 1);
    // los vidrios: el vano entre los dos marcos menos los parales (que nunca tocan la joya: la joya queda siempre en un vidrio)
    let cortes = [[Math.min(cerca, lejos), Math.max(cerca, lejos)]];
    for (const m of [m1, m2]) cortes = cortes.flatMap(([a, b]) => [[a, Math.min(b, m - ax)], [Math.max(a, m + ax), b]]);
    const filas = [[y0, t1 - ay], [t1 + ay, y1]], huecos = [];
    for (const [a, b] of cortes) for (const [c, d] of filas) if (b - a > 0.05 && d - c > 0.05) huecos.push(rect(a, c, b, d));
    return { pared: true, huecos };
  }
  if (tipo === 'persiana') {
    // persiana: franjas en diagonal sobre el fondo (unas tres en el cuadro); la joya queda en el centro de una franja de luz.
    // Con luz más suave las lamas se ven más anchas (como una persiana más lejos de la pared): la penumbra crece con la
    // suavidad y en franjas angostas las borraría del todo (ver penumbraGobo)
    const periodo = 0.62 * Math.abs(Y(0, 1) - Y(0, 0)) * (1 + 0.8 * limitar(suavidad, 0, 1)), lama = 0.45 * periodo;
    const x0 = Math.min(X(-6), X(6), -3), x1 = Math.max(X(-6), X(6), 3), y0 = Math.min(Y(0, -4), -3.5), y1 = Math.max(Y(0, 7), 3.5);
    const huecos = [];
    for (let k = Math.floor(y0 / periodo) - 1; k * periodo < y1; k++) {
      const c = k * periodo;   // centro de un hueco (k = 0: el de la joya)
      huecos.push(rect(x0, c - (periodo - lama) / 2, x1, c + (periodo - lama) / 2));
    }
    return { pared: true, huecos, periodo };
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
  return null;   // ninguno y foco no llevan ventana
}
// Penumbra del patrón en el plano de la joya (en radios) según la suavidad
const penumbra = s => 0.1 + 2.4 * Math.pow(s, 1.5);
// La de un gobo dado: en la persiana (franjas de ~0,5 r) la penumbra se frena suave antes de la mitad del período; más
// ancha, la luz de una rendija tapa la sombra de la lama vecina y desde suavidad 0,28 no quedaba ninguna franja. Las
// ventanas tienen vidrios grandes: ahí la penumbra es la de siempre
function penumbraGobo(g, s) {
  const p = penumbra(s);
  if (!g?.periodo) return p;
  const tope = 0.45 * g.periodo;
  return p / Math.pow(1 + (p / tope) ** 4, 0.25);
}

// Cookie del motor rápido: el patrón visto desde la luz, difuminado con la misma penumbra que el trazado de rayos
// (pen: el ancho de la penumbra en el plano de la joya, en radios)
function dibujarCookie(g, pen, N = 2048) {
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
  const sigma = pen * k / 2.6;
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
    this.destellos = new Destellos(); this.tela = null; this.giroLuz = 0; this.t = 0;
  }

  // cfg: escena normalizada (no 'ninguna'); m: { radio, base (donde va la cara de arriba de la superficie: la base de la
  // joya, o el piso bajo una joya que flota o bajo su estuche), huella, joya (grupo con las mallas en su lugar), flotando }
  armar(cfg, m) {
    cfg = normalizarEscena(cfg);
    if (cfg.id === 'ninguna') { this.vaciar(); return false; }
    const u = Math.max(1e-6, m.radio), hu = Math.max(m.huella || u, 0.15 * u), s = cfg.superficie, f = cfg.fondo, l = cfg.luz;
    const ext = Math.max(1, Number.isFinite(m.ext) ? m.ext : 1);
    const medidas = `${u.toPrecision(6)}|${hu.toPrecision(6)}|${(m.base || 0).toPrecision(6)}|${ext.toFixed(3)}`;
    // qué hay que rehacer: la geometría (formas, medidas y el material, que da la escala de la textura), la luz (y su
    // ventana), solo los colores o solo el degradado. El relleno (ambiente) no rehace nada: lo aplica el estudio en cada cuadro
    const kGeo = JSON.stringify([s.forma, s.tamano, s.altura, s.material, f.forma, f.distancia, f.material, medidas, f.forma === 'tela' && !!m.flotando]);
    const kLuz = JSON.stringify([l, s.tamano, kGeo]), kMat = JSON.stringify([s.material, s.color, f.material, f.color]);
    const kDeg = JSON.stringify([f.degradado, kGeo]), kDes = JSON.stringify([f.destellos, kGeo]);
    const cambioGeo = kGeo !== this.claves.geo, cambioLuz = kLuz !== this.claves.luz, cambioMat = kMat !== this.claves.mat;
    const cambioDeg = kDeg !== this.claves.deg, cambioDes = kDes !== this.claves.des;
    this.cfg = cfg;
    const kJoya = `${m.version ?? m.joya?.uuid}|${medidas}|${!!m.flotando}`;
    if (this.tela) this.tela.ondas = f.ondas;
    if (!cambioGeo && !cambioLuz && !cambioMat && !cambioDeg && !cambioDes && this.claves.joya === kJoya) return false;

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
      // (la joya que flota no toca la tela: el piso puede plegarse justo debajo)
      const fd = fondo(f, B, u, TIPOS[f.material].T * u, ped.alcanceZ, ext, m.flotando && s.forma === 'piso' ? 0.4 * u : null);
      fd.geo.translate(0, piso, 0);
      this.tela = fd.tela ? { geo: fd.geo, datos: fd.tela, ondas: f.ondas, fase: null } : null;
      if (this.tela) { fd.tela.base = fd.geo.attributes.position.array.slice(); this.plegar(this.t, true); }
      const piezas = [];
      if (ped.geo) { ped.geo.translate(0, tope, 0); ped.geo.computeTangents(); piezas.push([ped.geo, this.mats.sup, true]); }
      fd.geo.computeTangents();
      piezas.push([fd.geo, this.mats.fondo, false]);
      for (const [geo, mat, sombra] of piezas) {
        const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
        a.castShadow = sombra; a.receiveShadow = true; a.userData.parte = 'geo'; b.userData.parte = 'geo';
        if (geo === fd.geo) a.userData.fondo = b.userData.fondo = true;
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
      this.limites = { tope, piso, alto: ped.H, fondo: B, alcance: Math.hypot(ANCHO, FRENTE, ALTO_FONDO) * u * ext, radioSup: ped.alcanceZ, forma: s.forma, curva: fd.curva || 0, tela: !!fd.tela };
    }
    // degradado del fondo (más oscuro arriba): colores por vértice, sin rehacer la geometría
    if (cambioDeg || cambioGeo || cambioMat) {
      const fg = this.grupo.children.find(o => o.userData.fondo)?.geometry;
      if (fg) colorearFondo(fg, f.degradado, this.limites.piso, u);
      const vc = f.degradado > 0;
      if (this.mats.fondo.vertexColors !== vc) { this.mats.fondo.vertexColors = vc; this.mats.fondo.needsUpdate = true; }
    }
    if (cambioLuz || cambioGeo) { this.limpiarGrupo('luz'); this.armarLuz(cfg, u, hu); }
    if (cambioDes || cambioGeo) {
      const pts = this.destellos.armar(f.destellos, u, this.limites.piso, this.limites.fondo);
      if (pts && pts.parent !== this.grupo) this.grupo.add(pts);
    }
    // la mancha de contacto depende de la joya: se rehace si cambió la pieza, su orientación o el pedestal.
    // (si la joya flota o va en un estuche no hay contacto: la sombra la da la luz)
    if (cambioGeo || this.claves.joya !== kJoya) {
      this.limpiarGrupo('contacto', this.contacto);
      if (m.joya && s.forma !== 'cojin' && !m.flotando) {   // en el terciopelo la pieza se hunde un poco: la sombra la pone la luz
        const { tex, ext } = manchaContacto(m.joya, m.base || 0, u, hu);
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext, 2 * ext), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        d.rotation.x = -Math.PI / 2; d.position.y = tope + 0.002 * u; d.renderOrder = 1; d.userData.parte = 'contacto';
        this.contacto.add(d);
      }
    }
    this.claves = { geo: kGeo, luz: kLuz, mat: kMat, joya: kJoya, deg: kDeg, des: kDes };
    this.ambiente = cfg.ambiente;
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true);
    return true;
  }

  // Pliegues de la tela en el instante t: con ondas se corren despacio (siempre igual para el mismo t). true si cambió
  plegar(t, forzar = false) {
    const T = this.tela; if (!T) return false;
    const fase = 0.022 * (T.ondas || 0) * (Number.isFinite(t) ? t : 0);
    if (!forzar && T.fase === fase) return false;
    T.fase = fase; plegarTela(T.geo, T.datos, fase);
    return true;
  }
  // Lo que se mueve con el tiempo: los pliegues (con ondas) y los destellos. Devuelve true si cambió la geometría
  actualizar(t) {
    this.t = Number.isFinite(t) ? t : 0;
    return this.tela?.ondas > 0 ? this.plegar(this.t) : false;
  }
  // La pista «luz»: la luz principal y las de apoyo giran alrededor de la joya (grados). true si cambió
  ponerGiroLuz(grados) {
    const a = M.degToRad(Number.isFinite(grados) ? grados : 0);
    if (a === this.giroLuz) return false;
    this.giroLuz = a;
    for (const r of [this.rig, this.rigPT]) if (r) { r.rotation.y = a; r.updateMatrixWorld(true); }
    return true;
  }

  // Luz principal: dirección, color, fuerza, gobo y su penumbra. Las dos luces (rápida y trazada) dan la misma irradiancia.
  // Va en un grupo (rig) con las luces de apoyo del esquema: así la pista «luz» las gira juntas
  armarLuz(cfg, u, hu = u) {
    const l = cfg.luz, esquema = l.esquema || 'ventana';
    this.rig = new THREE.Group(); this.rigPT = new THREE.Group();
    for (const [r, g] of [[this.rig, this.grupo], [this.rigPT, this.grupoPT]]) { r.userData.parte = 'luz'; r.rotation.y = this.giroLuz; g.add(r); }
    const rig = this.rig, rigPT = this.rigPT;
    // la luz no puede venir de detrás del fondo (la taparía): de ±90° en adelante queda rasante por el costado
    const az = M.degToRad(limitar(l.angulo, -90, 90)), el = M.degToRad(limitar(l.elevacion, 10, 80));
    const L = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    // dónde cae en el dibujo del gobo cada punto del fondo que se ve detrás de la joya (ejes de la cámara de sombras del
    // foco). El fondo está en z = −B; el punto se lleva al plano de la joya a lo largo de la luz
    const ex = new THREE.Vector3(0, 1, 0).cross(L).normalize(), ey = L.clone().cross(ex), B = this.limites.fondo / u, q = new THREE.Vector3();
    const proy = (x, y) => { q.set(x, y, -B); return { x: q.dot(ex), y: q.dot(ey) }; };
    const T = this.limites.tope / u, proyTope = (x, z) => { q.set(x, T, z); return { x: q.dot(ex), y: q.dot(ey) }; };
    const g = gobo(l.gobo, proy, L.x < 0 ? -1 : 1, proyTope, Math.max(this.limites.radioSup / u, 1), l.suavidad);
    const penG = penumbraGobo(g, l.suavidad);
    // contraluz: la luz de adelante queda de relleno (la principal viene de atrás)
    // (en clave alta el estudio ya ilumina mucho: la principal baja para que la tela clara no se queme y se lean los pliegues)
    const color = colorLuz(l.calidez), E = 2.6 * l.intensidad * (esquema === 'contraluz' ? 0.3 : esquema === 'alta-clave' ? 0.55 : 1);   // irradiancia en la joya (la escala la da la exposición)
    const foco = l.gobo === 'foco', sinGobo = l.gobo === 'ninguno';
    // clave baja sin gobo: un foco angosto (la escena cae a oscuro alrededor de la joya) en vez de la caja de luz grande
    const angosta = sinGobo && esquema === 'clave-baja';
    // D: distancia del disco de la luz (en el trazador) = vértice del foco del motor rápido; así el patrón y el cono coinciden
    const D = (foco || sinGobo ? 34 : DIST_LUZ) * u;
    const medio = foco ? (2.3 + 0.9 * cfg.superficie.tamano) * u : angosta ? (5.5 + 2 * hu / u) * u : sinGobo ? 36 * u : MEDIO_COOKIE * u;
    const angulo = Math.atan(medio / D), pen = foco ? 0.3 + 0.55 * l.suavidad : angosta ? 0.9 : sinGobo ? 0.35 : 0.25;
    // --- motor rápido: foco con cookie y mapa de sombras ---
    const sl = new THREE.SpotLight(color, E * D * D, 0, angulo, pen, 2);
    sl.position.copy(L).multiplyScalar(D); sl.castShadow = true;
    sl.shadow.mapSize.set(2048, 2048);
    sl.shadow.camera.near = Math.max(u, D - 45 * u); sl.shadow.camera.far = D + 45 * u;
    sl.shadow.bias = -0.0004; sl.shadow.normalBias = 0.015 * u;
    // la sombra de la joya: más suave cuanto más difusa la luz (el trazador la hace con el tamaño de la luz)
    sl.shadow.radius = 1.5 + (angosta ? 11 : sinGobo ? 7 : 4) * l.suavidad;
    // (las sombras nítidas —persiana, ventana— necesitan el doble de resolución; las suaves no y así se dibujan más rápido)
    if (g) sl.map = dibujarCookie(g, penG, penG < 0.3 ? 2048 : 1024);
    const tgt = new THREE.Object3D(); sl.target = tgt;
    rig.add(sl, tgt);
    // --- trazado de rayos ---
    let lp;
    const Do = DIST_VENTANA * u;
    if (sinGobo && !angosta) {
      // sin ventana: una caja de luz redonda y grande (sombras suaves); el trazador la refleja en el metal
      const S = (2 + 22 * l.suavidad) * u;
      lp = new ShapedAreaLight(color, E * D * D / (Math.PI * S * S / 4), S, S);
      lp.isCircular = true; lp.position.copy(L).multiplyScalar(D); lp.lookAt(0, 0, 0);
    } else {
      // foco físico con radio (penumbra de verdad en la joya y en la ventana)
      // radio: el borde del patrón queda con la penumbra pedida en el plano de la joya (semejanza de triángulos)
      const radio = foco ? (0.15 + 1.6 * l.suavidad) * u : angosta ? (0.4 + 2.2 * l.suavidad) * u : penG * u * (D - Do) / (2 * Do);
      lp = new PhysicalSpotLight(color, E * D * D, 0, angulo, pen, 2);
      lp.radius = radio;
      // el trazador pone el disco delante de la posición de la luz (a radio / tan(ángulo)): se corre para que el disco quede en D
      lp.position.copy(L).multiplyScalar(D + radio / Math.tan(angulo));
      const t2 = new THREE.Object3D(); lp.target = t2; rigPT.add(t2);
    }
    rigPT.add(lp);
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
      rigPT.add(v);
    }
    this.luz = { L, D, angulo, E, sl, lp, apoyo: this.lucesApoyo(cfg, u, hu, color, L) };
  }

  // Luces de apoyo de cada esquema (las dos copias: foco del motor rápido y foco físico del trazador).
  //  · clave baja: un charco de luz cálida en el piso, justo bajo la joya (con sombra: la joya que flota se despega del piso)
  //  · clave alta: un relleno grande del otro lado (casi sin sombras)
  //  · contraluz: el fondo encendido por detrás de la joya y dos luces de borde desde atrás (siluetas con filo de luz)
  lucesApoyo(cfg, u, hu, color, Lp) {
    const l = cfg.luz, esquema = l.esquema || 'ventana', lim = this.limites, k = l.intensidad, lista = [];
    const piso = lim.tope, B = lim.fondo;
    const foco = ({ pos, mira, E, radioCono, radio, sombra = false, col = color, pen = 1 }) => {
      const D = pos.distanceTo(mira), ang = Math.min(1.2, Math.atan(radioCono / D));
      const a = new THREE.SpotLight(col, E * D * D, 0, ang, pen, 2); a.position.copy(pos);
      const ta = new THREE.Object3D(); ta.position.copy(mira); a.target = ta;
      if (sombra) { a.castShadow = true; a.shadow.mapSize.set(1024, 1024); a.shadow.camera.near = Math.max(u, D - 30 * u); a.shadow.camera.far = D + 30 * u; a.shadow.bias = -0.0005; a.shadow.normalBias = 0.02 * u; a.shadow.radius = 6; }
      this.rig.add(a, ta);
      const b = new PhysicalSpotLight(col, E * D * D, 0, ang, pen, 2); b.radius = radio;
      const dir = mira.clone().sub(pos).normalize();
      b.position.copy(pos).addScaledVector(dir, -radio / Math.tan(ang));
      const tb = new THREE.Object3D(); tb.position.copy(mira); b.target = tb;
      this.rigPT.add(b, tb);
      lista.push({ rapido: a, pt: b });
    };
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    if (esquema === 'clave-baja') {
      // el charco: un foco desde arriba, apenas adelante, del ancho de la pieza (o del par)
      // (sin mapa de sombras en el motor rápido: dejaba una sombra dura; en el trazador la sombra sale suave por el radio)
      foco({ pos: V3(0, piso + 30 * u, 2.5 * u), mira: V3(0, piso, 0), E: 1.5 * k, radioCono: (2.2 * u + 1.3 * hu), radio: 2.2 * u, col: colorLuz(Math.min(1, l.calidez + 0.3)) });
    } else if (esquema === 'alta-clave') {
      const L = Lp || V3(0, 1, 1);
      foco({ pos: V3(-L.x, Math.max(0.5, L.y), L.z).normalize().multiplyScalar(30 * u), mira: V3(0, 0, 0), E: 0.5 * k, radioCono: 22 * u, radio: 6 * u, pen: 1 });
    } else if (esquema === 'contraluz') {
      // el fondo encendido: un foco ancho entre la joya y el fondo, mirando a la pared (un degradado de luz natural)
      foco({ pos: V3(0, piso + 11 * u, -0.2 * B), mira: V3(0, piso + 3 * u, -B), E: 3.4 * k, radioCono: 14 * u, radio: 3 * u, col: colorLuz(l.calidez * 0.5) });
      // bordes: dos focos angostos desde atrás y arriba, a cada lado, hacia la joya
      for (const lado of [-1, 1]) foco({ pos: V3(lado * (2.4 * u + hu), 5.5 * u, -0.6 * B), mira: V3(0, 0.2 * u, 0), E: 2.6 * k, radioCono: 2.4 * u + hu, radio: 0.5 * u, col: colorLuz(l.calidez) });
    }
    return lista;
  }

  // La escena del motor rápido gira con la cámara (como el estudio): el fondo siempre queda detrás y la joya gira sobre el
  // pedestal. La del trazador queda quieta: allá gira la joya (tornamesa del estudio), que da la misma imagen
  girar(az) {
    if (this.grupo.rotation.y !== az) { this.grupo.rotation.y = az; this.grupo.updateMatrixWorld(true); }
  }

  // Altura mínima de la cámara: nunca por debajo de la superficie donde está la joya (no se mete en el pedestal ni el piso;
  // en la tela, tampoco en un pliegue)
  alturaMinima() { return this.limites ? this.limites.tope + (this.tela ? this.tela.datos.ampPiso * 1.1 : 0) : -Infinity; }

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
    this.destellos.vaciar();
    this.cfg = null; this.claves = {}; this.limites = null; this.luz = null; this.tela = null; this.rig = this.rigPT = null;
  }
}

// ---------- Limpieza del ruido del escenario en el render realista ----------
// El trazador converge rápido en la joya (refleja luces) pero lento en el yeso del fondo y del pedestal, que recibe la luz
// rebotada de toda la sala: a 48–128 muestras queda un grano que en el video «hierve» cuadro a cuadro. Al terminar el
// cuadro se promedia cada píxel del escenario con sus vecinos parecidos, guiado por el mismo cuadro hecho con el motor
// rápido (sin ruido, con las mismas texturas y la misma ventana): solo se mezclan píxeles con el mismo dibujo en la guía,
// así no se borran las vetas, el grano de la arena ni el borde de las sombras. La joya (su silueta, con el borde suave)
// queda tal cual, con todos sus destellos, y sus píxeles no entran en el promedio del fondo.
const SOMBREADOR_LIMPIEZA = {
  uniforms: { mapaPT: { value: null }, guia: { value: null }, mascara: { value: null }, pixel: { value: new THREE.Vector2() }, salto: { value: 1 }, sigmaColor: { value: 0.1 }, sigmaGuia: { value: 0.035 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D mapaPT, guia, mascara;
    uniform vec2 pixel;
    uniform float salto, sigmaColor, sigmaGuia;
    varying vec2 vUv;
    // a valores de pantalla (con la exposición y el tono del estudio): el ruido y los bordes se miden como se ven
    vec3 pantalla( vec3 c ) {
      #ifdef TONE_MAPPING
      c = toneMapping( c );
      #endif
      return linearToOutputTexel( vec4( c, 1.0 ) ).rgb;
    }
    vec3 trazado( vec2 uv ) { return pantalla( texture2D( mapaPT, uv ).rgb ); }
    vec3 guiado( vec2 uv ) { return pantalla( texture2D( guia, uv ).rgb ); }
    void main() {
      vec3 c0 = trazado( vUv );
      // cuánto del píxel es joya (la silueta viene suavizada en los bordes): el borde se mezcla en esa proporción
      float m = min( 1.0, 1.5 * texture2D( mascara, vUv ).r );
      if ( m > 0.999 ) { gl_FragColor = vec4( c0, 1.0 ); return; }
      // el color de referencia es el promedio de 3×3 (un píxel solo es casi puro ruido)
      vec3 ref = vec3( 0.0 );
      for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) ref += trazado( vUv + vec2( i, j ) * pixel );
      ref /= 9.0;
      vec3 g0 = guiado( vUv ), suma = vec3( 0.0 );
      float peso = 0.0, kc = 0.5 / ( sigmaColor * sigmaColor ), kg = 0.5 / ( sigmaGuia * sigmaGuia );
      // vecinos hasta 4 píxeles (peso espacial con σ = 3 px: con 8 muestras el grano del yeso baja más de 3 veces sin
      // borrar las sombras de la ventana, que respeta la guía)
      for ( int j = -4; j <= 4; j ++ ) for ( int i = -4; i <= 4; i ++ ) {
        vec2 d = vec2( i, j ), q = vUv + d * pixel * salto;
        vec3 c = trazado( q ), dc = c - ref, dg = guiado( q ) - g0;
        float w = exp( - dot( d, d ) / 18.0 - dot( dg, dg ) * kg - dot( dc, dc ) * kc ) * ( 1.0 - texture2D( mascara, q ).r );
        suma += c * w; peso += w;
      }
      vec3 limpio = peso > 1e-4 ? suma / peso : c0;
      gl_FragColor = vec4( mix( limpio, c0, m ), 1.0 );
    }`,
};
export class LimpiadorPT {
  constructor() {
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.guia = rt(); this.mascara = rt();
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ ...SOMBREADOR_LIMPIEZA, uniforms: THREE.UniformsUtils.clone(SOMBREADOR_LIMPIEZA.uniforms), depthTest: false, depthWrite: false, blending: THREE.NoBlending }));
  }
  tamano(w, h) { for (const t of [this.guia, this.mascara]) if (t.width !== w || t.height !== h) t.setSize(w, h); }
  // Dibuja en el lienzo el cuadro del trazador (textura lineal) ya limpio; muestras: las que lleva (fija la fuerza)
  aplicar(renderer, textura, muestras) {
    const u = this.quad.material.uniforms, w = this.guia.width, h = this.guia.height;
    u.mapaPT.value = textura; u.guia.value = this.guia.texture; u.mascara.value = this.mascara.texture;
    u.pixel.value.set(1 / w, 1 / h);
    // el grano no depende del tamaño del cuadro: en un video grande el promedio toma vecinos más separados (mismo costo)
    u.salto.value = Math.max(1, Math.round(Math.min(w, h) / 600));
    // ruido medido en el yeso (pantalla, 0..1): ≈ 0,3/√muestras; se mezcla lo que difiere menos de unas 2,5 veces eso
    u.sigmaColor.value = 2.5 * 0.3 / Math.sqrt(Math.max(4, muestras));
    const antes = renderer.getRenderTarget(), auto = renderer.autoClear;
    renderer.setRenderTarget(null); renderer.autoClear = false;
    this.quad.render(renderer);
    renderer.autoClear = auto; renderer.setRenderTarget(antes);
  }
  dispose() { this.guia.dispose(); this.mascara.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

// (para las pruebas)
export const _interno = { TIPOS, gobo, penumbra, penumbraGobo, pedestal, patron, fondoTela, pliegue, colorearFondo };
