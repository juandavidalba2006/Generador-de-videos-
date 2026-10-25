// Modelo del proyecto: pistas de cámara con keyframes (como en CapCut), cortes, textos y sonido.
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
  // v4 (escena): sin keyframes no hacen nada; la línea de tiempo las muestra solo cuando sirven (hay estuche, la joya flota…)
  apertura:    { nombre: 'Apertura del estuche', unidad: '', min: 0,     max: 1,    paso: 0.01, def: 1 },     // 0 = cerrado; sin keyframes, la del panel
  elevar:      { nombre: 'Elevar la joya',     unidad: '',  min: 0,     max: 1.5,  paso: 0.01, def: 0 },     // en altos de la joya, sobre su asiento o el piso
  luz:         { nombre: 'Giro de la luz',     unidad: '°', min: -180,  max: 180,  paso: 1,    def: 0 },     // la luz principal gira: los brillos recorren la tela
};
// Pistas de la escena: un movimiento base no las borra salvo que las traiga el movimiento anterior (como las de imagen)
export const PISTAS_ESCENA = ['apertura', 'elevar', 'luz'];

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

// ---------- Cortes: la cámara salta de un plano a otro (como los cortes de un reel) ----------
// En un corte ninguna pista se interpola: cada una salta a su siguiente keyframe. La transición es solo de imagen
// (la dibuja transiciones.js encima del cuadro).
export const TRANSICIONES = { seco: 'Corte seco', flash: 'Flash blanco', negro: 'Fundido a negro', barrido: 'Barrido' };
export const SEPARACION_CORTES = 1 / 15;   // dos cortes a menos de 2 cuadros se juntan en uno
const BORDE_CORTE = 1 / 30;                // un corte necesita al menos un cuadro antes y uno después
const MAX_CORTES = 240;
const HOLGURA = 1e-4;                      // los tiempos van redondeados a 4 decimales
const CUADRO = 1 / 30;                     // un cuadro del video

const r4 = x => Math.round(x * 1e4) / 1e4;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const K = (t, v, curva = 'suave') => ({ t: r4(t), v: r4(v), curva });
const esCurva = c => typeof c === 'string' && Object.hasOwn(CURVAS, c);
const esPista = p => typeof p === 'string' && Object.hasOwn(PISTAS, p);
const esTransicion = x => typeof x === 'string' && Object.hasOwn(TRANSICIONES, x);

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
  // v4 — los reels de lujo de referencia
  'macro-revelado': {
    // un solo plano: de un macro ladeado y desenfocado sobre la piedra se aleja frenando, se endereza y termina de frente, nítido
    nombre: 'Macro y revelado (del pavé a la pieza)', bucle: false,
    crear: D => ({
      giro: [K(0, -24, 'salida'), K(D, 0)], inclinacion: [K(0, 6, 'salida'), K(D, 10)], zoom: [K(0, 3.5, 'salida'), K(D, 1)],
      foco: [K(0, 1, 'salida'), K(D * 0.8, 0)], rodar: [K(0, -12, 'salida'), K(D * 0.85, 0)], desenfoque: [K(0, 0.6, 'salida'), K(D * 0.8, 0)],
    }),
  },
  'abrir-estuche': {
    // el estuche cerrado, la tapa se abre, la joya sube un poco y la cámara se acerca despacio
    nombre: 'Abrir el estuche', bucle: false,
    crear: D => ({
      giro: [K(0, -14, 'lineal'), K(D, 10)], inclinacion: [K(0, 30), K(D, 18)], zoom: [K(0, 0.82, 'lineal'), K(D, 1.3)],
      apertura: [K(0, 0), K(D * 0.12, 0), K(D * 0.5, 1)], elevar: [K(0, 0), K(D * 0.48, 0), K(D * 0.8, 0.3)],
    }),
  },
  'dentro-del-estuche': {
    // desde arriba con la caja cerrada → la tapa se abre → la cámara baja hasta la joya → pasadas macro → final de frente
    nombre: 'Dentro del estuche', bucle: false,
    crear: D => ({
      inclinacion: [K(0, 78), K(D * 0.3, 76), K(D * 0.55, 42), K(D * 0.82, 14), K(D, 16)],
      zoom: [K(0, 0.72), K(D * 0.3, 0.8, 'entrada'), K(D * 0.55, 2.4), K(D * 0.82, 2.2), K(D, 1.25)],
      apertura: [K(0, 0), K(D * 0.08, 0), K(D * 0.32, 1)],
      giro: [K(0, 0), K(D * 0.45, 0), K(D * 0.82, 70), K(D, 0)],
      foco: [K(0, 0), K(D * 0.4, 0), K(D * 0.6, 0.6), K(D * 0.85, 0.4), K(D, 0)],
      desenfoque: [K(0, 0), K(D * 0.45, 0), K(D * 0.6, 0.45), K(D * 0.85, 0.35), K(D, 0.05)],
    }),
  },
  'descenso-revelado': {
    // de cerca en la joya (arriba en el cuadro), se aleja y baja como una grúa hasta mostrar la caja o la cinta de abajo
    nombre: 'Descenso y revelado', bucle: false,
    crear: D => ({
      giro: [K(0, -10), K(D, 0)], inclinacion: [K(0, 30, 'salida'), K(D, 8)], zoom: [K(0, 2.4, 'salida'), K(D, 1)],
      foco: [K(0, 1, 'salida'), K(D * 0.85, 0)], desenfoque: [K(0, 0.25, 'salida'), K(D * 0.7, 0)],
    }),
  },
};

// Pistas de "imagen" (y las de la escena): un movimiento base no las borra salvo que las traiga el movimiento anterior
const PISTAS_IMAGEN = ['exposicion', 'desenfoque', ...PISTAS_ESCENA];

const pistasVacias = () => Object.fromEntries(Object.keys(PISTAS).map(id => [id, []]));

export function proyectoNuevo() {
  // textos y audio por defecto los pone main.js (para no crear un ciclo con textos.js y sonido.js)
  return {
    version: 2,
    duracion: 8,
    bucle: MOVIMIENTOS.giro.bucle,
    pistas: { ...pistasVacias(), ...MOVIMIENTOS.giro.crear(8) },
    cortes: [],
    textos: [],
    audio: { clips: [], musica: null },
  };
}

// ---------- Evaluación ----------
// Valor de una lista de keyframes (ordenada) en el instante t. Si entre dos keyframes a y b hay un corte c
// (a.t < c ≤ b.t), no se interpola: vale a.v hasta el corte y b.v desde el corte (si hay varios, salta en el primero).
function valorClaves(claves, t, def, cortes) {
  if (!claves || !claves.length) return def;
  if (t <= claves[0].t) return claves[0].v;
  const n = claves.length;
  if (t >= claves[n - 1].t) return claves[n - 1].v;
  let i = 0;
  while (i < n - 2 && claves[i + 1].t <= t) i++;
  const a = claves[i], b = claves[i + 1], tramo = b.t - a.t;
  if (cortes?.length) {
    for (const c of cortes) {
      const tc = typeof c === 'number' ? c : c?.t;
      if (tc > a.t && tc <= b.t) return t < tc ? a.v : b.v;
    }
  }
  if (tramo <= 0) return b.v;
  const f = (esCurva(a.curva) ? CURVAS[a.curva] : CURVAS.suave).fn((t - a.t) / tramo);   // la curva la decide el keyframe de la izquierda
  return a.v + (b.v - a.v) * f;
}

export function valorEn(proyecto, pista, tSeg) {
  if (!esPista(pista)) throw new Error(`No existe la pista «${pista}».`);
  const P = PISTAS[pista], t = limitar(esNum(tSeg) ? tSeg : 0, 0, proyecto.duracion || 8);
  const v = valorClaves(proyecto.pistas?.[pista], t, P.def, Array.isArray(proyecto.cortes) ? proyecto.cortes : null);
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
// Uno nuevo sin curva hereda la del tramo que parte (la del keyframe de la izquierda), como en CapCut: marcar el valor
// que ya tenía no cambia el movimiento (un giro lineal sigue lineal). Sin keyframe a la izquierda, 'suave'.
export function ponerClave(proyecto, pista, t, v, curva) {
  const claves = lista(proyecto, pista), P = PISTAS[pista];
  const tt = r4(limitar(esNum(t) ? t : 0, 0, proyecto.duracion || 8));
  const vv = r4(limitar(esNum(v) ? v : P.def, P.min, P.max));
  const c = esCurva(curva) ? curva : undefined;
  const existente = claveEn(proyecto, pista, tt);
  if (existente) { existente.v = vv; if (c) existente.curva = c; return existente; }
  const izquierda = claves.filter(k => k.t < tt).at(-1)?.curva;
  const nueva = { t: tt, v: vv, curva: c || (esCurva(izquierda) ? izquierda : 'suave') };
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

// ---------- Cortes ----------
// Limpia una lista de cortes (de un archivo, del chat o de la IA): solo los que caben dentro del video, redondeados como
// los keyframes, ordenados y separados al menos 2 cuadros (si dos quedan más cerca, se queda el primero). Nunca lanza.
export function normalizarCortes(lista, duracion = 8) {
  if (!Array.isArray(lista)) return [];
  const d = esNum(duracion) && duracion > 0 ? duracion : 8, salida = [];
  const crudos = lista.map(c => (esNum(c) ? { t: c } : esObj(c) ? c : null))
    .filter(c => c && esNum(c.t) && c.t >= BORDE_CORTE - HOLGURA && c.t <= d - BORDE_CORTE + HOLGURA)
    .map(c => ({ t: r4(limitar(c.t, BORDE_CORTE, d - BORDE_CORTE)), transicion: esTransicion(c.transicion) ? c.transicion : 'seco' }))
    .sort((a, b) => a.t - b.t);
  for (const c of crudos) if (!salida.length || c.t - salida[salida.length - 1].t >= SEPARACION_CORTES - HOLGURA) salida.push(c);
  return salida.slice(0, MAX_CORTES);
}

const listaCortes = proyecto => (Array.isArray(proyecto.cortes) ? proyecto.cortes : (proyecto.cortes = []));
const ordenarCortes = cortes => cortes.sort((a, b) => a.t - b.t);
const tiempoCorte = (proyecto, t) => r4(limitar(esNum(t) ? t : 0, BORDE_CORTE, (proyecto.duracion || 8) - BORDE_CORTE));

// El corte más cercano a t (a menos de tol), o null
export function corteEn(proyecto, t, tol = TOLERANCIA) {
  let mejor = null, dm = Infinity;
  for (const c of proyecto.cortes || []) { const d = Math.abs(c.t - t); if (d < tol && d < dm) { mejor = c; dm = d; } }
  return mejor;
}

// Pone un corte en t; si ya hay uno a menos de 2 cuadros, ese mismo toma la transición. Fuera del video (en el segundo 0
// o en el final) no hay corte posible: devuelve null.
export function ponerCorte(proyecto, t, transicion = 'seco') {
  const d = proyecto.duracion || 8;
  if (!esNum(t) || t < BORDE_CORTE - HOLGURA || t > d - BORDE_CORTE + HOLGURA) return null;
  const cortes = listaCortes(proyecto), tt = tiempoCorte(proyecto, t), tr = esTransicion(transicion) ? transicion : 'seco';
  const existente = corteEn(proyecto, tt, SEPARACION_CORTES - HOLGURA);
  if (existente) { existente.transicion = tr; return existente; }
  const nuevo = { t: tt, transicion: tr };
  cortes.push(nuevo); ordenarCortes(cortes);
  return nuevo;
}

// Quita el corte dado (o el que esté en el instante t). Devuelve el que quitó, o null.
export function quitarCorte(proyecto, t) {
  const cortes = proyecto.cortes; if (!Array.isArray(cortes)) return null;
  const c = typeof t === 'object' && t ? (cortes.includes(t) ? t : null) : corteEn(proyecto, t);
  if (!c) return null;
  cortes.splice(cortes.indexOf(c), 1);
  return c;
}

// Mueve un corte a otro instante; si cae a menos de 2 cuadros de otro, se queda con su lugar (el otro desaparece).
// Con arrastrarClaves, el corte se lleva la «costura» entre sus dos planos: los keyframes que están justo en el corte (el
// comienzo del plano siguiente) y un cuadro antes (el final del anterior). Así se cambia dónde termina un plano y empieza el
// otro sin que la cámara se congele. En ese modo el corte no pasa por encima de otros keyframes ni de otros cortes.
export function moverCorte(proyecto, corte, nuevoT, { arrastrarClaves = false } = {}) {
  const cortes = listaCortes(proyecto);
  if (!cortes.includes(corte)) return null;
  const antes = corte.t;
  let t = tiempoCorte(proyecto, esNum(nuevoT) ? nuevoT : corte.t);
  if (arrastrarClaves) {
    const [lo, hi] = limitesCorte(proyecto, corte);
    t = r4(limitar(t, lo, hi));
    for (const claves of Object.values(proyecto.pistas || {})) {
      if (!Array.isArray(claves)) continue;
      for (const c of claves) {
        if (Math.abs(c.t - antes) < TOLERANCIA) c.t = t;
        else if (Math.abs(c.t - (antes - CUADRO)) < TOLERANCIA) c.t = r4(t - CUADRO);
      }
      ordenar(claves);
    }
  }
  corte.t = t;
  for (let i = cortes.length - 1; i >= 0; i--) if (cortes[i] !== corte && Math.abs(cortes[i].t - corte.t) < SEPARACION_CORTES - HOLGURA) cortes.splice(i, 1);
  ordenarCortes(cortes);
  return corte;
}

// Hasta dónde se puede llevar un corte con su costura: sin cruzar otros cortes ni los keyframes vecinos de ninguna pista
export function limitesCorte(proyecto, corte) {
  const d = proyecto.duracion || 8, c = corte.t;
  let lo = BORDE_CORTE + CUADRO, hi = d - BORDE_CORTE;
  for (const o of proyecto.cortes || []) {
    if (o === corte) continue;
    if (o.t < c) lo = Math.max(lo, o.t + SEPARACION_CORTES); else hi = Math.min(hi, o.t - SEPARACION_CORTES);
  }
  for (const claves of Object.values(proyecto.pistas || {})) {
    for (const k of Array.isArray(claves) ? claves : []) {
      if (Math.abs(k.t - c) < TOLERANCIA || Math.abs(k.t - (c - CUADRO)) < TOLERANCIA) continue;   // la costura misma
      if (k.t < c) lo = Math.max(lo, k.t + 2 * CUADRO); else hi = Math.min(hi, k.t - CUADRO);
    }
  }
  return hi >= lo ? [r4(lo), r4(hi)] : [c, c];
}

// Al cortar en medio de un movimiento, la cámara se quedaría quieta hasta el corte (no se interpola a través de él).
// separarPlanos deja el movimiento como estaba a cada lado: en cada pista que pasa por el corte pone un keyframe un cuadro
// antes y otro justo en el corte, con los valores que tenía. Desde ahí cada lado es un plano que se edita por separado.
// Devuelve las pistas que tocó.
const CURVA_ANTES = { suave: 'entrada', salida: 'lineal', rebote: 'lineal', elastico: 'lineal' };   // el tramo que llega al corte no frena
const CURVA_DESPUES = { suave: 'salida', entrada: 'lineal' };                                         // el que sale del corte no arranca de cero
export function separarPlanos(proyecto, t) {
  const tocadas = [], c = esNum(t) ? r4(t) : NaN, d = proyecto.duracion || 8;
  if (!esNum(c) || c - CUADRO < 0 || c > d) return tocadas;
  for (const id of Object.keys(PISTAS)) {
    const claves = proyecto.pistas?.[id];
    if (!Array.isArray(claves) || claves.length < 2) continue;
    // el tramo (a, b] que contiene el corte; sin keyframes a los dos lados la pista no cambia en el corte
    const i = claves.findIndex((k, j) => j < claves.length - 1 && k.t < c && claves[j + 1].t >= c);
    if (i < 0) continue;
    const a = claves[i];
    if (Math.abs(a.t - (c - CUADRO)) < TOLERANCIA && Math.abs(claves[i + 1].t - c) < TOLERANCIA) continue;   // ya está separada
    const v1 = valorClaves(claves, c - CUADRO, PISTAS[id].def), v2 = valorClaves(claves, c, PISTAS[id].def);
    const curva = esCurva(a.curva) ? a.curva : 'suave';
    if (!(Math.abs(claves[i + 1].t - c) < TOLERANCIA)) claves.splice(i + 1, 0, { t: c, v: r4(v2), curva: CURVA_DESPUES[curva] || curva });
    if (a.t < c - CUADRO - TOLERANCIA) {
      claves.splice(i + 1, 0, { t: r4(c - CUADRO), v: r4(v1), curva });
      a.curva = CURVA_ANTES[curva] || curva;
    }
    ordenar(claves);
    tocadas.push(id);
  }
  return tocadas;
}

// Lo contrario de separarPlanos, para cuando se quita un corte: en cada pista con «costura» en t (un keyframe un cuadro antes y
// otro justo en t) y keyframes a los dos lados, quita la costura y deja el movimiento de un solo tramo (la curva vuelve a ser la
// de antes de partirlo: «acelerar» + «frenar» = «suave»). Si no, la pista daría un salto de un cuadro donde ya no hay corte.
const CURVA_UNIDA = { 'entrada|salida': 'suave', 'lineal|lineal': 'lineal', 'entrada|lineal': 'entrada', 'lineal|salida': 'salida' };
export function unirPlanos(proyecto, t) {
  const tocadas = [], c = esNum(t) ? t : NaN;
  if (!esNum(c)) return tocadas;
  for (const id of Object.keys(PISTAS)) {
    const claves = proyecto.pistas?.[id];
    if (!Array.isArray(claves) || claves.length < 3) continue;
    const j = claves.findIndex(k => Math.abs(k.t - c) < TOLERANCIA), i = claves.findIndex(k => Math.abs(k.t - (c - CUADRO)) < TOLERANCIA);
    if (i < 1 || j !== i + 1 || j >= claves.length - 1) continue;   // hace falta un keyframe antes y otro después de la costura
    const previa = claves[i - 1], enCorte = claves[j];
    previa.curva = CURVA_UNIDA[`${previa.curva}|${enCorte.curva}`] || (esCurva(enCorte.curva) ? enCorte.curva : 'suave');
    claves.splice(i, 2);
    tocadas.push(id);
  }
  return tocadas;
}

// Cortes con a < t ≤ b (los que pasan al avanzar de a hasta b), en orden
export function cortesEntre(proyecto, a, b) {
  return (proyecto.cortes || []).filter(c => c.t > a && c.t <= b);
}

// ---------- Movimientos base ----------
const igualesClaves = (a = [], b = []) => a.length === b.length && a.every((c, i) => Math.abs(c.t - b[i].t) < 1e-3 && Math.abs(c.v - b[i].v) < 1e-3 && c.curva === b[i].curva);

// Qué movimiento base tiene el proyecto ahora, o null si ya se editaron los keyframes ("personalizado").
// Con cortes tampoco es un movimiento base (esos son continuos).
export function movimientoDe(proyecto) {
  if (proyecto.cortes?.length) return null;
  const d = proyecto.duracion || 8;
  for (const [id, m] of Object.entries(MOVIMIENTOS)) {
    const p = m.crear(d);
    const igual = Object.keys(PISTAS).every(k => p[k] ? igualesClaves(proyecto.pistas?.[k], p[k])
      : PISTAS_IMAGEN.includes(k) || !(proyecto.pistas?.[k]?.length));
    if (igual) return id;
  }
  return null;
}

// Reemplaza las pistas de cámara por un movimiento base (y su bucle). Quita los cortes: un movimiento base es continuo.
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
  proyecto.cortes = [];
  proyecto.bucle = m.bucle;
  return proyecto;
}

// ---------- Duración ----------
// Cambia la duración estirando o encogiendo todo: keyframes, cortes, textos y sonidos
export function escalarTiempo(proyecto, nuevaDuracion) {
  const antes = proyecto.duracion || 8;
  const d = limitar(esNum(+nuevaDuracion) ? +nuevaDuracion : antes, DURACION_MIN, DURACION_MAX);
  const k = d / antes, esc = t => r4(limitar(t * k, 0, d));
  // las costuras se mueven con su corte (como en escalarPlan de replica.js): el keyframe del corte va al corte nuevo y el de
  // un cuadro antes, un cuadro antes del nuevo. Si se escalaran, al encoger a la mitad quedarían a menos de medio cuadro y al
  // abrir el archivo (o deshacer) se juntarían en uno: el plano perdería su movimiento.
  const viejos = (Array.isArray(proyecto.cortes) ? proyecto.cortes : []).filter(c => esObj(c) && esNum(c.t)).map(c => c.t).sort((x, y) => x - y);
  const nuevos = viejos.map(t => r4(limitar(t * k, BORDE_CORTE, d - BORDE_CORTE)));
  const costuras = new Set();
  const mover = t => {
    for (let j = 0; j < viejos.length; j++) {
      if (Math.abs(t - viejos[j]) < 1e-3) return nuevos[j];
      if (Math.abs(t - (viejos[j] - CUADRO)) < 1e-3) return r4(Math.max(0, nuevos[j] - CUADRO));
      // un keyframe de en medio del plano no pasa por encima del final del plano (al encoger, el final se corre a la derecha)
      if (t < viejos[j] - CUADRO) return Math.min(esc(t), r4(Math.max(0, nuevos[j] - CUADRO)));
    }
    return esc(t);
  };
  for (const claves of Object.values(proyecto.pistas || {})) {
    if (!Array.isArray(claves)) continue;
    for (const c of claves) {
      const t = mover(c.t);
      if (viejos.some(v => Math.abs(c.t - v) < 1e-3 || Math.abs(c.t - (v - CUADRO)) < 1e-3)) costuras.add(c);
      c.t = t;
    }
    ordenar(claves);
  }
  for (const capa of proyecto.textos || []) {
    if (esNum(capa.entra)) capa.entra = esc(capa.entra);
    if (esNum(capa.sale)) capa.sale = esc(capa.sale);
  }
  for (const clip of proyecto.audio?.clips || []) if (esNum(clip.t)) clip.t = esc(clip.t);
  // (al encoger, dos cortes pueden quedar a menos de 2 cuadros: se juntan; los objetos que quedan son los mismos)
  if (Array.isArray(proyecto.cortes)) {
    const quedan = [];
    for (const c of proyecto.cortes.filter(c => esObj(c) && esNum(c.t)).sort((x, y) => x.t - y.t)) {
      c.t = r4(c.t * k);
      if (c.t < BORDE_CORTE - HOLGURA || c.t > d - BORDE_CORTE + HOLGURA) continue;
      c.t = r4(limitar(c.t, BORDE_CORTE, d - BORDE_CORTE));
      if (!esTransicion(c.transicion)) c.transicion = 'seco';
      if (!quedan.length || c.t - quedan[quedan.length - 1].t >= SEPARACION_CORTES - HOLGURA) quedan.push(c);
    }
    proyecto.cortes = quedan;
  }
  // al encoger, dos keyframes de un mismo lado de un corte pueden quedar a menos de medio cuadro: se juntan ya (como al
  // abrir el archivo), así lo que se ve es lo mismo que lo que se guarda. Gana el de la costura; si no, el último.
  for (const claves of Object.values(proyecto.pistas || {})) {
    if (!Array.isArray(claves) || claves.length < 2) continue;
    const quedan = [];
    for (const c of claves) {
      const u = quedan[quedan.length - 1];
      if (u && esNum(u.t) && esNum(c.t) && c.t - u.t < TOLERANCIA && !hayCorteEntre(proyecto.cortes, u.t, c.t)) {
        if (costuras.has(u) && !costuras.has(c)) continue;
        quedan[quedan.length - 1] = c;
      } else quedan.push(c);
    }
    if (quedan.length < claves.length) claves.splice(0, claves.length, ...quedan);
  }
  proyecto.duracion = d;
  return proyecto;
}

// ¿Hay un corte c con a < c ≤ b? (entonces los keyframes en a y en b son de planos distintos y no se juntan)
function hayCorteEntre(cortes, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return Array.isArray(cortes) && cortes.some(c => { const t = esNum(c) ? c : c?.t; return esNum(t) && t > lo + HOLGURA / 2 && t <= hi + HOLGURA / 2; });
}

// ---------- Guardar y abrir ----------
// Solo pasan los datos simples: el AudioBuffer de una canción, imágenes, etc. no se guardan en el JSON
const reemplazo = (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) ? undefined : v;

export function serializar(proyecto) {
  return JSON.stringify(proyecto, reemplazo);
}

function limpiarClaves(lista, id, duracion, cortes) {
  if (!Array.isArray(lista)) return [];
  const P = PISTAS[id], claves = [];
  for (const c of lista) {
    if (!esObj(c) || !esNum(c.t) || !esNum(c.v)) continue;
    const clave = { t: r4(limitar(c.t, 0, duracion)), v: r4(limitar(c.v, P.min, P.max)), curva: esCurva(c.curva) ? c.curva : 'suave' };
    // dos keyframes a los dos lados de un corte son el final de un plano y el comienzo del otro: nunca se juntan
    const igual = claves.find(o => Math.abs(o.t - clave.t) < TOLERANCIA && !hayCorteEntre(cortes, o.t, clave.t));
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
  p.cortes = normalizarCortes(d.cortes, p.duracion);   // (los archivos de antes no tienen cortes)
  p.pistas = Object.fromEntries(Object.keys(PISTAS).map(id => [id, limpiarClaves(fuente[id], id, p.duracion, p.cortes)]));
  p.textos = Array.isArray(d.textos) ? d.textos.filter(esObj) : [];
  const a = esObj(d.audio) ? d.audio : {};
  p.audio = {
    ...a,
    clips: Array.isArray(a.clips) ? a.clips.filter(c => esObj(c) && esNum(c.t)).map(c => ({ ...c, t: limitar(c.t, 0, p.duracion) })) : [],
    musica: esObj(a.musica) ? a.musica : null,
  };
  return p;
}
