// Bitmaps para dar realismo: inclusiones dentro de las piedras, martillado o cepillado en el metal
// y mapas de luz HDRI. El STL no trae coordenadas de textura: se proyectan como una caja.
// Todo se genera en el navegador (sin descargas) y sirve igual para el motor rápido y el trazado de rayos.
import * as THREE from 'three';

const MAX = 1024;    // lado máximo de los bitmaps (el trazado de rayos los guarda en 1024 × 1024)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const suav = t => t * t * (3 - 2 * t);
const escalon = (a, b, v) => suav(clamp((v - a) / (b - a), 0, 1));
const lienzo = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx2d = c => c.getContext('2d', { willReadFrequently: true });

// Azar con semilla (mulberry32): los presets salen idénticos en cada equipo y en cada cuadro del video
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Coordenadas de textura ----------
// Proyección de caja: cada triángulo toma el eje dominante de su normal y usa los otros dos como u, v.
// El eje más delgado de la pieza (en un anillo, el del dedo) va siempre en u: así el cepillado
// (líneas a lo largo de v) corre alrededor del aro sin cortes aunque cambie la cara de la caja.
export function generarUVCaja(geometry, escala = 1) {
  const pos = geometry.attributes.position, n = pos.count;
  // caja propia (un STL dañado puede traer NaN y la de three quedaría inservible)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let e = 0; e < 3; e++) { const v = pos.getComponent(i, e); if (Number.isFinite(v)) { if (v < min[e]) min[e] = v; if (v > max[e]) max[e] = v; } }
  for (let e = 0; e < 3; e++) if (!(max[e] >= min[e])) min[e] = max[e] = 0;
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  // misma escala en u y v (los poros y las inclusiones no se estiran); el lado mayor de la pieza = una repetición
  const lado = Math.max(ext[0], ext[1], ext[2], 1e-6) * clamp(num(escala, 1), 1e-3, 1e3);
  const delgado = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const uv = new Float32Array(n * 2), p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const ejes = d => d === delgado ? [(d + 1) % 3, (d + 2) % 3] : [delgado, 3 - d - delgado];
  const vertice = (i, a, b) => {
    const x = pos.getComponent(i, a), y = pos.getComponent(i, b);
    uv[2 * i] = Number.isFinite(x) ? (x - min[a]) / lado : 0;
    uv[2 * i + 1] = Number.isFinite(y) ? (y - min[b]) / lado : 0;
  };
  if (geometry.index) {
    // geometría indexada (no viene de un STL): cada vértice decide con su propia normal
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const nor = geometry.attributes.normal;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      const [a, b] = ejes(ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2);
      vertice(i, a, b);
    }
  } else {
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) { p[k][0] = pos.getX(t + k); p[k][1] = pos.getY(t + k); p[k][2] = pos.getZ(t + k); }
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
      const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      const ax = Math.abs(uy * vz - uz * vy), ay = Math.abs(uz * vx - ux * vz), az = Math.abs(ux * vy - uy * vx);   // normal de la cara
      const [a, b] = ejes(ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2);
      for (let k = 0; k < 3; k++) vertice(t + k, a, b);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.userData.uvCaja = true;
  return geometry;
}

// ---------- Imágenes del usuario ----------
export async function cargarImagen(file) {
  if (!file) throw new Error('Escoge una imagen.');
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(file.name || '')) throw new Error('Ese archivo no es una imagen: sube un JPG, PNG o WebP.');
  try { if (typeof createImageBitmap === 'function') return await createImageBitmap(file); } catch (e) { /* algunos Safari no decodifican así: se intenta con <img> */ }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  catch (e) { throw new Error('No se pudo leer la imagen. Prueba con un JPG o PNG.'); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// Recorte cuadrado del centro, máximo 1024 px, sobre blanco (las zonas transparentes no oscurecen la piedra)
function cuadrado(imagen, alfa = 1) {
  const w = imagen.width || imagen.naturalWidth || 1, h = imagen.height || imagen.naturalHeight || 1;
  const s = Math.min(w, h), S = Math.min(MAX, s), c = lienzo(S), x = ctx2d(c);
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  x.globalAlpha = clamp(alfa, 0, 1);
  x.imageSmoothingQuality = 'high';
  x.drawImage(imagen, (w - s) / 2, (h - s) / 2, s, s, 0, 0, S, S);
  return c;
}
const repetir = tex => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true; return tex; };

// Mapa de normales a partir del brillo (Sobel con bordes que se repiten: la textura no tiene costuras)
export function mapaNormalDesde(imagen, fuerza = 1) {
  const c = cuadrado(imagen), S = c.width, x = ctx2d(c), datos = x.getImageData(0, 0, S, S), p = datos.data;
  const L = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) L[i] = (0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]) / 255;
  const k = fuerza * S / 64;   // la pendiente se mide en unidades de textura: igual relieve con 512 o 1024 px
  for (let y = 0; y < S; y++) {
    const ym = ((y + S - 1) % S) * S, y0 = y * S, yp = ((y + 1) % S) * S;
    for (let xx = 0; xx < S; xx++) {
      const xm = (xx + S - 1) % S, xp = (xx + 1) % S;
      const gx = (L[ym + xp] + 2 * L[y0 + xp] + L[yp + xp] - L[ym + xm] - 2 * L[y0 + xm] - L[yp + xm]) / 8;
      const gy = (L[yp + xm] + 2 * L[yp + xx] + L[yp + xp] - L[ym + xm] - 2 * L[ym + xx] - L[ym + xp]) / 8;
      // la fila 0 del lienzo es v = 1 (flipY): por eso la y no cambia de signo
      const nx = -gx * k, ny = gy * k, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = 4 * (y0 + xx);
      p[i] = (nx * inv * 0.5 + 0.5) * 255; p[i + 1] = (ny * inv * 0.5 + 0.5) * 255; p[i + 2] = (inv * 0.5 + 0.5) * 255; p[i + 3] = 255;
    }
  }
  x.putImageData(datos, 0, 0);
  const tex = repetir(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Mapa de normales que ya viene armado (presets que lo dibujan directo, sin pasar por el brillo)
function texturaNormal(c) {
  const tex = repetir(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Color en sRGB; intensidad < 1 mezcla el bitmap con blanco (blanco = la piedra queda con su color)
export function texturaColor(imagen, intensidad = 1) {
  const tex = repetir(new THREE.CanvasTexture(cuadrado(imagen, intensidad)));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- Ruido procedural (periódico: todos los presets se repiten sin costuras) ----------
function ruido(T, cx, cy, rnd) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(T * T);
  for (let y = 0; y < T; y++) {
    const fy = y * cy / T, y0 = fy | 0, ty = suav(fy - y0), f0 = (y0 % cy) * cx, f1 = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < T; x++) {
      const fx = x * cx / T, x0 = fx | 0, tx = suav(fx - x0), x1 = (x0 + 1) % cx;
      const a = g[f0 + x0] + (g[f0 + x1] - g[f0 + x0]) * tx, b = g[f1 + x0] + (g[f1 + x1] - g[f1 + x0]) * tx;
      out[y * T + x] = a + (b - a) * ty;
    }
  }
  return out;
}
// suma de octavas, estirada a 0..1; aniso > 1 alarga las manchas en vertical
function fbm(T, celdas, octavas, rnd, { ganancia = 0.5, aniso = 1 } = {}) {
  const out = new Float32Array(T * T);
  let amp = 1;
  for (let o = 0; o < octavas; o++) {
    const c = Math.min(T, celdas << o), n = ruido(T, c, Math.max(1, Math.round(c / aniso)), rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= ganancia;
  }
  return estirar(out);
}
function estirar(a) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) * k;
  return a;
}
// Lienzo desde una función por píxel que devuelve un gris (número) o [r, g, b], de 0 a 1
function pintarPixeles(T, f) {
  const c = lienzo(T), x = ctx2d(c), d = x.createImageData(T, T), p = d.data;
  for (let i = 0; i < T * T; i++) {
    const v = f(i), j = 4 * i;
    if (typeof v === 'number') { p[j] = p[j + 1] = p[j + 2] = clamp(v, 0, 1) * 255; }
    else { p[j] = clamp(v[0], 0, 1) * 255; p[j + 1] = clamp(v[1], 0, 1) * 255; p[j + 2] = clamp(v[2], 0, 1) * 255; }
    p[j + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}
// Dibuja un elemento y sus copias del otro lado si toca un borde (sin costuras al repetirse)
function enCopias(T, x, y, r, dibujar) {
  for (const dx of [-T, 0, T]) {
    if (x + dx < -r || x + dx > T + r) continue;
    for (const dy of [-T, 0, T]) if (y + dy >= -r && y + dy <= T + r) dibujar(x + dx, y + dy);
  }
}

// ---------- Presets de las piedras (blanco = sin cambio; lo oscuro tiñe, el relieve desvía la luz) ----------
function seda() {
  const T = MAX, rnd = azar(7101);
  const nube = fbm(T, 4, 4, rnd);
  // nubes lechosas casi invisibles: la seda se concentra en ellas, como en los rubíes y zafiros naturales
  const c = pintarPixeles(T, i => 1 - 0.09 * escalon(0.45, 0.9, nube[i]));
  const x = c.getContext('2d');
  x.lineCap = 'round';
  // seda: agujas finísimas de rutilo en tres direcciones a 60°
  for (let n = 0; n < 2600; n++) {
    const px = rnd() * T, py = rnd() * T;
    if (rnd() > 0.12 + 0.88 * Math.pow(nube[(py | 0) * T + (px | 0)], 1.6)) continue;
    const ang = ((rnd() * 3 | 0) * 60 + 18 + (rnd() - 0.5) * 7) * Math.PI / 180, largo = 6 + 80 * Math.pow(rnd(), 2.4);
    const dx = Math.cos(ang) * largo / 2, dy = Math.sin(ang) * largo / 2;
    x.strokeStyle = `rgba(78,70,62,${(0.12 + 0.3 * rnd()).toFixed(3)})`; x.lineWidth = 0.6 + rnd() * 1;
    enCopias(T, px, py, largo, (cx, cy) => { x.beginPath(); x.moveTo(cx - dx, cy - dy); x.lineTo(cx + dx, cy + dy); x.stroke(); });
  }
  // plumas: fracturas pequeñas con un velo alrededor
  for (let n = 0; n < 6; n++) {
    const px = rnd() * T, py = rnd() * T, a = rnd() * Math.PI, L = 30 + rnd() * 50;
    enCopias(T, px, py, L * 1.5, (cx, cy) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, L);
      g.addColorStop(0, 'rgba(120,112,102,0.1)'); g.addColorStop(1, 'rgba(120,112,102,0)');
      x.fillStyle = g; x.fillRect(cx - L, cy - L, 2 * L, 2 * L);
      x.strokeStyle = 'rgba(80,72,64,0.22)'; x.lineWidth = 0.8;
      for (let k = -3; k <= 3; k++) {
        const o = k * 4;
        x.beginPath(); x.moveTo(cx - Math.cos(a) * L * 0.6 - Math.sin(a) * o, cy - Math.sin(a) * L * 0.6 + Math.cos(a) * o);
        x.quadraticCurveTo(cx + Math.sin(a) * 9, cy - Math.cos(a) * 9, cx + Math.cos(a) * L * 0.6 - Math.sin(a) * o, cy + Math.sin(a) * L * 0.6 + Math.cos(a) * o); x.stroke();
      }
    });
  }
  // cristales diminutos con su halo de tensión
  for (let n = 0; n < 26; n++) {
    const px = rnd() * T, py = rnd() * T, r = 1.4 + rnd() * 3.2, lados = 5 + (rnd() * 3 | 0), giro = rnd() * 6;
    enCopias(T, px, py, r * 4, (cx, cy) => {
      x.strokeStyle = 'rgba(110,100,90,0.08)'; x.lineWidth = r * 1.2;
      x.beginPath(); x.arc(cx, cy, r * 2.6, 0, Math.PI * 2); x.stroke();
      x.fillStyle = 'rgba(40,34,28,0.7)'; x.beginPath();
      for (let k = 0; k < lados; k++) { const a = giro + k / lados * Math.PI * 2, rr = r * (0.6 + 0.5 * ((k * 7919 % 5) / 5)); x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr); }
      x.closePath(); x.fill();
    });
  }
  return c;
}

function jardin() {
  const T = MAX, rnd = azar(2203);
  const musgo = fbm(T, 6, 5, rnd), velo = fbm(T, 3, 3, rnd), wx = fbm(T, 4, 3, rnd), wy = fbm(T, 4, 3, rnd);
  // musgo: manchas verde grisáceas suaves y retorcidas (el "jardín" que hace única a cada esmeralda)
  const c = pintarPixeles(T, i => {
    const px = ((i % T) + (wx[i] - 0.5) * 160 + T) % T | 0, py = (((i / T) | 0) + (wy[i] - 0.5) * 160 + T) % T | 0;
    const s = 0.24 * escalon(0.48, 0.84, musgo[py * T + px]) * (0.35 + 0.65 * velo[i]);
    return [1 - s * 0.95, 1 - s * 0.7, 1 - s * 0.88];
  });
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  // velos: fracturas plumosas, trazos cortos a lo largo de una curva
  for (let n = 0; n < 22; n++) {
    const px = rnd() * T, py = rnd() * T, a = rnd() * Math.PI * 2, L = 70 + rnd() * 200, curva = (rnd() - 0.5) * L * 0.8;
    const ax = Math.cos(a), ay = Math.sin(a);
    enCopias(T, px, py, L, (cx, cy) => {
      for (let s = 0; s <= 1; s += 3 / L) {
        const b = 4 * s * (1 - s), qx = cx + ax * (s - 0.5) * L - ay * curva * b, qy = cy + ay * (s - 0.5) * L + ax * curva * b;
        const h = (3 + 12 * b) * (0.5 + 0.5 * Math.sin(s * 37 + n));
        x.strokeStyle = `rgba(66,90,76,${(0.06 + 0.11 * b).toFixed(3)})`; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(qx - ay * h, qy + ax * h); x.lineTo(qx + ay * h * 0.6, qy - ax * h * 0.6); x.stroke();
      }
    });
  }
  // fisuras que se ramifican (cada una con su propio azar: sus copias en los bordes salen idénticas)
  const rama = (r, px, py, ang, largo, ancho, nivel) => {
    let qx = px, qy = py;
    x.strokeStyle = `rgba(56,74,64,${(0.12 + 0.05 * nivel).toFixed(3)})`; x.lineWidth = ancho;
    x.beginPath(); x.moveTo(qx, qy);
    for (let k = 0; k < 4; k++) { ang += (r() - 0.5) * 0.6; qx += Math.cos(ang) * largo / 4; qy += Math.sin(ang) * largo / 4; x.lineTo(qx, qy); }
    x.stroke();
    if (nivel > 0) for (const s of [-1, 1]) if (r() < 0.85) rama(r, qx, qy, ang + s * (0.35 + r() * 0.5), largo * 0.66, ancho * 0.72, nivel - 1);
  };
  for (let n = 0; n < 7; n++) {
    const px = rnd() * T, py = rnd() * T, a = rnd() * Math.PI * 2, L = 40 + rnd() * 50, semilla = rnd() * 1e9 | 0;
    enCopias(T, px, py, L * 3, (cx, cy) => rama(azar(semilla), cx, cy, a, L, 1.4, 4));
  }
  // inclusiones de tres fases: cavidades alargadas con su burbuja
  for (let n = 0; n < 30; n++) {
    const px = rnd() * T, py = rnd() * T, a = rnd() * Math.PI, L = 4 + rnd() * 7, W = 1.2 + rnd() * 1.6;
    enCopias(T, px, py, L * 2, (cx, cy) => {
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.beginPath(); x.moveTo(-L, 0); x.lineTo(-L * 0.4, -W); x.lineTo(L * 0.5, -W * 0.7); x.lineTo(L, 0); x.lineTo(L * 0.3, W); x.lineTo(-L * 0.6, W * 0.8); x.closePath();
      x.fillStyle = 'rgba(96,116,104,0.16)'; x.fill(); x.strokeStyle = 'rgba(40,52,46,0.34)'; x.lineWidth = 0.8; x.stroke();
      x.beginPath(); x.arc(L * 0.25, 0, W * 0.38, 0, Math.PI * 2); x.stroke();
      x.restore();
    });
  }
  return c;
}

function escarcha() {
  const T = MAX, rnd = azar(3307);
  const grano = fbm(T, 256, 2, rnd, { ganancia: 0.6 }), manchas = fbm(T, 8, 3, rnd);
  // grano fino como vidrio esmerilado, con zonas un poco más densas
  return pintarPixeles(T, i => 1 - (0.05 + 0.13 * grano[i] * grano[i]) * (0.55 + 0.45 * manchas[i]));
}

function facetas() {
  // micro facetas: celdas de Voronoi, cada una con su propia inclinación (refleja y refracta una luz distinta).
  // El mapa de normales se arma directo, plano dentro de cada celda: sacado del gris con Sobel, los bordes
  // serían grietas y en el trazado de rayos la piedra se vería escarchada en vez de chispeante
  const T = MAX, rnd = azar(4409), G = 22, cel = T / G, sem = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = rnd() * Math.PI * 2, t = Math.tan((3 + rnd() * 6) * Math.PI / 180);
    sem.push({ x: (i + 0.15 + rnd() * 0.7) * cel, y: (j + 0.15 + rnd() * 0.7) * cel, nx: Math.cos(a) * t, ny: Math.sin(a) * t });
  }
  const nx = new Float32Array(T * T), ny = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const ci = (x / cel) | 0, cj = (y / cel) | 0;
    let mejor = Infinity, s = null;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, q = sem[((jj + G) % G) * G + ((ii + G) % G)];
      const d = (x - q.x - Math.floor(ii / G) * T) ** 2 + (y - q.y - Math.floor(jj / G) * T) ** 2;
      if (d < mejor) { mejor = d; s = q; }
    }
    nx[y * T + x] = s.nx; ny[y * T + x] = s.ny;
  }
  // destellos: puntitos abombados que siempre encuentran una luz (en el lienzo, +y es hacia abajo = −v)
  const rnd3 = azar(4410), puntos = [];
  for (let n = 0; n < 150; n++) {
    const px = rnd3() * T, py = rnd3() * T, R = 2 + rnd3() * 3, L = 2 + rnd3() * 6, a = rnd3() * 0.6;
    puntos.push({ px, py, L, a });
    for (let y = Math.floor(py - R); y <= py + R; y++) for (let x = Math.floor(px - R); x <= px + R; x++) {
      const dx = (x + 0.5 - px) / R, dy = (y + 0.5 - py) / R, r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      const i = ((y + T) % T) * T + ((x + T) % T);
      nx[i] = dx * 0.8; ny[i] = -dy * 0.8;
    }
  }
  // gris: la luz de arriba a la izquierda sobre cada faceta (para la miniatura y el modo Color)
  const c = pintarPixeles(T, i => 0.955 + 0.25 * (ny[i] - nx[i]));
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 1; x.fillStyle = '#fff';
  for (const { px, py, L, a } of puntos) enCopias(T, px, py, L, (cx, cy) => {
    for (const b of [a, a + Math.PI / 2]) { x.beginPath(); x.moveTo(cx - Math.cos(b) * L, cy - Math.sin(b) * L); x.lineTo(cx + Math.cos(b) * L, cy + Math.sin(b) * L); x.stroke(); }
    x.beginPath(); x.arc(cx, cy, 1.2, 0, Math.PI * 2); x.fill();
  });
  c.mapaNormal = pintarPixeles(T, i => { const inv = 1 / Math.sqrt(nx[i] * nx[i] + ny[i] * ny[i] + 1); return [nx[i] * inv * 0.5 + 0.5, ny[i] * inv * 0.5 + 0.5, inv * 0.5 + 0.5]; });
  return c;
}

// ---------- Presets del metal (gris = altura: lo oscuro es un hundimiento) ----------
function martillado() {
  // cada golpe del martillo deja un cuenco; la superficie es la más honda de todas las huellas
  const T = MAX, rnd = azar(5501), G = 9, cel = T / G, sem = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) for (let k = 0; k < 2; k++) {
    const R = cel * (0.62 + rnd() * 0.5);
    sem.push({ i, j, x: (i + rnd()) * cel, y: (j + rnd()) * cel, R, h: R * (0.1 + rnd() * 0.05) });
  }
  const porCelda = Array.from({ length: G * G }, () => []);
  for (const s of sem) porCelda[s.j * G + s.i].push(s);
  const alt = new Float32Array(T * T), fino = fbm(T, 128, 2, rnd);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const ci = (x / cel) | 0, cj = (y / cel) | 0;
    let h = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, lista = porCelda[((jj + G) % G) * G + ((ii + G) % G)];
      const ox = Math.floor(ii / G) * T, oy = Math.floor(jj / G) * T;
      for (const s of lista) {
        const d2 = (x - s.x - ox) ** 2 + (y - s.y - oy) ** 2, r2 = s.R * s.R;
        if (d2 < r2) { const v = s.h * (d2 / r2 - 1); if (v < h) h = v; }
      }
    }
    alt[y * T + x] = h + fino[y * T + x] * 0.12;   // apenas un poco de textura dentro de cada golpe
  }
  estirar(alt);
  return pintarPixeles(T, i => 0.15 + 0.7 * alt[i]);
}

function ruido1D(T, celdas, rnd) {
  const g = Array.from({ length: celdas }, rnd), out = new Float32Array(T);
  for (let x = 0; x < T; x++) { const f = x * celdas / T, i = f | 0, t = suav(f - i); out[x] = g[i % celdas] + (g[(i + 1) % celdas] - g[i % celdas]) * t; }
  return out;
}
function cepillado() {
  // líneas verticales (a lo largo de v = alrededor del aro): cada columna tiene su propio surco
  const T = MAX, rnd = azar(6607);
  const a = ruido1D(T, 512, rnd), b = ruido1D(T, 1024, rnd), m = ruido1D(T, 96, rnd);
  const largo = fbm(T, 64, 2, rnd, { aniso: 24 });   // los surcos cambian despacio a lo largo
  const alt = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = y * T + x; alt[i] = 0.45 * a[x] + 0.3 * b[x] + 0.25 * m[x] + 0.35 * (largo[i] - 0.5); }
  // rayas más hondas que no recorren toda la pieza
  for (let n = 0; n < 46; n++) {
    const x0 = rnd() * T | 0, y0 = rnd() * T, L = 160 + rnd() * 760, p = 0.25 + rnd() * 0.35;
    for (let k = 0; k < L; k++) {
      const y = ((y0 + k) | 0) % T, f = Math.sin(Math.PI * k / L) * p;
      alt[y * T + x0] -= f; alt[y * T + (x0 + 1) % T] -= f * 0.35; alt[y * T + (x0 + T - 1) % T] -= f * 0.35;
    }
  }
  estirar(alt);
  return pintarPixeles(T, i => 0.2 + 0.6 * alt[i]);
}

function arenado() {
  // granalla fina e irregular: miles de micro cráteres
  const T = MAX, rnd = azar(7703);
  const fino = fbm(T, 512, 2, rnd, { ganancia: 0.7 }), medio = fbm(T, 48, 3, rnd);
  return pintarPixeles(T, i => 0.5 + 0.38 * (fino[i] - 0.5) * 2 * (0.75 + 0.5 * medio[i]) + 0.06 * (medio[i] - 0.5));
}

function grabado() {
  // arabesco floral a buril: un tallo ondulado con zarcillos en espiral dentro de cada curva, hojas con
  // nervios y florecitas. El motivo mide 512 × 256 y se repite 2 × 4 veces, sin costuras.
  const T = MAX, M = 512, N = 256, A = 52, c = lienzo(T), x = c.getContext('2d');
  x.fillStyle = 'rgb(196,196,196)'; x.fillRect(0, 0, T, T);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const surco = (trazar, ancho) => {   // surco en V: hombro suave, fondo oscuro y el filo brillante del buril
    x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = ancho * 2.4; x.beginPath(); trazar(); x.stroke();
    x.strokeStyle = 'rgba(34,34,34,0.92)'; x.lineWidth = ancho; x.beginPath(); trazar(); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = Math.max(1, ancho * 0.3); x.save(); x.translate(-ancho * 0.45, -ancho * 0.45); x.beginPath(); trazar(); x.stroke(); x.restore();
  };
  const y = s => N / 2 + A * Math.sin(2 * Math.PI * s / M), pend = s => Math.atan(A * 2 * Math.PI / M * Math.cos(2 * Math.PI * s / M));
  const hoja = (bx, by, ang, L, W) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), tx = bx + ux * L, ty = by + uy * L;
    surco(() => {
      x.moveTo(bx, by); x.quadraticCurveTo(bx + ux * L * 0.45 - uy * W, by + uy * L * 0.45 + ux * W, tx, ty);
      x.quadraticCurveTo(bx + ux * L * 0.45 + uy * W, by + uy * L * 0.45 - ux * W, bx, by);
    }, 3);
    surco(() => { x.moveTo(bx + ux * 5, by + uy * 5); x.lineTo(tx - ux * 7, ty - uy * 7); }, 1.8);
    for (let k = 1; k <= 3; k++) for (const s of [-1, 1]) {   // nervios en diagonal: el corte brillante del buril
      const f = k / 4.4, px = bx + ux * L * f, py = by + uy * L * f, w = W * 0.62 * Math.sin(Math.PI * (f + 0.08));
      surco(() => { x.moveTo(px, py); x.lineTo(px + ux * w * 0.8 - uy * w * s, py + uy * w * 0.8 + ux * w * s); }, 1.5);
    }
  };
  const flor = (cx, cy, r) => {
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 - Math.PI / 2;
      surco(() => { x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a - 0.5) * r * 1.3, cy + Math.sin(a - 0.5) * r * 1.3, cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.quadraticCurveTo(cx + Math.cos(a + 0.5) * r * 1.3, cy + Math.sin(a + 0.5) * r * 1.3, cx, cy); }, 2.4);
    }
    x.fillStyle = 'rgba(34,34,34,0.92)'; x.beginPath(); x.arc(cx, cy, 3.4, 0, Math.PI * 2); x.fill();
  };
  const motivo = () => {
    surco(() => { for (let s = -16; s <= M + 16; s += 4) x[s > -16 ? 'lineTo' : 'moveTo'](s, y(s)); }, 5);
    for (const [sc, sg] of [[M / 4, -1], [3 * M / 4, 1]]) {   // sg = -1: la curva se abre hacia arriba
      const yc = y(sc), r0 = 44, cx = sc + 12, cy = yc + sg * 62, sp = sc - 74, py = y(sp);
      const vueltas = 1.3, sentido = -sg;
      // zarcillo: sale del tallo y se enrolla dentro de la curva
      surco(() => {
        x.moveTo(sp, py); x.quadraticCurveTo(cx - r0, py, cx - r0, cy);   // llega subiendo (o bajando) justo donde arranca la espiral
        for (let k = 1; k <= 80; k++) { const t = k / 80, a = Math.PI + sentido * t * vueltas * Math.PI * 2, r = r0 * Math.pow(0.15, t); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      }, 4);
      x.fillStyle = 'rgba(34,34,34,0.92)'; x.beginPath(); x.arc(cx + Math.cos(Math.PI + sentido * vueltas * Math.PI * 2) * r0 * 0.15, cy + Math.sin(Math.PI + sentido * vueltas * Math.PI * 2) * r0 * 0.15, 4, 0, Math.PI * 2); x.fill();
      hoja(sp + 6, py + sg * 26, Math.PI + sg * 0.5, 34, 11);                   // hojita en el arranque del zarcillo
      hoja(sc + 58, y(sc + 58), pend(sc + 58) - sg * 1.05, 46, 15);             // hoja hacia afuera de la curva
      hoja(sc - 30, y(sc - 30), pend(sc - 30) + Math.PI - sg * 1.0, 40, 13);
      // florecita en el espacio de afuera, con su tallito
      const fy = yc - sg * 78;
      surco(() => { x.moveTo(sc + 20, y(sc + 20)); x.quadraticCurveTo(sc + 26, yc - sg * 40, sc, fy + sg * 16); }, 2.6);
      flor(sc, fy, 15);
      hoja(sc + 4, yc - sg * 52, -sg * Math.PI / 2 + 0.9, 22, 8);                 // hojita en el tallo de la flor
      // punteado de adorno junto a la flor
      x.fillStyle = 'rgba(34,34,34,0.85)';
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(sc - 52 + k * 11, fy + sg * (8 - Math.abs(k - 1) * 4), 2.6, 0, Math.PI * 2); x.fill(); }
    }
  };
  for (let dx = -M; dx < T + M; dx += M) for (let dy = -N; dy < T + N; dy += N) { x.save(); x.translate(dx, dy); motivo(); x.restore(); }
  return c;
}

// crear() guarda el lienzo: la primera vez tarda unas décimas, después es instantáneo
const unaVez = (id, f, extra = {}) => {
  let c = null;
  return () => {
    if (!c) { c = f(); c.dataset.preset = id; for (const [k, v] of Object.entries(extra)) c.dataset[k] = String(v); }
    return c;
  };
};
// fuerza: pendiente del mapa de normales; relieve: multiplica normalScale; relievePT: lo mismo en la piedra del trazado
// de rayos (allí la luz atraviesa la gema y rebota adentro, así que cada desvío se multiplica: se usa mucho menos);
// modo, intensidad y escala: valores con los que se ve mejor
export const PRESETS_PIEDRA = {
  inclusiones:      { nombre: 'Seda e inclusiones', descripcion: 'Agujas finas de rutilo y cristales diminutos, como en rubíes y zafiros naturales', modo: 'ambos', intensidad: 0.7, escala: 1, crear: unaVez('inclusiones', seda, { fuerza: 1.5, relieve: 1, relievePT: 0.25 }) },
  jardin:           { nombre: 'Jardín de esmeralda', descripcion: 'Velos y fisuras con forma de musgo: el "jardín" de las esmeraldas', modo: 'ambos', intensidad: 0.7, escala: 1, crear: unaVez('jardin', jardin, { fuerza: 1.5, relieve: 1, relievePT: 0.25 }) },
  escarcha:         { nombre: 'Escarcha', descripcion: 'Superficie esmerilada, como una piedra mate o sin pulir', modo: 'relieve', intensidad: 0.6, escala: 0.6, crear: unaVez('escarcha', escarcha, { fuerza: 1.5, relieve: 1, relievePT: 0.45 }) },
  'facetas-brillo': { nombre: 'Facetas con brillo', descripcion: 'Micro facetas y puntos de luz: más destellos al girar', modo: 'relieve', intensidad: 0.6, escala: 0.8, crear: unaVez('facetas-brillo', facetas, { relieve: 1, relievePT: 0.3 }) },
};
export const PRESETS_METAL = {
  martillado: { nombre: 'Martillado', descripcion: 'Huellas de martillo, como un anillo forjado a mano', intensidad: 0.6, escala: 0.7, crear: unaVez('martillado', martillado, { fuerza: 5, relieve: 1 }) },
  cepillado:  { nombre: 'Cepillado', descripcion: 'Líneas finas alrededor de la pieza', intensidad: 0.55, escala: 1, crear: unaVez('cepillado', cepillado, { fuerza: 0.5, relieve: 1, rugosidad: 1 }) },
  arenado:    { nombre: 'Arenado', descripcion: 'Grano fino de chorro de arena', intensidad: 0.6, escala: 0.6, crear: unaVez('arenado', arenado, { fuerza: 0.4, relieve: 1, rugosidad: 1 }) },
  grabado:    { nombre: 'Grabado floral', descripcion: 'Arabescos a buril con hojas y espirales', intensidad: 0.7, escala: 0.9, crear: unaVez('grabado', grabado, { fuerza: 1.5, relieve: 1 }) },
};

// ---------- HDRI ----------
// .hdr y .exr: luz real de alto rango. JPG/PNG: se pasa a lineal y se realzan las luces altas,
// porque una foto normal se satura en 1 y sin eso el metal se vería apagado.
export async function cargarHDRI(file, renderer) {
  if (!file) throw new Error('Escoge un panorama HDR, EXR o JPG.');
  const nombre = (file.name || 'Panorama').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Panorama';
  const ext = ((file.name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const maxAncho = Math.min(2048, renderer?.capabilities?.maxTextureSize || 2048);
  let tex;
  if (ext === 'hdr' || ext === 'pic' || ext === 'rgbe' || ext === 'exr') {
    const buf = await file.arrayBuffer();
    let datos;
    try {
      if (ext === 'exr') { const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js'); datos = new EXRLoader().setDataType(THREE.HalfFloatType).parse(buf); }
      else { const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js'); datos = new HDRLoader().setDataType(THREE.HalfFloatType).parse(buf); }
    } catch (e) { console.error(e); throw new Error(`No se pudo leer el archivo .${ext}: puede estar dañado o usar una compresión no compatible.`); }
    if (!datos?.data || !datos.width || !datos.height) throw new Error(`No se pudo leer el archivo .${ext}.`);
    tex = reducirHDR(datos, maxAncho, ext !== 'exr');
  } else if (/^image\//.test(file.type) || /^(jpe?g|png|webp|avif)$/.test(ext)) {
    tex = hdrDesdeFoto(await cargarImagen(file), maxAncho);
  } else throw new Error('Ese archivo no es un panorama: sube un .hdr, .exr o una foto 360° en JPG.');
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.name = nombre;
  tex.needsUpdate = true;
  return { equirect: tex, nombre };
}

// Reduce un HDR grande a máx. 2048 px de ancho (promediando: no se pierde energía de las luces).
// arribaPrimero: en los .hdr la primera fila es el cielo (el cargador de three usa flipY por eso)
function reducirHDR(datos, maxAncho, arribaPrimero) {
  const { width: W, height: H } = datos, f = Math.max(1, Math.ceil(W / maxAncho));
  const media = datos.type === THREE.HalfFloatType || datos.data instanceof Uint16Array;
  const leer = media ? v => THREE.DataUtils.fromHalfFloat(v) : v => v;
  const canales = datos.data.length / (W * H);
  const w = Math.floor(W / f), h = Math.max(1, Math.floor(H / f)), out = new Uint16Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const k = ((y * f + j) * W + x * f + i) * canales;
      r += leer(datos.data[k]); g += leer(datos.data[k + 1]); b += leer(datos.data[k + 2]);
    }
    const n = f * f, yy = arribaPrimero ? h - 1 - y : y, o = (yy * w + x) * 4;   // se guarda con la fila 0 abajo (sin flipY)
    out[o] = THREE.DataUtils.toHalfFloat(sano(r / n)); out[o + 1] = THREE.DataUtils.toHalfFloat(sano(g / n)); out[o + 2] = THREE.DataUtils.toHalfFloat(sano(b / n)); out[o + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.flipY = false;
  return tex;
}
const sano = v => (Number.isFinite(v) && v > 0 ? Math.min(v, 65000) : 0);
const aLineal = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function hdrDesdeFoto(imagen, maxAncho) {
  const W0 = imagen.width || imagen.naturalWidth, H0 = imagen.height || imagen.naturalHeight;
  const w = Math.min(maxAncho, W0), h = Math.max(1, Math.round(w * H0 / W0));
  const c = lienzo(w, h), x = ctx2d(c);
  x.drawImage(imagen, 0, 0, w, h);
  const p = x.getImageData(0, 0, w, h).data, out = new Uint16Array(w * h * 4), tabla = new Float32Array(256);
  for (let i = 0; i < 256; i++) tabla[i] = aLineal(i / 255);
  const uno = THREE.DataUtils.toHalfFloat(1);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = 4 * (y * w + xx), o = 4 * ((h - 1 - y) * w + xx);   // fila 0 del lienzo = cielo: va arriba (v = 1)
    const r = tabla[p[i]], g = tabla[p[i + 1]], b = tabla[p[i + 2]], L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = 1 + 5 * Math.pow(escalon(0.6, 1, L), 2);   // ventanas y cielo casi blancos → luces de verdad
    out[o] = THREE.DataUtils.toHalfFloat(r * k); out[o + 1] = THREE.DataUtils.toHalfFloat(g * k); out[o + 2] = THREE.DataUtils.toHalfFloat(b * k); out[o + 3] = uno;
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.flipY = false;
  return tex;
}

// ---------- Aplicar al estudio ----------
// Los materiales del Estudio se modifican desde aquí (estudio.js no sabe de texturas).
const ESTADOS = new WeakMap();       // estudio → texturas puestas (para liberarlas al cambiar)
const CACHE = new WeakMap();         // imagen → { piedra: {...}, metal: {...} } (el Sobel se hace una sola vez)
const MATERIALES = { piedra: ['matP', 'matP2', 'matPPT'], metal: ['mat', 'matPT'] };

function datosDe(imagen, grupo) {
  let porImagen = CACHE.get(imagen);
  if (!porImagen) CACHE.set(imagen, porImagen = {});
  return porImagen[grupo] || (porImagen[grupo] = {});
}
// textura de color (o de rugosidad) mezclada con blanco según la intensidad: se redibuja en su mismo lienzo
function mezclaConBlanco(d, clave, fuente, alfa, colorSpace) {
  let m = d[clave];
  if (!m) { m = d[clave] = { tex: repetir(new THREE.CanvasTexture(cuadrado(fuente, alfa))), alfa }; m.tex.colorSpace = colorSpace; return m.tex; }
  if (Math.abs(m.alfa - alfa) > 1e-3) {
    const c = m.tex.image, x = c.getContext('2d'), S = c.width, w = fuente.width, h = fuente.height, s = Math.min(w, h);
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    x.globalAlpha = alfa; x.drawImage(fuente, (w - s) / 2, (h - s) / 2, s, s, 0, 0, S, S); x.globalAlpha = 1;
    m.alfa = alfa; m.tex.needsUpdate = true;
  }
  return m.tex;
}
// Fotos del usuario: se aclaran hasta que lo más claro (el 1 % más brillante) quede blanco.
// Así una foto oscura no apaga la piedra y el relieve sale con la misma fuerza que en los presets
function aclarada(d, imagen) {
  if (d.aclarada) return d.aclarada;
  const c = cuadrado(imagen), x = ctx2d(c), S = c.width, datos = x.getImageData(0, 0, S, S), p = datos.data, hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) hist[(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) | 0]++;
  let n = 0, alto = 255;
  for (let v = 255; v > 0; v--) { n += hist[v]; if (n >= S * S * 0.01) { alto = v; break; } }
  const k = 255 / Math.max(alto, 32);   // una imagen casi negra no se estira sin límite (sería puro ruido)
  if (k > 1.02) { for (let i = 0; i < p.length; i += 4) { p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k); } x.putImageData(datos, 0, 0); }
  return (d.aclarada = c);
}

// rugosidad derivada del bitmap. three la multiplica por la del acabado, así que solo puede bajarla:
// lo hundido (surcos del cepillado, cráteres del arenado) conserva la rugosidad del acabado y lo alto,
// pulido por el roce, brilla un poco más. El mate de verdad lo da el acabado Satinado o Arenado
function fuenteRugosidad(d, imagen) {
  if (d.fuenteRug) return d.fuenteRug;
  const c = cuadrado(imagen), x = ctx2d(c), S = c.width, datos = x.getImageData(0, 0, S, S), p = datos.data;
  for (let i = 0; i < p.length; i += 4) { const v = 255 * (1 - 0.55 * (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255); p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(datos, 0, 0);
  return (d.fuenteRug = c);
}

function ponerMapa(m, clave, tex) {
  if ((m[clave] || null) === (tex || null)) return false;
  const habia = !!m[clave];
  m[clave] = tex || null;
  return habia !== !!tex;   // solo cambia el sombreador si aparece o desaparece el mapa
}

function aplicarGrupo(estudio, est, grupo, a) {
  const mats = MATERIALES[grupo].map(k => estudio[k]).filter(Boolean);
  const geo = grupo === 'piedra' ? estudio.geoP : estudio.geo, imagen = a?.imagen || null;
  let geometria = false;
  const viejas = est[grupo] || [];
  let nuevas = [];
  if (imagen) {
    if (geo && !geo.attributes.uv) { generarUVCaja(geo); geometria = true; }
    const d = datosDe(imagen, grupo), ds = imagen.dataset || {};
    const fuente = ds.preset ? imagen : aclarada(d, imagen);   // los presets ya vienen calibrados
    const modo = grupo === 'metal' ? 'relieve' : (['color', 'relieve', 'ambos'].includes(a.modo) ? a.modo : 'ambos');
    const intensidad = clamp(num(a.intensidad, 0.6), 0, 1), escala = clamp(num(a.escala, 1), 0.2, 5);
    const color = modo !== 'relieve' ? mezclaConBlanco(d, 'color', fuente, intensidad, THREE.SRGBColorSpace) : null;
    const normal = modo !== 'color' ? (d.normal || (d.normal = imagen.mapaNormal ? texturaNormal(imagen.mapaNormal) : mapaNormalDesde(fuente, num(+ds.fuerza, 1)))) : null;
    const rug = grupo === 'metal' && (ds.rugosidad === '1' || a.rugosidad === true) ? mezclaConBlanco(d, 'rug', fuenteRugosidad(d, fuente), intensidad, THREE.NoColorSpace) : null;
    nuevas = [color, normal, rug].filter(Boolean);
    const aniso = Math.min(8, estudio.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    for (const t of nuevas) { t.repeat.set(1 / escala, 1 / escala); t.anisotropy = aniso; }
    // en «ambos» el color dibuja las inclusiones y el relieve solo suma un brillo leve (si no, parecen rayones)
    const s = intensidad * num(+ds.relieve, 1) * (grupo === 'metal' ? 0.9 : modo === 'ambos' ? 0.45 : 1);
    for (const m of mats) {
      let sombreador = ponerMapa(m, 'normalMap', normal);
      const k = m === estudio.matPPT ? num(+ds.relievePT, 0.35) : 1;
      if (normal) m.normalScale.set(s * k, s * k);
      if (grupo === 'piedra') sombreador = ponerMapa(m, 'map', color) || sombreador;
      // el metal del motor rápido tiene capa de laca (clearcoat): lleva el mismo relieve, más suave.
      // Se pone siempre (aunque el acabado de ahora no tenga laca) porque estudio.pintar() la activa al cambiar el acabado
      else {
        sombreador = ponerMapa(m, 'roughnessMap', rug) || sombreador;
        sombreador = ponerMapa(m, 'clearcoatNormalMap', m === estudio.mat ? normal : null) || sombreador;
        if (m === estudio.mat && normal) m.clearcoatNormalScale.set(s * 0.6, s * 0.6);
      }
      if (sombreador) m.needsUpdate = true;
    }
  } else {
    for (const m of mats) {
      let sombreador = ponerMapa(m, 'normalMap', null);
      sombreador = ponerMapa(m, grupo === 'piedra' ? 'map' : 'roughnessMap', null) || sombreador;
      if (grupo === 'metal') sombreador = ponerMapa(m, 'clearcoatNormalMap', null) || sombreador;
      if (sombreador) m.needsUpdate = true;
    }
  }
  for (const t of viejas) if (!nuevas.includes(t)) t.dispose();   // libera la memoria de video (el lienzo queda en caché)
  est[grupo] = nuevas;
  return geometria;
}

function aplicarHDRI(estudio, est, h) {
  const tex = h?.textura || null, e = estudio.escena, ept = estudio.escenaPT;
  if (tex !== (est.hdri || null)) {
    est.pmrem?.dispose(); est.pmrem = null;
    if (tex) { const pm = new THREE.PMREMGenerator(estudio.renderer); est.pmrem = pm.fromEquirectangular(tex); pm.dispose(); }
    est.hdri = tex;
  }
  // motor rápido: el mapa prefiltrado (PMREM); trazado de rayos: el panorama tal cual. Sin HDRI vuelve el estudio Atelier
  if (e) e.environment = tex ? est.pmrem.texture : estudio.pmMetal;
  if (ept) ept.environment = tex || estudio.envMetal;
  const k = tex ? clamp(num(h.intensidad, 1), 0.2, 3) : 1;
  if (e) e.environmentIntensity = k;
  if (ept) ept.environmentIntensity = k;
  estudio.rotacionHDRI = tex ? THREE.MathUtils.degToRad(num(h.rotacion, 0)) : 0;   // la suma aplicarPose al giro de la luz
  estudio.pt?.updateEnvironment();
}

// ajustes = { piedra: { imagen, modo, intensidad, escala }, metal: { imagen, intensidad, escala }, hdri: { textura, intensidad, rotacion } }
// (cada grupo es opcional: si falta, no se toca)
export function aplicarTexturas(estudio, ajustes = {}) {
  if (!estudio) return;
  let est = ESTADOS.get(estudio);
  if (!est) ESTADOS.set(estudio, est = {});
  let geometria = false;
  if (ajustes.piedra !== undefined) geometria = aplicarGrupo(estudio, est, 'piedra', ajustes.piedra) || geometria;
  if (ajustes.metal !== undefined) geometria = aplicarGrupo(estudio, est, 'metal', ajustes.metal) || geometria;
  if (geometria) estudio.ptSucio = true;   // el trazador de rayos vuelve a leer la geometría con sus uv
  if (ajustes.hdri !== undefined) aplicarHDRI(estudio, est, ajustes.hdri);
  estudio.pt?.updateMaterials();
}

// ---------- Panel ----------
const ICONOS = {
  subir: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>',
  quitar: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  estudio: '<svg viewBox="0 0 24 24"><path d="M5 4h14l-2 6H7z"/><path d="M12 10v4M8 21l4-7 4 7"/></svg>',
};
const MODOS = { color: ['Color', 'El bitmap tiñe el interior de la piedra: lo blanco no cambia nada y lo oscuro se ve como inclusiones.'], relieve: ['Relieve', 'El brillo del bitmap se vuelve relieve: desvía la luz y da más destellos y textura.'], ambos: ['Ambos', 'Tiñe el interior y desvía la luz: el resultado más realista.'] };
const CONSEJOS_METAL = {
  martillado: 'Cada golpe refleja la luz por separado: se luce al girar la pieza.',
  cepillado: 'Para un cepillado más marcado, combínalo con el acabado Satinado.',
  arenado: 'Para un mate completo, combínalo con el acabado Arenado (mate).',
  grabado: 'Baja la escala si quieres el grabado más fino y repetido.',
  propia: 'Lo claro de tu imagen queda en alto y lo oscuro hundido.',
};
const GRUPOS = {
  piedra: { titulo: 'Bitmaps de las piedras', ayuda: 'Inclusiones y textura dentro de la gema', presets: PRESETS_PIEDRA },
  metal: { titulo: 'Textura del metal', ayuda: 'Martillado, cepillado o grabado', presets: PRESETS_METAL },
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const decimal = (v, d = 1) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const enSRGB = color => { const t = { r: 1, g: 1, b: 1 }; color?.getRGB?.(t, THREE.SRGBColorSpace); return [t.r, t.g, t.b]; };

// Miniatura "iluminada": el bitmap con el color de la piedra o del metal y su relieve sombreado
// por una luz de arriba a la izquierda (así se ve qué hace antes de aplicarlo)
function miniatura(destino, fuente, { tinte = [1, 1, 1], color = 1, relieve = 0.7, metal = false, recorte = 0.42 } = {}) {
  const N = destino.width, w = fuente.width || fuente.naturalWidth, h = fuente.height || fuente.naturalHeight, s = Math.min(w, h) * recorte;
  const t = lienzo(N), x = ctx2d(t);
  x.fillStyle = '#fff'; x.fillRect(0, 0, N, N);
  x.drawImage(fuente, (w - s) / 2, (h - s) / 2, s, s, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N), p = d.data, L = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) L[i] = (0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]) / 255;
  const lx = -0.45, ly = -0.55, lz = 0.7, ln = Math.hypot(lx, ly, lz), hx = lx / ln, hy = ly / ln, hz = lz / ln + 1, hn = Math.hypot(hx, hy, hz);
  const k = (metal ? 3.2 : 2.4) * N / 64, plano = lz / ln;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const a = Math.max(0, xx - 1), b = Math.min(N - 1, xx + 1), c = Math.max(0, y - 1), e = Math.min(N - 1, y + 1);
    const gx = (L[y * N + b] - L[y * N + a]) / 2, gy = (L[e * N + xx] - L[c * N + xx]) / 2;
    const nx = -gx * k, ny = -gy * k, inv = 1 / Math.hypot(nx, ny, 1);
    const dif = Math.max(0, (nx * lx + ny * ly + lz) * inv / ln), esp = Math.pow(Math.max(0, (nx * hx + ny * hy + hz) * inv / hn), metal ? 30 : 60);
    const u = xx / N - 0.5, v = y / N - 0.5, r2 = u * u + v * v, i = 4 * (y * N + xx);
    let o;
    if (metal) {
      const brillo = (0.3 + 0.95 * dif) * (1.08 - 0.5 * (y / N)) ;
      o = tinte.map(q => q * brillo + esp * 0.7);
    } else {
      const sombra = 1 + relieve * (dif / plano - 1) * 0.9, vineta = 1.05 - 1.1 * r2;
      o = tinte.map((q, j) => q * (1 - color + color * p[i + j] / 255) * sombra * vineta + esp * relieve * 0.45);
    }
    p[i] = clamp(o[0], 0, 1) * 255; p[i + 1] = clamp(o[1], 0, 1) * 255; p[i + 2] = clamp(o[2], 0, 1) * 255; p[i + 3] = 255;
  }
  destino.getContext('2d').putImageData(d, 0, 0);
}

// Panorama en miniatura (con tono simple), para ver qué luz está puesta
function miniaturaPanorama(destino, tex) {
  const img = tex?.image, W = destino.width, H = destino.height, x = destino.getContext('2d');
  if (!img?.data) { x.fillStyle = '#2a2622'; x.fillRect(0, 0, W, H); return; }
  const { width: w, height: h, data } = img, media = data instanceof Uint16Array, can = data.length / (w * h);
  const leer = media ? v => THREE.DataUtils.fromHalfFloat(v) : v => v;
  const d = x.createImageData(W, H), p = d.data, fx = w / W, fy = h / H, pasoX = Math.max(1, Math.floor(fx / 3)), pasoY = Math.max(1, Math.floor(fy / 3));
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let r = 0, g = 0, b = 0, n = 0;
    const y0 = Math.floor(y * fy), x0 = Math.floor(xx * fx);
    for (let j = 0; j < fy; j += pasoY) for (let i = 0; i < fx; i += pasoX) {
      const fila = h - 1 - Math.min(h - 1, y0 + j), k = (fila * w + Math.min(w - 1, x0 + i)) * can;   // fila 0 de los datos = abajo
      r += leer(data[k]); g += leer(data[k + 1]); b += leer(data[k + 2]); n++;
    }
    const o = 4 * (y * W + xx), tono = c => Math.pow(clamp(1.4 * c / (1 + 1.4 * c), 0, 1), 1 / 2.2) * 255;
    p[o] = tono(r / n); p[o + 1] = tono(g / n); p[o + 2] = tono(b / n); p[o + 3] = 255;
  }
  x.putImageData(d, 0, 0);
}

export class PanelTexturas {
  constructor(contenedor, { estudio, alCambiar } = {}) {
    this.cont = contenedor; this.estudio = estudio; this.alCambiarExt = alCambiar;
    this.estado = {
      piedra: { preset: null, propia: null, nombrePropia: '', modo: 'ambos', intensidad: 0.7, escala: 1 },
      metal: { preset: null, propia: null, nombrePropia: '', intensidad: 0.6, escala: 1 },
      hdri: { textura: null, nombre: '', intensidad: 1, rotacion: 0 },
    };
    this.tintes = ''; this.listas = new Set(); this.pendiente = 0;
    contenedor.classList.add('ptr');
    contenedor.innerHTML = `${Object.keys(GRUPOS).map(g => this.htmlGrupo(g)).join('')}${this.htmlHDRI()}`;
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alMover(e));
    contenedor.addEventListener('change', e => { const a = e.target.closest('input[type=file][data-archivo]'); if (a?.files?.length) { this.cargar(a.dataset.archivo, a.files[0]); a.value = ''; } });
    // soltar archivos sobre cada bloque (sin que el estudio crea que es un STL)
    contenedor.addEventListener('dragover', e => { const b = e.target.closest('[data-bloque]'); if (!b) return; e.preventDefault(); e.stopPropagation(); b.classList.add('encima'); });
    contenedor.addEventListener('dragleave', e => { const b = e.target.closest('[data-bloque]'); if (b && !b.contains(e.relatedTarget)) b.classList.remove('encima'); });
    contenedor.addEventListener('drop', e => {
      const b = e.target.closest('[data-bloque]'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); b.classList.remove('encima');
      const f = e.dataTransfer?.files?.[0]; if (f && !b.querySelector('fieldset')?.disabled) this.cargar(b.dataset.bloque, f);
    });
    // por si el estudio cambia de modelo o de piedra sin avisar: se revisa al acercarse al panel
    for (const ev of ['pointerenter', 'focusin']) contenedor.addEventListener(ev, e => { if (ev === 'pointerenter' || !contenedor.contains(e.relatedTarget)) this.render(); }, { passive: true });
    this.render();
    // las miniaturas se generan cuando el panel se ve (cada preset tarda unas décimas la primera vez)
    try {
      this.observador = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { this.observador.disconnect(); this.generarMiniaturas(); } });
      this.observador.observe(contenedor);
    } catch (e) { this.generarMiniaturas(); }
  }

  htmlGrupo(g) {
    const G = GRUPOS[g], rango = (campo, txt, min, max, paso) => `<label class="rango"><span>${txt}</span><input type="range" data-grupo="${g}" data-campo="${campo}" min="${min}" max="${max}" step="${paso}"><output data-salida="${g}-${campo}"></output></label>`;
    return `
      <section class="ptr-bloque" data-bloque="${g}">
        <div class="ptr-cab"><h3>${G.titulo}</h3><span class="ptr-ayuda">${G.ayuda}</span></div>
        <p class="ptr-pista" data-pista="${g}" hidden></p>
        <fieldset class="ptr-campos">
          <legend class="vh">${G.titulo}</legend>
          <div class="ptr-galeria" role="group" aria-label="${G.titulo}">
            ${Object.entries(G.presets).map(([k, pr]) => `<button type="button" class="ptr-ficha" data-grupo="${g}" data-preset="${k}" aria-pressed="false" title="${esc(pr.descripcion)}"><canvas class="ptr-muestra" width="128" height="128" aria-hidden="true"></canvas><b>${esc(pr.nombre)}</b></button>`).join('')}
            <button type="button" class="ptr-ficha" data-grupo="${g}" data-preset="propia" aria-pressed="false" hidden><canvas class="ptr-muestra" width="128" height="128" aria-hidden="true"></canvas><b>Tu imagen</b></button>
            <button type="button" class="ptr-ficha ptr-subir" data-accion="subir" data-grupo="${g}" title="JPG, PNG o WebP"><span class="ptr-muestra">${ICONOS.subir}</span><b>Subir imagen</b></button>
          </div>
          <input type="file" data-archivo="${g}" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden>
          <div class="ptr-ajustes" data-ajustes="${g}" hidden>
            ${g === 'piedra' ? `<div class="ptr-seg" role="group" aria-label="Cómo se usa el bitmap">${Object.entries(MODOS).map(([k, [n]]) => `<button type="button" data-modo="${k}" aria-pressed="false">${n}</button>`).join('')}</div>` : ''}
            <div class="grid2">${rango('intensidad', 'Intensidad', 0, 1, 0.01)}${rango('escala', 'Escala del patrón', -1, 1, 0.01)}</div>
            <div class="ptr-pie"><p class="ptr-ayuda" data-consejo="${g}"></p><button type="button" class="btn peligro chico" data-accion="quitar" data-grupo="${g}">${ICONOS.quitar}Quitar</button></div>
          </div>
          <p class="ptr-error" data-error="${g}" role="alert" hidden></p>
        </fieldset>
      </section>`;
  }

  htmlHDRI() {
    const rango = (campo, txt, min, max, paso) => `<label class="rango"><span>${txt}</span><input type="range" data-grupo="hdri" data-campo="${campo}" min="${min}" max="${max}" step="${paso}"><output data-salida="hdri-${campo}"></output></label>`;
    return `
      <section class="ptr-bloque" data-bloque="hdri">
        <div class="ptr-cab"><h3>Iluminación (HDRI)</h3><span class="ptr-ayuda">La luz y los reflejos de la joya</span></div>
        <div class="ptr-hdri">
          <canvas class="ptr-pano" width="320" height="160" aria-hidden="true"></canvas>
          <div class="ptr-hdri-txt">
            <b data-nombre-hdri>Estudio Atelier</b>
            <span class="ptr-ayuda" data-ayuda-hdri></span>
            <div class="ptr-botones">
              <button type="button" class="btn sec chico" data-accion="subirHDRI">${ICONOS.subir}Subir panorama</button>
              <button type="button" class="btn sec chico" data-accion="estudio" hidden>${ICONOS.estudio}Volver al estudio Atelier</button>
            </div>
          </div>
        </div>
        <input type="file" data-archivo="hdri" accept=".hdr,.exr,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden>
        <div class="ptr-ajustes" data-ajustes="hdri" hidden><div class="grid2">${rango('intensidad', 'Intensidad de la luz', 0.2, 3, 0.05)}${rango('rotacion', 'Rotación', -180, 180, 1)}</div></div>
        <p class="ptr-error" data-error="hdri" role="alert" hidden></p>
      </section>`;
  }

  // Ajustes listos para aplicarTexturas()
  get ajustes() {
    const e = this.estado, img = g => { const s = e[g]; return s.preset === 'propia' ? s.propia : s.preset ? GRUPOS[g].presets[s.preset]?.crear() || null : null; };
    return {
      piedra: { imagen: img('piedra'), modo: e.piedra.modo, intensidad: e.piedra.intensidad, escala: e.piedra.escala },
      metal: { imagen: img('metal'), intensidad: e.metal.intensidad, escala: e.metal.escala },
      hdri: { textura: e.hdri.textura, intensidad: e.hdri.intensidad, rotacion: e.hdri.rotacion },
    };
  }

  aplicar() {
    if (!this.estudio) return;
    try { aplicarTexturas(this.estudio, this.ajustes); }
    catch (err) { console.error(err); this.error('piedra', 'No se pudo aplicar la textura en este equipo.'); }
    this.geoVista = this.estudio.geo; this.geoPVista = this.estudio.geoP;
    this.alCambiarExt?.('texturas');
  }
  // Varias señales seguidas (un deslizador) se aplican una sola vez por cuadro
  programar() {
    if (this.pendiente) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
    this.pendiente = raf(() => { this.pendiente = 0; this.aplicar(); });
  }
  // Para main.js: después de cargar otro modelo (las uv se generan en la geometría nueva)
  reaplicar() { this.aplicar(); this.render(); }

  error(g, txt) { const p = this.cont.querySelector(`[data-error="${g}"]`); if (!p) return; p.textContent = txt || ''; p.hidden = !txt; }

  async alClic(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const g = b.dataset.grupo;
    if (b.dataset.preset) {
      const s = this.estado[g], id = b.dataset.preset;
      if (id !== 'propia' && s.preset !== id) Object.assign(s, { modo: GRUPOS[g].presets[id].modo || s.modo, intensidad: GRUPOS[g].presets[id].intensidad, escala: GRUPOS[g].presets[id].escala });
      s.preset = id; this.error(g, '');
      // la primera vez el preset se genera (unas décimas): se muestra la ficha ocupada mientras tanto
      if (id !== 'propia' && !this.listas.has(g + ':' + id)) { b.setAttribute('aria-busy', 'true'); await new Promise(r => setTimeout(r, 30)); }
      this.aplicar(); b.removeAttribute('aria-busy'); this.render();
      return;
    }
    if (b.dataset.modo) { this.estado.piedra.modo = b.dataset.modo; this.programar(); this.render(); return; }
    const accion = b.dataset.accion;
    if (accion === 'subir') this.cont.querySelector(`input[data-archivo="${g}"]`)?.click();
    else if (accion === 'quitar') { this.estado[g].preset = null; this.aplicar(); this.render(); }
    else if (accion === 'subirHDRI') this.cont.querySelector('input[data-archivo="hdri"]')?.click();
    else if (accion === 'estudio') { const h = this.estado.hdri, vieja = h.textura; Object.assign(h, { textura: null, nombre: '', intensidad: 1, rotacion: 0 }); this.aplicar(); vieja?.dispose(); this.error('hdri', ''); this.render(); }
  }

  alMover(e) {
    const inp = e.target.closest('input[type=range][data-campo]'); if (!inp) return;
    const s = this.estado[inp.dataset.grupo], v = +inp.value;
    s[inp.dataset.campo] = inp.dataset.campo === 'escala' ? Math.round(Math.pow(5, v) * 100) / 100 : v;   // escala: deslizador logarítmico de 0,2× a 5×
    this.salidas();
    this.programar();
  }

  async cargar(g, file) {
    const bloque = this.cont.querySelector(`[data-bloque="${g}"]`);
    bloque?.setAttribute('aria-busy', 'true'); this.error(g, '');
    try {
      if (g === 'hdri') {
        const { equirect, nombre } = await cargarHDRI(file, this.estudio?.renderer);
        const h = this.estado.hdri, vieja = h.textura;
        Object.assign(h, { textura: equirect, nombre, intensidad: 1, rotacion: 0 });
        this.aplicar(); vieja?.dispose();
      } else {
        const img = await cargarImagen(file), s = this.estado[g];
        s.propia = img; s.nombrePropia = file.name || 'Tu imagen'; s.preset = 'propia';
        if (s.intensidad < 0.4) s.intensidad = 0.6;
        this.aplicar();
        this.pintarPropia(g);
      }
    } catch (err) { console.error(err); this.error(g, err?.message || 'No se pudo leer el archivo.'); }
    finally { bloque?.removeAttribute('aria-busy'); this.render(); }
  }

  // ----- Miniaturas -----
  tinte(g) { return enSRGB(g === 'piedra' ? this.estudio?.matP2?.color : this.estudio?.mat?.color); }
  pintarFicha(g, id) {
    const pr = GRUPOS[g].presets[id], c = this.cont.querySelector(`[data-grupo="${g}"][data-preset="${id}"] canvas`); if (!pr || !c) return;
    const fuente = pr.crear(), modo = pr.modo || 'relieve';
    miniatura(c, fuente, { tinte: this.tinte(g), metal: g === 'metal', color: modo === 'relieve' ? 0.25 : 1, relieve: modo === 'color' ? 0.3 : 0.8, recorte: id === 'grabado' ? 0.62 : 0.42 });
    c.classList.add('lista'); this.listas.add(g + ':' + id);
  }
  pintarPropia(g) {
    const s = this.estado[g], c = this.cont.querySelector(`[data-grupo="${g}"][data-preset="propia"] canvas`); if (!s.propia || !c) return;
    // la imagen del usuario se muestra tal cual (recortada al centro) para que la reconozca
    const x = c.getContext('2d'), w = s.propia.width || s.propia.naturalWidth, h = s.propia.height || s.propia.naturalHeight, m = Math.min(w, h);
    x.drawImage(s.propia, (w - m) / 2, (h - m) / 2, m, m, 0, 0, c.width, c.height); c.classList.add('lista');
  }
  generarMiniaturas() {
    const cola = [];
    for (const g of Object.keys(GRUPOS)) for (const id of Object.keys(GRUPOS[g].presets)) cola.push([g, id]);
    const espera = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 400 }) : f => setTimeout(f, 40);
    const siguiente = () => { const t = cola.shift(); if (!t) return; try { this.pintarFicha(...t); } catch (e) { console.error(e); } espera(siguiente); };
    espera(siguiente);
    this.tintes = this.claveTintes();
    this.pintarPanorama();
  }
  claveTintes() { return [...this.tinte('piedra'), ...this.tinte('metal')].map(v => v.toFixed(3)).join(','); }
  pintarPanorama() {
    const c = this.cont.querySelector('.ptr-pano'), h = this.estado.hdri;
    if (c) miniaturaPanorama(c, h.textura || this.estudio?.envMetal);
    this.panoDe = h.textura || null;
  }

  // ----- Estado de los controles -----
  salidas() {
    const e = this.estado, poner = (k, txt) => { const o = this.cont.querySelector(`[data-salida="${k}"]`); if (o) o.textContent = txt; };
    for (const g of ['piedra', 'metal']) { poner(`${g}-intensidad`, `${Math.round(e[g].intensidad * 100)} %`); poner(`${g}-escala`, `${decimal(e[g].escala)}×`); }
    poner('hdri-intensidad', `${decimal(e.hdri.intensidad, 2)}×`); poner('hdri-rotacion', `${Math.round(e.hdri.rotacion)}°`);
  }

  render() {
    const est = this.estudio, modelo = !!est?.tieneModelo, piedras = modelo && !!est.geoP;
    // otro modelo cargado: se generan sus uv y se vuelven a poner las texturas de una vez
    // (así el siguiente cuadro de la vista previa ya sale con ellas)
    if (est && (est.geo !== this.geoVista || est.geoP !== this.geoPVista) && (this.estado.piedra.preset || this.estado.metal.preset)) this.aplicar();
    else if (est) { this.geoVista = est.geo; this.geoPVista = est.geoP; }
    const pistas = {
      piedra: !modelo ? 'Carga un modelo 3D (o el anillo de ejemplo) para ponerle bitmaps a las piedras.' : !piedras ? 'Este modelo no tiene piedras reconocidas. Súbelas en otro STL junto al metal o activa «Reconocer las piedras automáticamente».' : '',
      metal: !modelo ? 'Carga un modelo 3D (o el anillo de ejemplo) para darle textura al metal.' : '',
    };
    for (const g of ['piedra', 'metal']) {
      const s = this.estado[g], bloque = this.cont.querySelector(`[data-bloque="${g}"]`);
      const p = bloque.querySelector(`[data-pista="${g}"]`); p.textContent = pistas[g]; p.hidden = !pistas[g];
      bloque.querySelector('fieldset').disabled = !!pistas[g];
      bloque.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === s.preset)));
      const propia = bloque.querySelector('[data-preset="propia"]'); propia.hidden = !s.propia; propia.title = s.nombrePropia || 'Tu imagen';
      bloque.querySelector(`[data-ajustes="${g}"]`).hidden = !s.preset;
      bloque.querySelector(`[data-campo="intensidad"]`).value = s.intensidad;
      bloque.querySelector(`[data-campo="escala"]`).value = Math.log(s.escala) / Math.log(5);
      bloque.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === s.modo)));
      bloque.querySelector(`[data-consejo="${g}"]`).textContent = g === 'piedra' ? (s.preset === 'propia' ? 'Usa una foto clara de inclusiones o una textura: lo blanco no cambia la piedra. ' : '') + (MODOS[s.modo]?.[1] || '') : (CONSEJOS_METAL[s.preset] || '');
    }
    const h = this.estado.hdri, hb = this.cont.querySelector('[data-bloque="hdri"]');
    hb.querySelector('[data-nombre-hdri]').textContent = h.textura ? h.nombre || 'Tu panorama' : 'Estudio Atelier';
    hb.querySelector('[data-ayuda-hdri]').textContent = h.textura ? 'El metal refleja tu panorama; la luz completa se ve en el render hiperrealista.' : 'Cajas de luz de joyería, calibradas para el oro y las piedras. Sube un .hdr, .exr o una foto 360° en JPG.';
    hb.querySelector('[data-accion="estudio"]').hidden = !h.textura;
    hb.querySelector('[data-ajustes="hdri"]').hidden = !h.textura;
    hb.querySelector('[data-campo="intensidad"]').value = h.intensidad;
    hb.querySelector('[data-campo="rotacion"]').value = h.rotacion;
    this.salidas();
    // miniaturas con el color actual de la piedra y del metal
    if (this.tintes && this.tintes !== this.claveTintes()) { this.tintes = this.claveTintes(); for (const k of this.listas) this.pintarFicha(...k.split(':')); }
    if ((h.textura || null) !== this.panoDe && this.tintes) this.pintarPanorama();
  }
}
