// Estudio 3D: carga el STL, arma los materiales de joyería, la luz de estudio y la cámara.
// Tiene dos motores: el rápido (rasterizado, para la vista previa) y el hiperrealista
// (trazado de rayos con three-gpu-pathtracer) que se usa para el video final.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WebGLPathTracer, PhysicalCamera } from 'three-gpu-pathtracer';
import { separarPiedras } from './piedras.js';
import { METALES, PIEDRAS, ACABADOS } from './catalogo.js';
import { Escenario3D, LimpiadorPT } from './escenario3d.js';
import { normalizarEscena, escenaOscura } from './escenas.js';
export { METALES, PIEDRAS, ACABADOS };

// ---------- Metales y piedras (mismos valores que el visor 3D de la página; las listas viven en catalogo.js) ----------
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
function paneles(oscuro, sala = false) {
  const P = [];
  const panel = (w, h, intensidad, pos, color = 0xffffff) => P.push({ w, h, pos: new THREE.Vector3(...pos), color: lineal(color).multiplyScalar(intensidad) });
  if (sala) {
    // sala de las escenas 3D: la luz principal (con su ventana) la pone la escena; aquí solo un relleno parejo de la sala y
    // los mismos puntitos de luz del estudio, más suaves, para que el metal y las piedras sigan centelleando.
    // Nada bajo el horizonte: ahí está el piso (en el motor rápido, una luz ahí se vería reflejada en el frente del pedestal)
    panel(10, 3, 1.6, [0, 9, 3]);
    panel(2.4, 8, 2.2, [-10, 4.5, 3]); panel(2.4, 8, 1.8, [10, 4.5, -3]);
    panel(1.2, 1.2, 9, [-4, 6, 8]);
    for (let i = 0; i < 26; i++) {
      const t = i * 2.399963, y = 1 - (i + 0.5) / 26 * 2, rr = Math.sqrt(1 - y * y);
      if (y > 0.12) panel(0.9, 0.9, 6 + (i % 3) * 4, [Math.cos(t) * rr * 13, y * 13, Math.sin(t) * rr * 13], i % 4 === 0 ? 0xfff0d8 : 0xffffff);
    }
  } else {
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
  if (oscuro) for (let i = 0; i < 36; i++) {
    const t = i * 2.399963 + 0.4, y = -0.05 - (i + 0.5) / 36 * 0.9, rr = Math.sqrt(1 - y * y);
    panel(2, 2, 8 + (i % 3) * 6, [Math.cos(t) * rr * 12, y * 12, Math.sin(t) * rr * 12], i % 4 === 1 ? 0xfff0d8 : 0xffffff);
  }
  }
  for (const p of P) {   // ejes del panel, que mira hacia el centro
    p.n = p.pos.clone().normalize(); p.dist = p.pos.length();
    const ref = Math.abs(p.n.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    p.der = new THREE.Vector3().crossVectors(ref, p.n).normalize();
    p.arr = new THREE.Vector3().crossVectors(p.n, p.der).normalize();
  }
  return P;
}
export function hdrEstudio(oscuro = false, W = 1024, H = 512, sala = false) {
  const datos = new Float32Array(W * H * 4), P = paneles(oscuro, sala);
  // cúpula con degradado: claro arriba, oscuro abajo (da contraste a las facetas y volumen al metal).
  // En la sala de las escenas es más pareja y cálida: es la luz que rebota en las paredes de un estudio de fotografía
  // (abajo, en la sala, es el piso iluminado: con el trazador no se ve nunca porque lo tapa el piso de verdad)
  const arriba = sala ? lineal(0x7a7266) : lineal(oscuro ? 0x2a2622 : 0x9a948a), medio = sala ? lineal(0x5a5248) : lineal(oscuro ? 0x0b0a08 : 0x2c2822), abajo = sala ? lineal(0x4a443c) : lineal(oscuro ? 0x000000 : 0x050505);
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
    // sombras del motor rápido: solo las da la luz de la escena 3D (sin escena no hay luces con sombra y no cuesta nada)
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;

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
    // tornamesa del trazador: con una escena 3D, en vez de girar el escenario con la cámara gira la joya (la imagen es la
    // misma). Así el fondo y el pedestal, que son grandes, quedan quietos y el BVH del trazador no se deforma cuadro a cuadro
    this.tornamesaPT = new THREE.Group(); this.escenaPT.add(this.tornamesaPT);
    this.pivotePT = new THREE.Group(); this.tornamesaPT.add(this.pivotePT);

    this.camara = new PhysicalCamera(30, 9 / 16, 0.1, 1000);
    this.camara.apertureBlades = 7;
    this.camaraPT = new PhysicalCamera(30, 9 / 16, 0.1, 1000);   // la del trazador: la misma, girada con la tornamesa
    this.pt = null; this.ptSucio = true;

    this.mat = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, metalness: 1, roughness: 0.12, clearcoat: 0.35, clearcoatRoughness: 0.08 });
    this.matPT = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, metalness: 1, roughness: 0.08 });
    this.matP = new THREE.MeshPhysicalMaterial({ side: THREE.BackSide, metalness: 1, roughness: 0.02, flatShading: true, envMap: this.pmPiedras, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 480] });
    this.matP2 = new THREE.MeshPhysicalMaterial({ side: THREE.FrontSide, transparent: true, metalness: 1, roughness: 0, flatShading: true, envMap: this.pmPiedras, depthWrite: false, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 480] });
    this.matPPT = new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0, transmission: 1, thickness: 1, ior: 2.42, flatShading: true });
    this.matMascara = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // el movimiento, el zoom, la exposición y el desenfoque ya no viven aquí: los da el proyecto (keyframes) en cada cuadro
    this.ajustes = { metal: METALES[0], acabado: 'Pulido', piedra: 'Diamante' };
    this.radio = 1; this.base = 0; this.huella = 1;
    this.rotacionHDRI = 0;   // la pone texturas.js cuando hay un HDRI girado (radianes)

    // escena 3D (superficie, fondo y luz con gobo): sin escena ('ninguna') todo queda como siempre
    this.escenario = new Escenario3D();
    this.escena3D = { id: 'ninguna' };
    this.versionModelo = 0;
    this.costosPT = [];   // ms de cada actualización del BVH por el giro del escenario (para medir)
    this.limpiezaPT = true;   // con escena, el grano del yeso se limpia al final de cada cuadro realista (ver LimpiadorPT)
  }

  // ---------- Escena 3D ----------
  // (hasta que haya una joya el escenario no existe —sus medidas salen de la pieza— y se compone como sin escena)
  get escenaActiva() { return this.escena3D.id !== 'ninguna' && !!this.escenario.limites; }
  // con escena: ¿los textos van claros? (sin escena manda el fondo de marca: null)
  get oscuro() { return this.escenaActiva ? escenaOscura(this.escena3D) : null; }

  // cfg: id de una escena lista o su configuración (se valida con normalizarEscena). Devuelve la escena que quedó
  ponerEscena(cfg) {
    const n = normalizarEscena(cfg), antes = this.escenaActiva;
    this.escena3D = n;
    const grupos = [[this.escena, this.escenario.grupo], [this.escena, this.escenario.contacto], [this.escenaPT, this.escenario.grupoPT]];
    if (n.id === 'ninguna') {
      for (const [e, g] of grupos) e.remove(g);
      this.escenario.vaciar();
      this.escena.background = null; this.escenaPT.background = null; this.luces.visible = true;
      if (antes) { this.restaurarEntornoPT(); this.ptSucio = true; }
      return n;
    }
    for (const [e, g] of grupos) if (g.parent !== e) e.add(g);
    this.armarEscenario();
    return n;
  }
  // arma o ajusta el escenario a la joya de ahora (tamaño, base y orientación)
  armarEscenario() {
    if (this.escena3D.id === 'ninguna' || !this.tieneModelo) return;
    const cambio = this.escenario.armar(this.escena3D, { radio: this.radio, base: this.base, huella: this.huella, joya: this.pivote, version: this.versionModelo, renderer: this.renderer });
    if (cambio) { this.ptSucio = true; this.escena.background = new THREE.Color(this.escena3D.fondo.color); }
  }
  // sin escena el trazador vuelve a la intensidad del estudio que tenía (la que puso texturas.js)
  restaurarEntornoPT() {
    const e = this.escenaPT;
    if (e.environment === this.envSala) e.environment = this.envMetal;
    if (this.envPT && e.environmentIntensity === this.envPT.escrito) e.environmentIntensity = this.envPT.base;
    this.envPT = null;
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
    this.versionModelo++;
    this.geo = geo; this.geoP = geoP;
    // tamaño de las piedras: con él se calcula cuánto color absorbe la luz al atravesarlas en el render realista
    this.tamPiedras = geoP ? Math.max(...geoP.boundingBox.getSize(new THREE.Vector3()).toArray()) : 0;
    this.mallaMetal = new THREE.Mesh(geo, this.mat);
    this.mallaMetal.castShadow = true;   // (solo se nota con la luz de una escena 3D)
    this.pivote.add(this.mallaMetal);
    this.pivotePT.add(new THREE.Mesh(geo, this.matPT));
    if (geoP) {
      const interior = new THREE.Mesh(geoP, this.matP), exterior = new THREE.Mesh(geoP, this.matP2); exterior.renderOrder = 2;
      interior.castShadow = true;
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
    // el pedestal se arma con la base y el tamaño de la pieza: cambia con el modelo y con su orientación
    this.versionModelo++;
    this.armarEscenario();
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
      // la luz recorre varias veces la piedra entre reflejos internos: con una distancia de absorción del orden de su
      // tamaño el cuerpo queda saturado; mucho más corta, la gema se ve negra. (En pavé la caja junta muchas piedras: se limita)
      else { t.color.setHex(g.color).lerp(new THREE.Color(0xffffff), 0.35); t.attenuationColor.setHex(g.color); t.attenuationDistance = THREE.MathUtils.clamp(this.tamPiedras || this.radio * 0.4, this.radio * 0.15, this.radio * 0.5) * 0.7; }
    }
    // la mesa de una gema de color refleja sobre todo el gris de la cúpula del estudio y el cuerpo se ve apagado: un brillo
    // propio muy suave (como la luz difusa que usan los fotógrafos de joyas) le devuelve el color sin quitarle los reflejos
    if (g.perla || g.blanca) t.emissive.setHex(0x000000); else { t.emissive.setHex(g.color); t.emissiveIntensity = 0.2; }
    t.needsUpdate = true; this.matPT.needsUpdate = true;
    if (this.pt) this.pt.updateMaterials();
  }

  tamano(w, h) {
    this.ancho = w; this.alto = h;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h; this.camara.updateProjectionMatrix();
  }

  // Coloca la cámara con los valores del proyecto en un instante (p = evaluar(proyecto, t)).
  // La luz gira con la cámara: el resultado es idéntico a una tornamesa con la pieza girando bajo luces fijas.
  // zona: franja de la imagen libre de textos ({ arriba, abajo }, de 0 a 1); la joya se encuadra ahí
  aplicarPose(p, zona = { arriba: 0.03, abajo: 0.97 }) {
    const cam = this.camara, M = THREE.MathUtils;
    const tv = Math.tan(M.degToRad(cam.fov) / 2), alto = Math.max(0.25, zona.abajo - zona.arriba);
    const tz = Math.min(tv * alto, tv * cam.aspect * 0.92);           // medio ángulo disponible para la pieza
    const ajuste = this.radio * Math.sqrt(1 + tz * tz) / tz;          // la esfera que envuelve la joya cabe justo en la franja
    const dist = ajuste / Math.max(0.05, p.zoom);
    const az = M.degToRad(p.giro), escenario = this.escenaActiva && this.escenario.limites;
    this.giroCamara = az;
    let el = M.degToRad(M.clamp(p.inclinacion, -60, 85));
    if (escenario) {
      // con escena la cámara no baja de la superficie donde está la joya (no se mete en el pedestal ni bajo el piso):
      // un mínimo suave, así un movimiento que baja mucho se aplana sin quiebre. Queda unos 3° por encima: a ras de la
      // superficie el grano de la arena o del yeso se estira y se ve como manchas
      const k = this.radio * 0.12, min = this.escenario.alturaMinima() + this.radio * 0.04 + dist * 0.05, y = Math.sin(el) * dist;
      const x = (y - min) / k, ys = min + k * (x > 30 ? x : Math.log1p(Math.exp(x)));
      el = Math.asin(M.clamp(ys / dist, -1, 0.999));
    }
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    if (escenario) {
      // el fondo está lejos y el piso llega hasta la cámara: plano cercano chico y lejano hasta el borde del escenario
      cam.near = Math.max(dist * 0.012, this.radio * 0.01); cam.far = dist + escenario.alcance;
    } else { cam.near = Math.max(dist - this.radio * 3, dist * 0.02); cam.far = dist + this.radio * 6; }
    // punto de interés: el centro de la pieza, o más arriba (la piedra) en los acercamientos
    const foco = new THREE.Vector3(0, M.clamp(p.foco, 0, 1) * (this.caja ? this.caja.max.y * 0.7 : 0), 0);
    // cámara ladeada (roll): se gira el "arriba" alrededor de la dirección en que mira
    const mira = foco.clone().sub(cam.position).normalize();
    cam.up.set(0, 1, 0).applyAxisAngle(mira, M.degToRad(p.rodar || 0));
    const arribaLadeado = cam.up.clone();
    cam.lookAt(foco); cam.updateMatrixWorld(true);
    // corre la mira para que la pieza quede centrada en la franja libre, más la posición vertical y lateral de los keyframes
    const cy = 1 - (zona.arriba + zona.abajo) + p.altura, cx = p.lateral;
    const arribaCam = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), derCam = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    // el "arriba" es el de la cámara ya orientada: en vista cenital la mira corrida puede pasar por la vertical y, con el
    // arriba del mundo, la imagen se daría vuelta de golpe (con este arriba el encuadre normal queda igual)
    cam.up.copy(arribaCam);
    cam.lookAt(foco.clone().addScaledVector(arribaCam, -cy * tv * dist).addScaledVector(derCam, -cx * tv * cam.aspect * dist));
    cam.up.copy(arribaLadeado);   // la orientación ya quedó calculada: camera.up vuelve a ser el «arriba» ladeado por el roll
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // el trazador lanza los rayos desde el plano cercano y mide el foco desde ahí: se descuenta para que lo nítido sea la joya
    cam.focusDistance = Math.max(this.radio * 0.05, cam.position.distanceTo(foco) - cam.near);
    // desenfoque 0 = todo nítido; 1 = macro con poca profundidad de campo (solo se ve con trazado de rayos).
    // El trazador mide la apertura en metros (bokehSize · 0,5·10⁻³) y la pieza está en mm: la apertura se calcula con el tamaño
    // de la pieza (hasta 0,3 de su radio), así se nota igual en un arete que en un anillo. Nunca es 0 exacto: pasar de 0 a otro
    // valor obligaría a recompilar el shader a mitad del video.
    cam.bokehSize = Math.max(1e-3, M.clamp(p.desenfoque || 0, 0, 1) * this.radio * 0.3 * 1000);
    this.renderer.toneMappingExposure = p.exposicion;
    // el HDRI que suba la usuaria puede venir girado: se suma al giro de la tornamesa
    const giroLuz = this.giroLuz = az + (this.rotacionHDRI || 0);
    for (const e of [this.escena, this.escenaPT]) e.environmentRotation.set(0, giroLuz, 0);
    this.luces.rotation.set(0, az, 0);
    // con escena manda su luz (con sombras): las luces de apoyo del estudio iluminarían el fondo desde otro lado
    this.luces.visible = !escenario;
    if (escenario) this.poseEscena(az);
    // el mapa de las piedras también "sube" con una cámara baja (contrapicado, «Héroe»): sus facetas siguen viendo la cúpula
    // iluminada como a la altura normal (18°) y el pabellón no se ve negro en la vista rápida. Desde 18° hacia arriba no cambia.
    const alza = Math.max(0, M.degToRad(18) - el);
    this.matP.envMapRotation.set(-alza, az, 0); this.matP2.envMapRotation.set(-alza, az, 0);
  }

  // Luz de la sala para las escenas (se calcula la primera vez que se pone una)
  sala() {
    if (!this.envSala) {
      this.envSala = hdrEstudio(false, 1024, 512, true);
      const pm = new THREE.PMREMGenerator(this.renderer); this.pmSala = pm.fromEquirectangular(this.envSala).texture; pm.dispose();
    }
    return this.envSala;
  }
  // El escenario gira con la cámara (tornamesa) y toma la luz del estudio que esté puesta (también un HDRI)
  poseEscena(az) {
    const E = this.escenario, e = this.escena, ept = this.escenaPT;
    E.girar(az);
    this.sala();
    // con la luz de estudio de siempre, la escena usa la sala (más pareja: deja ver la ventana); un HDRI propio se respeta
    const propio = e.environment && e.environment !== this.pmMetal;
    if (ept.environment === this.envMetal) ept.environment = this.envSala;
    // relleno (ambiente): en el motor rápido solo toca los materiales de la escena (la joya sigue con su estudio)
    for (const m of [E.mats.sup, E.mats.fondo]) if (m) { m.envMap = propio ? e.environment : this.pmSala; m.envMapIntensity = this.escena3D.ambiente * (e.environmentIntensity ?? 1); m.envMapRotation.copy(e.environmentRotation); }
    // en el trazador el relleno es la intensidad del estudio (la de texturas.js por el relleno de la escena)
    const k = this.escena3D.ambiente;
    if (!this.envPT || ept.environmentIntensity !== this.envPT.escrito) this.envPT = { base: ept.environmentIntensity ?? 1 };
    this.envPT.escrito = ept.environmentIntensity = this.envPT.base * k;
    // los rayos que escapan (por encima del fondo o a través de una piedra) ven el estudio, no un hueco transparente
    ept.background = ept.environment; ept.backgroundRotation.copy(ept.environmentRotation); ept.backgroundIntensity = 1;
  }

  renderRapido() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.escena, this.camara);
  }

  // Silueta de la pieza (para no oscurecerla con la sombra en el render final)
  renderMascara() {
    const e = this.escena, prev = e.overrideMaterial, env = e.environment, tm = this.renderer.toneMapping;
    const fondo = e.background, esc = this.escenario;
    e.overrideMaterial = this.matMascara; e.environment = null; e.background = null; this.renderer.toneMapping = THREE.NoToneMapping;
    this.luces.visible = false; esc.grupo.visible = esc.contacto.visible = false;
    this.renderer.render(e, this.camara);
    e.overrideMaterial = prev; e.environment = env; e.background = fondo; this.renderer.toneMapping = tm; this.luces.visible = !this.escenaActiva; esc.grupo.visible = esc.contacto.visible = true;
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
    // con escena, la tornamesa: todo se gira −giro alrededor del eje vertical (la cámara, la luz del estudio y la joya);
    // el escenario y su luz quedan quietos. Sin escena la cámara del trazador es la misma de siempre
    const giro = this.escenaActiva && this.escenario.limites ? this.giroCamara || 0 : 0, c = this.camaraPT, k = this.camara;
    // con escena, la luz del foco que rebota en el fondo y vuelve a dar en el oro deja puntitos naranja sueltos en el
    // fondo: ahí se suavizan más los rebotes brillantes (es un uniforme: no recompila el sombreador)
    this.pt.filterGlossyFactor = this.escenaActiva ? 0.8 : 0.35;
    c.copy(k, false);
    for (const p of ['focusDistance', 'bokehSize', 'apertureBlades', 'apertureRotation', 'anamorphicRatio']) c[p] = k[p];
    if (giro) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -giro);
      c.position.applyQuaternion(q); c.quaternion.premultiply(q); c.up.applyQuaternion(q);
    }
    c.updateMatrixWorld(true);
    const e = this.escenaPT;
    e.environmentRotation.set(0, (this.giroLuz || 0) - giro, 0); if (e.background) e.backgroundRotation.copy(e.environmentRotation);
    if (this.tornamesaPT.rotation.y !== -giro) { this.tornamesaPT.rotation.y = -giro; this.tornamesaPT.updateMatrixWorld(true); }
    if (this.ptSucio) { this.pt.setScene(e, c); this.ptSucio = false; this.giroPT = giro; }
    else if (giro !== this.giroPT) {
      // la joya giró en la tornamesa: el trazador vuelve a hornear su geometría y reajusta el BVH (sin reconstruirlo)
      const t0 = performance.now();
      this.pt.setScene(e, c);
      this.costosPT.push(performance.now() - t0); if (this.costosPT.length > 400) this.costosPT.shift();
      this.giroPT = giro;
    }
  }

  // Renderiza el cuadro actual con trazado de rayos hasta llegar a las muestras pedidas.
  // Los cuadritos (tiles) se mandan a la tarjeta en tandas y se espera a que termine cada tanda antes de mandar otra:
  // así nunca se acumula trabajo de más, la página sigue respondiendo y «Cancelar» actúa enseguida.
  // Guía (el mismo cuadro con el motor rápido) y silueta de la joya para limpiar el grano del escenario en el render realista
  prepararLimpieza() {
    const r = this.renderer, L = this.limpiador || (this.limpiador = new LimpiadorPT()), tam = r.getDrawingBufferSize(new THREE.Vector2());
    L.tamano(tam.x, tam.y);
    const antes = r.getRenderTarget(), color = r.getClearColor(new THREE.Color()), alfa = r.getClearAlpha();
    r.setRenderTarget(L.guia); r.clear(); r.render(this.escena, this.camara);
    const e = this.escena, prev = e.overrideMaterial, env = e.environment, fondo = e.background, esc = this.escenario;
    e.overrideMaterial = this.matMascara; e.environment = null; e.background = null; esc.grupo.visible = esc.contacto.visible = false;
    r.setRenderTarget(L.mascara); r.setClearColor(0x000000, 0); r.clear(); r.render(e, this.camara);
    e.overrideMaterial = prev; e.environment = env; e.background = fondo; esc.grupo.visible = esc.contacto.visible = true;
    r.setClearColor(color, alfa); r.setRenderTarget(antes);
  }

  async renderRealista(muestras, { alAvanzar, cancelado } = {}) {
    const limpiar = this.limpiezaPT && this.escenaActiva && !!this.escenario.limites;
    if (limpiar) this.prepararLimpieza();
    this.prepararPT();
    const pt = this.pt, gl = this.renderer.getContext();
    pt.updateCamera(); pt.updateEnvironment(); pt.updateMaterials(); pt.reset();
    let tanda = 1, enCurso = null;
    while (pt.samples < muestras || pt.isCompiling) {
      const t0 = performance.now();
      // mientras se compila el shader (la primera vez puede tardar más de medio minuto) no se dibuja nada: solo se espera
      for (let i = 0; i < tanda && pt.samples < muestras && !pt.isCompiling; i++) pt.renderSample();
      if (pt.isCompiling) pt.renderSample();
      // una tanda en la tarjeta mientras se espera la anterior: la tarjeta no se queda quieta y tampoco se atrasa
      const valla = vallaGPU(gl);
      if (enCurso) await enCurso;
      enCurso = valla;
      // tandas de unos 25 a 60 ms: rápidas en una tarjeta potente, de a un cuadrito en una lenta
      const dt = performance.now() - t0;
      tanda = dt < 25 ? Math.min(tanda * 2, 256) : dt > 60 && tanda > 1 ? tanda >> 1 : tanda;
      alAvanzar?.(Math.min(1, pt.samples / muestras));
      if (cancelado?.()) throw new DOMException('Cancelado', 'AbortError');
    }
    await enCurso;
    if (limpiar) this.limpiador.aplicar(this.renderer, pt.target.texture, pt.samples);
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
    // ang: el piso se ve girado cuando la cámara se ladea (roll): la elipse gira con él y sigue pegada a la base del aro
    return { x: c.x, y: c.y, rx: Math.hypot(a.x - c.x, a.y - c.y), ry: Math.max(Math.hypot(b.x - c.x, b.y - c.y), 4), ang: Math.atan2(a.y - c.y, a.x - c.x) };
  }
}

// Promesa que se cumple cuando la tarjeta de video terminó todo lo que se le mandó hasta ahora (sin bloquear la página)
function vallaGPU(gl) {
  if (!gl.fenceSync) return new Promise(r => requestAnimationFrame(() => r()));
  const valla = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise(r => {
    const mirar = () => {
      if (gl.isContextLost() || gl.getSyncParameter(valla, gl.SYNC_STATUS) === gl.SIGNALED) { gl.deleteSync(valla); r(); }
      else setTimeout(mirar, 1);
    };
    setTimeout(mirar, 0);
  });
}

function unir(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array, arr = new Float32Array(pa.length + pb.length);
  arr.set(pa); arr.set(pb, pa.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  a.dispose(); b.dispose();
  return g;
}
