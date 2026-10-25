// Réplica de un video de referencia: del análisis (analizador.js, hecho en el equipo) y de lo que vio la IA (analisis-ia.js,
// opcional) a un plan para el proyecto: duración, cortes, keyframes de cada pista por plano, escena, metal y piedra, textos,
// sonidos en los cortes y música. Es puro (sin DOM): lo usan el panel Replicar y las pruebas en Node.
//
//   construirReplica(analisis, ia | null, { duracion, colores: 'video' | 'marca' }) → plan
//   recolorearEscena(escena, { fondo, superficie, caja, cinta }) → la escena con esos colores (las muestras del panel)
//   aplicarReplica(proyecto, plan, { movimientos, cortes, textos, sonidos, musica, duracion }) → lo que cambió (muta el proyecto;
//   la escena y los materiales los pone main.js con sus propias funciones)
//
// Cómo se mezclan las dos fuentes: el flujo (lo medido cuadro a cuadro) sabe hacia dónde y cuándo se mueve la cámara; la IA
// sabe mejor el encuadre (qué tan cerca, desde qué altura) porque mira la foto entera. Si dicen lo mismo, se afina la
// cantidad; si se contradicen, el flujo manda en la dirección y el tiempo y la IA en el encuadre.
import { PISTAS, CURVAS, TRANSICIONES, MOVIMIENTOS, DURACION_MIN, DURACION_MAX, ajustarACuadro, normalizarCortes, escalarTiempo } from './proyecto.js';
import { ESCENAS, escenaParecida, normalizarEscena } from './escenas.js';
import { configEscenaIA, TIPOS_JOYA, ENCUADRES } from './analisis-ia.js';
import { COLORES_MARCA, ESCENAS_SATEN, SATEN_DE_MARCA, ESQUEMAS_LUZ, TIPOS_UTILERIA, ELEMENTOS_IA, marcaMasCercana, idMarca, escenaDeId, completarEscena, grupoElemento, nombreEscena, oklab } from './escena-marca.js';
import { EFECTOS } from './sonido.js';
import { textosDesdeAcciones } from './textos.js';

const CUADRO = 1 / 30;
const MAX_SONIDOS = 12;
const ESTILOS_MUSICA_BPM = { lujo: 76, lofi: 82, trap: 140, house: 122, phonk: 130, popViral: 116, cinematico: 90 };
// Pistas de cámara que lleva cada plano (las de imagen, exposición y desenfoque, solo si hacen falta)
const PISTAS_CAMARA = ['giro', 'inclinacion', 'zoom', 'altura', 'lateral', 'foco', 'rodar'];
// Pistas de la escena (v4): se aplican con la escena, no con los movimientos
const PISTAS_DE_ESCENA = ['apertura', 'elevar', 'luz'];
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
    let v = valoresPlano(pa, pi, previo, alterna, avisos);
    if (v.salto) alterna = -alterna;
    const ta = r4(j === 0 ? 0 : t0), tb = r4(j + 1 < limites.length - 1 ? t1 - CUADRO : D);
    // un macro que se aleja sin parar (r1) o un alejamiento que baja la cámara para revelar lo de abajo (r5, r7): keys como
    // las de los movimientos «Macro revelado» y «Descenso revelado», con el encuadre de la IA si lo dio
    const patron = tb - ta >= 1.2 ? patronDePlano(pa, pi, v, { abre: conIA && !!ia.abre_estuche?.abre && planos.length === 0 && tb - ta >= 6 }) : null;
    if (patron) v = { ...v, ...patron.v };
    hayMacro ||= v.encuadre === 'macro' || !!patron;
    if (patron) ponerPatron(pistas, ta, tb, v, patron.tipo); else poner(pistas, ta, tb, v, pa, k);
    planos.push({
      indice: j, analizado: pa.indice ?? j, inicio: r3(ta), fin: r3(j + 1 < limites.length - 1 ? t1 : D), duracion: r2(t1 - t0),
      transicion: j === 0 ? null : cortes[j - 1].transicion, encuadre: v.encuadre,
      giro: r2(v.g1 - v.g0), zoomDesde: r2(v.z0), zoomHasta: r2(v.z1), inclinacionDesde: r2(v.i0), inclinacionHasta: r2(v.i1),
      lateral: r3(v.l1 - v.l0), altura: r3(v.a1 - v.a0), rodar: r2(v.r1 - v.r0), curva: v.curva, confianza: v.confianza,
      descripcion: pi?.descripcion || (patron ? DESCRIPCION_PATRON[patron.tipo] : describirMovimiento({ giro: v.g1 - v.g0, zoomDesde: v.z0, zoomHasta: v.z1, inclinacion: v.i1 - v.i0, lateral: v.l1 - v.l0, altura: v.a1 - v.a0, rodar: v.r1 - v.r0, curva: v.curva })),
      movimientoBase: patron?.tipo || null,
      miniatura: Array.isArray(a.miniaturas) ? a.miniaturas[pa.indice ?? j] || null : null,
    });
    previo = v;
  }
  if (!hayMacro) pistas.desenfoque = [];

  // escena: la que vio la IA; sin IA, la lista más parecida a los colores del video, con esos colores y la luz que se midió.
  // Con colores «de mi marca», cada parte (fondo, superficie, caja, cinta) pasa al color de la marca que hace su papel.
  const modoColor = opciones.colores === 'marca' ? 'marca' : 'video';
  const { escena, muestras } = escenaDelPlan(conIA ? ia : null, a.paleta, modoColor);
  // la tapa del estuche se abre cuando la IA lo vio (keys en la pista «apertura»)
  const ab = conIA && esObj(ia.abre_estuche) && ia.abre_estuche.abre && escena?.utileria && escena.utileria.tipo !== 'ninguna' ? ia.abre_estuche : null;
  if (ab) {
    const t0 = ajustarACuadro(limitar(num(ab.desde, -1) >= 0 ? ab.desde * k : 0.4, 0, D - 0.4));
    const t1 = ajustarACuadro(limitar(num(ab.hasta, -1) > num(ab.desde, -1) ? ab.hasta * k : t0 + 1.1, t0 + 0.3, D));
    pistas.apertura = [...(t0 > 0 ? [{ t: 0, v: 0, curva: 'lineal' }] : []), { t: r4(t0), v: 0, curva: 'suave' }, { t: r4(t1), v: 1, curva: 'lineal' }];
  }
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
  return { duracion: D, bucle: false, cortes, pistas, escena, materiales, joya, textos, sonidos, musica, resumen, avisos, planos, conIA: !!conIA, duracionVideo: r2(durVideo), colores: { modo: modoColor, muestras } };
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
  // un ladeo de más de 50° no es un plano holandés: es el flujo confundido por una órbita o un giro de la pieza
  const rF0 = num(m?.rodar?.grados, 0), rF = Math.abs(rF0) > 50 ? 0 : rF0;
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

// ---------- Movimientos con nombre dentro de un plano ----------
const DESCRIPCION_PATRON = {
  'macro-revelado': 'Empieza en un macro de la piedra, ladeado y desenfocado, y se aleja despacio frenando hasta la pieza completa, de frente',
  'descenso-revelado': 'Empieza cerca de la joya y se aleja bajando la cámara: revela lo que hay debajo',
  'dentro-del-estuche': 'Desde arriba se abre el estuche, la cámara baja hasta la joya, la rodea de cerca y termina de frente',
};
// ¿Este plano es un macro que se aleja (r1) o un alejamiento con la cámara que baja (r5, r7)? → { tipo, v } o null.
// La IA dice el encuadre (si empieza en macro, desde qué altura); el flujo, que se aleja y cuánto sube la pieza en el cuadro.
function patronDePlano(pa, pi, v, { abre = false } = {}) {
  const m = esObj(pa.movimiento) ? pa.movimiento : null;
  // r4: el estuche se abre visto desde arriba y la cámara entra (un plano largo): como «Dentro del estuche»
  if (abre && num(pi?.inclinacionDesde, 0) >= 55) return { tipo: 'dentro-del-estuche', v: { encuadre: pi?.encuadre || 'medio', curva: 'suave', desenfoque: 0, z0: 0.72, z1: 1.25, i0: 78, i1: 16, g1: v.g0, r0: 0, r1: 0, l0: 0, l1: 0, a0: 0, a1: 0 } };
  const fF = num(m?.zoom?.factor, 1), fI = pi && esNum(pi.zoomDesde) && esNum(pi.zoomHasta) && pi.zoomDesde > 0 ? pi.zoomHasta / pi.zoomDesde : null;
  // se aleja: lo dicen el flujo (con confianza) o la IA; ninguno de los dos dice lo contrario
  const aleja = (fF <= 0.7 && num(m?.zoom?.confianza, 0) >= 0.3 && !(fI !== null && fI > 0.95)) || (fI !== null && fI <= 0.6 && !(fF > 1.1));
  if (!aleja) return null;
  // sin IA: empieza en macro si la pieza llena el cuadro y no se ve el fondo (r1); con fondo a la vista es un plano cercano (r7)
  const empiezaMacro = pi?.encuadre === 'macro' || num(pi?.zoomDesde, 0) >= 2.6
    || (!pi && (num(m?.zoom?.desde, 0) >= 2.55 || pa.objeto?.inicio?.llena || (num(pa.objeto?.inicio?.tam, 0) >= 0.88 && m?.fondoVisible === false && fF <= 0.5)));
  const dIncIA = pi && esNum(pi.inclinacionDesde) && esNum(pi.inclinacionHasta) ? pi.inclinacionHasta - pi.inclinacionDesde : null;
  const subeFlujo = num(m?.altura?.delta, 0);
  const g = pi && esNum(pi.giro) && Math.abs(pi.giro) <= 60 ? pi.giro : 0;   // en un macro el flujo confunde el deslizamiento con giro
  if (empiezaMacro) {
    const z0 = limitar(esNum(pi?.zoomDesde) && pi.zoomDesde >= 2.6 ? pi.zoomDesde : 3.5, 2.6, PISTAS.zoom.max);
    const z1 = limitar(esNum(pi?.zoomHasta) && pi.zoomHasta <= 1.4 ? pi.zoomHasta : 1, 0.85, 1.4);
    const r0 = pi && esNum(pi.rodar) && Math.abs(pi.rodar) >= 4 ? limitar(pi.rodar, -25, 25) : -12;
    const i0 = limitar(esNum(pi?.inclinacionDesde) ? pi.inclinacionDesde : 4, -10, 30), i1 = limitar(esNum(pi?.inclinacionHasta) ? pi.inclinacionHasta : 8, -5, 25);
    return { tipo: 'macro-revelado', v: { encuadre: 'macro', z0, z1, r0, r1: 0, i0, i1, g1: r2(v.g0 + g), l0: 0, l1: 0, a0: 0, a1: 0, curva: 'salida', desenfoque: 0.6 } };
  }
  const baja = (dIncIA !== null && dIncIA <= -6) || subeFlujo >= 0.15;
  if (!baja) return null;
  const z0 = limitar(esNum(pi?.zoomDesde) ? pi.zoomDesde : Math.max(1.8, num(m?.zoom?.desde, 1.8)), 1.3, 3), z1 = limitar(esNum(pi?.zoomHasta) && pi.zoomHasta < z0 ? pi.zoomHasta : 0.85, 0.6, 1.2);
  const i0 = limitar(esNum(pi?.inclinacionDesde) ? pi.inclinacionDesde : 22, 0, 45), i1 = limitar(esNum(pi?.inclinacionHasta) && dIncIA !== null && dIncIA < 0 ? pi.inclinacionHasta : i0 - 14, -10, 30);
  const a1 = subeFlujo >= 0.15 ? limitar(subeFlujo * 0.8, 0.18, 0.32) : 0.25;
  return { tipo: 'descenso-revelado', v: { encuadre: pi?.encuadre || 'detalle', z0, z1, i0, i1, a0: 0, a1, l0: 0, l1: 0, r0: 0, r1: 0, g1: r2(v.g0 + limitar(g, -40, 40)), curva: 'salida', desenfoque: 0.25 } };
}
// Keys de un plano con movimiento con nombre: todo frena al final (salida); el desenfoque se va antes de llegar
function ponerPatron(pistas, ta, tb, v, tipo) {
  const macro = tipo === 'macro-revelado', L = tb - ta;
  if (tipo === 'dentro-del-estuche') {
    // las keys del movimiento de la línea de tiempo (o unas iguales si proyecto.js aún no lo trae), llevadas al plano
    const K = (t, x, curva = 'suave') => ({ t, v: x, curva });
    const crear = MOVIMIENTOS['dentro-del-estuche']?.crear || (D => ({
      inclinacion: [K(0, 78), K(D * 0.3, 76), K(D * 0.55, 42), K(D * 0.82, 14), K(D, 16)], zoom: [K(0, 0.72), K(D * 0.3, 0.8, 'entrada'), K(D * 0.55, 2.4), K(D * 0.82, 2.2), K(D, 1.25)],
      giro: [K(0, 0), K(D * 0.45, 0), K(D * 0.82, 70), K(D, 0)], foco: [K(0, 0), K(D * 0.4, 0), K(D * 0.6, 0.6), K(D * 0.85, 0.4), K(D, 0)],
      desenfoque: [K(0, 0), K(D * 0.45, 0), K(D * 0.6, 0.45), K(D * 0.85, 0.35), K(D, 0.05)],
    }));
    const plantilla = crear(L);
    for (const id of [...PISTAS_CAMARA, 'desenfoque']) {
      // las pistas que el movimiento no trae quedan quietas (la pieza centrada y la cámara derecha)
      const P = PISTAS[id], quieta = id === 'inclinacion' ? 18 : P.def;
      const ks = Array.isArray(plantilla[id]) && plantilla[id].length ? plantilla[id] : [K(0, quieta, 'lineal'), K(L, quieta, 'lineal')];
      for (const k of ks) pistas[id].push({ t: r4(Math.min(tb, ajustarACuadro(ta + limitar(k.t, 0, L)))), v: r4(id === 'giro' ? v.g0 + k.v : limitar(k.v, P.min, P.max)), curva: k.curva || 'suave' });
    }
    return;
  }
  const par = (id, x0, x1, curva = 'salida') => {
    const P = PISTAS[id], lim = x => r4(id === 'giro' ? x : limitar(x, P.min, P.max));
    pistas[id].push({ t: ta, v: lim(x0), curva: Math.abs(x1 - x0) < 1e-6 ? 'lineal' : curva });
    if (L >= CUADRO - 1e-6) pistas[id].push({ t: tb, v: lim(x1), curva: Math.abs(x1 - x0) < 1e-6 ? 'lineal' : curva });
  };
  par('zoom', v.z0, v.z1); par('giro', v.g0, v.g1); par('inclinacion', v.i0, v.i1); par('rodar', v.r0, v.r1);
  par('lateral', 0, 0); par('altura', v.a0, v.a1);
  par('foco', macro ? 0.9 : focoDe(v.z0), 0);
  // desenfoque: fuerte al empezar y nítido un poco antes del final (en el macro, a los 4/5 del plano)
  const d = pistas.desenfoque;
  d.push({ t: ta, v: v.desenfoque, curva: 'salida' });
  if (L > 0.6) d.push({ t: r4(ajustarACuadro(ta + L * (macro ? 0.8 : 0.6))), v: 0, curva: 'lineal' });
  if (L >= CUADRO - 1e-6) d.push({ t: tb, v: 0, curva: 'lineal' });
}

// ---------- Escena del plan ----------
const NOMBRE_ROL = { fondo: 'Fondo', superficie: 'Superficie', caja: 'Estuche o caja', cinta: 'Cinta' };
const hex6 = h => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : null);
const claridad = h => oklab(h)?.L ?? 0.5;
const esTela = e => !!e && e.id !== 'ninguna' && (e.fondo?.forma === 'tela' || /^saten-/.test(e.preset || e.base || e.id || ''));

// La escena sin IA: la lista más parecida a los colores del video (con esos colores y la luz medida). Una escena oscura y sin
// sombras marcadas es la de los reels de joyería en clave baja: satén con la luz de clave baja.
function escenaLocal(p) {
  if (!esObj(p)) return null;
  const F = hex6(p.fondo), S = hex6(p.superficie);
  if (!F && !S) return null;
  // un fondo claro, parejo y sin sombras marcadas (fondo blanco de catálogo): el fondo liso de la marca
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  if (F && S && !p.sombrasDuras && !p.oscuro) {
    const a = rgb(F), b = rgb(S), d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), luz = (a[0] + a[1] + a[2]) / 3;
    if (d < 18 && luz > 215) return { id: 'ninguna' };
  }
  if (p.oscuro && !p.sombrasDuras && F) {
    const id = SATEN_DE_MARCA[marcaMasCercana(F, 'fondo')] || 'saten-noche', base = escenaDeId(id);
    return completarEscena({ ...base, fondo: { ...base.fondo, color: F }, superficie: { ...base.superficie, color: S || F }, luz: { ...base.luz, esquema: 'clave-baja' } });
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

// El esquema de luz: el que dijo la IA; si no, por la imagen (oscura → clave baja; fondo claro con cajas oscuras → contraluz)
function esquemaDe(ia, escena, paleta) {
  if (ia?.luz_esquema && Object.hasOwn(ESQUEMAS_LUZ, ia.luz_esquema)) return ia.luz_esquema;
  if (escena?.luz?.esquema && escena.luz.esquema !== 'ventana') return escena.luz.esquema;
  const oscuro = esObj(paleta) ? !!paleta.oscuro : claridad(escena?.fondo?.color) < 0.4;
  if (oscuro) return 'clave-baja';
  if (ia?.utileria?.tipo === 'pila-cajas' && claridad(escena?.fondo?.color) >= 0.6) return 'contraluz';
  return escena?.luz?.esquema || 'ventana';
}

/**
 * La escena del plan con todo lo de v4 (satén, esquema de luz, flotar, par, estuche o caja, elementos) y sus muestras de color.
 * modo 'marca': cada color pasa al de la marca que hace su papel (marcaMasCercana); 'video': los colores tal como se vieron.
 * → { escena (config para estudio.ponerEscena) | null, muestras: [{ rol, nombre, original, hex, marca }] }
 */
function escenaDelPlan(ia, paleta, modo = 'video') {
  let escena = ia ? configEscenaIA(ia) : null;
  if (!escena) escena = escenaLocal(paleta);
  if (!escena || escena.id === 'ninguna') return { escena, muestras: [] };
  const u = ia && esObj(ia.utileria) && Object.hasOwn(TIPOS_UTILERIA, ia.utileria.tipo) && ia.utileria.tipo !== 'ninguna' ? ia.utileria : null;
  const elementos = ia && Array.isArray(ia.elementos) ? ia.elementos.filter(x => esObj(x) && Object.hasOwn(ELEMENTOS_IA, x.tipo)) : [];
  const hayCinta = !!u?.cinta || u?.tipo === 'caja-regalo' || elementos.some(x => x.tipo === 'cinta');
  // los colores del video (o los de un estuche de la marca si la IA no dijo el suyo)
  const orig = { fondo: escena.fondo.color, superficie: escena.superficie.color, caja: u ? hex6(u.color) : null, cinta: hayCinta ? hex6(u?.cinta) : null };
  const marca = modo === 'marca';
  const elegir = rol => {
    const o = orig[rol];
    if (marca || !o) { const id = o ? marcaMasCercana(o, rol) : rol === 'caja' ? 'tinta' : rol === 'cinta' ? 'oro' : 'perla'; return { hex: COLORES_MARCA[id].hex, marca: id }; }
    return { hex: o, marca: idMarca(o) };
  };
  const roles = ['fondo', 'superficie', ...(u ? ['caja'] : []), ...(hayCinta ? ['cinta'] : [])];
  const muestras = roles.map(rol => ({ rol, nombre: NOMBRE_ROL[rol], original: orig[rol], ...elegir(rol) }));
  // una cinta del mismo color que su caja no se ve: en la marca va en oro (o perla sobre una caja dorada)
  const mc = muestras.find(m => m.rol === 'caja'), mt = muestras.find(m => m.rol === 'cinta');
  if (marca && mc && mt && mc.marca === mt.marca) { mt.marca = mc.marca === 'oro' ? 'perla' : 'oro'; mt.hex = COLORES_MARCA[mt.marca].hex; }
  const col = Object.fromEntries(muestras.map(m => [m.rol, m.hex]));
  // satén: con los colores de la marca, el de su tono (un fondo esmeralda va en «Satén esmeralda»)
  const tela = esTela(escena);
  if (tela) {
    const id = marca ? SATEN_DE_MARCA[marcaMasCercana(orig.fondo, 'fondo')] || 'saten-noche' : (Object.hasOwn(ESCENAS_SATEN, escena.preset || escena.id) ? escena.preset || escena.id : SATEN_DE_MARCA[marcaMasCercana(orig.fondo, 'fondo')] || 'saten-noche');
    const base = escenaDeId(id), l = escena.luz;
    escena = { ...base, luz: { ...base.luz, angulo: l.angulo, elevacion: l.elevacion, calidez: Math.max(l.calidez, 0.2) } };
  }
  const esquema = esquemaDe(ia, escena, paleta);
  const flota = !!ia?.flotando, debajo = u?.posicion === 'al-lado' && flota;
  const cfg = {
    ...escena,
    superficie: { ...escena.superficie, color: tela ? col.fondo : col.superficie },
    fondo: { ...escena.fondo, color: col.fondo, ...(ia?.destellos ? { destellos: 0.35, degradado: Math.max(num(escena.fondo.degradado, 0), 0.45) } : {}) },
    luz: { ...escena.luz, esquema },
  };
  if (ia) {
    // la IA dice si flota (en r2 el par descansa sobre el satén, aunque el satén de la lista flote por defecto)
    if (flota || tela) cfg.flotar = { activo: flota, altura: debajo ? 1.5 : 0.35, bob: flota ? 0.25 : 0 };
    if (ia.par) cfg.par = { activo: true, separacion: 0.6 };
    if (u) {
      const abre = !!ia.abre_estuche?.abre;
      cfg.utileria = {
        tipo: u.tipo, color: col.caja, cinta: col.cinta || COLORES_MARCA.oro.hex, interior: claridad(col.caja) < 0.5 ? COLORES_MARCA.perla.hex : COLORES_MARCA.tinta.hex,
        material: u.tipo === 'caja-regalo' || u.tipo === 'pila-cajas' ? 'papel' : 'cuero', posicion: u.posicion || 'asiento', logo: true,
        apertura: abre ? 1 : u.tipo === 'caja-regalo' && u.posicion !== 'asiento' ? 0 : 1, ...(debajo ? { tamano: 0.8 } : {}),
      };
    }
    if (elementos.length) {
      cfg.elementos = elementos.map((x, i) => grupoElemento(x.tipo, { coreografia: x.coreografia, recorrido: x.recorrido, id: `el-${i + 1}`, color: x.tipo === 'cinta' ? col.cinta : null })).filter(Boolean);
    }
  }
  return { escena: completarEscena(cfg), muestras };
}

/**
 * La escena con otros colores en sus partes (lo que la joyera cambia en las muestras antes de aplicar).
 * cambios: { fondo, superficie, caja, cinta } en #RRGGBB (los que falten no cambian). En satén, la tela es fondo y piso.
 */
export function recolorearEscena(escena, cambios = {}) {
  if (!esObj(escena) || escena.id === 'ninguna') return escena;
  const c = Object.fromEntries(Object.entries(esObj(cambios) ? cambios : {}).map(([k, v]) => [k, hex6(v)]).filter(([, v]) => v));
  const e = JSON.parse(JSON.stringify(escena)), tela = esTela(e);
  if (c.fondo) { e.fondo.color = c.fondo; if (tela && !c.superficie) e.superficie.color = c.fondo; }
  if (c.superficie) e.superficie.color = c.superficie;
  if (esObj(e.utileria) && e.utileria.tipo !== 'ninguna') {
    if (c.caja) { e.utileria.color = c.caja; e.utileria.interior = claridad(c.caja) < 0.5 ? COLORES_MARCA.perla.hex : COLORES_MARCA.tinta.hex; }
    if (c.cinta) e.utileria.cinta = c.cinta;
  }
  if (c.cinta && Array.isArray(e.elementos)) for (const g of e.elementos) if (g?.forma === 'cinta') g.color = c.cinta;
  return completarEscena(e);
}

// Lo que va en la escena, en palabras (para el panel y el resumen): «Satén de noche · clave baja · flota · en par · Caja de regalo»
export function describirPuesta(escena) {
  if (!esObj(escena) || escena.id === 'ninguna') return [];
  const out = [];
  if (escena.luz?.esquema && escena.luz.esquema !== 'ventana') out.push(ESQUEMAS_LUZ[escena.luz.esquema].replace(/\s*\(.*\)$/, ''));
  if (escena.fondo?.forma === 'tela') out.push('Tela de satén');
  if (escena.flotar?.activo) out.push('La joya flota');
  if (escena.par?.activo) out.push('En par');
  if (escena.utileria?.tipo && escena.utileria.tipo !== 'ninguna') out.push(TIPOS_UTILERIA[escena.utileria.tipo]);
  for (const g of Array.isArray(escena.elementos) ? escena.elementos : []) {
    const n = g.forma === 'cinta' ? `Cinta de satén${g.recorrido === 'corazon' ? ' en corazón' : ''}` : g.forma === 'cadena' ? 'Cadena' : g.material === 'cristal' ? 'Esfera de cristal'
      : { esfera: 'Esferas', perla: 'Perlas', cuenta: 'Cuentas' }[g.forma] || null;
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
export const nombreDeEscena = e => (!esObj(e) ? null : e.id === 'ninguna' ? ESCENAS.ninguna.nombre : nombreEscena(e.preset) || nombreEscena(e.id === 'personalizada' ? e.base : e.id));

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
  const mov = principal ? principal.descripcion.replace(/[.\s]+$/, '').toLowerCase() : 'plano quieto';
  let s = `Video de ${decimal(D)} s con ${n === 1 ? 'un solo plano' : `${n} planos`}${deCortes.length ? ` (${deCortes.join(', ')})` : ''}.`;
  s += ` El movimiento principal: ${mov}.`;
  if (escena) s += escena.id === 'ninguna' ? ' Fondo liso, como el de la marca.' : ` Escena parecida: «${nombreDeEscena(escena) || 'personalizada'}».`;
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
 * Aplica el plan al proyecto (lo muta). opciones: { movimientos, cortes, escena, textos, sonidos, musica, duracion (true = la del
 * video; false = se queda la del proyecto y el plan se ajusta a ella), formato, textosDesdeAcciones }.
 * La escena (plan.escena) y los materiales (plan.materiales) no viven en el proyecto: los pone main.js. Con escena, aquí van sus
 * pistas (apertura del estuche, elevar, luz).
 * → { duracion, movimientos, cortes, escena, textos, sonidos, musica, algo }
 */
export function aplicarReplica(proyecto, plan, { movimientos = true, cortes = true, escena = true, textos = false, sonidos = false, musica = false, duracion = true, formato = 'reel', textosDesdeAcciones: convertir = textosDesdeAcciones } = {}) {
  const hecho = { duracion: false, movimientos: false, cortes: false, escena: false, textos: false, sonidos: false, musica: false, algo: false };
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
      if (PISTAS_DE_ESCENA.includes(id)) { pistas[id] = proyecto.pistas?.[id] || []; continue; }   // van con la escena (abajo)
      const nuevas = Array.isArray(P.pistas[id]) ? P.pistas[id] : [];
      // exposición y desenfoque: se respetan los que había si el plan no trae
      pistas[id] = nuevas.length || PISTAS_CAMARA.includes(id) ? nuevas.filter(c => c.t <= D + 1e-6).map(c => ({ t: r4(Math.min(c.t, D)), v: c.v, curva: c.curva })) : (proyecto.pistas?.[id] || []);
    }
    proyecto.pistas = pistas;
    proyecto.bucle = false;
    hecho.movimientos = true;
  }
  // la apertura del estuche, elevar la joya y el giro de la luz son de la escena: van con ella (si proyecto.js ya las tiene)
  if (escena) {
    proyecto.pistas = esObj(proyecto.pistas) ? proyecto.pistas : {};
    for (const id of PISTAS_DE_ESCENA) {
      if (!PISTAS[id]) continue;
      const nuevas = Array.isArray(P.pistas[id]) ? P.pistas[id] : [];
      proyecto.pistas[id] = nuevas.filter(c => c.t <= D + 1e-6).map(c => ({ t: r4(Math.min(c.t, D)), v: c.v, curva: c.curva }));
      if (nuevas.length) hecho.escena = true;
    }
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

export { ENCUADRES, TIPOS_JOYA, NOMBRE_TRANSICION, COLORES_MARCA };
