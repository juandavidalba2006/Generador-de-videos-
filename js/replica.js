// Réplica de un video de referencia: del análisis (analizador.js, hecho en el equipo) y de lo que vio la IA (analisis-ia.js,
// opcional) a un plan para el proyecto: duración, cortes, keyframes de cada pista por plano, escena, metal y piedra, textos,
// sonidos en los cortes y música. Es puro (sin DOM): lo usan el panel Replicar y las pruebas en Node.
//
//   construirReplica(analisis, ia | null, opciones) → plan
//   aplicarReplica(proyecto, plan, { movimientos, cortes, textos, sonidos, musica, duracion }) → lo que cambió (muta el proyecto;
//   la escena y los materiales los pone main.js con sus propias funciones)
//
// Cómo se mezclan las dos fuentes: el flujo (lo medido cuadro a cuadro) sabe hacia dónde y cuándo se mueve la cámara; la IA
// sabe mejor el encuadre (qué tan cerca, desde qué altura) porque mira la foto entera. Si dicen lo mismo, se afina la
// cantidad; si se contradicen, el flujo manda en la dirección y el tiempo y la IA en el encuadre.
import { PISTAS, CURVAS, TRANSICIONES, DURACION_MIN, DURACION_MAX, ajustarACuadro, normalizarCortes, escalarTiempo } from './proyecto.js';
import { ESCENAS, escenaParecida, normalizarEscena } from './escenas.js';
import { configEscenaIA, TIPOS_JOYA, ENCUADRES } from './analisis-ia.js';
import { EFECTOS } from './sonido.js';
import { textosDesdeAcciones } from './textos.js';

const CUADRO = 1 / 30;
const MAX_SONIDOS = 12;
const ESTILOS_MUSICA_BPM = { lujo: 76, lofi: 82, trap: 140, house: 122, phonk: 130, popViral: 116, cinematico: 90 };
// Pistas de cámara que lleva cada plano (las de imagen, exposición y desenfoque, solo si hacen falta)
const PISTAS_CAMARA = ['giro', 'inclinacion', 'zoom', 'altura', 'lateral', 'foco', 'rodar'];
// Encuadre → zoom de la app (el «macro/detalle» además mira la piedra)
const RANGO_ENCUADRE = { macro: [2.6, 3.5], detalle: [2, 2.8], medio: [1.1, 1.7], general: [0.85, 1.1] };

const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const r4 = x => Math.round(x * 1e4) / 1e4;
const num = (x, def) => (esNum(x) ? x : def);
const signo = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const decimal = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');

// ---------- Descripciones en español (para el panel y el resumen) ----------
// mov: el movimiento de un plano ({ giro, zoomDesde, zoomHasta, inclinacion, lateral, altura, rodar, curva }), en valores de la app
export function describirMovimiento(mov) {
  if (!esObj(mov)) return 'Plano quieto';
  const partes = [];
  const g = num(mov.giro, 0), zf = num(mov.zoomHasta, 1) / Math.max(0.01, num(mov.zoomDesde, 1)), inc = num(mov.inclinacion, 0);
  const lat = num(mov.lateral, 0), alt = num(mov.altura, 0), rod = num(mov.rodar, 0);
  // giro positivo: la cámara rodea hacia la derecha y la cara de la pieza se va hacia la izquierda de la pantalla
  if (Math.abs(g) >= 8) partes.push(`${Math.abs(g) >= 330 ? (Math.abs(g) >= 700 ? 'Gira dos vueltas' : 'Da una vuelta completa') : `Gira ${Math.round(Math.abs(g))}°`} hacia la ${g > 0 ? 'izquierda' : 'derecha'}`);
  if (zf >= 1.08) partes.push(`se acerca ×${decimal(zf)}`);
  else if (zf <= 0.92) partes.push(`se aleja ×${decimal(1 / zf)}`);
  if (Math.abs(inc) >= 6) partes.push(`la cámara ${inc > 0 ? 'sube' : 'baja'} ${Math.round(Math.abs(inc))}°`);
  if (Math.abs(lat) >= 0.08) partes.push(`la pieza se corre a la ${lat > 0 ? 'derecha' : 'izquierda'}`);
  if (Math.abs(alt) >= 0.08) partes.push(`la pieza ${alt > 0 ? 'sube' : 'baja'} en el cuadro`);
  if (Math.abs(rod) >= 4) partes.push(`se ladea ${Math.round(Math.abs(rod))}°`);
  if (!partes.length) return 'Plano quieto';
  let s = partes.join(', ');
  s = s[0].toUpperCase() + s.slice(1);
  const ritmo = { suave: ', suave', entrada: ', acelerando', salida: ', frenando' }[mov.curva] || '';
  return s + ritmo;
}
const NOMBRE_TRANSICION = { seco: 'corte seco', flash: 'flash blanco', negro: 'fundido a negro', barrido: 'barrido' };

// ---------- Plan ----------
/**
 * analisis: lo que devuelve analizarVideo ({ duracion, recortado, cortes, planos, paleta, miniaturas }).
 * ia: lo que devuelve pedirAnalisisIA (normalizarAnalisisIA) o null.
 * opciones: { duracion (s; por defecto la del video, entre 3 y 60), escenaActual }
 * → { duracion, bucle:false, cortes, pistas, escena, materiales, joya, textos, sonidos, musica, resumen, avisos, planos, conIA }
 */
export function construirReplica(analisis, ia = null, opciones = {}) {
  const a = esObj(analisis) ? analisis : {};
  const avisos = [];
  const planosA = (Array.isArray(a.planos) ? a.planos : []).filter(esObj);
  const finA = planosA.reduce((m, p) => Math.max(m, num(p.fin, 0)), 0);
  const durVideo = num(a.duracion, finA) > 0 ? num(a.duracion, finA) : finA || 8;
  // duración del plan: la del video (dentro de 3–60 s) o la que se pida; los tiempos se escalan por igual
  const pedida = esNum(opciones.duracion) ? opciones.duracion : durVideo;
  const D = r2(limitar(pedida, DURACION_MIN, DURACION_MAX));
  const k = D / durVideo;
  if (a.recortado) avisos.push(`El video dura más de ${DURACION_MAX} s: se analizó y se replica solo el primer minuto.`);
  if (!esNum(opciones.duracion) && durVideo < DURACION_MIN - 0.05) avisos.push(`El video dura ${decimal(durVideo)} s; la réplica dura ${DURACION_MIN} s (lo mínimo), con todo un poco más lento.`);

  const conIA = esObj(ia) && (Array.isArray(ia.planos) || esObj(ia.joya));
  const planosIA = conIA && Array.isArray(ia.planos) ? ia.planos.filter(esObj) : [];
  const iaDe = i => planosIA.find(p => p.indice === i && p.porIA !== false) || null;

  // cortes: los del video (afinados al cuadro), con la transición que se vio; la IA solo corrige el tipo si el equipo dudó
  const cortesA = (Array.isArray(a.cortes) ? a.cortes : []).filter(c => esObj(c) && esNum(c.t)).sort((x, y) => x.t - y.t);
  const cortes = normalizarCortes(cortesA.map((c, j) => {
    let tr = Object.hasOwn(TRANSICIONES, c.transicion) ? c.transicion : 'seco';
    const deIA = planosIA.find(p => p.indice === j + 1)?.transicion;
    if (num(c.confianza, 1) < 0.5 && deIA && Object.hasOwn(TRANSICIONES, deIA)) tr = deIA;
    return { t: ajustarACuadro(c.t * k), transicion: tr };
  }), D);

  // los planos de la réplica: entre cortes (si el analizador no trajo planos, uno solo quieto)
  const limites = [0, ...cortes.map(c => c.t), D];
  const lista = planosA.length ? planosA : [{ indice: 0, inicio: 0, fin: durVideo, movimiento: null, pasos: [] }];
  const planos = [];
  const pistas = Object.fromEntries(Object.keys(PISTAS).map(id => [id, []]));
  let previo = null, alterna = 1, hayMacro = false;
  for (let j = 0; j + 1 < limites.length; j++) {
    // el plano analizado que corresponde (por orden; si los cortes se juntaron, el que más se solapa)
    const t0 = limites[j], t1 = limites[j + 1];
    const pa = planoQueCubre(lista, t0 / k, t1 / k) || lista[Math.min(j, lista.length - 1)];
    const pi = iaDe(pa.indice ?? j);
    const v = valoresPlano(pa, pi, previo, alterna, avisos);
    if (v.salto) alterna = -alterna;
    hayMacro ||= v.encuadre === 'macro';
    const ta = r4(j === 0 ? 0 : t0), tb = r4(j + 1 < limites.length - 1 ? t1 - CUADRO : D);
    poner(pistas, ta, tb, v, pa, k);
    planos.push({
      indice: j, analizado: pa.indice ?? j, inicio: r3(ta), fin: r3(j + 1 < limites.length - 1 ? t1 : D), duracion: r2(t1 - t0),
      transicion: j === 0 ? null : cortes[j - 1].transicion, encuadre: v.encuadre,
      giro: r2(v.g1 - v.g0), zoomDesde: r2(v.z0), zoomHasta: r2(v.z1), inclinacionDesde: r2(v.i0), inclinacionHasta: r2(v.i1),
      lateral: r3(v.l1 - v.l0), altura: r3(v.a1 - v.a0), rodar: r2(v.r1 - v.r0), curva: v.curva, confianza: v.confianza,
      descripcion: pi?.descripcion || describirMovimiento({ giro: v.g1 - v.g0, zoomDesde: v.z0, zoomHasta: v.z1, inclinacion: v.i1 - v.i0, lateral: v.l1 - v.l0, altura: v.a1 - v.a0, rodar: v.r1 - v.r0, curva: v.curva }),
      miniatura: Array.isArray(a.miniaturas) ? a.miniaturas[pa.indice ?? j] || null : null,
    });
    previo = v;
  }
  if (!hayMacro) pistas.desenfoque = [];

  // escena: la que vio la IA; sin IA, la lista más parecida a los colores del video, con esos colores y la luz que se midió
  const escena = escenaDelPlan(ia, a.paleta);
  const materiales = conIA && (ia.joya?.metal || ia.joya?.piedra) ? { metal: ia.joya.metal || null, piedra: ia.joya.piedra || null } : null;
  const joya = conIA && esObj(ia.joya) ? { tipo: ia.joya.tipo, nombreTipo: TIPOS_JOYA[ia.joya.tipo] || 'Joya', descripcion: ia.joya.descripcion || '', metal: ia.joya.metal || null, piedra: ia.joya.piedra || null } : null;

  // textos de la IA (con sus tiempos en la duración de la réplica)
  const textos = conIA && Array.isArray(ia.textos) ? ia.textos.filter(t => esObj(t) && typeof t.texto === 'string' && t.texto.trim()).map(t => ({
    texto: t.texto.trim(), estilo: t.estilo || 'libre', y: limitar(num(t.y, 0.8), 0.02, 0.98), animacion: t.animacion || 'aparecer',
    entra: r2(limitar(num(t.entra, 0) * k, 0, D - 0.2)), sale: num(t.sale, -1) < 0 ? -1 : r2(limitar(t.sale * k, 0, D)),
  })) : [];

  const sonidos = sonidosEnCortes(cortes, D);
  const musica = musicaDelPlan(ia, cortes, D);
  if (!conIA) avisos.push('Sin IA: los movimientos, los cortes y los colores salen del análisis hecho en tu equipo; la joya y los textos no se detectan.');
  const resumen = conIA && ia.resumen ? ia.resumen : resumenLocal(planos, cortes, escena, D);
  return { duracion: D, bucle: false, cortes, pistas, escena, materiales, joya, textos, sonidos, musica, resumen, avisos, planos, conIA: !!conIA, duracionVideo: r2(durVideo) };
}

// El plano analizado que más se solapa con [a, b) (en segundos del video)
function planoQueCubre(lista, a, b) {
  let mejor = null, dm = 0;
  for (const p of lista) {
    const s = Math.min(b, num(p.fin, 0)) - Math.max(a, num(p.inicio, 0));
    if (s > dm + 1e-6) { dm = s; mejor = p; }
  }
  return mejor;
}

// Valores de inicio y fin de cada pista en un plano, mezclando el flujo y la IA
function valoresPlano(pa, pi, previo, alterna, avisos) {
  const m = esObj(pa.movimiento) ? pa.movimiento : null;
  const conf = x => num(x?.confianza, 0);
  // giro: el del flujo; la IA lo afina si van hacia el mismo lado, o lo pone si el flujo no vio nada
  const gF = num(m?.giro?.grados, 0), gI = pi && esNum(pi.giro) ? pi.giro : null;
  let giro = gF;
  if (gI !== null) {
    if (Math.abs(gF) < 5 && conf(m?.giro) < 0.3) giro = gI;
    else if (signo(gI) === signo(gF)) giro = conf(m?.giro) >= 0.5 ? gF : (gF + gI) / 2;
    else if (Math.abs(gI) >= 20 && Math.abs(gF) >= 20) avisos.push(`Plano ${num(pa.indice, 0) + 1}: la IA y el análisis no coinciden en hacia dónde gira; se usó lo medido en el video.`);
  }
  // zoom: el encuadre de la IA; el acercamiento (cuánto y hacia dónde) del flujo
  const fF = num(m?.zoom?.factor, 1) > 0 ? num(m?.zoom?.factor, 1) : 1;
  let z0 = num(m?.zoom?.desde, 1), factor = fF;
  if (pi && esNum(pi.zoomDesde)) {
    z0 = pi.zoomDesde;
    const fI = esNum(pi.zoomHasta) && pi.zoomDesde > 0 ? pi.zoomHasta / pi.zoomDesde : 1;
    if (Math.abs(Math.log(fF)) < 0.04 && conf(m?.zoom) < 0.3) factor = fI;
    else if (signo(Math.log(fI)) === signo(Math.log(fF)) && conf(m?.zoom) < 0.5) factor = Math.sqrt(fF * fI);
  }
  let encuadre = pi?.encuadre && RANGO_ENCUADRE[pi.encuadre] ? pi.encuadre : null;
  if (!encuadre) encuadre = m?.zoom?.desde >= 2.55 || pa.objeto?.inicio?.llena ? 'macro' : Math.max(z0, z0 * factor) >= 1.6 ? 'detalle' : Math.max(z0, z0 * factor) >= 1.15 ? 'medio' : 'general';
  // el encuadre pone el zoom en su rango (conservando el acercamiento del plano)
  const [lo, hi] = RANGO_ENCUADRE[encuadre];
  let z1 = z0 * factor;
  const mayor = Math.max(z0, z1);
  if (mayor < lo || mayor > hi) { const s = limitar(mayor, lo, hi) / mayor; z0 *= s; z1 *= s; }
  z0 = limitar(z0, PISTAS.zoom.min, PISTAS.zoom.max); z1 = limitar(z1, PISTAS.zoom.min, PISTAS.zoom.max);
  // inclinación: la altura de la IA; el cambio, del flujo (si la IA lo ve hacia el mismo lado, se promedia)
  const dF = num(m?.inclinacion?.delta, 0), dI = pi && esNum(pi.inclinacionDesde) && esNum(pi.inclinacionHasta) ? pi.inclinacionHasta - pi.inclinacionDesde : null;
  let dInc = dF;
  if (dI !== null) {
    if (Math.abs(dF) < 4 && conf(m?.inclinacion) < 0.3) dInc = dI;
    else if (signo(dI) === signo(dF) && conf(m?.inclinacion) < 0.5) dInc = (dF + dI) / 2;
  }
  let i0 = pi && esNum(pi.inclinacionDesde) ? pi.inclinacionDesde : PISTAS.inclinacion.def - dInc / 2;
  i0 = limitar(i0, PISTAS.inclinacion.min, PISTAS.inclinacion.max);
  const i1 = limitar(i0 + dInc, PISTAS.inclinacion.min, PISTAS.inclinacion.max);
  // posición de la pieza en el cuadro (del flujo). No se deja que la pieza se salga del cuadro.
  // Un macro va centrado: la pieza llena el cuadro y su «centro» medido no es la piedra. Si la cámara recorrió la pieza de
  // lado o de arriba abajo, el recorrido se conserva (en la app «lateral» y «altura» corren la mira: es el mismo paneo)
  // repartido a los dos lados del centro, así la piedra no se sale; antes quedaba «Plano quieto».
  const macro = encuadre === 'macro';
  const centrado = pista => {
    const d = num(pista?.delta, num(pista?.hasta, 0) - num(pista?.desde, 0)), dd = Math.abs(d) >= 0.04 ? limitar(d, -0.6, 0.6) : 0;
    return dd ? [-dd / 2, dd / 2] : [0, 0];
  };
  const [l0, l1] = macro ? centrado(m?.lateral) : [limitar(num(m?.lateral?.desde, 0), -0.35, 0.35), limitar(num(m?.lateral?.hasta, num(m?.lateral?.desde, 0)), -0.35, 0.35)];
  const [a0, a1] = macro ? centrado(m?.altura) : [limitar(num(m?.altura?.desde, 0), -0.35, 0.35), limitar(num(m?.altura?.hasta, num(m?.altura?.desde, 0)), -0.35, 0.35)];
  // roll: el ladeo con que empieza lo dice la IA (absoluto); el cambio, el flujo
  const rF = num(m?.rodar?.grados, 0);
  const r0 = limitar(pi && esNum(pi.rodar) && Math.abs(rF) < 4 ? pi.rodar : 0, PISTAS.rodar.min, PISTAS.rodar.max);
  const r1 = limitar(r0 + rF, PISTAS.rodar.min, PISTAS.rodar.max);
  // giro al empezar: el primero desde 0; después de un corte, si el encuadre casi no cambia, la cámara salta a otro ángulo
  // (si no, el corte no se notaría); si cambia mucho (de general a macro), sigue desde donde iba
  let g0 = 0, salto = false;
  if (previo) {
    const cambioEncuadre = Math.abs(Math.log(z0 / previo.z1)) > 0.25 || Math.abs(i0 - previo.i1) > 12;
    g0 = previo.g1 + (cambioEncuadre ? 0 : 35 * alterna);
    salto = !cambioEncuadre;
  }
  const curva = m?.curva && Object.hasOwn(CURVAS, m.curva) ? m.curva : pi?.curva && Object.hasOwn(CURVAS, pi.curva) ? pi.curva : 'suave';
  const confianza = r2(Math.max(conf(m?.giro), conf(m?.zoom), conf(m?.inclinacion), conf(m?.lateral), conf(m?.altura), conf(m?.rodar)));
  return { g0: r2(g0), g1: r2(g0 + giro), z0: r3(z0), z1: r3(z1), i0: r2(i0), i1: r2(i1), l0: r3(l0), l1: r3(l1), a0: r3(a0), a1: r3(a1), r0: r2(r0), r1: r2(r1), encuadre, curva, salto, confianza, desenfoque: macro ? 0.35 : encuadre === 'detalle' ? 0.2 : 0 };
}

// foco (0 = el centro de la pieza, 1 = la piedra): sube con el zoom, como en un primer plano de la piedra
const focoDe = z => r2(limitar((z - 1.3) / 1.5, 0, 0.95));

// Keyframes de un plano: al empezar (ta) y un cuadro antes del corte siguiente (tb); en medio, si el perfil de
// velocidad lo pide (un movimiento que va y vuelve, o que no sigue ninguna curva sencilla)
function poner(pistas, ta, tb, v, pa, k) {
  const ext = { giro: [v.g0, v.g1], inclinacion: [v.i0, v.i1], zoom: [v.z0, v.z1], lateral: [v.l0, v.l1], altura: [v.a0, v.a1], rodar: [v.r0, v.r1], foco: [focoDe(v.z0), focoDe(v.z1)], desenfoque: [v.desenfoque, v.desenfoque] };
  const quieto = id => Math.abs(ext[id][1] - ext[id][0]) < (id === 'zoom' ? 0.01 : id === 'giro' || id === 'inclinacion' || id === 'rodar' ? 0.5 : 0.005);
  const medios = tb - ta > 0.6 ? clavesMedias(pa, v, ta, tb, k) : {};
  for (const id of [...PISTAS_CAMARA, 'desenfoque']) {
    const [x0, x1] = ext[id], P = PISTAS[id];
    const cv = quieto(id) ? 'lineal' : v.curva;
    const lim = x => (id === 'giro' ? r4(x) : r4(limitar(x, P.min, P.max)));
    const claves = pistas[id];
    if (medios[id]) {
      const mm = medios[id];
      claves.push({ t: ta, v: lim(x0), curva: mm.curvaA });
      claves.push({ t: r4(mm.t), v: lim(mm.v), curva: mm.curvaB });
    } else claves.push({ t: ta, v: lim(x0), curva: cv });
    if (tb - ta >= CUADRO - 1e-6) claves.push({ t: tb, v: lim(x1), curva: cv });
  }
}

// Un keyframe en medio para las pistas cuyo recorrido medido se aparta de la curva elegida (p. ej. acerca y aleja en el
// mismo plano). pasos: los del analizador (acumulados desde el inicio del plano, en segundos del video).
function clavesMedias(pa, v, ta, tb, k) {
  const pasos = Array.isArray(pa.pasos) ? pa.pasos.filter(p => esObj(p) && esNum(p.t)) : [];
  if (pasos.length < 6) return {};
  const fn = CURVAS[v.curva]?.fn || CURVAS.suave.fn;
  const t0 = pasos[0].t, t1 = pasos[pasos.length - 1].t;
  if (!(t1 > t0)) return {};
  const res = {};
  // por pista: (serie medida, valores de la réplica al inicio y al final, umbral de «se nota»)
  const def = {
    giro: [p => p.giro, v.g0, v.g1, 12], inclinacion: [p => p.inclinacion, v.i0, v.i1, 8],
    zoom: [p => Math.log(p.zoom), Math.log(v.z0), Math.log(v.z1), 0.12], lateral: [p => p.lateral, v.l0, v.l1, 0.08],
    altura: [p => p.altura, v.a0, v.a1, 0.08], rodar: [p => p.rodar, v.r0, v.r1, 5],
  };
  for (const [id, [f, x0, x1, umbral]] of Object.entries(def)) {
    const s = pasos.map(f);
    if (!s.every(esNum)) continue;
    const total = s[s.length - 1] - s[0], replica = x1 - x0;
    // escala de lo medido a la réplica (la IA o el encuadre pueden haber cambiado la cantidad): misma forma
    const esc = Math.abs(total) > 1e-6 ? replica / total : 1;
    let peor = -1, dmax = 0;
    for (let q = 1; q < s.length - 1; q++) {
      const u = (pasos[q].t - t0) / (t1 - t0);
      if (u < 0.15 || u > 0.85) continue;
      const pred = s[0] + total * fn(u), d = Math.abs(s[q] - pred);
      if (d > dmax) { dmax = d; peor = q; }
    }
    const rango = Math.max(...s) - Math.min(...s);
    if (peor < 0 || dmax * Math.abs(esc) < umbral || dmax < 0.3 * rango) continue;
    // va y vuelve (o se aparta mucho): keyframe en ese punto, con el valor medido llevado a la réplica
    const vm = Math.abs(total) > 1e-6 ? x0 + (s[peor] - s[0]) * esc : x0 + (s[peor] - s[0]);
    const tm = ajustarACuadro(limitar(pasos[peor].t * k, ta + 2 * CUADRO, tb - 2 * CUADRO));
    res[id] = { t: tm, v: id === 'zoom' ? Math.exp(vm) : vm, curvaA: 'suave', curvaB: 'suave' };
  }
  return res;
}

// Escena del plan: la de la IA, o la lista más parecida a los colores del video (con esos colores y la luz medida)
function escenaDelPlan(ia, paleta) {
  const deIA = esObj(ia) ? configEscenaIA(ia) : null;
  if (deIA) return deIA;
  const p = esObj(paleta) ? paleta : null;
  if (!p) return null;
  const hex = h => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : null);
  const F = hex(p.fondo), S = hex(p.superficie);
  if (!F && !S) return null;
  // un fondo claro, parejo y sin sombras marcadas (fondo blanco de catálogo): el fondo liso de la marca
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  if (F && S && !p.sombrasDuras && !p.oscuro) {
    const a = rgb(F), b = rgb(S), d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), luz = (a[0] + a[1] + a[2]) / 3;
    if (d < 18 && luz > 215) return { id: 'ninguna' };
  }
  const id = escenaParecida({ fondo: F, superficie: S, oscuro: !!p.oscuro });
  const base = ESCENAS[id];
  const angulo = { izquierda: -45, derecha: 45, arriba: 0, frente: -15 }[p.luzDesde] ?? base.luz.angulo;
  return normalizarEscena({
    id, superficie: { ...base.superficie, color: S || base.superficie.color }, fondo: { ...base.fondo, color: F || base.fondo.color },
    luz: { ...base.luz, gobo: p.sombrasDuras ? (base.luz.gobo === 'ninguno' ? 'ventana' : base.luz.gobo) : 'ninguno', angulo, elevacion: p.luzDesde === 'arriba' ? 65 : base.luz.elevacion, suavidad: p.sombrasDuras ? 0.25 : 0.65, calidez: limitar(num(p.calidez, 0) * 0.8, -1, 1) },
    ambiente: base.ambiente,
  });
}

// Sonidos en los cortes (estilo viral): el golpe cae justo en el corte
const SONIDO_CORTE = { seco: ['whooshCorto', 0.6], barrido: ['whoosh', 0.7], flash: ['impacto', 0.75], negro: ['impacto', 0.6] };
export function sonidosEnCortes(cortes, D) {
  const clips = [];
  for (const c of cortes || []) {
    const [efecto, volumen] = SONIDO_CORTE[c.transicion] || SONIDO_CORTE.seco, e = EFECTOS[efecto];
    if (!e) continue;
    const t = r4(limitar(c.t - (e.ancla || 0) * e.duracion, 0, Math.max(0, D - 0.2)));
    clips.push({ efecto, t, volumen, tono: 0 });
  }
  // con muchos cortes, un sonido cada tanto (no en todos): se reparten los que caben
  if (clips.length > MAX_SONIDOS) { const paso = clips.length / MAX_SONIDOS; return Array.from({ length: MAX_SONIDOS }, (_, i) => clips[Math.floor(i * paso)]); }
  return clips;
}

// Música: el estilo que dijo la IA; sin estilo pero con varios cortes parejos, un estilo que vaya con ese ritmo
function musicaDelPlan(ia, cortes, D) {
  const mu = esObj(ia?.musica) ? ia.musica : null;
  if (mu?.estilo && Object.hasOwn(ESTILOS_MUSICA_BPM, mu.estilo)) return { estilo: mu.estilo, bpm: esNum(mu.bpm) ? Math.round(limitar(mu.bpm, 60, 180)) : ESTILOS_MUSICA_BPM[mu.estilo] };
  const ts = [0, ...(cortes || []).map(c => c.t)];
  if (ts.length < 4) return null;
  const dif = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b), med = dif[dif.length >> 1];
  if (!(med > 0.15)) return null;
  // pulsos por minuto de un corte por compás o por pulso, dentro de 70–150
  let bpm = 60 / med;
  while (bpm < 70) bpm *= 2;
  while (bpm > 150) bpm /= 2;
  const estilo = bpm < 95 ? 'lujo' : bpm < 128 ? 'popViral' : 'trap';
  return { estilo, bpm: Math.round(bpm), porRitmo: true };
}

function resumenLocal(planos, cortes, escena, D) {
  const n = planos.length;
  const tipos = {};
  for (const c of cortes) tipos[c.transicion] = (tipos[c.transicion] || 0) + 1;
  const deCortes = Object.entries(tipos).map(([t, q]) => `${q} ${q === 1 ? NOMBRE_TRANSICION[t] : NOMBRE_TRANSICION[t].replace(/^(\S+)/, '$1s').replace('flashs', 'flashes').replace('fundidos a negro', 'fundidos a negro')}`);
  const principal = planos.slice().sort((a, b) => b.duracion - a.duracion)[0];
  const mov = principal ? principal.descripcion.toLowerCase() : 'plano quieto';
  let s = `Video de ${decimal(D)} s con ${n === 1 ? 'un solo plano' : `${n} planos`}${deCortes.length ? ` (${deCortes.join(', ')})` : ''}.`;
  s += ` El movimiento principal: ${mov}.`;
  if (escena) s += escena.id === 'ninguna' ? ' Fondo liso, como el de la marca.' : ` Escena parecida: «${ESCENAS[escena.base || escena.id]?.nombre || 'personalizada'}».`;
  return s;
}

// ---------- Aplicar ----------
// Lleva un plan a otra duración (estira o encoge todos los tiempos). Los keyframes de las costuras se mueven con su corte:
// el final de un plano sigue un cuadro antes del corte y el inicio del siguiente, justo en el corte.
export function escalarPlan(plan, nuevaDuracion) {
  const p = JSON.parse(JSON.stringify(plan));
  const D = r2(limitar(num(nuevaDuracion, p.duracion), DURACION_MIN, DURACION_MAX)), k = D / p.duracion;
  if (Math.abs(k - 1) < 1e-6) return p;
  const viejos = (p.cortes || []).map(c => c.t), nuevos = viejos.map(t => ajustarACuadro(t * k));
  const papel = t => {
    for (let j = 0; j < viejos.length; j++) {
      if (Math.abs(t - viejos[j]) < 1e-3) return { j, fin: false };
      if (Math.abs(t - (viejos[j] - CUADRO)) < 1e-3) return { j, fin: true };
    }
    return null;
  };
  for (const [id, claves] of Object.entries(p.pistas)) {
    for (const c of claves) {
      const m = papel(c.t);
      c.t = m ? r4(limitar(m.fin ? nuevos[m.j] - CUADRO : nuevos[m.j], 0, D)) : c.t >= p.duracion - 1e-6 ? D : r4(limitar(c.t * k, 0, D));
    }
    claves.sort((x, y) => x.t - y.t);
    // al encoger mucho, dos keyframes pueden caer en el mismo cuadro: queda el último (el inicio del plano que sigue)
    p.pistas[id] = claves.filter((c, i) => i + 1 >= claves.length || claves[i + 1].t - c.t >= 1 / 60);
  }
  p.cortes = normalizarCortes(nuevos.map((t, j) => ({ t, transicion: p.cortes[j].transicion })), D);
  const t = x => r4(limitar(x * k, 0, D));
  for (const x of p.textos || []) { x.entra = t(x.entra); if (x.sale >= 0) x.sale = t(x.sale); }
  p.sonidos = sonidosEnCortes(p.cortes, D);
  for (const pl of p.planos || []) { pl.inicio = t(pl.inicio); pl.fin = t(pl.fin); pl.duracion = r2(pl.fin - pl.inicio); }
  p.duracion = D;
  return p;
}

/**
 * Aplica el plan al proyecto (lo muta). opciones: { movimientos, cortes, textos, sonidos, musica, duracion (true = la del video;
 * false = se queda la del proyecto y el plan se ajusta a ella), formato, textosDesdeAcciones }.
 * La escena (plan.escena) y los materiales (plan.materiales) no viven en el proyecto: los pone main.js.
 * → { duracion, movimientos, cortes, textos, sonidos, musica, algo }
 */
export function aplicarReplica(proyecto, plan, { movimientos = true, cortes = true, textos = false, sonidos = false, musica = false, duracion = true, formato = 'reel', textosDesdeAcciones: convertir = textosDesdeAcciones } = {}) {
  const hecho = { duracion: false, movimientos: false, cortes: false, textos: false, sonidos: false, musica: false, algo: false };
  if (!esObj(proyecto) || !esObj(plan) || !esObj(plan.pistas)) return hecho;
  const antes = num(proyecto.duracion, 8);
  let P = plan;
  if (duracion) {
    // la duración del video: lo que ya había (textos, sonidos) se estira con ella
    if (Math.abs(antes - plan.duracion) > 1e-3) { escalarTiempo(proyecto, plan.duracion); hecho.duracion = true; }
  } else if (Math.abs(antes - plan.duracion) > 1e-3) P = escalarPlan(plan, antes);
  const D = num(proyecto.duracion, P.duracion);
  if (movimientos) {
    const pistas = {};
    for (const id of Object.keys(PISTAS)) {
      const nuevas = Array.isArray(P.pistas[id]) ? P.pistas[id] : [];
      // exposición y desenfoque: se respetan los que había si el plan no trae
      pistas[id] = nuevas.length || PISTAS_CAMARA.includes(id) ? nuevas.filter(c => c.t <= D + 1e-6).map(c => ({ t: r4(Math.min(c.t, D)), v: c.v, curva: c.curva })) : (proyecto.pistas?.[id] || []);
    }
    proyecto.pistas = pistas;
    proyecto.bucle = false;
    hecho.movimientos = true;
  }
  if (cortes) { proyecto.cortes = normalizarCortes(P.cortes, D); hecho.cortes = true; }
  if (textos && Array.isArray(P.textos) && P.textos.length) {
    const actuales = Array.isArray(proyecto.textos) ? proyecto.textos : [];
    const nuevas = typeof convertir === 'function' ? convertir(P.textos, { formato, capasActuales: actuales }) : null;
    if (Array.isArray(nuevas)) { proyecto.textos = nuevas; hecho.textos = true; }
  }
  proyecto.audio = esObj(proyecto.audio) ? proyecto.audio : { clips: [], musica: null };
  if (sonidos) {
    let n = 0;
    proyecto.audio.clips = (P.sonidos || []).filter(c => c.t < D).map(c => ({ id: 'au' + (++n), efecto: c.efecto, t: c.t, volumen: c.volumen, tono: c.tono || 0 }));
    hecho.sonidos = true;
  }
  if (musica && P.musica) {
    const m = esObj(proyecto.audio.musica) ? proyecto.audio.musica : null;
    proyecto.audio.musica = { estilo: P.musica.estilo, bpm: P.musica.bpm, volumen: esNum(m?.volumen) ? m.volumen : 0.55, inicio: 0, fundidoSalida: esNum(m?.fundidoSalida) ? m.fundidoSalida : 1.5, archivo: null };
    hecho.musica = true;
  }
  hecho.algo = Object.entries(hecho).some(([k, v]) => k !== 'algo' && v === true);
  return hecho;
}

export { ENCUADRES, TIPOS_JOYA, NOMBRE_TRANSICION };
