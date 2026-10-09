// Estudio 3D: carga el STL, arma los materiales de joyería, la luz de estudio y la cámara.
// Tiene dos motores: el rápido (rasterizado, para la vista previa) y el hiperrealista
// (trazado de rayos con three-gpu-pathtracer) que se usa para el video final.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WebGLPathTracer, PhysicalCamera } from 'three-gpu-pathtracer';
import { separarPiedras } from './piedras.js';

// ---------- Metales y piedras (mismos valores que el visor 3D de la página) ----------
export const METALES = ['Oro amarillo 18k', 'Oro amarillo 14k', 'Oro rosa 18k', 'Oro blanco 18k', 'Plata 925', 'Platino 950'];
export const PIEDRAS = ['Diamante', 'Diamante laboratorio', 'Moissanita', 'Circón', 'Esmeralda', 'Rubí', 'Zafiro', 'Amatista', 'Espinela', 'Topacio', 'Citrino', 'Aguamarina', 'Granate', 'Perla'];
export const ACABADOS = { 'Pulido espejo': 0.45, 'Pulido': 1, 'Satinado': 2.6, 'Arenado (mate)': 4 };

export function aleacion(n) {
  n = String(n || '').toLowerCase();
  if (/plata/.test(n)) return { color: 0xEDEFF1, rugosidad: 0.16, brillo: 1.25 };
  if (/blanco|platino|rodio/.test(n)) return { color: 0xE9ECEF, rugosidad: 0.1, brillo: 1.35 };   // oro blanco con baño de rodio
  if (/rosa/.test(n)) return { color: 0xF0B39A, rugosidad: 0.12, brillo: 1.25 };
  if (/14k|10k/.test(n)) return { color: 0xF2CF84, rugosidad: 0.13, brillo: 1.2 };             // un poco más pálido que el 18k
  return { color: 0xF5C66A, rugosidad: 0.12, brillo: 1.25 };                                      // oro amarillo 18k
}
// Propiedades ópticas de cada piedra: color, índice de refracción y "fuego"
export function gema(n) {
  n = String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const G = (color, ior, extra = {}) => ({ color, ior, ...extra });
  if (/perla/.test(n)) return G(0xF4EEE4, 1.53, { perla: true, profundo: 0x8A8070 });
  if (/esmeralda/.test(n)) return G(0x0D9A58, 1.57, { profundo: 0x03482A, brillo: 1.4 });
  if (/rubi/.test(n)) return G(0xD0123A, 1.77, { profundo: 0x5C0414, brillo: 1.5 });
  if (/zafiro/.test(n)) return G(0x2150D6, 1.77, { profundo: 0x0A1C66, brillo: 1.5 });
  if (/amatista/.test(n)) return G(0x9A4FD8, 1.54, { profundo: 0x3D1466, brillo: 1.4 });
  if (/espinela/.test(n)) return G(0xE8487E, 1.72, { profundo: 0x6A0F30, brillo: 1.5 });
  if (/topacio/.test(n)) return G(0x62BDEB, 1.62, { profundo: 0x1C5B80, brillo: 1.5 });
  if (/citrino/.test(n)) return G(0xF0A626, 1.55, { profundo: 0x7A4608, brillo: 1.4 });
  if (/aguamarina/.test(n)) return G(0x86D8E6, 1.58, { profundo: 0x2E7A88, brillo: 1.5 });
  if (/granate/.test(n)) return G(0x8C1022, 1.76, { profundo: 0x33040B, brillo: 1.4 });
  if (/circon|zirc|moissan/.test(n)) return G(0xF7FAFF, 2.15, { blanca: true, fuego: 0.75, brillo: 2.6 });
  return G(0xF7FAFF, 2.42, { blanca: true, fuego: 0.5, brillo: 3 });                                   // diamante (natural o de laboratorio)
}

// ---------- Luz de estudio de joyería en HDR ----------
// La misma disposición de cajas de luz del visor de la página, pero calculada como un mapa
// equirectangular de alto rango: sirve igual para el motor rápido y para el trazado de rayos.
// los valores de la cúpula y los paneles se toman tal cual (sin pasar de sRGB a lineal), igual que en el visor de la página
const lineal = hex => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
function paneles(oscuro) {
  const P = [];
  const panel = (w, h, intensidad, pos, color = 0xffffff) => P.push({ w, h, pos: new THREE.Vector3(...pos), color: lineal(color).multiplyScalar(intensidad) });
  panel(10, 3, 9, [0, 9, 3]);              // caja de luz superior
  panel(2.4, 11, 6, [-10, 1, 3]);          // tira izquierda
  panel(2.4, 11, 4.5, [10, 0, -3]);        // tira derecha
  panel(8, 1.6, 3, [0, -7, 7]);            // relleno inferior
  panel(4, 4, 2.5, [5, 4, -10], 0xffe7c4); // luz cálida trasera
  panel(1.2, 1.2, 14, [-4, 6, 8]);         // punto brillante para los destellos
  // muchas luces pequeñas alrededor: cada faceta refleja una distinta y la piedra "centellea"
  const n = oscuro ? 40 : 26;
  for (let i = 0; i < n; i++) {
    const t = i * 2.399963, y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y);
    panel(oscuro ? 0.7 : 0.9, oscuro ? 0.7 : 0.9, (oscuro ? 16 : 10) + (i % 3) * 6, [Math.cos(t) * rr * 13, y * 13, Math.sin(t) * rr * 13], i % 4 === 0 ? 0xfff0d8 : 0xffffff);
  }
  if (oscuro) for (let i = 0; i < 14; i++) {   // destellos puntuales para las piedras
    const t = i * 2.399963 + 1.1, y = 0.9 - (i + 0.5) / 14 * 1.6, rr = Math.sqrt(1 - y * y);
    panel(0.45, 0.45, 26 + (i % 2) * 10, [Math.cos(t) * rr * 12, y * 12, Math.sin(t) * rr * 12]);
  }
  for (const p of P) {   // ejes del panel, que mira hacia el centro
    p.n = p.pos.clone().normalize(); p.dist = p.pos.length();
    const ref = Math.abs(p.n.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    p.der = new THREE.Vector3().crossVectors(ref, p.n).normalize();
    p.arr = new THREE.Vector3().crossVectors(p.n, p.der).normalize();
  }
  return P;
}
export function hdrEstudio(oscuro = false, W = 1024, H = 512) {
  const datos = new Float32Array(W * H * 4), P = paneles(oscuro);
  // cúpula con degradado: claro arriba, oscuro abajo (da contraste a las facetas y volumen al metal)
  const arriba = lineal(oscuro ? 0x2a2622 : 0x9a948a), medio = lineal(oscuro ? 0x0b0a08 : 0x2c2822), abajo = lineal(oscuro ? 0x000000 : 0x050505);
  const d = new THREE.Vector3(), q = new THREE.Vector3(), c = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const th = ((j + 0.5) / H - 0.5) * Math.PI, y = Math.sin(th), ct = Math.cos(th);
    if (y > 0) c.copy(medio).lerp(arriba, Math.pow(y, 0.8)); else c.copy(medio).lerp(abajo, Math.min(1, -y * 1.6));
    for (let i = 0; i < W; i++) {
      const ph = ((i + 0.5) / W - 0.5) * 2 * Math.PI;
      d.set(ct * Math.cos(ph), y, ct * Math.sin(ph));
      let r = c.r, g = c.g, b = c.b, cerca = Infinity;
      for (const p of P) {
        const dn = d.dot(p.n); if (dn <= 0) continue;
        const t = p.dist / dn; if (t >= cerca) continue;
        q.copy(d).multiplyScalar(t).sub(p.pos);
        if (Math.abs(q.dot(p.der)) <= p.w / 2 && Math.abs(q.dot(p.arr)) <= p.h / 2) { cerca = t; r = p.color.r; g = p.color.g; b = p.color.b; }
      }
      const k = 4 * (j * W + i); datos[k] = r; datos[k + 1] = g; datos[k + 2] = b; datos[k + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(datos, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Movimientos de cámara ----------
const suave = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const mezcla = (a, b, t) => a + (b - a) * t;
export const MOVIMIENTOS = {
  giro: { nombre: 'Giro 360°', ciclico: true, fn: t => ({ az: t * Math.PI * 2, el: 0, dist: 1 }) },
  acercamiento: { nombre: 'Giro con acercamiento', fn: t => { const s = suave(t); return { az: s * Math.PI * 2, el: mezcla(10, -2, s), dist: mezcla(1.22, 0.86, s) }; } },
  revelacion: { nombre: 'Revelación (del detalle a la pieza)', fn: t => { const s = suave(t); return { az: mezcla(-Math.PI * 0.6, Math.PI * 0.4, s), el: mezcla(14, 0, s), dist: mezcla(0.5, 1.02, s), foco: 1 - s }; } },
  pendulo: { nombre: 'Vaivén frontal', ciclico: true, fn: t => ({ az: Math.sin(t * Math.PI * 2) * THREE.MathUtils.degToRad(38), el: Math.sin(t * Math.PI * 4) * 3, dist: 1 - Math.sin(t * Math.PI) * 0.06 }) },
  orbita: { nombre: 'Órbita alta y baja', ciclico: true, fn: t => ({ az: t * Math.PI * 2, el: Math.sin(t * Math.PI * 2) * 16, dist: 1 + Math.cos(t * Math.PI * 2) * 0.05 }) },
};

const leerSTL = async archivo => {
  const g = new STLLoader().parse(await archivo.arrayBuffer());
  return g.index ? g.toNonIndexed() : g;
};

export class Estudio {
  constructor(lienzo) {
    this.lienzo = lienzo;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NeutralToneMapping;   // tono neutro de Khronos: pensado para fotografía de producto, respeta el color del oro
    r.toneMappingExposure = 1.15;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.envMetal = hdrEstudio(false);
    this.envPiedras = hdrEstudio(true, 1024, 512);
    const pm = new THREE.PMREMGenerator(r);
    this.pmMetal = pm.fromEquirectangular(this.envMetal).texture;
    this.pmPiedras = pm.fromEquirectangular(this.envPiedras).texture;
    pm.dispose();

    // escena del motor rápido
    this.escena = new THREE.Scene();
    this.escena.environment = this.pmMetal;
    this.pivote = new THREE.Group(); this.escena.add(this.pivote);
    this.luces = new THREE.Group(); this.escena.add(this.luces);    // las luces giran con la cámara, como el mapa de entorno
    this.luces.add(new THREE.HemisphereLight(0xfff6e8, 0x2a2118, 0.25));
    const l1 = new THREE.DirectionalLight(0xfff1d6, 0.9); l1.position.set(3, 5, 4); this.luces.add(l1);
    const l2 = new THREE.DirectionalLight(0xdfe8ff, 0.5); l2.position.set(-4, 2, -3); this.luces.add(l2);

    // escena del trazado de rayos (mismas geometrías, materiales físicos de verdad)
    this.escenaPT = new THREE.Scene();
    this.escenaPT.environment = this.envMetal;
    this.escenaPT.background = null;   // fondo transparente: el fondo de marca se compone después
    this.pivotePT = new THREE.Group(); this.escenaPT.add(this.pivotePT);

    this.camara = new PhysicalCamera(30, 9 / 16, 0.1, 1000);
    this.camara.apertureBlades = 7;
    this.pt = null; this.ptSucio = true;

    this.mat = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, metalness: 1, roughness: 0.12, clearcoat: 0.35, clearcoatRoughness: 0.08 });
    this.matPT = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, metalness: 1, roughness: 0.08 });
    this.matP = new THREE.MeshPhysicalMaterial({ side: THREE.BackSide, metalness: 1, roughness: 0.02, flatShading: true, envMap: this.pmPiedras, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 480] });
    this.matP2 = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, transparent: true, metalness: 1, roughness: 0, flatShading: true, envMap: this.pmPiedras, depthWrite: false, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 480] });
    this.matPPT = new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0, transmission: 1, thickness: 1, ior: 2.42, flatShading: true });
    this.matMascara = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.ajustes = { metal: METALES[0], acabado: 'Pulido', piedra: 'Diamante', elevacion: 18, zoom: 1, altura: 0, giroInicial: 0, movimiento: 'giro', exposicion: 1.15, enfoque: 0 };
    this.radio = 1; this.base = 0; this.huella = 1;
  }

  get tieneModelo() { return !!this.mallaMetal; }

  async cargar(archivos, { separar = true } = {}) {
    const lista = [...archivos].filter(Boolean);
    if (!lista.length) throw new Error('Escoge un archivo STL.');
    // el archivo más grande es el metal; si hay otro, son las piedras
    lista.sort((a, b) => b.size - a.size);
    let geo = await leerSTL(lista[0]), geoP = null;
    for (const extra of lista.slice(1)) {
      const g = await leerSTL(extra);
      geoP = geoP ? unir(geoP, g) : g;
    }
    if (!geoP && separar) { let sp = null; try { sp = separarPiedras(geo); } catch (e) { sp = null; } if (sp) { geo.dispose(); geo = sp.metal; geoP = sp.piedras; } }
    if (!geo.attributes.position.count) throw new Error('El archivo no tiene triángulos.');
    return this.montar(geo, geoP, { zArriba: true });
  }

  // geo: metal; geoP: piedras (opcional). zArriba: el modelo viene con Z hacia arriba (lo normal en STL de joyería)
  montar(geo, geoP, { zArriba = false } = {}) {

    // centrar metal y piedras con el mismo desplazamiento
    geo.computeBoundingBox(); const caja = geo.boundingBox.clone();
    if (geoP) { geoP.computeBoundingBox(); caja.union(geoP.boundingBox); }
    const centro = caja.getCenter(new THREE.Vector3());
    geo.translate(-centro.x, -centro.y, -centro.z);
    // metal liso: normales suaves en las curvas y aristas nítidas (sin el efecto de "facetas" del STL)
    try { const g2 = toCreasedNormals(geo, Math.PI / 5); geo.dispose(); geo = g2; } catch (e) { geo.computeVertexNormals(); }
    if (geoP) { geoP.translate(-centro.x, -centro.y, -centro.z); geoP.computeVertexNormals(); }

    this.limpiar();
    this.geo = geo; this.geoP = geoP;
    this.mallaMetal = new THREE.Mesh(geo, this.mat);
    this.pivote.add(this.mallaMetal);
    this.pivotePT.add(new THREE.Mesh(geo, this.matPT));
    if (geoP) {
      const interior = new THREE.Mesh(geoP, this.matP), exterior = new THREE.Mesh(geoP, this.matP2); exterior.renderOrder = 2;
      this.pivote.add(interior, exterior);
      this.pivotePT.add(new THREE.Mesh(geoP, this.matPPT));
    }
    this.orientacionInicial = zArriba ? -Math.PI / 2 : 0;   // los programas de joyería guardan el STL con Z hacia arriba
    this.orientar(this.orientacionInicial, 0, 0);
    this.pintar();
    return { triangulos: (geo.attributes.position.count + (geoP ? geoP.attributes.position.count : 0)) / 3, piedras: !!geoP, medidas: caja.getSize(new THREE.Vector3()) };
  }

  limpiar() {
    for (const p of [this.pivote, this.pivotePT]) while (p.children.length) p.remove(p.children[0]);
    this.geo?.dispose(); this.geoP?.dispose();
    this.geo = this.geoP = this.mallaMetal = null;
    this.ptSucio = true;
  }

  orientar(x, y, z) {
    this.rot = new THREE.Euler(x, y, z);
    for (const p of [this.pivote, this.pivotePT]) { p.rotation.copy(this.rot); p.position.set(0, 0, 0); p.updateMatrixWorld(true); }
    this.medir();
    this.ptSucio = true;
  }
  girar(eje, angulo) {
    const q = new THREE.Quaternion().setFromEuler(this.rot);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(eje === 'x' ? 1 : 0, eje === 'y' ? 1 : 0, eje === 'z' ? 1 : 0), angulo));
    const e = new THREE.Euler().setFromQuaternion(q);
    this.orientar(e.x, e.y, e.z);
  }
  medir() {
    if (!this.mallaMetal) return;
    const caja = new THREE.Box3().setFromObject(this.pivote);
    const c = caja.getCenter(new THREE.Vector3());
    for (const p of [this.pivote, this.pivotePT]) { p.position.sub(c); p.updateMatrixWorld(true); }
    caja.translate(c.negate());
    this.caja = caja;
    this.radio = caja.getBoundingSphere(new THREE.Sphere()).radius || 1;
    this.base = caja.min.y;
    const s = caja.getSize(new THREE.Vector3());
    this.huella = Math.max(s.x, s.z) / 2;
  }

  pintar() {
    const a = this.ajustes, al = aleacion(a.metal), k = ACABADOS[a.acabado] ?? 1;
    const color = new THREE.Color(al.color);
    this.mat.color.copy(color); this.mat.roughness = Math.min(0.6, al.rugosidad * k); this.mat.envMapIntensity = al.brillo;
    this.mat.clearcoat = k > 1.5 ? 0 : 0.35;
    this.matPT.color.copy(color); this.matPT.roughness = Math.min(0.55, al.rugosidad * 0.6 * k);
    // piedras del motor rápido: dos capas (interior y exterior), como en el visor de la página
    const g = gema(a.piedra), mP = this.matP, mP2 = this.matP2;
    if (g.perla) {
      mP.color.setHex(0x8A8070); mP.emissive.setHex(0x000000); mP.metalness = 0.2; mP.envMapIntensity = 1.2; mP.iridescence = 0.6; mP.flatShading = false;
      mP2.color.setHex(g.color); mP2.emissive.setHex(0x1a1814); mP2.opacity = 0.97; mP2.metalness = 0; mP2.roughness = 0.22; mP2.envMapIntensity = 1.4; mP2.iridescence = 0.5; mP2.flatShading = false;
    } else if (g.blanca) {
      // diamante y circón: facetas oscuras y claras que alternan, con un toque de "fuego" de colores
      mP.flatShading = mP2.flatShading = true; mP.metalness = mP2.metalness = 1;
      mP.color.setHex(0xDDE4EA); mP.emissive.setHex(0x0C0F12); mP.envMapIntensity = 4.4; mP.iridescence = g.fuego * 0.7;
      mP2.color.setHex(0xF4F7FA); mP2.emissive.setHex(0x0A0C0E); mP2.opacity = 0.8; mP2.envMapIntensity = 4.6; mP2.roughness = 0; mP2.iridescence = g.fuego * 0.45;
    } else {
      // piedras de color: cuerpo profundo y saturado, con reflejos teñidos y destellos blancos
      mP.flatShading = mP2.flatShading = true; mP.metalness = mP2.metalness = 1;
      mP.color.setHex(g.color); mP.emissive.setHex(g.profundo).multiplyScalar(0.7); mP.envMapIntensity = 3.4; mP.iridescence = 0;
      mP2.color.setHex(g.color); mP2.emissive.setHex(g.profundo).multiplyScalar(0.4); mP2.opacity = 0.84; mP2.envMapIntensity = 3.6; mP2.roughness = 0; mP2.iridescence = 0;
    }
    mP.needsUpdate = mP2.needsUpdate = true;
    // piedras del trazado de rayos: vidrio con el índice de refracción real de cada gema
    const t = this.matPPT;
    if (g.perla) {
      Object.assign(t, { transmission: 0, metalness: 0, roughness: 0.18, ior: g.ior, iridescence: 0.55, iridescenceIOR: 1.6, flatShading: false, sheen: 0.4 });
      t.color.setHex(g.color); t.sheenColor.setHex(0xFFF6EA);
    } else {
      Object.assign(t, { transmission: 1, metalness: 0, roughness: 0, ior: g.ior, iridescence: 0, flatShading: true, sheen: 0, thickness: 1 });
      if (g.blanca) { t.color.setHex(0xFFFFFF); t.attenuationColor.setHex(0xFFFFFF); t.attenuationDistance = Infinity; }
      else { t.color.setHex(g.color).lerp(new THREE.Color(0xffffff), 0.35); t.attenuationColor.setHex(g.color); t.attenuationDistance = Math.max(this.radio * 0.08, 0.4); }
    }
    t.needsUpdate = true; this.matPT.needsUpdate = true;
    this.renderer.toneMappingExposure = a.exposicion;
    if (this.pt) this.pt.updateMaterials();
  }

  tamano(w, h) {
    this.ancho = w; this.alto = h;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h; this.camara.updateProjectionMatrix();
  }

  // Coloca la cámara para el instante t (0 a 1) del movimiento escogido.
  // La luz gira con la cámara: el resultado es idéntico a una tornamesa con la pieza girando bajo luces fijas.
  // zona: franja de la imagen libre de textos ({ arriba, abajo }, de 0 a 1); la joya se encuadra ahí
  pose(t, zona = { arriba: 0.03, abajo: 0.97 }) {
    const a = this.ajustes, cam = this.camara, m = (MOVIMIENTOS[a.movimiento] || MOVIMIENTOS.giro).fn(THREE.MathUtils.clamp(t, 0, 1));
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), alto = Math.max(0.25, zona.abajo - zona.arriba);
    const tz = Math.min(tv * alto, tv * cam.aspect * 0.92);           // medio ángulo disponible para la pieza
    const ajuste = this.radio * Math.sqrt(1 + tz * tz) / tz;          // la esfera que envuelve la joya cabe justo en la franja
    const dist = ajuste / a.zoom * m.dist;
    const az = m.az + THREE.MathUtils.degToRad(a.giroInicial), el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(a.elevacion + m.el, -60, 85));
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam.near = Math.max(dist - this.radio * 3, dist * 0.02); cam.far = dist + this.radio * 6;
    // punto de interés: el centro de la pieza, o más arriba (la piedra) en los acercamientos
    const foco = new THREE.Vector3(0, (m.foco || 0) * (this.caja ? this.caja.max.y * 0.7 : 0), 0);
    cam.up.set(0, 1, 0); cam.lookAt(foco); cam.updateMatrixWorld(true);
    // corre la mira para que la pieza quede centrada en la franja libre (más el ajuste manual de posición vertical)
    const cy = 1 - (zona.arriba + zona.abajo) + a.altura;
    const arribaCam = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.lookAt(foco.clone().addScaledVector(arribaCam, -cy * tv * dist)); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    cam.focusDistance = cam.position.length();
    // enfoque 0 = todo nítido; 1 = macro con poca profundidad de campo
    cam.fStop = a.enfoque > 0 ? THREE.MathUtils.lerp(22, 1.8, a.enfoque) : 1e6;
    for (const e of [this.escena, this.escenaPT]) e.environmentRotation.set(0, az, 0);
    this.luces.rotation.set(0, az, 0);
    this.matP.envMapRotation.set(0, az, 0); this.matP2.envMapRotation.set(0, az, 0);
  }

  renderRapido() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.escena, this.camara);
  }

  // Silueta de la pieza (para no oscurecerla con la sombra en el render final)
  renderMascara() {
    const e = this.escena, prev = e.overrideMaterial, env = e.environment, tm = this.renderer.toneMapping;
    e.overrideMaterial = this.matMascara; e.environment = null; this.renderer.toneMapping = THREE.NoToneMapping;
    this.luces.visible = false;
    this.renderer.render(e, this.camara);
    e.overrideMaterial = prev; e.environment = env; this.renderer.toneMapping = tm; this.luces.visible = true;
  }

  prepararPT() {
    if (!this.pt) {
      const pt = this.pt = new WebGLPathTracer(this.renderer);
      pt.tiles.set(2, 2);
      pt.bounces = 14;
      pt.transmissiveBounces = 12;
      pt.filterGlossyFactor = 0.35;   // quita los "puntos de fuego" sueltos sin perder los destellos
      pt.minSamples = 1; pt.renderDelay = 0; pt.fadeDuration = 0;
      pt.rasterizeScene = false; pt.dynamicLowRes = false;
      pt.multipleImportanceSampling = true;
    }
    if (this.ptSucio) { this.pt.setScene(this.escenaPT, this.camara); this.ptSucio = false; }
  }

  // Renderiza el cuadro actual con trazado de rayos hasta llegar a las muestras pedidas
  async renderRealista(muestras, { alAvanzar, cancelado } = {}) {
    this.prepararPT();
    const pt = this.pt;
    pt.updateCamera(); pt.updateEnvironment(); pt.updateMaterials(); pt.reset();
    let t0 = performance.now(), vueltas = 0;
    while (pt.samples < muestras || pt.isCompiling) {
      pt.renderSample();
      if (++vueltas > 200000) break;
      if (performance.now() - t0 > 40) {
        alAvanzar?.(Math.min(1, pt.samples / muestras));
        await new Promise(r => requestAnimationFrame(() => r()));
        if (cancelado?.()) throw new DOMException('Cancelado', 'AbortError');
        t0 = performance.now();
      }
    }
    alAvanzar?.(1);
  }

  // Dónde cae la sombra de contacto en la imagen (en píxeles)
  sombra() {
    const cam = this.camara, W = this.ancho, H = this.alto;
    const p = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
    const y = this.base - this.radio * 0.08, h = this.huella * 0.92;
    const c = p(0, y, 0);
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const der = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const a = p(der.x * h, y, der.z * h), b = p(fwd.x * h, y, fwd.z * h);
    return { x: c.x, y: c.y, rx: Math.hypot(a.x - c.x, a.y - c.y), ry: Math.max(Math.hypot(b.x - c.x, b.y - c.y), 4) };
  }
}

function unir(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array, arr = new Float32Array(pa.length + pb.length);
  arr.set(pa); arr.set(pb, pa.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  a.dispose(); b.dispose();
  return g;
}
