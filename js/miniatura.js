// Mundo en miniatura de noche (r6, «Noche de regalo»): sobre la tapa de una caja de regalo gigante (la pone utileria.js en
// posición «escenario») van un farol de hierro fundido con su linterna encendida y un halo que late, una banca de parque y,
// si se pide, una cajita de regalo que vuela alrededor del farol dejando una estela de destellos (la coreografía «volar» de
// elementos.js). El fondo de fachadas con ventanas bajo el cielo estrellado es el fondo «ciudad» del escenario: su dibujo
// sale de texturaCiudad(), aquí. No hay figuras humanas: la joyera puede subir las suyas como elementos «Mi STL».
//  · Todo se mide con la joya (h = su alto): el farol mide ~2,4 h y la banca ~1,15 h. Así la joya se ve enorme, la protagonista
//    del mundo chiquito, al lado del farol.
//  · Va pegado a la joya, como la caja de escenario: en el motor rápido queda quieto (la cámara gira alrededor) y en el
//    trazado de rayos va dentro de la tornamesa (estudio.js pone grupoPT en tornamesaPT).
//  · El halo es un brillo de pantalla (un sprite que suma luz): en el trazado de rayos no es geometría; estudio.js lo dibuja
//    encima del cuadro terminado, como los destellos del aire. La linterna sí es vidrio que emite luz en los dos motores, y
//    una luz de verdad (un foco hacia abajo) hace el charco cálido en la tapa y las sombras de la banca y de la joya.
//  · El latido del halo es una función cerrada del tiempo: la vista previa y el video dan lo mismo.
// Funciona en Node sin DOM (sin texturas ni sprite): la geometría y los sólidos para las pruebas sí.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Elementos } from './elementos.js';

const PI = Math.PI;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const HAY_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- La caja gigante de escenario ----------
// La configuración plana de utileria.js para la caja de la miniatura (sin moño ni logo: la tapa es el piso del mundo)
export function utileriaDeMiniatura(m) {
  return { tipo: 'caja-regalo', posicion: 'escenario', color: m?.caja || '#1E5B4B', cinta: m?.cinta || '#B8871F', interior: '#F1EFEA', material: m?.material || 'papel', mono: false, logo: false, apertura: 0, tamano: 1 };
}

// Cuánto late el halo en el instante t: 0..1, suave (sin quiebres) y con un respiro largo entre latidos, como en r6
export function latido(t, periodo = 4) {
  const f = (((Number.isFinite(t) ? t : 0) / Math.max(0.5, periodo)) % 1 + 1) % 1, s = 0.5 - 0.5 * Math.cos(2 * PI * f);
  return s * s * (3 - 2 * s);
}

// ---------- Texturas (solo en el navegador) ----------
function azar(semilla) {
  let s = (semilla >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const css = (c, a = 1) => `rgba(${c.map(v => Math.round(limitar(v, 0, 255))).join(',')},${a})`;
const tono = (c, k) => c.map(v => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));

// Fondo «ciudad»: cielo nocturno con estrellas arriba y fachadas con ventanas abajo, en el color del fondo de la escena.
// Se repite sin costuras a lo ancho (u). En alto (v, 0 = el piso del escenario, 1 = arriba del todo) la tapa de la caja de
// escenario queda en v ≈ V_TOPE: las fachadas suben hasta un poco más arriba de ella y el cielo sigue. Unas pocas ventanas
// encendidas en oro (la Navidad de la marca); las fachadas van apenas desenfocadas, como pintadas (r6)
export const V_TOPE = 0.36;
export function texturaCiudad(colorHex = '#143B33', semilla = 11) {
  if (!HAY_DOM) return null;
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), base = rgb(/^#[0-9a-f]{6}$/i.test(colorHex) ? colorHex : '#143B33'), R = azar(semilla);
  const Y = v => (1 - v) * H;   // v → fila del lienzo (el lienzo va de arriba hacia abajo)
  // cielo: casi negro arriba, el color del fondo hacia el horizonte
  const g = x.createLinearGradient(0, 0, 0, Y(V_TOPE));
  g.addColorStop(0, css(tono(base, -0.9))); g.addColorStop(0.55, css(tono(base, -0.72))); g.addColorStop(1, css(tono(base, -0.38)));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // estrellas: muchas finitas y unas pocas con un halo suave (se repiten a lo ancho sin costura)
  const punto = (px, py, r, a, halo) => {
    for (const dx of [-W, 0, W]) {
      if (px + dx < -20 || px + dx > W + 20) continue;
      if (halo) { const h = x.createRadialGradient(px + dx, py, 0, px + dx, py, r * 5); h.addColorStop(0, `rgba(255,244,222,${a * 0.5})`); h.addColorStop(1, 'rgba(255,244,222,0)'); x.fillStyle = h; x.fillRect(px + dx - r * 5, py - r * 5, r * 10, r * 10); }
      x.fillStyle = `rgba(255,${240 + Math.round(15 * R())},${215 + Math.round(35 * R())},${a})`; x.beginPath(); x.arc(px + dx, py, r, 0, 2 * PI); x.fill();
    }
  };
  for (let i = 0; i < 520; i++) {
    const v = V_TOPE + 0.12 + (1 - V_TOPE - 0.12) * Math.pow(R(), 0.8), r = 0.5 + 1.3 * R() * R();
    punto(R() * W, Y(v), r, 0.35 + 0.6 * R(), r > 1.35 && R() < 0.5);
  }
  // fachadas: edificios de alturas distintas, uno al lado del otro, con su grilla de ventanas
  const f = document.createElement('canvas'); f.width = W; f.height = H;
  const y = f.getContext('2d');
  let px = 0;
  while (px < W) {
    const ancho = 150 + 260 * R(), alto = V_TOPE + 0.05 + 0.2 * R() * R() + (R() < 0.18 ? 0.08 : 0), k = -0.42 + 0.18 * R();
    const col = tono(base, k), filas = 9 + Math.floor(R() * 4), arco = R() < 0.45, cols = Math.max(3, Math.round(ancho / (34 + 10 * R())));
    const top = Y(alto), bw = ancho / cols, bh = (H - top) / (filas + 0.6);
    for (const dx of [0, px + ancho > W ? -W : null]) {
      if (dx === null) continue;
      const X0 = px + dx;
      y.fillStyle = css(col); y.fillRect(X0, top, ancho + 1, H - top);
      // cornisa
      y.fillStyle = css(tono(col, 0.1)); y.fillRect(X0, top, ancho + 1, 5);
      const Rv = azar(semilla * 31 + Math.round(px));
      for (let j = 0; j < filas; j++) for (let i = 0; i < cols; i++) {
        const wx = X0 + i * bw + bw * 0.28, wy = top + bh * (0.55 + j), ww = bw * 0.44, wh = bh * 0.58;
        const encendida = Rv() < 0.1, vidrio = encendida ? [233, 184, 96] : tono(col, -0.45 - 0.1 * Rv());
        y.fillStyle = css(tono(col, 0.07)); y.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);   // el marco de la ventana
        y.fillStyle = css(vidrio, encendida ? 0.92 : 1);
        y.beginPath();
        if (arco) { y.moveTo(wx, wy + wh); y.lineTo(wx, wy + ww / 2); y.arc(wx + ww / 2, wy + ww / 2, ww / 2, PI, 0); y.lineTo(wx + ww, wy + wh); y.closePath(); }
        else y.rect(wx, wy, ww, wh);
        y.fill();
        if (encendida) {
          const h = y.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, bw);
          h.addColorStop(0, 'rgba(240,196,110,.28)'); h.addColorStop(1, 'rgba(240,196,110,0)');
          y.fillStyle = h; y.fillRect(wx - bw, wy - bw, ww + 2 * bw, wh + 2 * bw);
        }
        // parteluz
        y.fillStyle = css(tono(col, encendida ? -0.2 : 0.04)); y.fillRect(wx + ww / 2 - 1, wy + (arco ? ww * 0.2 : 0), 2, wh);
      }
    }
    px += ancho;
  }
  // abajo de todo el piso queda oscuro (lo tapa la caja casi siempre)
  y.fillStyle = css(tono(base, -0.75)); y.fillRect(0, Y(0.03), W, H);
  // las fachadas van un poco desenfocadas (como pintadas y lejos)
  x.filter = 'blur(1.6px)'; x.drawImage(f, 0, 0); x.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Disco suave del halo (sprite que suma luz)
let TEX_HALO = null;
function texturaHalo() {
  if (TEX_HALO || !HAY_DOM) return TEX_HALO;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  // (cálido tirando a ámbar: sumado sobre la noche verde no se ve verdoso)
  g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(0.1, 'rgba(255,200,128,.85)'); g.addColorStop(0.3, 'rgba(250,160,70,.45)');
  g.addColorStop(0.55, 'rgba(236,132,48,.17)'); g.addColorStop(0.8, 'rgba(226,120,40,.05)'); g.addColorStop(1, 'rgba(226,120,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  TEX_HALO = new THREE.CanvasTexture(c); TEX_HALO.colorSpace = THREE.SRGBColorSpace;
  return TEX_HALO;
}

// ---------- Geometría (todo en unidades de L: el alto del farol, o B: el largo de la banca) ----------
// Farol de hierro fundido: pie torneado, poste con anillos, cuello, linterna hexagonal de vidrio con su techo y remate
function geoFarol(L) {
  const hierro = [], oro = [], vidrio = [];
  const P = (r, y) => new THREE.Vector2(r * L, y * L);
  // pie y poste (un solo torno)
  const perfil = [P(0, 0), P(0.075, 0), P(0.075, 0.018), P(0.062, 0.03), P(0.062, 0.05), P(0.044, 0.07), P(0.03, 0.11), P(0.021, 0.14), P(0.017, 0.2), P(0.015, 0.74), P(0.019, 0.76), P(0.03, 0.79), P(0.034, 0.805), P(0, 0.805)];
  hierro.push(new THREE.LatheGeometry(perfil, 20));
  // anillos del poste (dorados: el detalle de la marca)
  for (const [y, r] of [[0.2, 0.022], [0.5, 0.019], [0.72, 0.02]]) { const t = new THREE.TorusGeometry(r * L, 0.0045 * L, 6, 20); t.rotateX(PI / 2); t.translate(0, y * L, 0); oro.push(t); }
  // linterna: un vidrio hexagonal que se abre hacia arriba, con parantes y dos marcos
  const y0 = 0.805, y1 = 0.93, r0 = 0.034, r1 = 0.052;
  const cristal = new THREE.CylinderGeometry(r1 * L * 0.96, r0 * L * 0.96, (y1 - y0) * L, 6, 1, false); cristal.translate(0, (y0 + y1) / 2 * L, 0);
  vidrio.push(cristal);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * 2 * PI + PI / 6, b = new THREE.CylinderGeometry(0.0035 * L, 0.0035 * L, Math.hypot((y1 - y0), r1 - r0) * L, 5);
    b.rotateZ(-Math.atan2(r1 - r0, y1 - y0)); b.translate(((r0 + r1) / 2) * L, (y0 + y1) / 2 * L, 0); b.rotateY(-a);
    hierro.push(b);
  }
  for (const [y, r] of [[y0, r0], [y1, r1]]) { const m = new THREE.CylinderGeometry(r * L, r * L, 0.008 * L, 6); m.translate(0, y * L, 0); hierro.push(m); }
  // techo: una pirámide hexagonal con alero y el remate dorado
  const techo = new THREE.ConeGeometry(0.066 * L, 0.06 * L, 6); techo.translate(0, (y1 + 0.004 + 0.03) * L, 0); hierro.push(techo);
  const cuello = new THREE.CylinderGeometry(0.008 * L, 0.012 * L, 0.025 * L, 8); cuello.translate(0, (y1 + 0.07) * L, 0); hierro.push(cuello);
  const remate = new THREE.SphereGeometry(0.012 * L, 12, 8); remate.translate(0, (y1 + 0.093) * L, 0); oro.push(remate);
  const pt = new THREE.ConeGeometry(0.006 * L, 0.03 * L, 8); pt.translate(0, (y1 + 0.115) * L, 0); oro.push(pt);
  return {
    hierro: unir(hierro), oro: unir(oro), vidrio: unir(vidrio),
    cabeza: V(0, (y0 + y1) / 2 * L, 0), alto: (y1 + 0.13) * L, radio: 0.075 * L, rLinterna: r1 * L,
  };
}
// Banca de parque: tablas de madera en el asiento y el respaldo, lados de hierro fundido con patas curvas y apoyabrazos
function geoBanca(B) {
  const madera = [], hierro = [];
  const tabla = (largo, ancho, grueso, x, y, z, inclina = 0) => {
    const g = new THREE.BoxGeometry(largo, grueso, ancho, 1, 1, 1); g.rotateX(inclina); g.translate(x, y, z); madera.push(g);
  };
  const hs = 0.3 * B, fondo = 0.34 * B;
  for (let i = 0; i < 4; i++) tabla(B, 0.068 * B, 0.022 * B, 0, hs, -fondo / 2 + 0.05 * B + i * 0.079 * B);
  // respaldo inclinado hacia atrás
  const inc = 0.22;
  for (let i = 0; i < 3; i++) { const yy = hs + 0.12 * B + i * 0.085 * B; tabla(B, 0.064 * B, 0.02 * B, 0, yy, -fondo / 2 - (yy - hs) * Math.tan(inc), PI / 2 - inc); }
  // lados: tubos curvos (pata de adelante con el apoyabrazos, pata de atrás que sube por el respaldo)
  const tubo = pts => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.014 * B, 6, false);
  for (const s of [-1, 1]) {
    const x = s * 0.43 * B;
    hierro.push(tubo([V(x, 0, fondo / 2 - 0.02 * B), V(x, hs * 0.5, fondo / 2 - 0.035 * B), V(x, hs, fondo / 2 - 0.02 * B), V(x, hs + 0.12 * B, fondo / 2 + 0.01 * B), V(x, hs + 0.15 * B, fondo / 2 - 0.08 * B), V(x, hs + 0.15 * B, -fondo / 2 + 0.02 * B)]));
    hierro.push(tubo([V(x, 0, -fondo / 2 - 0.05 * B), V(x, hs * 0.6, -fondo / 2 + 0.01 * B), V(x, hs, -fondo / 2 + 0.02 * B), V(x, hs + 0.2 * B, -fondo / 2 - 0.2 * B * Math.tan(inc)), V(x, hs + 0.33 * B, -fondo / 2 - 0.33 * B * Math.tan(inc) - 0.01 * B)]));
    const bajo = new THREE.BoxGeometry(0.02 * B, 0.022 * B, fondo); bajo.translate(x, hs - 0.02 * B, 0); hierro.push(bajo);
    for (const z of [fondo / 2 - 0.02 * B, -fondo / 2 - 0.05 * B]) { const pie = new THREE.CylinderGeometry(0.02 * B, 0.024 * B, 0.012 * B, 10); pie.translate(x, 0.006 * B, z); hierro.push(pie); }
  }
  return { madera: unir(madera), hierro: unir(hierro), alto: hs + 0.37 * B, fondo: fondo + 0.25 * B };
}
function unir(L) {
  const g = mergeGeometries(L.map(x => (x.index ? x.toNonIndexed() : x)).map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x; }), false);
  for (const x of L) x.dispose();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ---------- Materiales ----------
function materiales() {
  const M = {
    hierro: new THREE.MeshPhysicalMaterial({ color: 0x18201D, metalness: 0.55, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    oro: new THREE.MeshPhysicalMaterial({ color: 0xE2B45C, metalness: 1, roughness: 0.22 }),
    // la linterna: vidrio que emite la luz cálida de la vela (el halo lo rodea)
    vidrio: new THREE.MeshStandardMaterial({ color: 0x2A1E10, emissive: 0xFFC478, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0 }),
    madera: new THREE.MeshPhysicalMaterial({ color: 0x4A2C17, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
  };
  return M;
}

// ---------- La miniatura ----------
export class Miniatura {
  constructor() {
    this.grupo = new THREE.Group(); this.grupo.name = 'miniatura';        // motor rápido (en estudio.escena, quieto con la joya)
    this.grupoPT = new THREE.Group(); this.grupoPT.name = 'miniaturaPT';  // trazador (en estudio.tornamesaPT)
    this.vuelo = new Elementos();                                         // la cajita que vuela alrededor del farol
    this.grupo.add(this.vuelo.grupo); this.grupoPT.add(this.vuelo.grupoPT);
    this.cfg = null; this.clave = null; this.mats = null; this.halo = null; this.luces = []; this.t = null; this.brillo = -1;
    this.ptSucio = false; this.lucesSucias = false; this.resultado = null;
  }
  get activa() { return !!this.resultado; }

  // m: escena.miniatura (normalizada); op: { joya: { caja (Box3 de la joya o del par, sin elevar) }, suelo (y de la tapa de la
  // caja de escenario), escenario (ru.escenario de utileria.js: centro, ancho, fondo, cintas), version }
  // Devuelve { limites (Box3), solidos (Box3 de cada pieza, para que los elementos no los atraviesen), cabeza (centro de la
  // linterna), alto } o null si no va
  armar(m, op = {}) {
    if (!m?.activo || !op.joya?.caja) { this.vaciar(); return null; }
    const caja = op.joya.caja, h = Math.max(1e-6, caja.max.y - caja.min.y), w = Math.max(1e-6, caja.max.x - caja.min.x), d = Math.max(1e-6, caja.max.z - caja.min.z);
    const suelo = Number.isFinite(op.suelo) ? op.suelo : caja.min.y, esc = op.escenario, cinta = esc?.cintas?.ancho || 0;
    const k = JSON.stringify([m.farol, m.banca, m.regalo, m.caja, m.cinta, caja.min.toArray(), caja.max.toArray(), suelo, esc && [esc.ancho, esc.fondo, cinta], op.version]);
    if (k === this.clave) return this.resultado;
    this.limpiar();
    this.clave = k; this.cfg = { ...m };
    const M = this.mats = materiales(), solidos = [], lim = new THREE.Box3().union(caja);
    const malla = (geo, mat, padres) => padres.map(p => { const o = new THREE.Mesh(geo, mat); o.castShadow = o.receiveShadow = true; p.add(o); return o; });
    const dos = [this.grupo, this.grupoPT];
    // dónde va cada cosa: el farol atrás a la derecha de la joya y la banca a la izquierda, fuera de las cintas del cruce
    const L = 2.1 * h, B = 1.05 * h, medio = cinta / 2;
    let farol = null;
    if (m.farol) {
      const F = geoFarol(L), x = Math.max(w / 2 + 0.3 * h, medio + F.radio * 1.2), z = -Math.max(d / 2 + 0.25 * h, medio + F.radio * 1.2);
      const nodo = dos.map(p => { const g = new THREE.Group(); g.position.set(x, suelo, z); p.add(g); return g; });
      malla(F.hierro, M.hierro, nodo); malla(F.oro, M.oro, nodo);
      for (const o of malla(F.vidrio, M.vidrio, nodo)) o.castShadow = false;   // (la luz sale de adentro)
      const cabeza = F.cabeza.clone().add(V(x, suelo, z));
      // la luz: un foco cálido desde la linterna hacia abajo (el charco en la tapa y las sombras); en el trazador, con radio
      // (sombras suaves). Va un poco debajo del vidrio y por delante del poste
      // (fuera del poste y de la linterna: adentro, su propia geometría la tapaba y no llegaba luz al piso)
      const pie = V(x, suelo, z + 0.06 * L), origen = cabeza.clone().add(V(0, -0.085 * L, 0.06 * L)), D = origen.distanceTo(pie), ang = 0.95;
      const sl = new THREE.SpotLight(0xFFC98A, 1, 0, ang, 1, 2); sl.position.copy(origen); sl.castShadow = true;
      sl.shadow.mapSize.set(1024, 1024); sl.shadow.camera.near = 0.02 * L; sl.shadow.camera.far = 3 * L; sl.shadow.bias = -0.0005; sl.shadow.normalBias = 0.01 * h; sl.shadow.radius = 4;
      const t1 = new THREE.Object3D(); t1.position.copy(pie); sl.target = t1; this.grupo.add(sl, t1);
      // (un foco común con radio: es lo que lee el trazador de un PhysicalSpotLight; así este módulo también corre en Node)
      const radio = 0.02 * L, lp = new THREE.SpotLight(0xFFC98A, 1, 0, ang, 1, 2); lp.radius = radio;
      lp.position.copy(origen).addScaledVector(V(0, 1, 0), radio / Math.tan(ang));
      const t2 = new THREE.Object3D(); t2.position.copy(pie); lp.target = t2; this.grupoPT.add(lp, t2);
      // una luz puntual suave alrededor de la linterna (solo motor rápido: en el trazador la linterna emite sola)
      const pl = new THREE.PointLight(0xFFD9A0, 1, 0, 2); pl.position.copy(cabeza); this.grupo.add(pl);
      this.luces = [{ luz: sl, E: 6 * D * D }, { luz: lp, E: 6 * D * D }, { luz: pl, E: 0.22 * L * L }];
      // el halo
      if (HAY_DOM) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHalo(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.position.copy(cabeza); s.renderOrder = 6; s.name = 'halo'; s.userData.base = 1.05 * L;
        this.grupo.add(s); this.halo = s;
      }
      farol = { cabeza, alto: F.alto, pie };
      solidos.push(new THREE.Box3(V(x - F.radio, suelo, z - F.radio), V(x + F.radio, suelo + F.alto, z + F.radio)));
      solidos.push(new THREE.Box3(V(x - F.rLinterna * 1.3, suelo + 0.79 * L, z - F.rLinterna * 1.3), V(x + F.rLinterna * 1.3, suelo + F.alto, z + F.rLinterna * 1.3)));
    }
    if (m.banca) {
      const G = geoBanca(B), x = -(w / 2 + 0.12 * h + B / 2), z = -Math.max(0.12 * h, 0);
      const nodo = dos.map(p => { const g = new THREE.Group(); g.position.set(x, suelo, z); g.rotation.y = 0.18; p.add(g); g.updateMatrixWorld(true); return g; });
      malla(G.madera, M.madera, nodo); malla(G.hierro, M.hierro, nodo);
      // (la caja se mide en la copia del motor rápido: la del trazador puede estar girada con la tornamesa)
      const bb = new THREE.Box3().setFromObject(nodo[0]);
      bb.min.y = Math.max(bb.min.y, suelo);
      solidos.push(bb);
    }
    for (const s of solidos) lim.union(s);
    // la cajita que vuela alrededor de la linterna, con su estela (en el color de la caja de escenario y la cinta de oro)
    if (m.regalo && farol) {
      this.vuelo.armar([{ id: 'regalo-volador', forma: 'regalo', color: m.caja, color2: m.cinta, material: 'laca', coreografia: 'volar', cantidad: 1, tamano: 0.75, inicio: 0.2, duracion: 7.4, estela: 0.85, semilla: 5 }],
        { joya: { caja, mmPorUnidad: 1 }, suelo, version: op.version, centroVuelo: farol.cabeza.clone().add(V(0, 0.02 * L, 0)) });
      this.vuelo.girar(0);
    } else this.vuelo.vaciar();
    if (farol) lim.expandByPoint(V(farol.pie.x, farol.pie.y + farol.alto, farol.pie.z));
    this.grupo.updateMatrixWorld(true); this.grupoPT.updateMatrixWorld(true);
    this.t = null; this.brillo = -1; this.ptSucio = true; this.lucesSucias = true;
    this.resultado = { limites: lim, solidos, cabeza: farol?.cabeza || null, farol, alto: L, banca: m.banca };
    this.actualizar(0);
    return this.resultado;
  }

  // Cada cuadro: el latido del halo y de la luz del farol, y la cajita que vuela. Deja ptSucio (algo se movió: el trazador
  // vuelve a ajustar su geometría) y lucesSucias (cambió la fuerza de las luces o del vidrio). true si algo cambió
  actualizar(t) {
    if (!this.resultado || !Number.isFinite(t) || t === this.t) return false;
    this.t = t;
    let cambio = false;
    const m = this.cfg, b = 1 - m.pulso + m.pulso * latido(t, m.periodo);
    if (Math.abs(b - this.brillo) > 1e-4) {
      this.brillo = b;
      // el halo crece y se enciende con el latido (r6); la luz de verdad apenas (el charco no debe titilar)
      if (this.halo) { this.halo.scale.setScalar(this.halo.userData.base * (0.55 + 0.9 * b)); this.halo.material.opacity = 0.4 + 0.6 * b; }
      for (const l of this.luces) l.luz.intensity = l.E * (0.82 + 0.18 * b);
      if (this.mats) this.mats.vidrio.emissiveIntensity = 1.6 + 1.2 * b;
      this.lucesSucias = cambio = true;
    }
    if (!this.vuelo.vacio && this.vuelo.actualizar(t)) { this.ptSucio = cambio = true; this.vuelo.ptSucio = false; }
    return cambio;
  }

  limpiar() {
    this.vuelo.vaciar();
    for (const g of [this.grupo, this.grupoPT]) for (const c of [...g.children]) {
      if (c === this.vuelo.grupo || c === this.vuelo.grupoPT) continue;
      g.remove(c);
      c.traverse(o => { if (o.isMesh) o.geometry?.dispose(); if (o.isSprite) o.material.dispose(); if (o.isLight) { o.shadow?.map?.dispose(); o.dispose?.(); } });
    }
    for (const m of Object.values(this.mats || {})) m.dispose();
    this.mats = null; this.halo = null; this.luces = []; this.resultado = null; this.clave = null;
  }
  vaciar() { this.limpiar(); this.t = null; this.ptSucio = true; }
}

// (para las pruebas)
export const _interno = { geoFarol, geoBanca };
