// Modelo del proyecto: pistas de cámara con keyframes (como en CapCut), textos y sonido.
// Es puro (sin DOM): lo usan la línea de tiempo, el estudio, el chat y las pruebas en Node.

// ---------- Pistas de cámara y escena (todas se pueden animar con keyframes) ----------
export const PISTAS = {
  giro:        { nombre: 'Giro',               unidad: '°', min: -1080, max: 1080, paso: 1,    def: 0 },     // vuelta alrededor de la pieza (tornamesa)
  inclinacion: { nombre: 'Altura de cámara',   unidad: '°', min: -20,   max: 80,   paso: 1,    def: 18 },
  zoom:        { nombre: 'Zoom',               unidad: '×', min: 0.4,   max: 4,    paso: 0.01, def: 1 },
  altura:      { nombre: 'Posición vertical',  unidad: '',  min: -0.5,  max: 0.5,  paso: 0.01, def: 0 },     // + = la pieza sube en la imagen
  lateral:     { nombre: 'Posición lateral',   unidad: '',  min: -0.5,  max: 0.5,  paso: 0.01, def: 0 },     // + = a la derecha
  foco:        { nombre: 'Foco en la piedra',  unidad: '',  min: 0,     max: 1,    paso: 0.01, def: 0 },     // 0 = centro de la pieza, 1 = la piedra
  rodar:       { nombre: 'Inclinación (roll)', unidad: '°', min: -45,   max: 45,   paso: 1,    def: 0 },     // cámara ladeada
  exposicion:  { nombre: 'Exposición',         unidad: '',  min: 0.5,   max: 2,    paso: 0.01, def: 1.15 },
  desenfoque:  { nombre: 'Desenfoque macro',   unidad: '',  min: 0,     max: 1,    paso: 0.01, def: 0 },     // solo se ve en el render realista
};

// ---------- Curvas de transición: cada keyframe dice cómo llegar al siguiente ----------
const rebote = u => {   // como una pelota que cae y rebota hasta quedarse quieta (nunca pasa del valor final)
  const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};
export const CURVAS = {
  lineal:   { nombre: 'Lineal',                 fn: u => u },
  suave:    { nombre: 'Suave',                  fn: u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2 },   // la misma de los movimientos de antes
  entrada:  { nombre: 'Acelerar',               fn: u => u * u * u },
  salida:   { nombre: 'Frenar',                 fn: u => 1 - Math.pow(1 - u, 3) },
  rebote:   { nombre: 'Rebote',                 fn: u => u >= 1 ? 1 : rebote(u) },
  elastico: { nombre: 'Elástico',               fn: u => u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI / 3)) + 1 },   // se pasa y vuelve, como un resorte
  escalon:  { nombre: 'Corte (sin transición)', fn: u => u >= 1 ? 1 : 0 },   // se queda en el valor y salta de golpe en el siguiente keyframe
};

export const TOLERANCIA = 1 / 60;   // dos keyframes a menos de medio cuadro son el mismo
export const DURACION_MIN = 3, DURACION_MAX = 60;

const r4 = x => Math.round(x * 1e4) / 1e4;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const K = (t, v, curva = 'suave') => ({ t: r4(t), v: r4(v), curva });
const esCurva = c => typeof c === 'string' && Object.hasOwn(CURVAS, c);
const esPista = p => typeof p === 'string' && Object.hasOwn(PISTAS, p);

// lleva un tiempo al cuadro más cercano (30 cuadros por segundo, como el video)
export const ajustarACuadro = (t, fps = 30) => Math.round(t * fps) / fps;

// ---------- Movimientos base (los mismos de antes, ahora hechos con keyframes) ----------
// En el estudio anterior: az en radianes → aquí giro en grados; el era un desfase sobre 18° → aquí inclinación absoluta;
// dist era un multiplicador → aquí zoom = 1 / dist.
export const MOVIMIENTOS = {
  giro: {
    nombre: 'Giro 360°', bucle: true,
    crear: D => ({ giro: [K(0, 0, 'lineal'), K(D, 360, 'lineal')] }),
  },
  acercamiento: {
    nombre: 'Giro con acercamiento', bucle: false,
    crear: D => ({ giro: [K(0, 0), K(D, 360)], inclinacion: [K(0, 28), K(D, 16)], zoom: [K(0, 0.82), K(D, 1.16)] }),
  },
  revelacion: {
    // el zoom se abre en dos tramos (acelera y frena sin saltos) para alejarse como antes, que era en distancia y no en zoom
    nombre: 'Revelación (del detalle a la pieza)', bucle: false,
    crear: D => ({ giro: [K(0, -108), K(D, 72)], inclinacion: [K(0, 32), K(D, 18)], zoom: [K(0, 2, 'entrada'), K(D * 0.38, 1.62, 'salida'), K(D, 1)], foco: [K(0, 1), K(D, 0)] }),
  },
  vaiven: {
    // los extremos con curva suave y el paso por el frente con la misma velocidad: el bucle no se nota
    nombre: 'Vaivén frontal', bucle: true,
    crear: D => ({
      giro: [K(0, 0, 'salida'), K(D / 4, 38), K(D * 3 / 4, -38, 'entrada'), K(D, 0)],
      inclinacion: [K(0, 18, 'salida'), K(D / 8, 21), K(D * 3 / 8, 15), K(D * 5 / 8, 21), K(D * 7 / 8, 15, 'entrada'), K(D, 18)],
      zoom: [K(0, 1), K(D / 2, 1.06), K(D, 1)],
    }),
  },
  orbita: {
    nombre: 'Órbita alta y baja', bucle: true,
    crear: D => ({
      giro: [K(0, 0, 'lineal'), K(D, 360, 'lineal')],
      inclinacion: [K(0, 18, 'salida'), K(D / 4, 34), K(D * 3 / 4, 2, 'entrada'), K(D, 18)],
      zoom: [K(0, 0.95), K(D / 2, 1.05), K(D, 0.95)],
    }),
  },
  giroRapido: {
    // dos vueltas que frenan en el plano final; al final sigue moviéndose un poco para que no se vea congelado
    nombre: 'Giro rápido con frenado', bucle: false,
    crear: D => ({
      giro: [K(0, 0, 'salida'), K(D * 0.85, 720), K(D, 735)],
      inclinacion: [K(0, 26, 'salida'), K(D * 0.85, 16), K(D, 16)],
      zoom: [K(0, 0.9, 'salida'), K(D * 0.85, 1.05), K(D, 1.07)],
    }),
  },
  destello: {
    // "punch" viral: acercamiento brusco a la piedra con rebote y un destello de luz, giro lento y se aleja al final
    nombre: 'Punch con destello', bucle: false,
    crear: D => {
      const a = 0.6, b = 1.1, c = D - 1.4;
      return {
        giro: [K(0, -20, 'lineal'), K(D, 160, 'lineal')],
        zoom: [K(0, 1, 'entrada'), K(a, 1.04, 'rebote'), K(b, 1.35), K(c, 1.42), K(D, 1)],
        foco: [K(0, 0, 'entrada'), K(a, 0.05, 'rebote'), K(b, 0.55), K(c, 0.55), K(D, 0)],
        exposicion: [K(0, 1.15, 'lineal'), K(a, 1.15, 'salida'), K(a + 0.12, 1.42), K(a + 0.7, 1.15)],
      };
    },
  },
  heroe: {
    nombre: 'Héroe (de abajo hacia arriba)', bucle: false,
    crear: D => ({ giro: [K(0, -90), K(D, 90)], inclinacion: [K(0, -5), K(D, 25)], zoom: [K(0, 1.12), K(D, 0.96)] }),
  },
};

// Pistas de "imagen": un movimiento base no las borra salvo que las traiga el movimiento anterior
const PISTAS_IMAGEN = ['exposicion', 'desenfoque'];

const pistasVacias = () => Object.fromEntries(Object.keys(PISTAS).map(id => [id, []]));

export function proyectoNuevo() {
  // textos y audio por defecto los pone main.js (para no crear un ciclo con textos.js y sonido.js)
  return {
    version: 2,
    duracion: 8,
    bucle: MOVIMIENTOS.giro.bucle,
    pistas: { ...pistasVacias(), ...MOVIMIENTOS.giro.crear(8) },
    textos: [],
    audio: { clips: [], musica: null },
  };
}

// ---------- Evaluación ----------
// Valor de una lista de keyframes (ordenada) en el instante t
function valorClaves(claves, t, def) {
  if (!claves || !claves.length) return def;
  if (t <= claves[0].t) return claves[0].v;
  const n = claves.length;
  if (t >= claves[n - 1].t) return claves[n - 1].v;
  let i = 0;
  while (i < n - 2 && claves[i + 1].t <= t) i++;
  const a = claves[i], b = claves[i + 1], tramo = b.t - a.t;
  if (tramo <= 0) return b.v;
  const f = (esCurva(a.curva) ? CURVAS[a.curva] : CURVAS.suave).fn((t - a.t) / tramo);   // la curva la decide el keyframe de la izquierda
  return a.v + (b.v - a.v) * f;
}

export function valorEn(proyecto, pista, tSeg) {
  if (!esPista(pista)) throw new Error(`No existe la pista «${pista}».`);
  const P = PISTAS[pista], t = limitar(esNum(tSeg) ? tSeg : 0, 0, proyecto.duracion || 8);
  const v = valorClaves(proyecto.pistas?.[pista], t, P.def);
  // el giro no tiene tope (puede dar las vueltas que quiera); el resto no se sale de su rango aunque la curva rebase
  return pista === 'giro' ? v : limitar(v, P.min, P.max);
}

export function evaluar(proyecto, tSeg) {
  const r = {};
  for (const id of Object.keys(PISTAS)) r[id] = valorEn(proyecto, id, tSeg);
  return r;
}

// ---------- Edición de keyframes ----------
function lista(proyecto, pista) {
  if (!esPista(pista)) throw new Error(`No existe la pista «${pista}».`);
  proyecto.pistas ||= {};
  return (proyecto.pistas[pista] ||= []);
}
const ordenar = claves => claves.sort((a, b) => a.t - b.t);

export function claveEn(proyecto, pista, t, tol = TOLERANCIA) {
  let mejor = null, dm = Infinity;
  for (const c of proyecto.pistas?.[pista] || []) { const d = Math.abs(c.t - t); if (d < tol && d < dm) { mejor = c; dm = d; } }
  return mejor;
}

// Agrega un keyframe, o reemplaza el que ya esté en ese instante. Si se reemplaza y no se pasa curva, conserva la suya.
export function ponerClave(proyecto, pista, t, v, curva) {
  const claves = lista(proyecto, pista), P = PISTAS[pista];
  const tt = r4(limitar(esNum(t) ? t : 0, 0, proyecto.duracion || 8));
  const vv = r4(limitar(esNum(v) ? v : P.def, P.min, P.max));
  const c = esCurva(curva) ? curva : undefined;
  const existente = claveEn(proyecto, pista, tt);
  if (existente) { existente.v = vv; if (c) existente.curva = c; return existente; }
  const nueva = { t: tt, v: vv, curva: c || 'suave' };
  claves.push(nueva); ordenar(claves);
  return nueva;
}

// Quita el keyframe que esté en el instante t (o el keyframe dado). Devuelve el que quitó, o null.
export function quitarClave(proyecto, pista, t) {
  const claves = proyecto.pistas?.[pista]; if (!claves) return null;
  const c = typeof t === 'object' && t ? (claves.includes(t) ? t : null) : claveEn(proyecto, pista, t);
  if (!c) return null;
  claves.splice(claves.indexOf(c), 1);
  return c;
}

// Mueve un keyframe a otro instante; si cae encima de otro, se queda con su lugar (el otro desaparece)
export function moverClave(proyecto, pista, clave, nuevoT) {
  const claves = lista(proyecto, pista);
  if (!claves.includes(clave)) return null;
  clave.t = r4(limitar(esNum(nuevoT) ? nuevoT : clave.t, 0, proyecto.duracion || 8));
  for (let i = claves.length - 1; i >= 0; i--) if (claves[i] !== clave && Math.abs(claves[i].t - clave.t) < TOLERANCIA) claves.splice(i, 1);
  ordenar(claves);
  return clave;
}

// ---------- Movimientos base ----------
const igualesClaves = (a = [], b = []) => a.length === b.length && a.every((c, i) => Math.abs(c.t - b[i].t) < 1e-3 && Math.abs(c.v - b[i].v) < 1e-3 && c.curva === b[i].curva);

// Qué movimiento base tiene el proyecto ahora, o null si ya se editaron los keyframes ("personalizado")
export function movimientoDe(proyecto) {
  const d = proyecto.duracion || 8;
  for (const [id, m] of Object.entries(MOVIMIENTOS)) {
    const p = m.crear(d);
    const igual = Object.keys(PISTAS).every(k => p[k] ? igualesClaves(proyecto.pistas?.[k], p[k])
      : PISTAS_IMAGEN.includes(k) || !(proyecto.pistas?.[k]?.length));
    if (igual) return id;
  }
  return null;
}

// Reemplaza las pistas de cámara por un movimiento base (y su bucle)
export function aplicarMovimiento(proyecto, id) {
  const m = Object.hasOwn(MOVIMIENTOS, id) ? MOVIMIENTOS[id] : null; if (!m) throw new Error(`No existe el movimiento «${id}».`);
  const d = proyecto.duracion || 8, nuevas = m.crear(d);
  const anterior = movimientoDe(proyecto), delAnterior = anterior ? MOVIMIENTOS[anterior].crear(d) : {};
  const pistas = {};
  for (const k of Object.keys(PISTAS)) {
    if (nuevas[k]) pistas[k] = nuevas[k];
    else if (PISTAS_IMAGEN.includes(k) && !delAnterior[k]) pistas[k] = proyecto.pistas?.[k] || [];   // la exposición que puso la usuaria se respeta
    else pistas[k] = [];
  }
  proyecto.pistas = pistas;
  proyecto.bucle = m.bucle;
  return proyecto;
}

// ---------- Duración ----------
// Cambia la duración estirando o encogiendo todo: keyframes, textos y sonidos
export function escalarTiempo(proyecto, nuevaDuracion) {
  const antes = proyecto.duracion || 8;
  const d = limitar(esNum(+nuevaDuracion) ? +nuevaDuracion : antes, DURACION_MIN, DURACION_MAX);
  const k = d / antes, esc = t => r4(limitar(t * k, 0, d));
  for (const claves of Object.values(proyecto.pistas || {})) {
    if (!Array.isArray(claves)) continue;
    for (const c of claves) c.t = esc(c.t);
    ordenar(claves);
  }
  for (const capa of proyecto.textos || []) {
    if (esNum(capa.entra)) capa.entra = esc(capa.entra);
    if (esNum(capa.sale)) capa.sale = esc(capa.sale);
  }
  for (const clip of proyecto.audio?.clips || []) if (esNum(clip.t)) clip.t = esc(clip.t);
  proyecto.duracion = d;
  return proyecto;
}

// ---------- Guardar y abrir ----------
// Solo pasan los datos simples: el AudioBuffer de una canción, imágenes, etc. no se guardan en el JSON
const reemplazo = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) ? undefined : v;

export function serializar(proyecto) {
  return JSON.stringify(proyecto, reemplazo);
}

function limpiarClaves(lista, id, duracion) {
  if (!Array.isArray(lista)) return [];
  const P = PISTAS[id], claves = [];
  for (const c of lista) {
    if (!esObj(c) || !esNum(c.t) || !esNum(c.v)) continue;
    const clave = { t: r4(limitar(c.t, 0, duracion)), v: r4(limitar(c.v, P.min, P.max)), curva: esCurva(c.curva) ? c.curva : 'suave' };
    const igual = claves.find(o => Math.abs(o.t - clave.t) < TOLERANCIA);
    if (igual) Object.assign(igual, clave); else claves.push(clave);   // si hay dos en el mismo instante gana el último
  }
  return ordenar(claves);
}

// Lee un proyecto (texto JSON u objeto): valida, completa lo que falte y conserva los campos que no conoce
export function deserializar(json) {
  let d;
  if (typeof json === 'string') {
    try { d = JSON.parse(json); } catch (e) { throw new Error('El archivo no es un proyecto válido: no se pudo leer.'); }
  } else d = json;
  if (!esObj(d)) throw new Error('El archivo no es un proyecto válido de Atelier & Co.');
  if (typeof json !== 'string') d = JSON.parse(JSON.stringify(d, reemplazo));   // copia independiente
  const p = { ...d, version: 2 };
  p.duracion = esNum(d.duracion) ? limitar(d.duracion, DURACION_MIN, DURACION_MAX) : 8;
  p.bucle = typeof d.bucle === 'boolean' ? d.bucle : true;
  const fuente = esObj(d.pistas) ? d.pistas : MOVIMIENTOS.giro.crear(p.duracion);
  p.pistas = Object.fromEntries(Object.keys(PISTAS).map(id => [id, limpiarClaves(fuente[id], id, p.duracion)]));
  p.textos = Array.isArray(d.textos) ? d.textos.filter(esObj) : [];
  const a = esObj(d.audio) ? d.audio : {};
  p.audio = {
    ...a,
    clips: Array.isArray(a.clips) ? a.clips.filter(c => esObj(c) && esNum(c.t)).map(c => ({ ...c, t: limitar(c.t, 0, p.duracion) })) : [],
    musica: esObj(a.musica) ? a.musica : null,
  };
  return p;
}
