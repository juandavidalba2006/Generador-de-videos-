// Asistente sin conexión: entiende pedidos sencillos en español («gira 2 vueltas y acércate a la piedra») y los convierte
// en las mismas acciones que devuelve la IA (keyframes, cortes, escena, textos, sonidos y música). Aquí también se validan y se aplican
// esas acciones al proyecto. Es puro (sin DOM): lo usan el chat, la función de Vercel (api/chat.js) y las pruebas en Node.
import { PISTAS, CURVAS, MOVIMIENTOS, TRANSICIONES, evaluar, escalarTiempo, normalizarCortes, separarPlanos, unirPlanos, TOLERANCIA, DURACION_MIN, DURACION_MAX } from './proyecto.js';
import { ESCENAS, FORMAS_SUPERFICIE, FORMAS_FONDO, MATERIALES_ESCENA, GOBOS, RANGOS, ESCENA_INICIAL, escenaDe, normalizarEscena } from './escenas.js';
import { COLORES_MARCA, ESQUEMAS_LUZ, TIPOS_UTILERIA, POSICIONES_UTILERIA, ELEMENTOS_IA, COREOGRAFIAS_IDS, RECORRIDOS_CINTA_IDS, FORMAS_FONDO_V4, esEscenaConocida, escenaDeId, completarEscena, grupoElemento, nombreEscena as nombreEscenaLista } from './escena-marca.js';

// ---------- Catálogos ----------
// Copias de los ids de sonido.js y textos.js: esos módulos usan Web Audio y el DOM, y este tiene que correr en Node.
// d = duración del efecto (s) y ancla = fracción donde está el golpe, para que el golpe caiga justo en el movimiento.
const EFECTOS_INFO = {
  whoosh:           { nombre: 'whoosh',           d: 1,    ancla: 0.55 },
  whooshCorto:      { nombre: 'whoosh corto',     d: 0.45, ancla: 0.45 },
  whooshInverso:    { nombre: 'whoosh inverso',   d: 1.1,  ancla: 0.97 },
  riser:            { nombre: 'subida (riser)',   d: 2.6,  ancla: 1 },
  impacto:          { nombre: 'impacto',          d: 2.2,  ancla: 0 },
  drop808:          { nombre: 'drop 808',         d: 2.2,  ancla: 0 },
  brillo:           { nombre: 'brillo',           d: 1.6,  ancla: 0 },
  campana:          { nombre: 'ding',             d: 1.6,  ancla: 0 },
  pop:              { nombre: 'pop',              d: 0.2,  ancla: 0 },
  obturador:        { nombre: 'foto (obturador)', d: 0.35, ancla: 0 },
  click:            { nombre: 'clic',             d: 0.08, ancla: 0 },
  glitch:           { nombre: 'glitch',           d: 0.7,  ancla: 0 },
  cajaRegistradora: { nombre: 'cha-ching',        d: 1.4,  ancla: 0.08 },
  latido:           { nombre: 'latido',           d: 0.9,  ancla: 0 },
  swipe:            { nombre: 'swipe',            d: 0.32, ancla: 0.4 },
  reverseCymbal:    { nombre: 'platillo inverso', d: 2,    ancla: 1 },
};
const MUSICA_INFO = {
  lujo: { nombre: 'Lujo', bpm: 76 }, lofi: { nombre: 'Lo-fi', bpm: 82 }, trap: { nombre: 'Trap', bpm: 140 }, house: { nombre: 'House', bpm: 122 },
  phonk: { nombre: 'Phonk', bpm: 130 }, popViral: { nombre: 'Pop viral', bpm: 116 }, cinematico: { nombre: 'Cinemático', bpm: 90 },
};
// estilo de texto → fuente, tamaño y peso (los mismos presets de textos.js, por si main.js no pasa textosDesdeAcciones)
const ESTILOS_TEXTO = {
  titulo: ['serif', 76, 500, 0.044, 'auto'], subtitulo: ['sans-mayus', 24, 500, 0.3, 'oro'], detalle: ['sans-mayus', 21, 500, 0.16, 'auto'],
  precio: ['serif', 40, 500, 0, 'auto'], pie: ['sans', 19, 400, 0.06, 'auto'], gancho: ['sans', 64, 600, -0.01, 'auto'], libre: ['serif-italica', 46, 400, 0, 'auto'],
};
// Tamaños de los formatos (los de composicion.js) y alto aproximado de cada capa en el cuadro, en fracciones del alto: [arriba, abajo].
// Son las mismas cuentas de textos.js (ascendente 0,78 del tamaño, una línea cada 1,18, filete dorado o pastilla; la marca es un
// bloque de ~149 px que empieza en su y), para que un texto nuevo no se monte sobre otro aunque aquí no haya lienzo.
const MEDIDAS_FORMATO = { reel: [1080, 1920], post: [1080, 1350], cuadrado: [1080, 1080], catalogo: [1920, 1080] };
function cajaVertical(c, W, H) {
  const u = Math.min(W, H) / 1080, y = (esNum(+c.y) ? +c.y : 0.5) * H;
  if (c.tipo === 'marca') return [y / H, (y + 149 * (esNum(c.tam) ? c.tam : 34) / 34 * u) / H];
  const [fuente, tamEstilo] = ESTILOS_TEXTO[c.estilo] || ESTILOS_TEXTO.libre;
  const lineas = String(c.texto ?? '').split('\n');
  const tamBase = esNum(c.tam) ? c.tam : c.estilo === 'titulo' && H / W <= 1.5 ? 64 : tamEstilo;
  let tam = tamBase * u;
  // un texto largo se achica para caber a lo ancho (no se parte en más líneas)
  const ancho = Math.max(1, ...lineas.map(l => [...l].length)) * tam * 0.56;
  const max = (esNum(c.ancho) ? c.ancho : W > H ? (c.estilo === 'titulo' ? 0.34 : 0.42) : 0.86) * W;
  if (ancho > max) tam = Math.max(tam * 0.32, tam * max / ancho);
  const mayus = (c.fuente || fuente) === 'sans-mayus', fondo = c.fondo || (c.estilo === 'titulo' ? 'linea-oro' : c.estilo === 'precio' ? 'pastilla' : 'ninguno');
  const ultima = y + (lineas.length - 1) * tam * 1.18;
  let a = y - tam * 0.78, b = ultima + tam * (mayus ? 0.08 : 0.22);
  if (fondo === 'pastilla') { const py = Math.max(6 * u, tam * 0.3); a -= py; b += py; }
  else if (fondo === 'linea-oro') b = Math.max(b, ultima + (30 * limitar(tamBase / 76, 0.55, 1.5) + 1.5) * u);
  return [a / H, b / H];
}

const MAX_TEXTO_CAPA = 140;   // el mismo límite del panel de textos (un texto más corto ya no se reconoce como la misma capa)

export const EFECTOS_IDS = Object.keys(EFECTOS_INFO);
export const ESTILOS_MUSICA_IDS = Object.keys(MUSICA_INFO);
export const ESTILOS_TEXTO_IDS = Object.keys(ESTILOS_TEXTO);
export const ANIMACIONES_IDS = ['aparecer', 'subir', 'maquina', 'zoom', 'brillo', 'deslizar', 'ninguna'];
export const PISTAS_IDS = Object.keys(PISTAS);
// pistas de la escena (v4): un movimiento de cámara no las borra
const PISTAS_DE_ESCENA = ['apertura', 'elevar', 'luz'];
export const CURVAS_IDS = Object.keys(CURVAS);
export const TRANSICIONES_IDS = Object.keys(TRANSICIONES);
export const ESCENAS_IDS = Object.keys(ESCENAS);

const r4 = x => Math.round(x * 1e4) / 1e4;
const r2 = x => Math.round(x * 100) / 100;
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const de = (obj, k, def) => (typeof k === 'string' && Object.hasOwn(obj, k) ? k : def);
const numero = (x, def) => (esNum(x) ? x : esNum(+x) && x !== '' && x !== null && typeof x !== 'boolean' ? +x : def);
const seg = n => `${String(r2(Math.round(n * 10) / 10)).replace('.', ',')} s`;   // 2.5 → "2,5 s" (coma decimal, como en Colombia)

// ---------- Acciones: forma común de la IA y del intérprete ----------
export function accionesVacias(respuesta = '') {
  return {
    respuesta, duracion: 0, bucle: 'igual', pistas: [],
    textos: { cambiar: false, capas: [] }, sonidos: { cambiar: false, clips: [] }, musica: { cambiar: false, estilo: 'ninguna', volumen: 0 },
    cortes: { cambiar: false, lista: [] },             // lista COMPLETA de cortes { t, transicion }
    escena: { cambiar: false, id: 'actual', cambios: null },   // id: una escena lista, 'ninguna' o 'actual'; cambios: lo que se toca encima
  };
}

export const hayCambios = a => !!a && (a.duracion > 0 || (a.bucle && a.bucle !== 'igual') || a.pistas?.length > 0 || !!a.textos?.cambiar || !!a.sonidos?.cambiar || !!a.musica?.cambiar || !!a.cortes?.cambiar || !!a.escena?.cambiar);

// Valida lo que llegue (de la IA o de cualquier lado): completa campos, recorta números a los rangos de PISTAS,
// descarta pistas, efectos o estilos desconocidos y ordena los keyframes. Nunca lanza.
export function normalizarAcciones(crudo, { duracion = 8 } = {}) {
  const a = esObj(crudo) ? crudo : {};
  const r = accionesVacias(typeof a.respuesta === 'string' ? a.respuesta.trim().slice(0, 1500) : '');
  const dur = numero(a.duracion, 0);
  r.duracion = dur > 0 ? r2(limitar(dur, DURACION_MIN, DURACION_MAX)) : 0;
  const D = r.duracion || limitar(numero(duracion, 8), DURACION_MIN, DURACION_MAX);
  r.bucle = ['si', 'no'].includes(a.bucle) ? a.bucle : a.bucle === true ? 'si' : a.bucle === false ? 'no' : 'igual';
  // pistas: cada pista listada se reemplaza entera; si viene dos veces gana la última
  const pistas = new Map();
  for (const p of Array.isArray(a.pistas) ? a.pistas : []) {
    if (!esObj(p) || !Object.hasOwn(PISTAS, p.pista)) continue;
    const P = PISTAS[p.pista], claves = [];
    for (const c of Array.isArray(p.claves) ? p.claves : []) {
      if (!esObj(c)) continue;
      const t = numero(c.t, NaN), v = numero(c.v, NaN);
      if (!esNum(t) || !esNum(v) || t < -0.05 || t > D + 0.25) continue;   // un poco fuera se acepta (redondeos), muy fuera no
      const clave = { t: r4(limitar(t, 0, D)), v: r4(limitar(v, P.min, P.max)), curva: de(CURVAS, c.curva, 'suave') };
      const igual = claves.find(o => Math.abs(o.t - clave.t) < TOLERANCIA);
      if (igual) Object.assign(igual, clave); else claves.push(clave);
    }
    claves.sort((x, y) => x.t - y.t);
    pistas.set(p.pista, { pista: p.pista, claves: claves.slice(0, 60) });
  }
  r.pistas = [...pistas.values()];
  // textos: capas simples que main.js convierte en capas completas (textos.js)
  const tx = esObj(a.textos) ? a.textos : {};
  r.textos.cambiar = tx.cambiar === true;
  if (r.textos.cambiar) {
    r.textos.capas = (Array.isArray(tx.capas) ? tx.capas : []).filter(c => esObj(c) && typeof c.texto === 'string' && c.texto.trim()).slice(0, 10).map(c => {
      const entra = r2(limitar(numero(c.entra, 0), 0, Math.max(0, D - 0.2)));
      let sale = numero(c.sale, -1);
      sale = sale < 0 || sale >= D - 1e-3 || sale <= entra + 0.1 ? -1 : r2(sale);
      return { texto: c.texto.trim().slice(0, MAX_TEXTO_CAPA), estilo: de(ESTILOS_TEXTO, c.estilo, 'libre'), y: r4(limitar(numero(c.y, 0.5), 0.02, 0.98)), entra, sale, animacion: ANIMACIONES_IDS.includes(c.animacion) ? c.animacion : 'aparecer' };
    });
  }
  const so = esObj(a.sonidos) ? a.sonidos : {};
  r.sonidos.cambiar = so.cambiar === true;
  if (r.sonidos.cambiar) {
    r.sonidos.clips = (Array.isArray(so.clips) ? so.clips : []).filter(c => esObj(c) && Object.hasOwn(EFECTOS_INFO, c.efecto) && esNum(numero(c.t, NaN)) && numero(c.t, 0) < D)
      .slice(0, 24).map(c => ({ efecto: c.efecto, t: r4(limitar(numero(c.t, 0), 0, D)), volumen: r2(limitar(numero(c.volumen, 0.8), 0, 1.5)) }))
      .sort((x, y) => x.t - y.t);
  }
  const mu = esObj(a.musica) ? a.musica : {};
  // «actual» = la música que ya hay (también la canción que subió la joyera): solo cambia el volumen
  const estilo = mu.estilo === 'ninguna' || mu.estilo === 'actual' ? mu.estilo : de(MUSICA_INFO, mu.estilo, null);
  if (mu.cambiar === true && estilo) {
    const vol = numero(mu.volumen, 0);
    r.musica = { cambiar: true, estilo, volumen: estilo === 'ninguna' ? 0 : r2(vol > 0 ? limitar(vol, 0.05, 1) : 0.55) };
  }
  const co = esObj(a.cortes) ? a.cortes : {};
  if (co.cambiar === true) {
    r.cortes = { cambiar: true, lista: normalizarCortes((Array.isArray(co.lista) ? co.lista : []).map(c => (esObj(c) ? { t: numero(c.t, NaN), transicion: c.transicion } : numero(c, NaN))), D) };
  }
  const es = esObj(a.escena) ? a.escena : {};
  const idEscena = es.id === 'actual' || es.id === 'personalizada' ? 'actual' : esEscenaConocida(es.id) ? es.id : null;
  if (es.cambiar === true && idEscena) r.escena = { cambiar: true, id: idEscena, cambios: idEscena === 'ninguna' ? null : cambiosEscena(es) };
  return r;
}

// Los cambios de una escena, validados: acepta la forma del intérprete ({ cambios: { superficie: {material}, luz: {angulo} } })
// y la de la IA (cada grupo con su «cambiar»: si es true trae TODOS sus campos; si es false, se ignora). Nunca lanza.
function cambiosEscena(es) {
  const fuente = esObj(es.cambios) ? es.cambios : es, out = {};
  const grupo = (g, campos) => {
    const o = esObj(fuente[g]) ? fuente[g] : null;
    if (!o || o.cambiar === false) return;
    const r = {};
    for (const [k, tipo] of Object.entries(campos)) {
      const v = o[k];
      if (tipo === 'num') { const x = numero(v, NaN); if (esNum(x)) r[k] = r4(limitar(x, RANGOS[k].min, RANGOS[k].max)); }
      else if (tipo === 'n01') { const x = numero(v, NaN); if (esNum(x) && x >= 0) r[k] = r2(limitar(x, 0, 1)); }
      else if (tipo === 'color') { if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())) r[k] = v.trim().toUpperCase(); }
      else if (typeof v === 'string' && Object.hasOwn(tipo, v)) r[k] = v;
    }
    if (Object.keys(r).length) out[g] = r;
  };
  grupo('superficie', { forma: FORMAS_SUPERFICIE, material: MATERIALES_ESCENA, color: 'color', tamano: 'num', altura: 'num' });
  grupo('fondo', { forma: FORMAS_FONDO_V4, material: MATERIALES_ESCENA, color: 'color', distancia: 'num', ondas: 'n01', degradado: 'n01', destellos: 'n01' });
  grupo('luz', { gobo: GOBOS, angulo: 'num', elevacion: 'num', suavidad: 'num', intensidad: 'num', calidez: 'num', esquema: ESQUEMAS_LUZ });
  const amb = numero(fuente.ambiente, NaN);   // -1 = sin cambio (así lo manda la IA)
  if (esNum(amb) && amb >= 0) out.ambiente = r4(limitar(amb, RANGOS.ambiente.min, RANGOS.ambiente.max));
  // v4: flotar, par, estuche o caja y elementos (la IA manda cada grupo con su «cambiar»)
  const g = k => (esObj(fuente[k]) && fuente[k].cambiar !== false ? fuente[k] : null);
  const si = v => (typeof v === 'boolean' ? v : null);
  const fl = g('flotar');
  if (fl && si(fl.activo) !== null) out.flotar = { activo: fl.activo, ...(esNum(numero(fl.altura, NaN)) && numero(fl.altura, 0) > 0 ? { altura: r2(limitar(numero(fl.altura, 0), 0, 1.5)) } : {}) };
  const pa = g('par');
  if (pa && si(pa.activo) !== null) out.par = { activo: pa.activo, ...(esNum(numero(pa.separacion, NaN)) && numero(pa.separacion, 0) > 0 ? { separacion: r2(limitar(numero(pa.separacion, 0), 0.2, 2)) } : {}) };
  const ut = g('utileria');
  if (ut && typeof ut.tipo === 'string' && Object.hasOwn(TIPOS_UTILERIA, ut.tipo)) {
    const u = { tipo: ut.tipo };
    if (ut.tipo !== 'ninguna') {
      for (const c of ['color', 'cinta', 'interior']) if (typeof ut[c] === 'string' && /^#[0-9a-f]{6}$/i.test(ut[c].trim())) u[c] = ut[c].trim().toUpperCase();
      if (POSICIONES_UTILERIA.includes(ut.posicion)) u.posicion = ut.posicion;
      const ap = numero(ut.apertura, NaN); if (esNum(ap) && ap >= 0) u.apertura = r2(limitar(ap, 0, 1));
    }
    out.utileria = u;
  }
  const el = g('elementos');
  if (el) {
    const modo = ['agregar', 'reemplazar', 'quitar'].includes(el.modo) ? el.modo : 'agregar';
    const lista = (Array.isArray(el.lista) ? el.lista : []).slice(0, 8).map(grupoDeAccion).filter(Boolean);
    if (lista.length || modo !== 'agregar') out.elementos = { modo, lista };
  }
  return Object.keys(out).length ? out : null;
}
// Un grupo de elementos de una acción: del tipo que dice la IA («perlas» con su coreografía) o ya armado por el intérprete
const FORMAS_GRUPO = ['esfera', 'perla', 'cuenta', 'cubo', 'cilindro', 'aro', 'gema', 'regalo', 'cinta', 'cadena'];
function grupoDeAccion(x) {
  if (!esObj(x)) return null;
  const cor = COREOGRAFIAS_IDS.includes(x.coreografia) ? x.coreografia : undefined, rec = RECORRIDOS_CINTA_IDS.includes(x.recorrido) ? x.recorrido : undefined;
  let gr = null;
  if (typeof x.tipo === 'string' && Object.hasOwn(ELEMENTOS_IA, x.tipo)) gr = grupoElemento(x.tipo, { coreografia: cor, recorrido: rec });
  else if (FORMAS_GRUPO.includes(x.forma)) {
    gr = { forma: x.forma };
    for (const [c, v] of Object.entries(x)) if (c !== 'forma' && /^[a-z0-9]{1,16}$/i.test(c) && (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40) || esNum(v))) gr[c] = v;
    if (cor) gr.coreografia = cor; else delete gr.coreografia;
    if (gr.forma === 'cinta') gr.recorrido = rec || 'corazon'; else delete gr.recorrido;
  }
  if (!gr) return null;
  const n = numero(x.cantidad, NaN); if (esNum(n) && n >= 1) gr.cantidad = Math.round(limitar(n, 1, 48));
  return gr;
}

// La escena lista que mejor va con unos cambios, para cuando no hay una escena 3D puesta («en mármol» → Mármol blanco)
function escenaPara(cambios) {
  const c = esObj(cambios) ? cambios : {}, lista = Object.entries(ESCENAS).filter(([, e]) => !e.ninguna);
  const con = fn => lista.find(([, e]) => fn(e))?.[0];
  return (c.superficie?.material && con(e => e.superficie.material === c.superficie.material))
    || (c.luz?.gobo && con(e => e.luz.gobo === c.luz.gobo))
    || (c.fondo?.forma === 'arco' && 'arco') || (c.superficie?.forma && c.superficie.forma !== 'cilindro' && con(e => e.superficie.forma === c.superficie.forma))
    || ESCENA_INICIAL;
}

// La configuración de escena que resulta de una acción (la que main.js le pasa a estudio.ponerEscena), partiendo de la que
// hay ahora (actual: configuración, id o null). 'actual' sin una escena 3D puesta parte de la escena lista que mejor va.
export function escenaDesdeAccion(accion, actual) {
  const a = esObj(accion) ? accion : {};
  if (a.id === 'ninguna') return { id: 'ninguna' };
  const act = typeof actual === 'string' ? { id: actual } : esObj(actual) ? actual : null;
  const c = esObj(a.cambios) ? a.cambios : {};
  let base;
  const ahora = act && act.id !== 'ninguna' && (Object.hasOwn(ESCENAS, act.id) || act.id === 'personalizada') ? completarEscena(act) : null;
  if (a.id && a.id !== 'actual' && esEscenaConocida(a.id)) base = escenaDeId(a.id);
  else if (ahora) base = ahora;
  else base = completarEscena(escenaDe(escenaPara(c)));
  const idBase = base.id === 'personalizada' ? base.base : base.id;
  // lo que acompaña a la joya (estuche, elementos, par) sigue aunque cambie el fondo; flotar lo trae la escena nueva
  const deAhora = k => (base !== ahora && ahora && ahora[k] !== undefined ? ahora[k] : base[k]);
  const utileria = c.utileria ? (c.utileria.tipo === 'ninguna' ? { tipo: 'ninguna' } : { ...(deAhora('utileria')?.tipo === c.utileria.tipo ? deAhora('utileria') : {}), ...c.utileria }) : deAhora('utileria');
  return completarEscena({
    id: idBase, ...(base.preset ? { preset: base.preset } : {}),
    superficie: { ...base.superficie, ...(c.superficie || {}) }, fondo: { ...base.fondo, ...(c.fondo || {}) },
    luz: { ...base.luz, ...(c.luz || {}) }, ambiente: esNum(c.ambiente) ? c.ambiente : base.ambiente,
    flotar: { ...(base.flotar || {}), ...(c.flotar || {}) }, par: { ...(deAhora('par') || {}), ...(c.par || {}) },
    ...(utileria ? { utileria } : {}), elementos: mezclarElementos(deAhora('elementos'), c.elementos),
  });
}
// Elementos de la escena con los de la acción: agregar (uno de la misma forma se reemplaza), reemplazar o quitar
function mezclarElementos(actuales, cambio) {
  const hay = Array.isArray(actuales) ? actuales.filter(esObj) : [];
  if (!esObj(cambio)) return hay;
  const lista = Array.isArray(cambio.lista) ? cambio.lista.filter(esObj) : [];
  const igual = (x, y) => x.forma === y.forma && (x.material === 'cristal') === (y.material === 'cristal');
  let out = cambio.modo === 'reemplazar' ? [] : cambio.modo === 'quitar' ? (lista.length ? hay.filter(g => !lista.some(n => igual(g, n))) : []) : hay.filter(g => !lista.some(n => igual(g, n)));
  if (cambio.modo !== 'quitar') {
    const ids = new Set(out.map(g => g.id));
    for (const n of lista) { let i = 1; while (ids.has(`el-${i}`)) i++; const g = { ...n, id: n.id && !ids.has(n.id) ? n.id : `el-${i}` }; ids.add(g.id); out.push(g); }
  }
  return out.slice(0, 8);
}

// Nombre corto de lo que cambia en la escena (para los chips y las respuestas)
function nombreEscena(e) {
  if (!e?.cambiar) return '';
  if (e.id === 'ninguna') return 'Fondo liso';
  const c = e.cambios || {};
  if (!e.cambios && esEscenaConocida(e.id)) return nombreEscenaLista(e.id);
  if (e.id !== 'actual' && /^saten-/.test(e.id)) return nombreEscenaLista(e.id);
  if (c.superficie?.material) return MATERIALES_ESCENA[c.superficie.material];
  if (c.superficie?.forma) return FORMAS_SUPERFICIE[c.superficie.forma];
  if (c.luz?.gobo) return GOBOS[c.luz.gobo];
  if (c.fondo?.color || c.fondo?.material || c.fondo?.forma || c.fondo?.distancia) return 'Fondo nuevo';
  if (c.superficie?.altura || c.superficie?.tamano) return 'Tamaño del pedestal';
  if (c.superficie?.color) return 'Color de la superficie';
  if (c.luz) return 'Luz de la escena';
  return ESCENAS[e.id]?.nombre || 'Escena ajustada';
}

// Etiquetas cortas de lo que cambió (para los chips bajo la respuesta del asistente)
export function resumenAcciones(acciones) {
  const a = acciones || accionesVacias(), out = [];
  if (a.pistas?.length) out.push('◆ ' + a.pistas.map(p => PISTAS[p.pista]?.nombre || p.pista).join(', '));
  if (a.duracion > 0) out.push(`⏱ ${seg(a.duracion)}`);
  if (a.bucle === 'si') out.push('∞ En bucle'); else if (a.bucle === 'no') out.push('→ Sin bucle');
  if (a.textos?.cambiar) out.push(a.textos.capas.length ? `Aa ${a.textos.capas.length} ${a.textos.capas.length === 1 ? 'texto' : 'textos'}` : 'Aa Sin textos');
  if (a.sonidos?.cambiar) out.push(a.sonidos.clips.length ? `♪ ${a.sonidos.clips.length} ${a.sonidos.clips.length === 1 ? 'sonido' : 'sonidos'}` : '♪ Sin efectos');
  if (a.musica?.cambiar) out.push(a.musica.estilo === 'ninguna' ? '♫ Sin música' : a.musica.estilo === 'actual' ? `♫ Volumen ${Math.round(a.musica.volumen * 100)} %` : `♫ ${MUSICA_INFO[a.musica.estilo]?.nombre || a.musica.estilo}`);
  if (a.cortes?.cambiar) { const n = a.cortes.lista?.length || 0; out.push(n ? `✂ ${n} ${n === 1 ? 'corte' : 'cortes'}` : '✂ Sin cortes'); }
  if (a.escena?.cambiar) {
    // lo de v4 va en sus propias etiquetas; la escena solo si cambió algo más (o un satén)
    const c = a.escena.cambios || {}, v4 = ['flotar', 'par', 'utileria', 'elementos'], soloV4 = a.escena.id === 'actual' && Object.keys(c).length && Object.keys(c).every(k => v4.includes(k) || (k === 'luz' && Object.keys(c.luz).every(x => x === 'esquema')));
    if (!soloV4) out.push(`◐ ${nombreEscena(a.escena)}`);
    if (c.luz?.esquema) out.push(`☼ ${ESQUEMAS_LUZ[c.luz.esquema].replace(/\s*\(.*\)$/, '')}`);
    if (c.utileria) out.push(c.utileria.tipo === 'ninguna' ? '▢ Sin estuche' : `▣ ${TIPOS_UTILERIA[c.utileria.tipo]}`);
    if (c.flotar) out.push(c.flotar.activo ? '↑ Flota' : '↓ Apoyada');
    if (c.par) out.push(c.par.activo ? '◎ En par' : '○ Una sola');
    if (c.elementos) out.push(c.elementos.modo === 'quitar' && !c.elementos.lista.length ? '✕ Sin elementos' : `● ${c.elementos.lista.map(g => (g.forma === 'cinta' ? 'Cinta' : g.forma === 'cadena' ? 'Cadena' : g.material === 'cristal' ? 'Cristal' : { perla: 'Perlas', esfera: 'Esferas', cuenta: 'Cuentas' }[g.forma] || 'Elemento')).join(', ')}`);
  }
  return out;
}

// ---------- Foto del proyecto al mandar un pedido ----------
// La IA tarda unos segundos y responde sobre el proyecto como estaba al mandarle el pedido. Con esta foto, lo que la joyera
// agregue o mueva mientras tanto (un texto, un sonido, la duración) no se pierde al llegar la respuesta.
export function fotoProyecto(proyecto) {
  const p = esObj(proyecto) ? proyecto : {};
  const copia = (lista, campos) => new Map((Array.isArray(lista) ? lista : []).filter(o => esObj(o) && o.id != null).map(o => [o.id, Object.fromEntries(campos.map(k => [k, o[k]]))]));
  return { duracion: esNum(p.duracion) && p.duracion > 0 ? p.duracion : 8, textos: copia(p.textos, ['texto', 'estilo', 'y', 'entra', 'sale', 'animacion']), clips: copia(p.audio?.clips, ['efecto', 't', 'volumen']) };
}
const por = (x, k) => (esNum(x) && x >= 0 ? r4(x * k) : x);   // un tiempo llevado a otra duración (-1 / null = hasta el final)
function escalarFoto(f, k) {
  const m = (mapa, fn) => new Map([...mapa].map(([id, o]) => [id, fn(o)]));
  return { ...f, textos: m(f.textos, o => ({ ...o, entra: por(o.entra, k), sale: por(o.sale, k) })), clips: m(f.clips, o => ({ ...o, t: por(o.t, k) })) };
}
function escalarAcciones(a, k) {
  for (const p of a.pistas) for (const c of p.claves) c.t = por(c.t, k);
  for (const c of a.textos.capas) { c.entra = por(c.entra, k); c.sale = por(c.sale, k); }
  for (const c of a.sonidos.clips) c.t = por(c.t, k);
  for (const c of a.cortes.lista) c.t = por(c.t, k);
}

// ---------- Aplicar acciones al proyecto (lo llama main.js; muta el proyecto) ----------
// textosDesdeAcciones (de textos.js) convierte las capas simples en capas completas; formato = 'reel' | 'post' | …
// musicaNueva (de sonido.js, opcional) arma la música por defecto de un estilo.
// foto (de fotoProyecto, opcional): el proyecto como estaba al mandar el pedido; sin ella, se compara con el de ahora.
// La escena no vive en el proyecto: si la acción la cambia, se le pasa la configuración final a alEscena(cfg, accion) (main.js
// la pone en el estudio). escenaActual: la escena de ahora (configuración, o una función que la devuelve). Sin alEscena, la
// escena no cambia.
export function aplicarAccionesAProyecto(proyecto, acciones, { textosDesdeAcciones, formato = 'reel', musicaNueva, foto, alEscena, escenaActual } = {}) {
  const hecho = { duracion: false, bucle: false, pistas: [], textos: false, sonidos: false, musica: false, cortes: false, escena: false, algo: false };
  if (!esObj(proyecto)) return hecho;
  const antes = esNum(proyecto.duracion) ? proyecto.duracion : 8;
  const base = esObj(foto) && esNum(foto.duracion) && foto.duracion > 0 ? foto.duracion : antes;
  const a = normalizarAcciones(acciones, { duracion: base });
  // primero la duración: estira todo lo que ya había; los tiempos nuevos ya vienen en la duración final
  if (a.duracion && Math.abs(a.duracion - antes) > 1e-3) { escalarTiempo(proyecto, a.duracion); hecho.duracion = true; }
  const D = proyecto.duracion || 8;
  // si ella cambió la duración mientras la IA pensaba, los tiempos de la respuesta (y de la foto) se llevan a la de ahora
  if (!a.duracion && Math.abs(D - base) > 1e-3) escalarAcciones(a, D / base);
  const f = esObj(foto) && foto.textos instanceof Map && foto.clips instanceof Map ? (Math.abs(D - base) > 1e-3 ? escalarFoto(foto, D / base) : foto) : null;
  if (a.bucle !== 'igual' && proyecto.bucle !== (a.bucle === 'si')) { proyecto.bucle = a.bucle === 'si'; hecho.bucle = true; }
  proyecto.pistas = esObj(proyecto.pistas) ? proyecto.pistas : {};
  for (const { pista, claves } of a.pistas) {
    proyecto.pistas[pista] = claves.filter(c => c.t <= D + 1e-6).map(c => ({ t: r4(Math.min(c.t, D)), v: c.v, curva: c.curva }));
    hecho.pistas.push(pista);
  }
  // (la IA manda la lista COMPLETA de textos y de sonidos: lo que se agregó después de la foto no estaba en ella y se conserva)
  const conservar = (previas, nuevas, enFoto) => [...nuevas, ...(f ? previas.filter(o => esObj(o) && !enFoto.has(o.id) && !nuevas.some(n => n.id === o.id)) : [])];
  if (a.textos.cambiar) {
    const previas = Array.isArray(proyecto.textos) ? [...proyecto.textos] : [];
    proyecto.textos = conservar(previas, mezclarTextos(previas, a.textos.capas, { textosDesdeAcciones, formato, foto: f }), f?.textos); hecho.textos = true;
  }
  proyecto.audio = esObj(proyecto.audio) ? proyecto.audio : { clips: [], musica: null };
  if (!Array.isArray(proyecto.audio.clips)) proyecto.audio.clips = [];
  if (a.sonidos.cambiar) { proyecto.audio.clips = conservar(proyecto.audio.clips, mezclarClips(proyecto.audio.clips, a.sonidos.clips.filter(c => c.t < D), f), f?.clips); hecho.sonidos = true; }
  if (a.musica.cambiar) {
    const m = esObj(proyecto.audio.musica) ? proyecto.audio.musica : null, { estilo, volumen } = a.musica;
    if (estilo === 'actual') { if (m) { m.volumen = volumen; hecho.musica = true; } }   // la que hay (la canción subida no se pierde)
    else {
      if (estilo === 'ninguna') proyecto.audio.musica = null;
      else if (m && m.estilo === estilo && !m.archivo) m.volumen = volumen;   // mismo estilo: solo el volumen (conserva su ritmo)
      else {
        const base = typeof musicaNueva === 'function' ? musicaNueva(estilo, m) : null;
        proyecto.audio.musica = esObj(base) ? { ...base, estilo, volumen }
          : { estilo, bpm: MUSICA_INFO[estilo].bpm, volumen, inicio: 0, fundidoSalida: esNum(m?.fundidoSalida) ? m.fundidoSalida : 1.5, archivo: null };
      }
      hecho.musica = true;
    }
  }
  if (a.cortes.cambiar) { proyecto.cortes = normalizarCortes(a.cortes.lista, D); hecho.cortes = true; }
  if (a.escena.cambiar && typeof alEscena === 'function') {
    const cfg = escenaDesdeAccion(a.escena, typeof escenaActual === 'function' ? escenaActual() : escenaActual);
    alEscena(cfg, a.escena);
    hecho.escena = true; hecho.escenaCfg = cfg;
  }
  hecho.algo = hecho.duracion || hecho.bucle || hecho.pistas.length > 0 || hecho.textos || hecho.sonidos || hecho.musica || hecho.cortes || hecho.escena;
  return hecho;
}

const mismoTexto = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// Las capas que siguen iguales se conservan tal cual (con su fuente, color y posición x); las nuevas se crean.
// Con la foto, una capa se reconoce también por cómo era al mandar el pedido, y solo cambia lo que el pedido cambió.
function mezclarTextos(actuales, simples, { textosDesdeAcciones, formato, foto }) {
  const lista = (Array.isArray(actuales) ? actuales : []).filter(esObj), usadas = new Set(), plan = [], nuevas = [];
  const era = c => foto?.textos.get(c.id) || c;
  const coincide = (o, s) => mismoTexto(o.texto, s.texto) && (o.estilo || 'libre') === s.estilo;
  for (const s of simples) {
    const igual = lista.find(c => c.tipo !== 'marca' && !usadas.has(c) && (coincide(c, s) || coincide(era(c), s)));
    if (igual) { usadas.add(igual); plan.push({ capa: igual, s }); } else { plan.push({ s }); nuevas.push(s); }
  }
  let creadas = typeof textosDesdeAcciones === 'function' ? textosDesdeAcciones(nuevas, { formato, capasActuales: lista }) : null;
  creadas = Array.isArray(creadas) ? creadas.filter(c => esObj(c) && c.tipo !== 'marca') : nuevas.map(capaBasica(lista));
  const marcas = lista.filter(c => c.tipo === 'marca');
  let i = 0;
  const resto = plan.map(({ capa, s }) => {
    if (!capa) return creadas[i++];
    const e = era(capa);
    if (Math.abs((e.y ?? 0.5) - s.y) > 0.002) capa.y = s.y;
    if (Math.abs((e.entra ?? 0) - s.entra) > 0.01) capa.entra = s.entra;
    const sale = s.sale < 0 ? null : s.sale;
    if ((e.sale ?? null) === null ? sale !== null : sale === null || Math.abs(e.sale - sale) > 0.01) capa.sale = sale;
    if (s.animacion && e.animacion !== s.animacion) capa.animacion = s.animacion;
    return capa;
  }).filter(Boolean);
  return [...marcas, ...resto];
}

// Capa completa mínima (solo si main.js no pasó textosDesdeAcciones)
const capaBasica = existentes => {
  let n = 0;
  for (const c of existentes) { const m = /^tx(\d+)$/.exec(c?.id || ''); if (m) n = Math.max(n, +m[1]); }
  return s => {
    const [fuente, tam, peso, espaciado, color] = ESTILOS_TEXTO[s.estilo] || ESTILOS_TEXTO.libre;
    return { id: 'tx' + (++n), tipo: 'texto', texto: s.texto, estilo: s.estilo, fuente, tam, peso, color, x: 0.5, y: s.y, alinear: 'centro', espaciado, entra: s.entra, sale: s.sale < 0 ? null : s.sale, animacion: s.animacion, dur: 0.9, fondo: s.estilo === 'titulo' ? 'linea-oro' : s.estilo === 'precio' ? 'pastilla' : 'ninguno', sombra: false, ancho: 0.86 };
  };
};

// Los sonidos que ya estaban (mismo efecto y momento) conservan su id y su tono. Con la foto, uno que ella movió mientras
// la IA pensaba se reconoce por donde estaba, y se queda donde lo dejó si el pedido no lo movió.
function mezclarClips(actuales, nuevos, foto) {
  const lista = (Array.isArray(actuales) ? actuales : []).filter(esObj), usados = new Set();
  let n = 0;
  for (const c of lista) { const m = /^au(\d+)$/.exec(c?.id || ''); if (m) n = Math.max(n, +m[1]); }
  const cerca = (o, c) => !!o && Math.abs((+o.t || 0) - c.t) < 0.02;
  return nuevos.map(c => {
    const igual = lista.find(o => !usados.has(o) && o.efecto === c.efecto && (cerca(o, c) || cerca(foto?.clips.get(o.id), c)));
    if (igual) {
      usados.add(igual);
      const e = foto?.clips.get(igual.id);
      return { ...igual, t: cerca(e, c) ? igual.t : c.t, volumen: e && Math.abs((+e.volumen || 0) - c.volumen) < 0.01 ? igual.volumen : c.volumen };
    }
    return { id: 'au' + (++n), efecto: c.efecto, t: c.t, volumen: c.volumen, tono: 0 };
  });
}

// ---------- Resumen del proyecto (contexto que el chat manda a la IA con cada mensaje) ----------
export function resumenProyecto(proyecto = {}, info = {}) {
  const p = esObj(proyecto) ? proyecto : {}, i = esObj(info) ? info : {};
  const D = esNum(p.duracion) ? p.duracion : 8;
  const pistas = {};
  for (const id of PISTAS_IDS) {
    const claves = p.pistas?.[id];
    if (Array.isArray(claves) && claves.length) pistas[id] = claves.filter(esObj).slice(0, 40).map(c => ({ t: r2(+c.t || 0), v: r2(+c.v || 0), curva: c.curva || 'suave' }));
  }
  const textos = (Array.isArray(p.textos) ? p.textos : []).filter(esObj).slice(0, 16).map(c => c.tipo === 'marca'
    ? { marca: true, y: r2(+c.y || 0), entra: r2(+c.entra || 0) }
    : { texto: String(c.texto ?? '').slice(0, MAX_TEXTO_CAPA), estilo: c.estilo || 'libre', y: r4(+c.y || 0), entra: r2(+c.entra || 0), sale: esNum(c.sale) ? r2(c.sale) : -1, animacion: c.animacion || 'aparecer', ...(c.oculta ? { oculta: true } : {}) });
  const m = esObj(p.audio?.musica) ? p.audio.musica : null;
  const medidas = Array.isArray(i.medidas) ? { x: i.medidas[0], y: i.medidas[1], z: i.medidas[2] } : esObj(i.medidas) ? i.medidas : null;
  return {
    duracion: D, bucle: p.bucle !== false, formato: typeof i.formato === 'string' ? i.formato : 'reel',
    pistas,
    textos,
    audio: {
      musica: m ? { estilo: m.archivo ? 'cancion-propia' : m.estilo || null, ...(m.archivo?.nombre ? { cancion: String(m.archivo.nombre).slice(0, 60) } : {}), bpm: esNum(m.bpm) ? r2(m.bpm) : null, volumen: esNum(m.volumen) ? r2(m.volumen) : 0.55 } : null,
      clips: (Array.isArray(p.audio?.clips) ? p.audio.clips : []).filter(esObj).slice(0, 30).map(c => ({ efecto: c.efecto, t: r2(+c.t || 0), volumen: r2(esNum(c.volumen) ? c.volumen : 0.8) })),
    },
    cortes: (Array.isArray(p.cortes) ? p.cortes : []).filter(c => esObj(c) && esNum(c.t)).slice(0, 60).map(c => ({ t: r2(c.t), transicion: Object.hasOwn(TRANSICIONES, c.transicion) ? c.transicion : 'seco' })),
    escena: i.escena === undefined || i.escena === null ? null : normalizarEscena(i.escena),
    modelo: {
      cargado: i.cargado !== false,
      medidasMm: medidas ? Object.fromEntries(['x', 'y', 'z'].map(k => [k, r2(+medidas[k] || 0)])) : null,
      tienePiedras: i.tienePiedras === undefined ? null : !!i.tienePiedras,
      metal: typeof i.metal === 'string' ? i.metal.slice(0, 40) : null,
      piedra: typeof i.piedra === 'string' ? i.piedra.slice(0, 40) : null,
      nombre: typeof i.nombre === 'string' ? i.nombre.slice(0, 60) : null,
    },
  };
}

// =====================================================================================================
// ---------- Intérprete por reglas ----------
// =====================================================================================================
export const AYUDA = 'Puedo mover la cámara, poner cortes, cambiar la escena y la duración, y poner textos, sonidos o música. Prueba con frases como: ' +
  '«gira 2 vueltas y termina enfocando la piedra», «empieza desde arriba y baja hasta quedar de frente», «acércate al diamante en 3 segundos», ' +
  '«pon un corte con flash a los 3 segundos», «pon la joya en un pedestal de mármol», «fondo con luz de ventana», ' +
  '«pon un whoosh al inicio», «música phonk», «dura 10 segundos» o «agrega el texto "Nueva colección" arriba».';

const PALABRAS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciocho: 18, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90, cien: 100 };
const COMPUESTOS = [[/\bciento\s+ochenta\b/g, '180'], [/\btrescientos\s+sesenta\b/g, '360'], [/\bsetecientos\s+veinte\b/g, '720'], [/\bdoscientos\s+setenta\b/g, '270'], [/\bcuarenta\s+y\s+cinco\b/g, '45'], [/\btreinta\s+y\s+(?:cinco|seis)\b/g, '35']];
const PAL = Object.keys(PALABRAS).join('|');
const ERRATAS = [[/\bbuelta(s?)\b/g, 'vuelta$1'], [/\bdiama[mn]?[mn]te(s?)\b/g, 'diamante$1'], [/\bdiamnte(s?)\b/g, 'diamante$1'], [/\bfr[ea]?nte\b/g, 'frente'],
  [/\ba[sc]er[ck](?=[aeo])/g, 'acerc'], [/\baserqu/g, 'acerqu'], [/\bpiedar(s?)\b/g, 'piedra$1'], [/\bpeidra(s?)\b/g, 'piedra$1'], [/\bgriar?\b/g, 'gira'], [/\bmusic(?=\s|$)/g, 'musica']];

// minúsculas, sin tildes, números escritos con palabras → cifras, fracciones de vuelta y de segundo
function normalizar(s) {
  let x = ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  // errores de ortografía frecuentes en las palabras clave (b/v, letras que se saltan o se cambian)
  for (const [re, v] of ERRATAS) x = x.replace(re, v);
  x = x.replace(/[¿¡"“”«»()]/g, ' ').replace(/[°º]/g, ' grados ').replace(/(\d),(\d)/g, '$1.$2');
  for (const [re, v] of COMPUESTOS) x = x.replace(re, v);
  x = x.replace(new RegExp(`\\b(${PAL})\\b(?=\\s+(?:vueltas?|segundos?|seg|grados?|giros?|cuartos?|veces|cortes?|planos?|tomas?)\\b)`, 'g'), (m, w) => PALABRAS[w]);
  x = x.replace(new RegExp(`\\b(segundo|los\\s+primeros|los\\s+ultimos)\\s+(${PAL})\\b`, 'g'), (m, a, w) => `${a} ${PALABRAS[w]}`);
  x = x.replace(/(\d)\s*(?:s|seg|segs|sg)\b\.?/g, '$1 segundos');
  x = x.replace(/\b(\d+(?:\.\d+)?)\s+vueltas?\s+y\s+media\b/g, (m, n) => `${+n + 0.5} vueltas`)
    .replace(/\bvuelta\s+y\s+media\b/g, '1.5 vueltas').replace(/\bmedia\s+vuelta\b/g, '0.5 vueltas')
    .replace(/\b3\s+cuartos\s+de\s+vuelta\b/g, '0.75 vueltas').replace(/\b(?:1\s+)?cuarto\s+de\s+vuelta\b/g, '0.25 vueltas')
    .replace(/\b(\d+(?:\.\d+)?)\s+segundos?\s+y\s+medio\b/g, (m, n) => `${+n + 0.5} segundos`)
    .replace(/\bsegundo\s+y\s+medio\b/g, '1.5 segundos').replace(/\bmedio\s+segundo\b/g, '0.5 segundos');
  return x.replace(/\s+/g, ' ');
}

// $ 4.800.000 con puntos de miles (como se escribe en Colombia)
function formatearPrecio(cifra, signo, moneda) {
  const mult = /mill|\bm$/i.test(cifra) ? 1e6 : /mil|k/i.test(cifra) ? 1e3 : 1;
  const limpia = cifra.replace(/[^\d.,]/g, '');
  const n = mult > 1 ? parseFloat(limpia.replace(',', '.')) : parseFloat(limpia.replace(/[.,](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  if (!esNum(n)) return null;
  const v = Math.round(n * mult), miles = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (/usd|d[oó]lar/i.test(moneda || '') ? 'US$ ' : '$ ') + miles;
}

const CORTES_TEXTO = '(?=\\s+(?:arriba|abajo|al\\s+centro|en\\s+el\\s+centro|en\\s+medio|en\\s+la\\s+parte|al\\s+inicio|al\\s+principio|al\\s+comienzo|al\\s+final|durante|los\\s+primeros|los\\s+[uú]ltimos|desde|hasta|en\\s+el\\s+segundo|al\\s+segundo|a\\s+los|con\\s+animaci[oó]n|con\\s+efecto|con\\s+brillo|que\\s+aparezca|que\\s+salga|y\\s+luego|y\\s+despu[eé]s|y\\s+al\\s+final)\\b|\\s*[\\n.;!?,]|\\s*$)';
const CLAVE_TEXTO = '(texto|t[ií]tulo|subt[ií]tulo|frase|letrero|mensaje|gancho|leyenda)';
// el texto en sí: una pregunta o exclamación completa («¿Te lo pondrías? 💍») o lo que haya hasta el siguiente corte
const TEXTO_LIBRE = '((?:[¿¡][^?!\\n§]{1,100}[?!](?:\\s*[\\p{Extended_Pictographic}\\u200d\\ufe0f]+)*)|[^\\n.;!?,§]+?)';

// Saca del texto original lo que no hay que pasar a minúsculas ni sin tildes: el precio y los textos que van en el video
function extraer(original) {
  const citas = []; let precio = null;
  let s = original.replace(/\r/g, '');
  s = s.replace(/\b(precio|vale|cuesta|valor)\b\s*(?:de|es|en|:|=)?\s*(?:de\s+)?(\$\s*)?(\d[\d.,]*(?:\s*(?:millones|mill[oó]n|mil|k|m)\b)?)\s*(cop|pesos|usd|d[oó]lares)?/gi, (m, _, signo, cifra, moneda) => {
    precio = formatearPrecio(cifra, signo, moneda); return precio ? ' §p§ ' : m;
  });
  const cita = t => { citas.push(t.trim().replace(/\s+/g, ' ')); return ` §${citas.length - 1}§ `; };
  // (entre comillas, hasta el largo que acepta el panel de textos: MAX_TEXTO_CAPA = 140)
  s = s.replace(/["“«]([^"“”«»\n]{1,140})["”»]/g, (m, t) => cita(t));
  s = s.replace(/(^|[\s(:])['‘]([^'‘’\n]{1,140})['’](?=$|[\s.,;:!?)])/g, (m, pre, t) => pre + cita(t));
  // sin comillas: «el texto que diga Nueva colección arriba» o «agrega el título Solitario Aurora abajo»
  // («texto arriba: ¿Para quién es? 💍»: el lugar se queda en la frase)
  s = s.replace(new RegExp(`\\b${CLAVE_TEXTO}(\\s+(?:arriba|abajo))?(\\s+que\\s+diga|\\s+que\\s+dice|\\s+diciendo|\\s*:)\\s*(?!\\s*§)${TEXTO_LIBRE}${CORTES_TEXTO}`, 'giu'), (m, clave, lugar, con, t) => `${clave}${lugar || ''} ${cita(t)}`);
  // (el verbo puede faltar si el mensaje empieza con «el texto …»; «pon arriba el texto …» también vale)
  s = s.replace(new RegExp(`(?:^\\s*|\\b(agrega|añade|anade|pon|ponle|escribe|coloca|mete|incluye)\\s+(?:(arriba|abajo)\\s+)?)(?:el|un|una|la)?\\s*${CLAVE_TEXTO}\\s+(?!(?:que|con|de|del|en|al|arriba|abajo|y|§)\\b)${TEXTO_LIBRE}${CORTES_TEXTO}`, 'giu'), (m, v, lugar, clave, t) => `${v || ''} ${lugar || ''} ${clave} ${cita(t)}`);
  // «… arriba y el título Anillo Luna abajo»: otro texto en la misma frase sin repetir el verbo
  s = s.replace(new RegExp(`\\s(?:y|e)\\s+(el|la|un|una|otro|otra)\\s+${CLAVE_TEXTO}\\s+(?!(?:que|con|de|del|en|al|arriba|abajo|y|§)\\b)${TEXTO_LIBRE}${CORTES_TEXTO}`, 'giu'), (m, art, clave, t) => ` y ${art} ${clave} ${cita(t)}`);
  return { s, citas, precio };
}

// ---------- Partir en cláusulas ("primero…, luego…, y al final…") ----------
// nombres de efectos: «whoosh al inicio y brillo cuando…» son dos pedidos, cada uno con su momento
const EFECTOS_PALABRAS = 'whoosh|wo+sh|wu+sh|swoosh|riser|808|drop|impactos?|golpes?|boom|campanas?|campanitas?|ding|timbre|bling|sparkle|brillitos?|brillos?(?!\\s+dorad)|chispas?|chispitas?|glitch|latidos?|swipe|pop|clic|click|obturador|shutter|platillo|cha\\s*-?\\s*ching|caja\\s+registradora';
const VERBOS = 'gir|rot|da\\b|dale|acerc|acerqu|aproxim|alej|sub|baj|termin|acab|enfoc|enfoqu|inclin|lade|muev|mov|fren|aceler|vuelv|volv|regres|muestr|ense|qued|pon|agreg|anad|mete|quit|usa\\b|cambi|haz|hag|empie|empez|comien|arranc|abr|cierr|cerr|zoom|vista|plano|balanc|orbit|rebot|revel|desliz|centr|ilumin|oscurec|aclar|desciend|elev';
function partir(x) {
  let s = x
    .replace(/\b(?:fren(?!te\b)\w*|desaceler\w*|suave|lento|despacio)\s+al\s+final\b/g, ' frenafinal ')   // («de frente al final» no)
    .replace(/\b(?:rapido|fuerte|con\s+fuerza)\s+al\s+(?:inicio|principio|comienzo)\b|\b(?:arranca\w*|empieza\w*)\s+(?:rapido|con\s+fuerza)\b/g, ' rapidoinicio ')
    .replace(/(\d)\s*,\s*(?=\d)/g, '$1 y ')   // «cortes en 2, 4 y 6»: una lista de tiempos no parte la frase
    .replace(/(?:\.(?!\d)|[;!?\n])+/g, ' ¦ ').replace(/,/g, ' ¦ ')   // el punto de «0.5 vueltas» no parte la frase
    .replace(/\s+y\s+(al\s+mismo\s+tiempo|a\s+la\s+vez)\s+/g, ' | $1 ')   // «…y al mismo tiempo baja»: otra indicación en el mismo tramo
    .replace(/\b(?:y\s+)?(primero|luego|despues|entonces|finalmente|por\s+ultimo|para\s+terminar|para\s+cerrar|para\s+finalizar|al\s+final|a\s+continuacion)\b/g, ' | $1 ')
    .replace(new RegExp(`\\s+y\\s+(?=(?:se\\s+|que\\s+|la\\s+|lo\\s+|le\\s+)?(?:${VERBOS}))`, 'g'), ' | ')
    // (no si el efecto va «antes»/«también»: es el mismo momento que el anterior, «un impacto cuando haga zoom y un riser antes»)
    .replace(new RegExp(`\\s+y\\s+(?=(?:(?:un|una|el|la|los|las|otro|otra)\\s+)?(?:${EFECTOS_PALABRAS})\\b(?!\\s+(?:justo\\s+)?(?:antes|tambien|igual)\\b))`, 'g'), ' | ')
    // «…arriba y el título "X" abajo»: cada texto con su lugar y su estilo
    .replace(/\s+y\s+(?=(?:el|la|un|una|otro|otra)\s+(?:texto|titulo|subtitulo|frase|letrero|mensaje|gancho|leyenda)\s+§)/g, ' | ')
    .replace(/\s+y\s+(?=(?:a\s+los|al\s+segundo|en\s+el\s+segundo|desde\s+el\s+segundo)\s+\d)/g, ' | ')   // «gira 2 vueltas y a los 4 segundos…»: otro tramo
    .replace(/\s+que\s+(?=(?:se\s+)?(?:gir|baj|sub|acerc|acerqu|alej|termin|acab|enfoc|qued|vuelv|regres|rot|inclin|desciend))/g, ' | ');
  const partes = []; let tras = '¦';
  for (const trozo of s.split(/([|¦])/)) {
    if (trozo === '|' || trozo === '¦') { tras = trozo; continue; }
    const c = trozo.replace(/^\s*(?:y|e|pero|tambien|ademas|primero|luego|despues|entonces|a\s+continuacion)\s+/, ' ').replace(/\s+(?:y|e)\s*$/, ' ').replace(/\s+/g, ' ').trim();
    if (c && !/^(?:y|e|primero|luego|despues|entonces)$/.test(c)) partes.push({ c, tras });
  }
  return partes;
}

// ---------- Vocabulario ----------
const PIEDRA = /\b(piedras?|diamantes?|gemas?|esmeraldas?|rubi(?:es)?|zafiros?|brillantes?|solitario|moissanita|amatistas?|topacios?|aguamarinas?|perlas?|circon(?:es)?|espinelas?|citrinos?|granates?|stone)\b/;
const SONIDOS = [
  ['whooshInverso', /\b(?:whoosh|wo+sh|wu+sh|swoosh)\s+(?:inverso|al\s+reves|reverso)\b|\breverse\s+whoosh\b/],
  ['whooshCorto', /\b(?:whoosh|wo+sh|wu+sh|swoosh)\s+(?:corto|rapido)\b/],
  ['whoosh', /\b(?:whoosh|wo+sh|wu+sh|swoosh|fiu+)\b|\b(?:sonido|efecto)\s+de\s+(?:viento|aire|transicion)\b/],
  ['reverseCymbal', /\bplatillo\s+(?:inverso|al\s+reves)\b|\breverse\s*cymbal\b|\bcymbal\b/],
  ['riser', /\briser\b|\b(?:sonido|efecto)\s+de\s+(?:subida|tension|suspenso)\b|\bsuspenso\b|\bredoble\b/],
  ['drop808', /\b808\b|\bdrop\b|\bsubgrave\b/],
  ['impacto', /\b(?:impactos?|golpes?|boom|bu+m|hit|trueno|explosion|bombazo)\b/],
  ['cajaRegistradora', /\bcaja\s+registradora\b|\b(?:cha|ka)\s*-?\s*ching\b|\bchaching\b|\b(?:sonido|efecto)\s+de\s+(?:dinero|plata|caja|venta)\b/],
  ['campana', /\b(?:campanas?|campanitas?|ding|dinn?g|timbre)\b/],
  ['obturador', /\b(?:obturador|shutter)\b|\b(?:sonido|efecto)\s+de\s+(?:foto|camara)\b|\b(?:disparo|clic|click)\s+de\s+(?:la\s+)?camara\b/],
  ['brillo', /\b(?:bling|sparkle|brillitos?|chispas?|chispitas?|magia|brillos?)\b/],
  ['glitch', /\b(?:glitch|interferencia)\b|\b(?:efecto|sonido)\s+de\s+falla\b/],
  ['latido', /\b(?:latidos?|corazon|heartbeat)\b/],
  ['swipe', /\bswipe\b|\b(?:sonido|efecto)\s+de\s+deslizar\b/],
  ['pop', /\b(?:pop|plop|burbujas?)\b/],
  ['click', /\b(?:click|clic|tic)\b/],
];
const CUANDO = [
  ['piedra', /\b(?:cuando|en\s+cuanto|apenas|justo\s+cuando|antes\s+de\s+que)\s+(?:se\s+)?(?:aparezca|vea|ve|muestre|enfoque|enfoca|llegue\s+a|acerque\s+a|salga|brille|revele|aparece|asome)?\s*(?:a\s+)?(?:la|el|las|los)?\s*(?:piedras?|diamantes?|gemas?|esmeraldas?|rubi|zafiro|brillante|solitario)\b|\bal\s+(?:aparecer|verse|mostrarse|revelarse|salir|brillar)\s+(?:la|el|las|los)\s+(?:piedras?|diamantes?|gemas?|esmeraldas?|rubi|zafiro|brillante|solitario)\b/],
  ['piedra', /\b(?:en|con)\s+(?:la\s+piedra|el\s+diamante|la\s+gema|el\s+brillante|la\s+esmeralda)\b/, true],   // suelto: solo si la cláusula no mueve la cámara hacia ella
  ['precio', /\b(?:cuando|al)\s+(?:aparezca|salga|entre|se\s+vea|aparece)?\s*(?:el\s+)?precio\b|\bcon\s+el\s+precio\b/],
  ['texto', /\b(?:cuando|al)\s+(?:aparezca|salga|entre|se\s+vea|aparece)\s+(?:el\s+)?(?:texto|titulo|nombre|letrero)\b|\bcon\s+el\s+(?:texto|titulo|nombre)\b/],
  ['vueltas', /\b(?:en\s+)?cada\s+(?:vuelta|giro)\b/],
  ['movimientos', /\b(?:cuando|al)\s+(?:gire|cambie|se\s+mueva|acelere)\b|\ben\s+(?:cada\s+)?(?:movimiento|transicion|cambio)s?\b|\ben\s+los\s+cambios\b/],
];
const MUSICAS = [
  ['phonk', /\b(?:phonk|fonk|drift)\b/],
  ['trap', /\b(?:trap|reggaet\w*|regueton|urbana|perreo|dembow)\b/],
  ['house', /\b(?:house|electronica|electro|para\s+bailar|disco|techno|tecno)\b/],
  ['lofi', /\b(?:lo\s*-?\s*fi|lofi|chill|relajad[oa]|tranquil[oa])\b/],
  ['cinematico', /\b(?:cinematic[oa]|epic[oa]|de\s+pelicula|trailer|dramatic[oa]|orquest\w*)\b/],
  ['lujo', /\b(?:lujo\w*|elegante|piano|sofisticad[oa]|clasica|romantic[oa])\b/],
  ['popViral', /\b(?:pop|viral|alegre|feliz|animad[oa]|tiktok|tik\s+tok|movida|bailable)\b/],
];
const PRESETS = [
  ['destello', /\b(?:estilo\s+viral|(?:hazlo|algo|video|reel|toma)\s+viral|viral|punch|que\s+enganche)\b/],
  ['revelacion', /\b(?:revelacion|del\s+detalle\s+a\s+(?:la\s+)?(?:pieza|joya|anillo)(?:\s+completa)?)\b/],
  ['heroe', /\b(?:heroe|heroic[oa]|toma\s+heroica)\b/],
  ['orbita', /\b(?:orbita\w*|(?:desde|por)\s+todos\s+los\s+(?:angulos|lados)|por\s+todos\s+lados|todos\s+sus\s+angulos)\b/],
  ['vaiven', /\b(?:vaiven|pendulo|de\s+un\s+lado\s+a\s+otro|de\s+lado\s+a\s+lado)\b/],
  ['giroRapido', /\bgiro\s+rapido\s+con\s+frenado\b/],
  ['acercamiento', /\bgiro\s+con\s+acercamiento\b/],
  ['acercamiento', /\b(?:mas\s+)?(?:elegante|sofisticad[oa]|lujos[oa]|de\s+lujo|con\s+clase|delicad[oa])\b/],   // elegante = giro suave que se acerca
  ['giro', /\b(?:giro\s+(?:360|basico|normal|clasico|simple)|tornamesa|movimiento\s+original)\b/],
];
const NOMBRES_PIEDRA = { diamante: 'el diamante', diamantes: 'los diamantes', esmeralda: 'la esmeralda', rubi: 'el rubí', zafiro: 'el zafiro', brillante: 'el brillante', solitario: 'el solitario', gema: 'la gema', perla: 'la perla', moissanita: 'la moissanita', amatista: 'la amatista', topacio: 'el topacio', aguamarina: 'la aguamarina' };

// ---------- Escena y cortes: vocabulario ----------
// colores con nombre (los compuestos primero: «gris oscuro» antes que «gris»)
const COLORES = [
  ['#4A4845', /\bgris\s+oscuro\b|\bcarbon\b|\bgrafito\b/, 'gris oscuro'], ['#A9A6A0', /\bgris(?:\s+claro)?\b/, 'gris'],
  ['#DDB7B2', /\bpalo\s+de\s+rosa\b|\brosa\s+empolvado\b/, 'palo de rosa'], ['#EACFCB', /\brosad[oa]\b|\brosa\b/, 'rosado'],
  ['#A9B49A', /\bverde\s+salvia\b|\bsalvia\b/, 'verde salvia'], ['#1F4D3F', /\bverde(?:\s+esmeralda|\s+oscuro)?\b/, 'verde esmeralda'],
  ['#BFCCD6', /\bazul\s+claro\b|\bceleste\b/, 'azul claro'], ['#2F4A66', /\bazul(?:\s+oscuro)?\b/, 'azul'],
  ['#1D1C1B', /\bnegr[oa]\b/, 'negro'], ['#2A2724', /\boscur[oa]\b/, 'oscuro'], ['#F1EEEA', /\bblanc[oa]\b/, 'blanco'], ['#ECE7E0', /\bperla\b|\bclar[oa]\b/, 'perla'],
  ['#EFE4D2', /\bcrema\b|\bmarfil\b/, 'crema'], ['#D8C7B0', /\bbeige\b|\bnude\b/, 'beige'], ['#B8A592', /\btaupe\b|\bvison\b/, 'taupe'],
  ['#B86A4B', /\bterracota\b|\bladrillo\b/, 'terracota'], ['#C9A15B', /\bdorad[oa]\b|\bcolor\s+oro\b/, 'dorado'], ['#6B4E3A', /\bcafe\b|\bmarron\b|\bchocolate\b/, 'café'],
  ['#5A1F2B', /\bvinotinto\b|\bvino\b|\bburdeos\b/, 'vinotinto'],
];
const NOMBRE_COLOR = Object.fromEntries(COLORES.map(([h, , n]) => [h, n]));
const RE_COLOR = new RegExp(COLORES.map(([, re]) => re.source).join('|'));
const colorDe = txt => COLORES.find(([, re]) => re.test(txt))?.[0] || null;
// el color que va con cada material (si ella no dice otro)
const COLOR_MATERIAL = { yeso: '#E1D5C5', travertino: '#E4D6C1', marmolBlanco: '#F1EEEA', marmolNegro: '#1D1C1B', concreto: '#B9B5AE', terciopelo: '#1F4D3F', lino: '#E3DACB', arena: '#E5D3B5', madera: '#C8A57E', acrilico: '#F3F1EE' };
const MATERIALES_PALABRAS = [
  ['marmolNegro', /\bmarmol\s+(?:negro|oscuro|nero)\b/], ['marmolBlanco', /\bmarmol(?:\s+blanco|\s+carrara)?\b/], ['travertino', /\btravertino\b/],
  ['yeso', /\byeso\b|\bestuco\b/], ['concreto', /\bconcreto\b|\bcemento\b|\bmicrocemento\b/], ['terciopelo', /\bterciopelo\b|\bvelvet\b|\bgamuza\b/],
  ['lino', /\blino\b|\btela\b/], ['arena', /\barena\b/], ['madera', /\bmadera\b/], ['acrilico', /\bacrilico\b|\bespejo\b|\bvidrio\b|\bcristal\b/],
];
const FORMAS_PALABRAS = [
  ['escalones', /\bescalones\b|\bpodio\b|\bgradas\b|\bniveles\b/], ['cojin', /\bcojin\b|\balmohad\w*\b|\bestuche\b/],
  ['losa', /\blosa\b|\bplancha\b|\bbandeja\b|\bplaca\b/], ['cubo', /\bbloque\b|\bcubo\b/],
  ['piso', /\b(?:en|sobre)\s+el\s+(?:piso|suelo)\b|\bdirecto\s+(?:en|sobre)\b|\bsin\s+pedestal\b/],
  ['cilindro', /\bpedestal(?:\s+redondo)?\b|\bcolumna\b|\bcilindro\b|\bbase\s+redonda\b/],
];
const SUSTANTIVO_FONDO = /\b(?:fondo|pared|nicho|muro|telon)\b/g;
const SUSTANTIVO_SUPERFICIE = /\b(?:pedestal|superficie|base|bloque|cubo|losa|cojin|podio|escalones|columna|mesa|piso|suelo|bandeja|placa|plancha)\b/g;
const GOBOS_PALABRAS = [
  ['arco', /\bventana(?:l)?\s+(?:con\s+)?(?:arco|arquead[oa])\b/],
  ['persiana', /\bpersianas?\b|\brejilla\b|\blineas\s+de\s+luz\b|\brayas\s+de\s+luz\b/], ['ventana', /\bventana(?:l|s)?\b/],
  ['foco', /\bun\s+foco\s+de\s+luz\b|\bluz\s+de\s+foco\b|\bspot\b|\breflector\b|\bcirculo\s+de\s+luz\b|\bcenital\s+de\s+luz\b/],
];
// nombres de las escenas listas tal como se dicen
const ESCENAS_PALABRAS = [
  ['pedestal-arena', /\bpedestal\s+arena\b/], ['marmol-negro', /\b(?:escena|ambiente|estilo)\s+(?:mas\s+)?(?:oscur[oa]|nocturn[oa]|negr[oa]|dark)\b|\bescena\s+de\s+noche\b/],
  ['escalones', /\bpodio\s+de\s+escalones\b/], ['arco', /\bnicho\s+con\s+arco\b/],
  ['terciopelo', /\bterciopelo\s+esmeralda\b/], ['espejo', /\bacrilico\s+espejo\b/], ['playa', /\barena\s+y\s+sol\b|\b(?:en\s+la\s+)?playa\b/], ['rosa', /\brosa\s+empolvado\b/],
];
// a qué se refiere un material o un color: al sustantivo de escena más cercano antes de él (o justo después)
function destino(r, i) {
  let fondo = -1, sup = -1;
  for (const m of r.matchAll(SUSTANTIVO_FONDO)) if (m.index <= i) fondo = Math.max(fondo, m.index);
  for (const m of r.matchAll(SUSTANTIVO_SUPERFICIE)) if (m.index <= i) sup = Math.max(sup, m.index);
  if (fondo < 0 && sup < 0) {   // «de mármol el fondo»: lo que venga después
    const f = r.slice(i).search(SUSTANTIVO_FONDO), s = r.slice(i).search(SUSTANTIVO_SUPERFICIE);
    return f >= 0 && (s < 0 || f < s) ? 'fondo' : 'superficie';
  }
  return fondo > sup ? 'fondo' : 'superficie';
}
const HAY_ESCENA = /\b(?:escena|fondo|degradado|pared|nicho|pedestal|superficie|podio|escalones|cojin|losa|bloque|marmol|travertino|yeso|concreto|cemento|terciopelo|lino|madera|acrilico|espejo|palmeras?|persianas?|ventana\w*|sombras?|gobo|playa|luz\s+(?:desde|de\s+la|de\s+lado|por|que\s+viene|lateral|mas|suave|difusa|dura|calida|fria|dorada|alta|baja|rasante|fuerte|intensa|debil|tenue)|contraluz|mas\s+suave\s+la\s+luz|suaviza\w*\s+la\s+luz)\b/;

// Lo que la cláusula pide de la escena: { ninguna, preset, superficie: {...}, fondo: {...}, luz: {...relativos}, txt: [...] }
function analizarEscena(k, r0) {
  let r = r0;
  if (!HAY_ESCENA.test(r) || /\b(?:musica|cancion|melodia|sonido)\s+de\s+fondo\b|\bde\s+fondo\s+(?:musical|sonoro)\b/.test(r) && !/\b(?:pedestal|superficie|marmol|escena)\b/.test(r)) return r;
  const sacar = re => { const m = r.match(re); if (m) r = r.replace(re, ' '); return m; };
  const e = { superficie: {}, fondo: {}, luz: {} };
  // sin escena: el fondo liso de marca de siempre
  if (sacar(/\b(?:sin\s+(?:fondo|escena|pedestal|superficie|decorado)|fondo\s+(?:liso|plano|de\s+(?:la\s+)?marca|normal|de\s+siempre|sencillo|simple)|quita\w*\s+(?:el\s+|la\s+)?(?:fondo|escena|pedestal|superficie|decorado)|(?:el\s+)?degradado\s+de\s+(?:la\s+)?marca)\b/)) {
    e.ninguna = true;
  } else {
    for (const [id, re] of ESCENAS_PALABRAS) if (sacar(re)) { e.preset = id; break; }
    // «que no sea un fondo blanco», «ponle una escena»: la escena de siempre
    if (sacar(/\bque\s+no\s+sea\s+(?:un\s+)?fondo\s+(?:blanco|liso|plano)\b|\b(?:pon\w*|agrega\w*|usa|quiero)\s+(?:una\s+|la\s+)?(?:escena|superficie)\b/)) e.generica = true;
    // tamaño del pedestal y distancia del fondo («pedestal más alto», «el fondo más lejos»): antes que la forma
    const SUP = '(?:el\\s+|la\\s+)?(?:pedestal|superficie|base|bloque|cubo|losa|cojin|podio|escalones|columna)';
    const tam = (palabras, k, signo) => { if (sacar(new RegExp(`\\b${SUP}\\s+(?:mas\\s+)?(?:${palabras})\\b|\\bmas\\s+(?:${palabras})\\s+${SUP}\\b`))) e.superficie[k] = signo; };
    tam('alt[oa]', 'altura', '+'); tam('baj[oa]|chat[oa]', 'altura', '-');
    tam('grande|anch[oa]', 'tamano', '+'); tam('pequen[oa]|chic[oa]|angost[oa]|delgad[oa]', 'tamano', '-');
    if (sacar(/\b(?:el\s+)?fondo\s+mas\s+(?:lejos|lejano|atras)\b|\baleja\w*\s+el\s+fondo\b/)) e.fondo.distancia = '+';
    else if (sacar(/\b(?:el\s+)?fondo\s+mas\s+(?:cerca|cercano|adelante)\b|\bacerca\w*\s+el\s+fondo\b/)) e.fondo.distancia = '-';
    // forma de la superficie y del fondo
    for (const [id, re] of FORMAS_PALABRAS) { const m = r.match(re); if (m) { e.superficie.forma = id; break; } }
    if (/\bnicho\b|\barco\b(?!\s+de\s+luz)/.test(r) && !/\bventana\w*\s+(?:con\s+)?(?:arco|arquead)/.test(r)) e.fondo.forma = 'arco';
    else if (/\bfondo\s+curvo\b|\bfondo\s+infinito\b|\bsin\s+esquinas\b|\bciclorama\b/.test(r)) e.fondo.forma = 'curva';
    else if (/\b(?:una\s+|la\s+)?pared\b/.test(r)) e.fondo.forma = 'pared';
    // materiales (del pedestal o del fondo, según a qué se refiera)
    for (const [id, re] of MATERIALES_PALABRAS) {
      const m = r.match(re); if (!m) continue;
      const a = destino(r, m.index);
      if (!e[a].material) e[a].material = id;
      r = r.replace(re, ' ');
    }
    // colores con su sustantivo: «fondo negro», «el fondo a rosa», «pedestal color crema»
    const PREFIJO = '(?:\\s+(?:de\\s+)?color(?:\\s+de)?|\\s+(?:a|en|de|al))*\\s+';
    for (const [lugar, nombres] of [['fondo', 'fondo|pared|nicho|muro'], ['superficie', 'pedestal|superficie|base|bloque|cubo|losa|cojin|podio|escalones|columna|mesa']]) {
      const m = r.match(new RegExp(`\\b(?:${nombres})${PREFIJO}(?:${RE_COLOR.source})`));
      if (m) { e[lugar].color = colorDe(m[0].replace(new RegExp(`^\\s*(?:${nombres})`), ' ')); r = r.replace(m[0], ' '); }
    }
    // la luz
    const hablaDeLuz = /\b(?:luz|sol|ventana\w*|contraluz)\b/.test(r);
    if (sacar(/\bmas\s+suave\s+la\s+luz\b|\bla\s+luz\s+mas\s+suave\b|\bluz\s+(?:mas\s+)?(?:suave|difusa|tenue\s+y\s+suave)\b|\bsuaviza\w*\s+(?:la\s+luz|las\s+sombras)\b|\bsombras?\s+(?:mas\s+)?(?:suaves?|difusas?|ligeras?)\b/)) e.luz.suavidad = '+';
    else if (sacar(/\bmas\s+dura\s+la\s+luz\b|\bluz\s+(?:mas\s+)?(?:dura|de\s+sol|directa)\b|\bsombras?\s+(?:mas\s+)?(?:duras?|marcadas?|definidas?|fuertes?)\b/)) e.luz.suavidad = '-';
    if (sacar(/\bluz\s+(?:mas\s+)?(?:calida|calidez|dorada|de\s+atardecer|naranja|amarilla)\b|\bmas\s+calida\s+la\s+luz\b/)) e.luz.calidez = '+';
    else if (sacar(/\bluz\s+(?:mas\s+)?(?:fria|azul|azulada|neutra|blanca)\b|\bmas\s+fria\s+la\s+luz\b/)) e.luz.calidez = '-';
    if (sacar(/\bluz\s+(?:mas\s+)?(?:fuerte|intensa)\b|\bmas\s+(?:fuerte|intensa)\s+la\s+luz\b/)) e.luz.intensidad = '+';
    else if (sacar(/\bluz\s+(?:mas\s+)?(?:debil|tenue|baja\s+intensidad)\b|\bmenos\s+intensa\s+la\s+luz\b/)) e.luz.intensidad = '-';
    if (sacar(/\bluz\s+(?:mas\s+)?(?:alta|desde\s+arriba|de\s+arriba|cenital)\b/)) e.luz.elevacion = 70;
    else if (sacar(/\bluz\s+(?:mas\s+)?(?:baja|rasante|desde\s+abajo)\b/)) e.luz.elevacion = 18;
    // de dónde viene (después de «cálida», «suave»…: «luz cálida desde la izquierda»)
    const m = hablaDeLuz && sacar(/\b(?:(?:la\s+)?(?:luz|sol|ventana)\s+)?(?:que\s+(?:viene|entra|llega)\s+|entrando\s+|viene\s+)?(?:desde|por)\s+(?:la\s+|el\s+)?(derecha|izquierda|atras|detras|frente|adelante|lado)\b|\b(?:luz|sol)\s+de\s+(?:la\s+)?(derecha|izquierda|atras|frente|lado)\b|\bluz\s+(?:a\s+la\s+)?(derecha|izquierda)\b|\b(contraluz)\b|\bluz\s+(lateral|frontal)\b/);
    if (m) {
      const lado = m[1] || m[2] || m[3] || m[4] || m[5];
      e.luz.angulo = /derecha|lado|lateral/.test(lado) ? 45 : /izquierda/.test(lado) ? -45 : /atras|detras|contraluz/.test(lado) ? 165 : 0;
      e.luz.lado = lado === 'lateral' || lado === 'lado' ? 'derecha' : lado;
    }
    // sombras de ventana, persiana, arco…
    if (sacar(/\bsin\s+sombras\b|\bsin\s+gobo\b|\bluz\s+pareja\b/)) e.luz.gobo = 'ninguno';
    else for (const [id, re] of GOBOS_PALABRAS) if (sacar(re)) { e.luz.gobo = id; break; }
    // lo que ya se entendió no lo vuelven a leer la cámara ni la luz de la cámara
    r = r.replace(/\b(?:la\s+)?(?:joya|pieza|anillo)\s+(?:en|sobre)\s+(?:un|una|el|la)?\b/g, ' ')
      .replace(/\b(?:escena|fondo|pared|nicho|pedestal|superficie|base|bloque|cubo|losa|cojin|podio|escalones|columna|sombras?|arco|curvo|redondo|liso|gobo)\b/g, ' ');
  }
  const algo = e.ninguna || e.preset || e.generica || ['superficie', 'fondo', 'luz'].some(g => Object.keys(e[g]).length);
  if (!algo) return r0;
  k.escena = e; k.entendido = true;
  return r;
}

// Lo que la cláusula pide de los cortes: { tiempos, n, cada, ritmo, transicion, quitar }
// ---------- Puesta en escena (v4): satén, esquema de luz, flotar, par, estuche o caja, elementos y la tapa ----------
// Colores con nombre para estuches, cajas y cintas: los de la marca (negro = tinta, dorado = oro…); otro color, tal cual
const COLOR_PUESTA = [
  [COLORES_MARCA.tinta.hex, /\b(?:negr[oa]s?|tinta|oscur[oa]s?)\b/], [COLORES_MARCA.oro.hex, /\b(?:dorad[oa]s?|de\s+oro|color\s+oro|oro)\b/],
  [COLORES_MARCA.esmeralda.hex, /\b(?:verdes?|esmeralda)\b/], [COLORES_MARCA.granate.hex, /\b(?:granate|vino(?:tinto)?|burdeos|roj[oa]s?)\b/],
  [COLORES_MARCA.rosa.hex, /\b(?:rosad[oa]s?|rosa|palo\s+de\s+rosa)\b/], [COLORES_MARCA.perla.hex, /\b(?:perla|crema|marfil|clar[oa]s?)\b/],
  [COLORES_MARCA.papel.hex, /\bblanc[oa]s?\b/], [COLORES_MARCA.bosque.hex, /\bbosque\b/],
];
const NOMBRE_MARCA = { ...NOMBRE_COLOR, ...Object.fromEntries(Object.values(COLORES_MARCA).map(c => [c.hex, c.nombre.toLowerCase()])) };
const colorPuesta = txt => (txt ? COLOR_PUESTA.find(([, re]) => re.test(txt))?.[0] || colorDe(txt) : null);
const HAY_PUESTA = /\b(?:estuche|cofre|caj(?:a|as|ita|on)|bandeja|regalo|abr\w*|cierr\w*|cerr\w*|tapa|par|pareja|flot\w*|levit\w*|aire|suspendid[oa]|saten|seda|clave|low\s*key|high\s*key|silueta\w*|perlas|esferas?|bolas?|bolitas|cuentas|cristal|vidrio|cinta|liston|cadena|elementos|adornos)\b/;
const COREO_PALABRAS = [
  ['caer-en-circulo', /\b(?:(?:caen?|cayendo|caigan)\s+(?:y\s+(?:forman|hacen)\s+)?(?:en\s+)?(?:un\s+)?(?:circulo|aro|anillo|rueda)|en\s+circulo|(?:forman|formen|hacen)\s+un\s+circulo)\b/],
  ['rodar', /\b(?:rued\w*|rod\w*)\b/], ['rebotar', /\b(?:rebot\w*|brinc\w*)\b/], ['fila-flotante', /\b(?:en\s+fila|en\s+linea|fila)\b/],
  ['orbitar', /\b(?:orbit\w*|alrededor|dan\s+vueltas|giran)\b/], ['lluvia', /\b(?:lluev\w*|lluvia|caen|cayendo|caigan)\b/],
  ['volar', /\b(?:vuel(?:an|en|ando)|volando)\b/], ['quieto', /\bquiet[oa]s\b/],
];
const RECORRIDO_PALABRAS = { corazon: /corazon/, onda: /onda|ola/, espiral: /espiral/, lazo: /lazo|mono/ };
// Qué estuche o caja se pidió (con la joya del pedido si se dice: «estuche de aretes»)
function tipoUtileriaPedido(t, todo = '') {
  if (/pila|apilad|torres?/.test(t)) return 'pila-cajas';
  if (/regalo/.test(t)) return 'caja-regalo';
  if (/cofre/.test(t)) return 'cofre';
  if (/cajon/.test(t)) return 'cajon';
  if (/bandeja/.test(t)) return 'bandeja';
  if (/estuche|tapa/.test(t)) return /aretes|pendientes|topos/.test(t + ' ' + todo) ? 'estuche-aretes' : /collar|dije|cadena/.test(t) ? 'estuche-collar' : /pulsera|brazalete/.test(t) ? 'cofre' : 'estuche-anillo';
  return 'caja-regalo';   // «una caja» a secas: la de regalo
}
function analizarPuesta(k, r0) {
  let r = r0;
  if (!HAY_PUESTA.test(r)) return r0;
  const sacar = re => { const m = r.match(re); if (m) r = r.replace(re, ' '); return m; };
  const p = {}, elementos = [];
  // satén: «fondo de satén esmeralda», «sobre satén», «tela de seda negra»
  const sat = sacar(/\b(?:(?:un\s+|el\s+)?fondo\s+(?:de\s+|en\s+)?|sobre\s+(?:un\s+|una\s+|el\s+)?|(?:una\s+)?tela\s+(?:de\s+)?|en\s+)?(?:saten|seda)(?:\s+(?:de\s+)?(?:color\s+)?(noche|negr[oa]|azul(?:\s+oscuro)?|tinta|esmeralda|verde|granate|vino(?:tinto)?|roj[oa]|perla|blanc[oa]|clar[oa]|crema))?\b/);
  if (sat) { const c = sat[1] || ''; p.saten = /esmeralda|verde/.test(c) ? 'saten-esmeralda' : /granate|vino|roj/.test(c) ? 'saten-granate' : /perla|blanc|clar|crema/.test(c) ? 'saten-perla' : 'saten-noche'; }
  // esquema de luz
  if (sacar(/\b(?:(?:la\s+)?(?:luz|iluminacion)\s+(?:de\s+|en\s+)?)?clave\s+baja\b|\blow\s*key\b/)) p.esquema = 'clave-baja';
  else if (sacar(/\b(?:(?:la\s+)?(?:luz|iluminacion)\s+(?:de\s+|en\s+)?)?(?:clave\s+alta|alta\s+clave)\b|\bhigh\s*key\b/)) p.esquema = 'alta-clave';
  else if (sacar(/\b(?:luz|iluminacion|esquema)\s+(?:de\s+|en\s+)?contraluz\s+con\s+siluetas\b|\ben\s+silueta\b|\bsiluetas\b/)) p.esquema = 'contraluz';
  // la tapa: «abre la caja en el segundo 2», «que el estuche se abra al final», «cierra el cofre»
  const CUANDO_TAPA = '(?:\\s+(?:en\\s+el\\s+segundo|al\\s+segundo|a\\s+los|en\\s+el|en)\\s+(\\d+(?:\\.\\d+)?)(?:\\s+segundos?)?|\\s+(al\\s+(?:inicio|principio|comienzo)|al\\s+final))?';
  const ab = sacar(new RegExp(`\\b(?:abr\\w*|cierr\\w*|cerr\\w*)\\s+(?:(?:el|la|su)\\s+)?(estuche(?:\\s+de\\s+(?:anillo|aretes|collar|pulsera))?|caj(?:a|ita)(?:\\s+de\\s+regalo)?|cofre|tapa|cajon)\\b${CUANDO_TAPA}`))
    || sacar(new RegExp(`\\b(?:que\\s+)?(?:el|la)\\s+(estuche|caja(?:\\s+de\\s+regalo)?|cofre|tapa|cajon)\\s+se\\s+(?:abra|abre|cierre|cierra)\\b${CUANDO_TAPA}`))
    // «caja de regalo con cinta dorada que se abre en el segundo 2»: la caja se nombró antes
    || (/\b(?:estuche|caja|cajita|cofre|cajon)\b/.test(r) ? sacar(new RegExp(`\\bque\\s+se\\s+(?:abra|abre|cierre|cierra)()\\b${CUANDO_TAPA}`)) : null);
  if (ab) p.abrir = { cerrar: /\b(?:cierr|cerr)|se\s+(?:cierre|cierra)/.test(ab[0]), t: ab[2] !== undefined ? +ab[2] : ab[3] ? (/final/.test(ab[3]) ? 'final' : 0) : null, que: ab[1] };
  // estuche o caja: «ponla en un estuche negro», «caja de regalo con cinta dorada», «sin estuche»
  if (sacar(/\b(?:sin|quita\w*|saca\w*|borra\w*)\s+(?:el\s+|la\s+|los\s+|las\s+)?(?:estuches?|cajas?|cofre|cajon|bandeja)\b/)) p.utileria = { tipo: 'ninguna' };
  else {
    const m = r.match(/\b(?:(?:pon\w*|mete\w*|guarda\w*|dentro\s+de|en|sobre|con|junto\s+a|al\s+lado\s+de|encima\s+de|arriba\s+de)\s+(?:un\s+|una\s+|el\s+|la\s+|unas\s+)?)?(estuche(?:\s+de\s+(?:anillo|aretes|collar|pulsera|dije))?|cofre|caj(?:a|ita)\s+de\s+regalo|regalo|caja\s+de\s+cajon|cajon|bandeja|pila\s+de\s+cajas|cajas\s+apiladas|torres?\s+de\s+cajas|caja)\b((?:\s+(?!y\b|que\b)[a-z]+){0,6})/);
    if (m) {
      r = r.replace(m[0], ' ');
      const resto = m[2] || '', conCinta = resto.match(/\bcon\s+(?:una\s+|la\s+|un\s+|el\s+)?(?:cinta|liston|mono|lazo)\b((?:\s+[a-z]+){0,3})/);
      const color = colorPuesta(conCinta ? resto.slice(0, conCinta.index) : resto), cinta = conCinta ? colorPuesta(conCinta[1]) || COLORES_MARCA.oro.hex : null;
      const tipo = tipoUtileriaPedido(m[1], r0);
      const posicion = /\b(?:al\s+lado|junto)\b/.test(m[0]) ? 'al-lado' : /\b(?:encima|arriba)\s+de\b/.test(m[0]) || /\bgigante\b/.test(resto) ? 'escenario' : 'asiento';
      p.utileria = { tipo, ...(color ? { color } : {}), ...(cinta ? { cinta } : {}), posicion };
    }
  }
  // elementos: «una esfera de cristal», «una cinta en corazón», «cuelga una cadena», «perlas que caen en círculo»
  if (sacar(/\b(?:sin|quita\w*|saca\w*|borra\w*)\s+(?:los\s+|las\s+)?(?:elementos|adornos|perlas|esferas|bolas|cuentas|cintas?|cadenas?)\b/)) p.quitarElementos = true;
  else {
    if (sacar(/\b(?:(?:una|la|unas|las)\s+)?(?:esferas?|bolas?|burbujas?)\s+de\s+(?:cristal|vidrio)\b|\b(?:un\s+)?cristal\s+(?:redondo|transparente)\b/)) elementos.push(grupoElemento('cristal'));
    const ci = sacar(/\b(?:(?:una|la)\s+)?(?:cinta|liston)(?:\s+de\s+saten)?(?:\s+(?:en|que\s+(?:forme|dibuje|haga)|con\s+forma\s+de|como)\s+(?:un\s+|una\s+|de\s+)?(corazon|onda|ola|espiral|lazo|mono))?(\s+que\s+pase\s+por\s+(?:el\s+|la\s+)?(?:anillo|argolla|joya|aro))?\b/);
    if (ci) elementos.push(grupoElemento('cinta', { recorrido: Object.entries(RECORRIDO_PALABRAS).find(([, re]) => re.test(ci[1] || ''))?.[0] || 'corazon' }));
    if (sacar(/\b(?:(?:cuelg\w*|colg\w*|pon\w*|agrega\w*|con)\s+)?(?:(?:de\s+)?una\s+|la\s+)?cadena(?:\s+(?:fina|delgada|que\s+cuelgue))?\b/)) elementos.push(grupoElemento('cadena'));
    const pe = r.match(/\b(?:(?:pon\w*|agrega\w*|anade|con|unas)\s+)?(?:\d+\s+)?(perlas|esferas|bolas|bolitas|cuentas)\b((?:\s+(?:que\s+)?[a-z]+){0,6})/);
    if (pe) {
      r = r.replace(pe[0], ' ');
      const tipo = /perla/.test(pe[1]) ? 'perlas' : /bolita|cuenta/.test(pe[1]) ? 'cuentas' : 'esferas';
      const coreografia = COREO_PALABRAS.find(([, re]) => re.test(pe[2] || ''))?.[0];
      elementos.push(grupoElemento(tipo, { coreografia }));
    }
  }
  // flotar y par (después de los elementos: «perlas que flotan en fila» no hace flotar la joya)
  if (sacar(/\bque\s+no\s+flote\b|\bsin\s+flotar\b|\b(?:apoyad[oa]|que\s+se\s+apoye)\s+(?:en|sobre)\s+(?:el\s+|la\s+)?(?:piso|suelo|tela|saten)\b/)) p.flotar = false;
  else if (sacar(/\b(?:que\s+)?(?:flot\w*|levit\w*)\b(?:\s+en\s+el\s+aire)?|\ben\s+el\s+aire\b|\bsuspendid[oa]\b/)) p.flotar = true;
  if (sacar(/\bsin\s+(?:el\s+)?par\b|\bsolo\s+(?:un|uno|una)\s+(?:arete|pendiente)\b|\b(?:un|una)\s+sol[oa]\s+(?:arete|pieza)\b/)) p.par = false;
  else if (sacar(/\b(?:(?:los\s+)?(?:aretes|pendientes|topos|candongas)\s+)?(?:en\s+par(?:eja)?|(?:como\s+)?(?:un\s+|el\s+)?par(?!\s+de\s+(?:segundos?|vueltas?|cortes?|veces|planos?))(?:\s+de\s+(?:aretes|pendientes))?|los\s+dos\s+(?:aretes|pendientes)|ambos\s+aretes)\b/)) p.par = true;
  if (elementos.length) p.elementos = elementos.filter(Boolean);
  if (!Object.keys(p).length) return r0;
  // «ponla en…», «la joya en…» ya se entendió con el estuche
  r = r.replace(/\b(?:ponla|ponlo|ponle|pon\s+la\s+joya|pon\s+el\s+anillo|ponlos|ponlas|metela|mételo|metelo)\b/g, ' ');
  k.puesta = p; k.entendido = true;
  return r;
}

function analizarCortes(k, r0) {
  let r = r0;
  const sacar = re => { const m = r.match(re); if (m) r = r.replace(re, ' '); return m; };
  // «un whoosh en cada corte»: es cuándo suena el sonido, no un corte nuevo
  if (SONIDOS.some(([, re]) => re.test(r)) && sacar(/\b(?:en|con|a)\s+(?:cada\s+|todos\s+los\s+|los\s+)cortes?\b/)) { k.cuando = 'cortes'; k.entendido = true; return r; }
  if (!/\bcortes?\b|\bjump\s*cuts?\b|\bcort(?:a|ar|alo|ala)\s+(?:el\s+video\s+|la\s+toma\s+)?(?:en|cada|al\s+ritmo)\b|\bcorta\s+a\s+(?:un|una|el|la)\s+(?:primer\s+plano|plano|toma|vista|detalle|acercamiento)\b/.test(r)) return r;
  const c = { tiempos: [], n: 0, cada: 0, ritmo: false, transicion: null, quitar: false };
  if (sacar(/\b(?:quita\w*|borra\w*|elimina\w*|saca\w*|sin)\s+(?:todos\s+)?(?:los\s+|el\s+|las\s+)?(?:cortes?|jump\s*cuts?|transiciones)\b|\bno\s+(?:quiero\s+)?(?:mas\s+)?cortes\b/)) c.quitar = true;
  if (sacar(/\b(?:con\s+)?(?:un\s+|una\s+)?(?:flash(?:\s+blanco)?|destellos?(?:\s+blancos?)?|fogonazos?|(?:en|a)\s+blanco)\b/)) c.transicion = 'flash';
  else if (sacar(/\b(?:con\s+)?(?:un\s+)?(?:fundidos?\s+(?:a|en|de)\s+negro|fundidos?|(?:en|a)\s+negro|fade(?:\s+to\s+black)?|parpadeo)\b/)) c.transicion = 'negro';
  else if (sacar(/\b(?:con\s+)?(?:un\s+)?(?:barridos?|latigazos?|whip(?:\s*pan)?|swipe)\b/)) c.transicion = 'barrido';
  else if (sacar(/\b(?:secos?|directos?|sin\s+(?:transicion|efecto))\b/)) c.transicion = 'seco';
  if (sacar(/\b(?:al|con\s+el|siguiendo\s+el|a)\s+(?:ritmo|compas|beat|tiempo)(?:\s+(?:de\s+)?(?:la\s+)?(?:musica|cancion))?\b|\bsincronizad\w*\s+con\s+(?:la\s+)?(?:musica|cancion)\b|\ben\s+(?:cada|los)\s+(?:beats?|golpes\s+de\s+la\s+musica)\b/)) c.ritmo = true;
  let m = sacar(/\bcada\s+(\d+(?:\.\d+)?)\s+segundos?\b/); if (m) c.cada = +m[1];
  m = sacar(/\b(\d+)\s+(?:cortes?|planos?|tomas?|jump\s*cuts?)\b/); if (m) c.n = +m[1];
  if (sacar(/\b(?:a|en)\s+la\s+mitad(?:\s+del\s+video)?\b/)) c.tiempos.push('mitad');
  // con un movimiento de cámara en la misma frase, «en 2 segundos» es cuánto dura el movimiento (no dónde va el corte)
  const conCamara = /\b(?:gir|rot|acerc|acerqu|aproxim|alej|sub|baj|enfoc|enfoqu|inclin|muestr|revel|zoom|vista|plano\s+(?:detalle|general|abierto)|primer\s+plano|desciend|elev)\w*/.test(r);
  const reT = conCamara ? /\b(?:a\s+los|al\s+segundo|en\s+el\s+segundo|desde\s+el\s+segundo)\s+(\d+(?:\.\d+)?)(?:\s+segundos?)?\b/g
    : /\b(?:a\s+los|al|en\s+el|en\s+los|en|a|y|e|desde\s+el|del)\s+(?:segundos?\s+)?(\d+(?:\.\d+)?)(?:\s+segundos?)?\b/g;
  r = r.replace(reT, (x, t) => { c.tiempos.push(+t); return ' '; });
  // palabras de relleno del pedido de cortes (el resto de la frase sigue: «…y acércate a la piedra»)
  r = r.replace(/\b(?:cortes?|jump\s*cuts?|cort(?:a|ar|alo|ala))\b|\b(?:pon\w*|agrega\w*|añade|anade|mete\w*|haz|hazle|hacer|hagan|quiero|usa|con|de|un|una|el|los|las|del|al|video|reel|segundos?)\b(?=(?:\s+(?:un|una|el|los|las|del|al|con|de|video|reel))*\s*$)/g, ' ');
  k.cortes = c; k.entendido = true;
  return r;
}

// ---------- Análisis de una cláusula ----------
function analizar(c0, citas) {
  const k = { c: c0, metas: {}, mods: {}, curva: null, peso: 1, t: {}, sonidos: [], textos: [], quitar: {}, musica: null, preset: null, estado: false, rapido: false, lento: false, cuando: null, entendido: false };
  let r = ` ${c0} `;
  const sacar = re => { const m = r.match(re); if (m) { r = r.replace(re, ' '); k.entendido = true; } return m; };
  const hay = re => re.test(r);

  // textos y precio (marcadores §n§ y §p§ que dejó extraer)
  const marcas = [...r.matchAll(/§(\d+)§/g)].map(m => citas[+m[1]]).filter(Boolean);
  if (marcas.length || hay(/§p§/)) {
    k.entendido = true;
    const pos = hay(/\b(?:arriba|parte\s+de\s+arriba|superior|encima|en\s+la\s+parte\s+alta)\b/) ? 'arriba' : hay(/\b(?:abajo|parte\s+de\s+abajo|inferior|debajo|al\s+pie)\b/) ? 'abajo' : hay(/\b(?:centro|medio|mitad)\b/) ? 'centro' : null;
    const anim = hay(/\b(?:maquina|letra\s+por\s+letra|escribiendo|tecleado)\b/) ? 'maquina' : hay(/\b(?:con\s+brillo|brillo\s+dorado|que\s+brille|dorado)\b/) ? 'brillo'
      : hay(/\b(?:que\s+suba|subiendo|desde\s+abajo)\b/) ? 'subir' : hay(/\bzoom\b/) ? 'zoom' : hay(/\b(?:desliz\w*|de\s+lado)\b/) ? 'deslizar' : hay(/\bsin\s+animacion\b/) ? 'ninguna' : hay(/\b(?:aparec\w*|fundido|suave)\b/) ? 'aparecer' : null;
    r = r.replace(/\b(?:con\s+brillo|brillo\s+dorado|que\s+brille)\b/g, ' ');
    const estilo = hay(/\bsubtitulo\b/) ? 'subtitulo' : hay(/\btitulo\b/) ? 'titulo' : hay(/\b(?:gancho|pregunta|hook)\b/) ? 'gancho' : hay(/\bdetalle\b/) ? 'detalle' : hay(/\b(?:pie\s+de\s+pagina|pie)\b/) ? 'pie' : hay(/\b(?:frase|leyenda)\b/) ? 'libre' : null;
    for (const texto of marcas) k.textos.push({ texto, pos, anim, estilo });
    if (hay(/§p§/)) k.precio = { pos, anim };
    r = r.replace(/§\w+§/g, ' ');
    k.esTexto = true;
  }
  // escena y cortes (antes que la luz de la cámara, la curva «en seco» y el destello: «corte con flash» es una transición)
  r = analizarPuesta(k, r);
  r = analizarEscena(k, r);
  r = analizarCortes(k, r);
  // quitar cosas
  if (sacar(/\b(?:quita\w*|borra\w*|elimina\w*|saca\w*|sin|remueve)\s+(?:todos\s+)?(?:los\s+|las\s+)?(?:textos|letras|titulos|letreros|escritos)\b/)) k.quitar.textos = true;
  if (sacar(/\b(?:quita\w*|borra\w*|elimina\w*|saca\w*|sin)\s+(?:el\s+)?precio\b/)) k.quitar.precio = true;
  const qs = sacar(/\b(?:quita\w*|borra\w*|elimina\w*|saca\w*|sin)\s+(la\s+musica\s+(?:y|e)\s+)?(?:todos\s+)?(?:los\s+)?(?:sonidos|efectos(?:\s+de\s+sonido)?|sfx)\b(\s+(?:y|e)\s+(?:la\s+)?musica\b)?/);
  if (qs) { k.quitar.sonidos = true; if (qs[1] || qs[2]) k.musica = { estilo: 'ninguna' }; }
  if (sacar(/\b(?:quita\w*|borra\w*|elimina\w*|saca\w*|apaga\w*|silencia\w*)\s+(?:la\s+)?(?:musica|cancion)\b|\bsin\s+(?:musica|cancion)\b|\bsilencio\b/)) k.musica = { estilo: 'ninguna' };
  // duración del video
  let m = sacar(/\b(?:que\s+)?(?:dur[ea]n?|duracion(?:\s+de)?|hazlo\s+de|video\s+de|reel\s+de|largo\s+de|alargalo\s+a|acortalo\s+a)\s*(?:de\s+|a\s+)?(\d+(?:\.\d+)?)\s*(?:segundos?)?/) || sacar(/\b(\d+(?:\.\d+)?)\s+segundos\s+de\s+(?:duracion|largo|video)\b/);
  if (!m) m = sacar(/^\s*(?:de\s+|en\s+)?(\d+(?:\.\d+)?)\s+segundos\s*$/);   // «10 segundos» a secas
  if (m) k.duracion = +m[1];
  else if (sacar(/\b(?:mas\s+largo|alargalo|alarga\s+el\s+video)\b/)) k.duracion = 'largo';
  else if (sacar(/\b(?:mas\s+corto|acortalo|acorta\s+el\s+video)\b/)) k.duracion = 'corto';
  // bucle
  if (sacar(/\bsin\s+(?:bucle|loop|repetir|repeticion)\b|\bque\s+no\s+se\s+repita\b|\bno\s+(?:lo\s+)?repitas?\b/)) k.bucle = 'no';
  else if (sacar(/\b(?:en\s+)?(?:bucle|loop)(?:\s+infinito|\s+perfecto)?\b|\bque\s+se\s+repita\b|\bciclico\b/)) k.bucle = 'si';
  // música (los nombres de estilo solo cuentan si se habla de música, salvo los que no pueden ser otra cosa)
  const conMusica = hay(/\b(?:musica|cancion|ritmo|melodia|beat|base\s+musical|fondo\s+musical)\b/) || hay(/\b(?:phonk|trap|house|lo\s*-?\s*fi|lofi|reggaet\w*|regueton)\b/);
  if (conMusica && !k.musica) {
    for (const [id, re] of MUSICAS) if (hay(re)) { k.musica = { estilo: id }; r = r.replace(re, ' '); break; }
    if (sacar(/\b(?:baja\w*|bajar)\s+(?:el\s+volumen\s+(?:de\s+)?)?(?:la\s+)?musica\b|\bmusica\s+(?:mas\s+)?(?:suave|bajita|baja|bajito|tenue|despacio|de\s+fondo)\b|\b(?:pero\s+)?(?:mas\s+)?bajit[oa]\b|\bpero\s+(?:mas\s+)?(?:suave|baj[oa]|tenue)\b/)) k.musica = { ...(k.musica || {}), volumen: 0.3 };
    else if (sacar(/\b(?:sube\w*|subir)\s+(?:el\s+volumen\s+(?:de\s+)?)?(?:la\s+)?musica\b|\bmusica\s+(?:mas\s+)?(?:fuerte|alta|duro)\b|\bpero\s+(?:mas\s+)?(?:fuerte|alt[oa])\b/)) k.musica = { ...(k.musica || {}), volumen: 0.85 };
    if (!k.musica && sacar(/\b(?:pon\w*|agrega\w*|añade|anade|mete\w*|usa)\s+(?:una\s+|la\s+|de\s+)?(?:musica|cancion)\b/)) k.musica = { estilo: 'auto' };
    r = r.replace(/\b(?:musica|cancion|ritmo|melodia|beat|de\s+fondo)\b/g, ' ');
    k.entendido ||= !!k.musica;
  }
  // luz (antes que los sonidos: «más brillo» es exposición, no el efecto)
  if (sacar(/\bmas\s+(?:luz|brillo|brillante|clar[oa]|iluminad[oa]|exposicion)\b|\bilumina\w*|\baclar\w*|\b(?:sube|subir|subele|aumenta\w*|incrementa\w*)\s+(?:el\s+|la\s+)?(?:luz|brillo|exposicion)\b/)) k.metas.exposicion = { valor: 1.4 };
  else if (sacar(/\bmenos\s+(?:luz|brillo|exposicion)\b|\bmas\s+oscur[oa]\b|\boscurec\w*|\b(?:baja|bajar|bajale|disminu\w*|reduce|reducir|reducele)\s+(?:el\s+|la\s+)?(?:luz|brillo|exposicion)\b/)) k.metas.exposicion = { valor: 0.9 };
  if (sacar(/\b(?:destellos?\s+de\s+luz|destello|flash(?!\s+de\s+foto)|fogonazo|resplandor)\b/)) k.metas.exposicion = { destello: true };
  // «que la piedra brille»: la cámara va a la piedra, destello de luz y sonido de brillo justo cuando llega
  if (sacar(/\b(?:brill(?:e|en|ando)|destell(?:e|en|ando)|resplandezca\w*|reluzca\w*|centell\w*)\b/)) {
    k.metas.exposicion = { destello: true }; k.sonidos.push('brillo'); k.brillaPiedra = true;
    if (hay(PIEDRA)) k.cuando = 'piedra';
  }
  // desenfoque (antes que el zoom: «efecto macro» no es acercarse)
  if (sacar(/\b(?:desenfoque|desenfocad[oa]|bokeh|fondo\s+borroso|borroso|profundidad\s+de\s+campo|efecto\s+macro)\b/)) k.metas.desenfoque = { valor: hay(/\b(?:mucho|bastante|fuerte)\b/) ? 0.9 : hay(/\b(?:poco|leve|suave)\b/) ? 0.3 : 0.6 };
  else if (sacar(/\b(?:nitid[oa]|sin\s+desenfoque|todo\s+enfocado|quita\w*\s+el\s+desenfoque)\b/)) k.metas.desenfoque = { valor: 0 };
  // curvas y modificadores
  if (sacar(/\bfrenafinal\b|\b(?:frena\w*|frene|desaceler\w*|aterriza\w*)\b|\bse\s+detiene\s+suave\w*/)) k.mods.frenaFinal = true;
  const rapidoInicio = !!sacar(/\brapidoinicio\b/);
  if (sacar(/\b(?:con\s+)?(?:rebote|rebotando|rebota|que\s+rebote)\b/)) k.curva = 'rebote';
  else if (sacar(/\b(?:elastic[oa]|resorte)\b/)) k.curva = 'elastico';
  else if (sacar(/\b(?:en\s+seco|sin\s+transicion|salto\s+directo|de\s+una\s+vez)\b/)) k.curva = 'escalon';   // («corte» ya es un corte de verdad)
  else if (sacar(/\b(?:acelerando|acelera|que\s+acelere|cada\s+vez\s+mas\s+rapido)\b/)) k.curva = 'entrada';
  else if (sacar(/\b(?:velocidad\s+constante|a\s+velocidad\s+constante|constante|lineal|uniforme|parej[oa])\b/)) k.curva = 'lineal';
  if (sacar(/\bmas\s+(?:rapido|veloz|rapida)\b/)) k.mods.velocidad = 1.6;
  else if (sacar(/\bmas\s+(?:lento|lenta|despacio|suave)\b|\bcamara\s+lenta\b|\bslow\s*motion\b/)) k.mods.velocidad = 0.6;
  else if (sacar(/^\s*(?:muy\s+|mas\s+)?(?:rapid[oa]|veloz)\s*$/)) k.mods.velocidad = 1.6;
  else if (sacar(/^\s*(?:muy\s+|mas\s+)?(?:lent[oa]|despacio)\s*$/)) k.mods.velocidad = 0.6;
  // (a) «al mismo tiempo»: comparte el tramo de la indicación anterior
  if (sacar(/\b(?:al\s+mismo\s+tiempo|a\s+la\s+vez|simultaneamente|mientras\s+tanto)\b/)) k.junto = true;
  if (hay(/\b(?:rapid[oa]s?|rapidamente|veloz|de\s+golpe|brusc[oa]|subit[oa]|repentin[oa]|con\s+fuerza)\b/)) { k.rapido = true; k.peso = 0.55; }
  else if (hay(/\b(?:lent[oa]s?|lentamente|despacio|suave(?:mente)?|poco\s+a\s+poco|tranquil[oa]|pausad[oa])\b/)) { k.lento = true; k.peso = 1.6; }
  // sonidos (y cuándo): «cuando aparezca la piedra» solo cuenta si hay un sonido o un texto; si no, «acércate al diamante» perdería la piedra
  const mueve = hay(/\b(?:acerc|acerqu|aproxim|zoom|enfoc|enfoqu|revel|muestr|lleg)\w*/);
  if (k.esTexto || SONIDOS.some(([, re]) => hay(re))) for (const [id, re, suelto] of CUANDO) if (!(suelto && mueve) && sacar(re)) { k.cuando = id; break; }
  for (const [id, re] of SONIDOS) {
    for (let i = 0; i < 3 && hay(re); i++) { r = r.replace(re, ' '); k.sonidos.push(id); k.entendido = true; }
  }
  // tiempo
  k.t = tiempo(r);
  if (k.t.algo) k.entendido = true;
  r = k.t.resto;
  if (k.esTexto) return k;
  // presets con nombre
  if (hay(/\b(?:elegante|sofisticad[oa]|lujos[oa]|de\s+lujo|con\s+clase|delicad[oa])\b/)) k.elegante = true;
  for (const [id, re] of PRESETS) if (hay(re)) { k.preset = id; r = r.replace(re, ' '); k.entendido = true; break; }
  camara(k, r);
  if (k.cortes && !k.cortes.quitar && Object.keys(k.metas).length) {
    // «con un corte acércate a la piedra»: en el corte la cámara salta al plano nuevo (en vez de ir llegando)
    k.corteAlInicio = true;
    const t0 = k.cortes.tiempos.find(esNum);
    if (t0 !== undefined && k.t.a === undefined) { k.t.a = t0; k.t.algo = true; }
    k.cortes.tiempos = []; k.cortes.n = 0; k.cortes.cada = 0;
  }
  if (k.cortes && k.sonidos.length && !k.cuando) k.cuando = 'cortes';   // «un corte a los 3 con un whoosh»: suena en el corte
  if (rapidoInicio) { if (Object.keys(k.metas).length) { k.t.inicio = true; k.rapido = true; k.peso = 0.55; } else k.mods.rapidoInicio = true; }
  if (k.mods.frenaFinal && Object.keys(k.metas).length && !k.curva) k.curva = 'salida';
  if (Object.keys(k.metas).length || Object.keys(k.mods).length || k.curva) k.entendido = true;
  return k;
}

// Expresiones de tiempo de una cláusula: a = empieza, b = termina, len = cuánto dura; inicio/final sin números
function tiempo(r0) {
  let r = r0; const t = { algo: false };
  const sacar = re => { const m = r.match(re); if (m) { r = r.replace(re, ' '); t.algo = true; } return m; };
  const N = '(\\d+(?:\\.\\d+)?)';
  let m;
  if ((m = sacar(new RegExp(`\\b(?:del?|entre\\s+el)\\s+segundo\\s+${N}\\s+(?:al?|y\\s+el|hasta\\s+el)\\s+(?:segundo\\s+)?${N}`))) || (m = sacar(new RegExp(`\\bde\\s+${N}\\s+a\\s+${N}\\s+segundos\\b`)))) { t.a = +m[1]; t.b = +m[2]; }
  if ((m = sacar(new RegExp(`\\b(?:en\\s+)?los\\s+primeros\\s+${N}\\s+segundos\\b`)))) { t.a = 0; t.b = +m[1]; }
  else if (sacar(/\b(?:en\s+)?el\s+primer\s+segundo\b/)) { t.a = 0; t.b = 1; }
  if ((m = sacar(new RegExp(`\\b(?:en\\s+)?los\\s+ultimos\\s+${N}\\s+segundos\\b`)))) t.ultimos = +m[1];
  else if (sacar(/\b(?:en\s+)?el\s+ultimo\s+segundo\b/)) t.ultimos = 1;
  if (t.a === undefined && (m = sacar(new RegExp(`\\b(?:al|en\\s+el|desde\\s+el|a\\s+partir\\s+del)\\s+segundo\\s+${N}\\b|\\b(?:a|desde|despues\\s+de)\\s+los\\s+${N}\\s+segundos\\b|\\bdespues\\s+de\\s+${N}\\s+segundos\\b`)))) t.a = +(m[1] ?? m[2] ?? m[3]);
  if (t.b === undefined && (m = sacar(new RegExp(`\\bhasta\\s+(?:el\\s+segundo|los)\\s+${N}(?:\\s+segundos)?\\b`)))) t.b = +m[1];
  if ((m = sacar(new RegExp(`\\b(?:en|durante|por|dura)\\s+${N}\\s+segundos\\b`)))) t.len = +m[1];
  if (sacar(/\b(?:al\s+(?:inicio|principio|comienzo|arrancar|empezar)|para\s+(?:empezar|arrancar|abrir)|de\s+entrada|empie[zc]a\w*|empezar|arranca\w*|comien[zc]a\w*|abre\s+con)\b/)) t.inicio = true;
  if (sacar(/\b(?:al\s+final|al\s+terminar|al\s+cierre|termina\w*|termine|acaba\w*|finalmente|para\s+(?:terminar|cerrar|finalizar)|por\s+ultimo|cierra\s+con|remata\w*)\b/)) t.final = true;
  t.resto = r;
  return t;
}

// Metas de cámara de una cláusula (qué pista va hacia qué valor)
function camara(k, r0) {
  let r = r0;
  const hay = re => re.test(r), sacar = re => { const m = r.match(re); if (m) r = r.replace(re, ' '); return m; };
  const M = k.metas;
  // posición de la pieza en el cuadro (antes del giro: «la pieza a la izquierda» no es girar)
  let m = sacar(/\b(?:sube|subir|baja|bajar|mueve|mover|lleva|pon|coloca|desplaza|corre)\s+(?:la\s+|el\s+)?(?:pieza|joya|anillo|objeto)\s+(?:mas\s+)?(?:hacia\s+)?(arriba|abajo|a\s+la\s+izquierda|a\s+la\s+derecha|al\s+centro)?|\b(?:pieza|joya|anillo)\s+(?:mas\s+)?(arriba|abajo|a\s+la\s+izquierda|a\s+la\s+derecha|centrad[oa]|al\s+centro)\b|\bcentra\w*\s+(?:la\s+|el\s+)?(?:pieza|joya|anillo)\b/);
  if (m) {
    const lado = m[1] || m[2] || (/^\s*(?:sube|subir)/.test(m[0]) ? 'arriba' : /^\s*(?:baja|bajar)/.test(m[0]) ? 'abajo' : 'centro');
    if (/arriba/.test(lado)) M.altura = { delta: 0.15, txt: 'sube la pieza en el cuadro' };
    else if (/abajo/.test(lado)) M.altura = { delta: -0.15, txt: 'baja la pieza en el cuadro' };
    else if (/izquierda/.test(lado)) M.lateral = { delta: -0.2, txt: 'lleva la pieza a la izquierda' };
    else if (/derecha/.test(lado)) M.lateral = { delta: 0.2, txt: 'lleva la pieza a la derecha' };
    else { M.altura = { valor: 0, txt: 'centra la pieza' }; M.lateral = { valor: 0 }; }
  }
  // giro
  const verboGiro = hay(/\b(?:gir\w*|rot\w*|vueltas?|giro|da(?:le)?\s+(?:\d|la|una|unas)|dando\s+vueltas|voltea\w*)\b/);
  const izq = hay(/\b(?:a|hacia)\s+la\s+izquierda\b|\bsentido\s+(?:del\s+reloj|horario|de\s+las\s+(?:agujas|manecillas))\b|\bhorario\b/);
  const der = hay(/\b(?:a|hacia)\s+la\s+derecha\b|\bantihorario\b|\b(?:contra|en\s+contra\s+de)\s+(?:las\s+(?:manecillas|agujas)|el\s+reloj)\b/);
  const reves = hay(/\b(?:al\s+reves|sentido\s+contrario|hacia\s+el\s+otro\s+lado|para\s+el\s+otro\s+lado|devuelve\w*)\b/);
  const vueltas = r.match(/(\d+(?:\.\d+)?)\s+vueltas?\b/), grados = r.match(/(\d+(?:\.\d+)?)\s+grados\b/);
  const frente = hay(/\bde\s+frente\b|\bfrontal\w*\b|\bmirando\s+(?:a\s+la\s+|hacia\s+la\s+)?camara\b|\bde\s+cara\b/);
  const lado = hay(/\bde\s+(?:lado|perfil)\b|\bperfil\b|\b(?:vista\s+)?lateral\b/);
  const detras = hay(/\b(?:por\s+)?detras\b|\bparte\s+de\s+atras\b|\bespalda\b/);
  const quieta = hay(/\b(?:quiet[oa]|sin\s+(?:girar|movimiento|moverse)|que\s+no\s+(?:gire|se\s+mueva)|estatic[oa]|detenid[oa]|fij[oa]|para\s+de\s+girar|deja\s+de\s+girar|no\s+gire)\b/);
  if (quieta) M.giro = { quieta: true };
  else if (verboGiro || vueltas || grados || frente || lado || detras || reves) {
    const g = {};
    const dir = der ? -1 : izq ? 1 : 0;
    if (vueltas) g.delta = +vueltas[1] * 360; else if (grados) g.delta = +grados[1];
    else if (verboGiro || reves) g.delta = k.rapido ? 720 : k.lento ? 360 : 360;
    if (g.delta !== undefined) { g.dir = dir; g.reves = reves && !dir; }
    if (frente) g.frente = true; else if (lado) g.lado = true; else if (detras) g.detras = true;
    M.giro = g;
  }
  // zoom y foco
  const cerca = hay(/\b(?:acer(?:c|qu)\w*|aproxim\w*|zoom(?!\s+out)|primer\s+plano|plano\s+detalle|close\s*up|mas\s+cerca|de\s+cerca|macro|detalle|amplia\w*|agranda\w*|zoom\s+in)\b/);
  const lejos = hay(/\b(?:alej\w*|zoom\s+out|plano\s+(?:general|abierto|completo)|toda\s+la\s+(?:pieza|joya)|(?:pieza|joya|anillo)\s+complet[oa]|mas\s+lejos|de\s+lejos|abre\s+el\s+plano|retroce\w*|achica\w*)\b/);
  const piedra = r.match(PIEDRA), detalle = hay(/\bdetalle\b/);
  const poco = hay(/\b(?:un\s+poco|un\s+poquito|ligeramente|leve\w*|apenas)\b/), mucho = hay(/\b(?:mucho|bastante|muy\s+cerca|al\s+maximo|extremo|super\s+cerca|full)\b/);
  const factor = r.match(/\bx\s*(\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*x\b|\b(al\s+doble)\b/);
  if (lejos && !(cerca && !/\balej/.test(r) && !/\bzoom\s+out\b/.test(r))) {
    M.zoom = { dir: -1, poco, mucho };
    M.foco = { valor: 0, txt: '' };
  } else if (cerca || factor) {
    M.zoom = { dir: 1, poco, mucho, piedra: !!piedra, detalle, valor: factor ? (factor[3] ? null : +(factor[1] || factor[2])) : null, doble: !!factor?.[3] };
    if (piedra) M.foco = { valor: 1, piedra: piedra[1] };
    else if (detalle) M.foco = { valor: 0.6 };
  } else if (piedra && hay(/\b(?:enfoc\w*|enfoqu\w*|muestr\w*|mira\w*|ver|vea|revel\w*|apunt\w*|centr\w*|qued\w*|termin\w*|en|a|al|hacia)\b/)) {
    M.foco = { valor: 1, piedra: piedra[1] };
    M.zoom = { minimo: 1.7 };
  } else if (piedra && k.brillaPiedra) {
    M.foco = { valor: 1, piedra: piedra[1] };
    M.zoom = { minimo: 1.7 };
  } else if (hay(/\b(?:enfoc\w*|centr\w*)\s+(?:la\s+|toda\s+la\s+)?(?:pieza|joya|anillo)\b|\bcentro\s+de\s+la\s+pieza\b/)) M.foco = { valor: 0 };
  // altura de la cámara
  const paso = poco ? 10 : mucho ? 30 : 20;
  const deltaInc = hay(/\b(?:sub\w*|elev\w*|levant\w*)\s+(?:un\s+poco\s+|un\s+poquito\s+)?(?:la\s+)?camara\b|\bcamara\s+(?:mas\s+)?(?:arriba|alta)\b|\bmas\s+alt[oa]\b/) ? paso
    : hay(/\b(?:baj\w*|desciend\w*)\s+(?:un\s+poco\s+|un\s+poquito\s+)?(?:la\s+)?camara\b|\bcamara\s+(?:mas\s+)?(?:abajo|baja)\b|\bmas\s+baj[oa]\b/) ? -paso : 0;
  if (hay(/\b(?:cenital|desde\s+el\s+techo|top\s+view|vista\s+de\s+pajaro|en\s+planta)\b/)) M.inclinacion = { valor: 78, txt: 'vista cenital' };
  else if (hay(/\b(?:desde\s+arriba|vista\s+(?:superior|de\s+arriba|aerea)|(?:en\s+)?picad[oa]|por\s+encima|desde\s+lo\s+alto|en\s+alto)\b/)) M.inclinacion = { valor: 60, txt: 'vista desde arriba' };
  else if (hay(/\b(?:contrapicad[oa]|desde\s+abajo|angulo\s+bajo|toma\s+baja|a\s+ras|desde\s+el\s+piso|desde\s+la\s+mesa|de\s+abajo)\b/)) M.inclinacion = { valor: hay(/contrapicad/) ? -15 : -10, txt: 'contrapicado (desde abajo)' };
  else if (frente) M.inclinacion = { valor: 8, txt: 'a la altura de la pieza' };
  else if (deltaInc) M.inclinacion = { delta: deltaInc, txt: deltaInc > 0 ? 'sube la cámara' : 'baja la cámara' };
  else if (!M.altura && hay(/\b(?:sube|subiendo|asciende)\b/)) M.inclinacion = { delta: paso, txt: 'sube la cámara' };
  else if (!M.altura && hay(/\b(?:baja|bajando|desciende)\b/)) M.inclinacion = { delta: -paso, txt: 'baja la cámara' };
  // inclinación lateral (roll) y balanceo
  if (hay(/\b(?:balance\w*|mece\w*|mecer|meciendo|oscila\w*)\b/)) M.rodar = { oscilar: 9 };
  else if (hay(/\b(?:endereza\w*|nivela\w*|sin\s+inclinacion|camara\s+recta)\b/)) M.rodar = { valor: 0 };
  else if (hay(/\b(?:inclin\w*|lade\w*|torc\w*|dutch|holandes|diagonal)\b/) && !hay(/\binclinacion\s+de\s+la\s+camara\s+(?:arriba|abajo)\b/)) M.rodar = { valor: der ? -12 : 12 };
  // ¿describe una vista (estado) o un movimiento?
  // (dar vueltas, balancearse o un destello siempre es movimiento, aunque no haya verbo: «media vuelta a la derecha»)
  const mov = (M.giro && (M.giro.delta !== undefined || M.giro.vaiven)) || M.rodar?.oscilar || M.exposicion?.destello || k.rapido || k.lento;
  k.estado = Object.keys(M).length > 0 && !mov && !hay(/\b(?:gir|rot|acerc|acerqu|aproxim|alej|sub|baj|desciend|elev|muev|mueve|vuelv|regres|termin|acab|pas[ae]|cambi|zoom|enfoc|inclin|balanc|mece|lade|revel|hasta|lleg|da\b|dale|voltea)\w*/);
  if (k.preset === 'vaiven') { /* se decide en interpretar */ }
}

// ---------- Ventanas de tiempo de las cláusulas de cámara ----------
function ventanas(cls, D) {
  const finLen = limitar(D * 0.25, 1.2, 3), iniLen = limitar(D * 0.25, 1, 2.2);
  cls.forEach((k, i) => {
    let { a, b, len, inicio, final, ultimos } = k.t;
    if (ultimos !== undefined) { a = D - ultimos; b = D; }
    // una vista sin verbo ni tiempo («desde arriba», «contrapicado») es el plano de partida; si va sola, el de todo el video
    if (a === undefined && b === undefined && len === undefined && !inicio && !final && k.estado && i === 0) { k.inicial = true; k.a = k.b = 0; return; }
    if (a !== undefined && b === undefined && len !== undefined) b = a + len;
    if (b !== undefined && a === undefined && len !== undefined) a = b - len;
    if (final && a === undefined && b === undefined) { b = D; a = D - (len ?? finLen * (k.rapido ? 0.6 : 1)); }
    if (inicio && a === undefined && b === undefined) { a = 0; b = len ?? iniLen * (k.rapido ? 0.6 : 1); }
    Object.assign(k, { a, b, len });
  });
  // los que no dicen cuándo se reparten el tiempo que queda, en orden (los rápidos ocupan menos)
  let cursor = 0;
  for (let i = 0; i < cls.length; i++) {
    const k = cls[i]; if (k.inicial) continue;
    const previo = cls.slice(0, i).reverse().find(o => !o.inicial);
    if (k.junto && previo && k.a === undefined && k.b === undefined && k.len === undefined) { k.a = previo.a; k.b = previo.b; continue; }
    if (k.a === undefined) k.a = cursor;
    if (k.b === undefined) {
      if (k.len !== undefined) k.b = k.a + k.len;
      else {
        const grupo = [k]; let j = i + 1, limite = D;
        while (j < cls.length) {
          const o = cls[j];
          if (o.a !== undefined) { limite = o.a; break; }
          if (o.junto && o.b === undefined && o.len === undefined) { j++; continue; }
          grupo.push(o);
          if (o.b !== undefined) { limite = o.b; break; }
          j++;
        }
        const fijo = grupo.reduce((s, o) => s + (o !== k && o.len !== undefined && o.b === undefined ? o.len : 0), 0);
        const libres = grupo.filter(o => o.len === undefined && o.b === undefined);
        const pesoTotal = libres.reduce((s, o) => s + o.peso, 0) || 1;
        let disponible = Math.max(0.3 * libres.length, limite - k.a - fijo);
        // una sola indicación rápida no se estira a todo el video: ocupa lo justo y el resto lo llena un giro suave
        if (libres.length === 1 && k.rapido && grupo.length === 1) disponible = Math.min(disponible, limitar(D * 0.4, 1.2, 4));
        k.b = k.a + disponible * k.peso / pesoTotal;
      }
    }
    if (k.b < k.a) [k.a, k.b] = [k.b, k.a];
    k.a = limitar(k.a, 0, D); k.b = limitar(k.b, 0, D);
    if (k.b - k.a < 0.25) { k.b = Math.min(D, k.a + 0.25); k.a = Math.min(k.a, k.b - 0.25); }
    cursor = Math.max(cursor, k.b);
  }
}

// ---------- Construcción de keyframes ----------
const ZOOM = PISTAS.zoom;
const CUADRO = 1 / 30;
const aCuadro = t => Math.round(t * 30) / 30;
function objetivo(id, meta, cur, ctx) {
  const P = PISTAS[id];
  if (id === 'giro') {
    if (meta.quieta) return cur;
    let v = cur;
    if (meta.delta !== undefined) {
      const dir = meta.dir || (meta.reves ? -ctx.dirGiro : ctx.dirGiro || 1);
      v = cur + Math.abs(meta.delta) * dir;
      ctx.dirGiro = dir;
    }
    const multiplo = base => { const d = ctx.dirGiro || 1, n = (v - base) / 360; return base + 360 * (meta.delta !== undefined ? Math.round(n) : d > 0 ? Math.ceil(n - 1e-6) : Math.floor(n + 1e-6)); };
    if (meta.frente) {
      // sigue girando en el mismo sentido hasta el frente si falta poco; si no, vuelve al frente más cercano
      const sig = multiplo(0);
      v = meta.delta !== undefined || Math.abs(sig - cur) <= 200 ? sig : Math.round(cur / 360) * 360;
    }
    else if (meta.lado) v = multiplo(90);
    else if (meta.detras) v = multiplo(180);
    return limitar(v, P.min, P.max);
  }
  if (id === 'zoom') {
    if (meta.minimo) return Math.max(cur, meta.minimo);
    if (meta.dir > 0) {
      let v = meta.valor ?? (meta.doble ? cur * 2 : meta.piedra ? (meta.mucho ? 2.8 : 2.2) : meta.detalle ? 2.4 : meta.mucho ? 2.6 : meta.poco ? Math.max(cur * 1.25, 1.15) : Math.max(cur * 1.5, 1.7));
      if (!meta.valor && v <= cur * 1.05) v = cur * 1.3;
      return r2(limitar(v, ZOOM.min, ZOOM.max));
    }
    let v = meta.mucho ? 0.7 : meta.poco ? cur / 1.25 : cur > 1.15 ? 1 : 0.85;
    if (v >= cur * 0.97) v = cur / 1.3;
    return r2(limitar(v, ZOOM.min, ZOOM.max));
  }
  if (meta.valor !== undefined) return limitar(meta.valor, P.min, P.max);
  if (meta.delta !== undefined) return limitar(cur + meta.delta, P.min, P.max);
  return cur;
}

const curvaDe = (k, id, a) => k.curva || (k.rapido ? 'salida' : id === 'giro' && a < 0.05 && !k.lento ? 'salida' : 'suave');

function construirPista(id, cls, v0, D, ctx) {
  const claves = [{ t: 0, v: v0, curva: 'suave' }];
  let cur = v0, tc = 0, ultima = null;
  for (const k of cls) {
    const meta = k.metas[id]; if (!meta || k.inicial) continue;
    const a = Math.min(Math.max(k.a, tc), D - 0.2), b = Math.min(D, Math.max(k.b, a + 0.2));
    const curva = curvaDe(k, id, a);
    if (k.corteAlInicio && a >= CUADRO * 2 && !meta.oscilar && !meta.vaiven && !meta.destello && !(id === 'giro' && meta.delta !== undefined)) {
      // con un corte: el plano anterior se queda hasta un cuadro antes y en el corte la cámara ya está en el plano nuevo
      if (a - CUADRO > tc + 1e-3) claves.push({ t: a - CUADRO, v: cur, curva: 'lineal' });
      meta.de = cur; cur = objetivo(id, meta, cur, ctx); meta.a = cur;
      claves.push({ t: a, v: cur, curva: 'suave' });
      if (b > a + 0.1) claves.push({ t: b, v: cur, curva: 'suave' });
      tc = claves[claves.length - 1].t; ultima = { k, meta };
      continue;
    }
    if (a > tc + 1e-3) claves.push({ t: a, v: cur, curva }); else claves[claves.length - 1].curva = curva;
    if (meta.oscilar && id === 'rodar' || meta.vaiven) {
      // vaivén / balanceo: ida y vuelta alrededor del valor actual, ciclos de unos 3 s
      const A = meta.oscilar || 38, n = Math.max(1, Math.round((b - a) / 3)), paso = (b - a) / n;
      for (let i = 0; i < n; i++) {
        const t0 = a + i * paso;
        claves.push({ t: t0 + paso / 4, v: cur + A, curva: 'suave' }, { t: t0 + paso * 3 / 4, v: cur - A, curva: 'suave' }, { t: t0 + paso, v: cur, curva: 'suave' });
      }
    } else if (meta.destello) {
      // destello de luz: sube de golpe y vuelve en medio segundo, al final de la ventana
      const tf = Math.max(a, b - 0.7), pico = Math.min(PISTAS.exposicion.max, Math.max(cur, 1.15) + 0.4);
      if (tf > a + 1e-3) claves.push({ t: tf, v: cur, curva: 'salida' }); else claves[claves.length - 1].curva = 'salida';
      claves.push({ t: Math.min(D, tf + 0.12), v: pico, curva: 'suave' }, { t: Math.min(D, tf + 0.7), v: cur, curva: 'suave' });
    } else {
      meta.de = cur;
      cur = objetivo(id, meta, cur, ctx);
      meta.a = cur;   // para la respuesta («baja hasta…» o «sube hasta…»)
      claves.push({ t: b, v: cur, curva: 'suave' });
    }
    tc = claves[claves.length - 1].t; ultima = { k, meta };
  }
  return { claves: limpiar(claves, id, D), ultima };
}

// ordena, junta los keyframes que caen en el mismo instante y recorta a los rangos
function limpiar(claves, id, D) {
  const P = PISTAS[id], out = [];
  for (const c of [...claves].sort((x, y) => x.t - y.t)) {
    const k = { t: r4(limitar(c.t, 0, D)), v: r4(limitar(c.v, P.min, P.max)), curva: c.curva };
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.t - k.t) < TOLERANCIA) { prev.v = k.v; continue; }
    out.push(k);
  }
  return out;
}

const tramosConMovimiento = claves => claves.map((c, i) => i < claves.length - 1 && Math.abs(claves[i + 1].v - c.v) > 1e-6 ? i : -1).filter(i => i >= 0);
const ponerCurva = (claves, cual, curva) => { const t = tramosConMovimiento(claves); if (t.length) claves[cual === 'ultimo' ? t[t.length - 1] : t[0]].curva = curva; return t.length > 0; };

// ¿El movimiento termina como empezó? (el giro, en una vuelta completa)
function cierra(claves, id) {
  if (!claves || claves.length < 2) return true;
  const a = claves[0].v, b = claves[claves.length - 1].v;
  return id === 'giro' ? Math.abs(((b - a) % 360 + 360) % 360) < 1 || Math.abs(((b - a) % 360 + 360) % 360 - 360) < 1 : Math.abs(b - a) < 1e-3;
}
function cerrarBucle(claves, id, D) {
  if (cierra(claves, id)) return claves;
  const a = claves[0].v, ult = claves[claves.length - 1];
  if (id === 'giro') {
    const n = Math.round((ult.v - a) / 360) || Math.sign(ult.v - a) || 1;
    ult.v = r4(limitar(a + n * 360, PISTAS.giro.min, PISTAS.giro.max));
    if (ult.t < D - 1e-3) claves.push({ t: D, v: ult.v, curva: 'suave' });
    if (claves.length === 2) claves[0].curva = 'lineal';
    return claves;
  }
  if (ult.t < D - 0.3) claves.push({ t: D, v: a, curva: 'suave' }); else ult.v = a;
  return claves;
}

// ---------- El intérprete ----------
const vueltasTxt = g => {
  const v = Math.abs(g) / 360;
  if (Math.abs(v - 0.5) < 1e-6) return 'media vuelta';
  if (Math.abs(v - 1.5) < 1e-6) return '1 vuelta y media';
  if (Math.abs(v - Math.round(v)) < 1e-6 && v >= 1) return `${Math.round(v)} ${Math.round(v) === 1 ? 'vuelta' : 'vueltas'}`;
  if (Math.abs(v * 2 - Math.round(v * 2)) < 1e-6 && v > 1) return `${Math.floor(v)} vueltas y media`;
  return `${Math.round(Math.abs(g))}°`;
};

function proyectoBase(p) {
  const d = esObj(p) ? p : {};
  return {
    duracion: esNum(d.duracion) ? limitar(d.duracion, DURACION_MIN, DURACION_MAX) : 8, bucle: d.bucle !== false,
    pistas: esObj(d.pistas) ? d.pistas : {}, textos: Array.isArray(d.textos) ? d.textos.filter(esObj) : [],
    audio: { clips: Array.isArray(d.audio?.clips) ? d.audio.clips.filter(esObj) : [], musica: esObj(d.audio?.musica) ? d.audio.musica : null },
    cortes: Array.isArray(d.cortes) ? d.cortes.filter(esObj) : [],
  };
}

// Pedidos que no son del chat: se le dice en qué pestaña se hacen
function fueraDeAqui(x) {
  if (/\b(?:metal|oro(?:\s+(?:rosa|blanco|amarillo))?|plata|platino|acabado|material|color\s+de\s+la\s+(?:piedra|gema))\b/.test(x)) return 'El metal, el acabado y el color de las piedras se cambian en la pestaña «Materiales». Aquí puedo mover la cámara y poner textos, sonidos o música.';
  if (/\b(?:logo|logotipo|marca|escarabajo)\b/.test(x)) return 'El logo de Atelier & Co está en la pestaña «Textos»: ahí lo mueves, cambias cuándo aparece o lo ocultas.';
  if (/\b(?:fondo|color\s+de\s+fondo|escena|superficie|pedestal|decorado)\b/.test(x)) return 'Puedo cambiar la escena: prueba «pon la joya en un pedestal de mármol», «fondo con luz de ventana», «luz desde la derecha» o «fondo liso». También la eliges en la pestaña «Escena».';
  if (/\bsombras?\b/.test(x)) return 'La sombra bajo la pieza del fondo liso se ajusta en la pestaña «Escena». En una escena 3D la sombra la da su luz: prueba «sombras más suaves» o «luz desde la izquierda».';
  if (/\b(?:export\w*|descarg\w*|guarda\w*\s+el\s+video|crea\w*\s+el\s+video|compart\w*|subir\s+a\s+instagram)\b/.test(x)) return 'Para crear y descargar el video usa la pestaña «Exportar».';
  if (/\b(?:stl|archivo|modelo\s+3d|otro\s+anillo|otra\s+joya)\b/.test(x)) return 'Para cambiar la joya sube otro archivo STL en la pestaña «Modelo».';
  return '';
}

// interpretar(texto, proyecto, info) → acciones (la misma forma que devuelve /api/chat). Nunca lanza.
export function interpretar(texto, proyecto, info = {}) {
  try { return interpretarSinRed(texto, proyecto, esObj(info) ? info : {}); }
  catch (e) { return accionesVacias('No pude entender eso. ' + AYUDA); }
}

function interpretarSinRed(texto, proyecto, info) {
  const P = proyectoBase(proyecto);
  const original = String(texto ?? '').slice(0, 1500);
  const { s, citas, precio } = extraer(original);
  const x = normalizar(s);
  const palabras = x.trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return accionesVacias(AYUDA);
  if (/^\s*(?:hola|holi|buenas|buenos\s+dias|buenas\s+(?:tardes|noches)|hey|que\s+tal)\b/.test(x) && palabras.length <= 4) return accionesVacias('¡Hola! Cuéntame cómo quieres que se mueva la joya. ' + AYUDA);
  if (/\b(?:gracias|perfecto|genial|me\s+gusta|chevere|bacano|excelente|super|divino|hermoso)\b/.test(x) && palabras.length <= 5) return accionesVacias('¡Con gusto! Si quieres otro cambio, solo dímelo.');
  if (/\b(?:deshacer|deshaz|devuelvelo|como\s+estaba\s+antes)\b/.test(x)) return accionesVacias('Para deshacer usa el botón «Deshacer» de la línea de tiempo (o Ctrl+Z).');
  if (/^\s*(?:ayuda|que\s+puedes\s+hacer|que\s+sabes\s+hacer|como\s+funciona|ejemplos?)\b/.test(x)) return accionesVacias(AYUDA);

  // cláusulas; las que solo dicen «cuándo» se pegan a la anterior (o a la siguiente si empiezan la frase)
  const crudas = partir(x).map(p => ({ ...analizar(p.c, citas), tras: p.tras }));
  const cls = [];
  crudas.forEach((k, i) => {
    const soloTiempo = k.t.algo && !k.esTexto && !Object.keys(k.metas).length && !Object.keys(k.mods).length && !k.curva && !k.sonidos.length && !k.preset && !k.musica && k.duracion === undefined && !k.bucle && !Object.keys(k.quitar).length && !k.cortes && !k.escena && !k.puesta;
    if (soloTiempo) {
      const destino = k.tras === '|' && cls.length ? cls[cls.length - 1] : crudas[i + 1];
      if (destino) {
        for (const c of ['a', 'b', 'len', 'ultimos', 'inicio', 'final']) if (k.t[c] !== undefined && destino.t[c] === undefined) destino.t[c] = k.t[c];
        destino.t.algo = true;
        return;
      }
    }
    cls.push(k);
  });
  if (!cls.some(k => k.entendido) && !precio) return accionesVacias(fueraDeAqui(x) || 'No entendí bien qué quieres cambiar. ' + AYUDA);

  // ----- globales -----
  const salida = accionesVacias(), notas = [];
  let D = P.duracion;
  const durPedida = cls.map(k => k.duracion).filter(v => v !== undefined).pop();
  if (durPedida !== undefined) {
    const nueva = r2(limitar(durPedida === 'largo' ? P.duracion * 1.5 : durPedida === 'corto' ? P.duracion * 0.7 : durPedida, DURACION_MIN, DURACION_MAX));
    if (Math.abs(nueva - P.duracion) > 1e-3) { salida.duracion = D = nueva; notas.push(`El video ahora dura ${seg(D)} (estiré los movimientos, textos y sonidos que ya tenías).`); }
    else notas.push(`El video ya dura ${seg(D)}.`);
  }
  const escala = D / P.duracion;
  const bucleTxt = cls.map(k => k.bucle).filter(Boolean).pop() || null;

  // pistas de partida: las del proyecto (estiradas si cambió la duración) o las de un movimiento con nombre
  let base = Object.fromEntries(PISTAS_IDS.map(id => [id, (P.pistas[id] || []).filter(esObj).map(c => ({ t: r4(limitar((+c.t || 0) * escala, 0, D)), v: +c.v || 0, curva: c.curva || 'suave' }))]));
  const salidaPistas = new Map();
  const camaras = cls.filter(k => !k.esTexto && (Object.keys(k.metas).length || k.preset || Object.keys(k.mods).length || k.curva));
  let preset = camaras.find(k => k.preset)?.preset || null;
  if (preset === 'vaiven' && camaras.filter(k => Object.keys(k.metas).length).length > 0) {
    camaras.find(k => k.preset === 'vaiven').metas.giro = { vaiven: true }; preset = null;
  }
  if (preset) {
    const nuevas = MOVIMIENTOS[preset].crear(D);
    for (const id of PISTAS_IDS) if (nuevas[id] || !['exposicion', 'desenfoque', ...PISTAS_DE_ESCENA].includes(id)) { base[id] = (nuevas[id] || []).map(c => ({ ...c })); salidaPistas.set(id, base[id]); }
  }
  const vBase = id => evaluar({ duracion: D, pistas: base }, 0)[id];
  const ctx = { dirGiro: Math.sign((base.giro.at(-1)?.v ?? 0) - (base.giro[0]?.v ?? 0)) || 1 };

  // ----- cámara -----
  const conMetas = camaras.filter(k => Object.keys(k.metas).length);
  // «termina de frente» sin pedir giros: se conserva el giro que había y solo se ajusta para que acabe de frente
  const pideGiro = conMetas.some(k => k.metas.giro && (k.metas.giro.delta !== undefined || k.metas.giro.quieta || k.metas.giro.vaiven || k.metas.giro.lado || k.metas.giro.detras));
  if (!pideGiro) for (const k of conMetas) if (k.metas.giro?.frente) {
    delete k.metas.giro;
    const g = base.giro.map(c => ({ ...c }));
    if (g.length >= 2) {
      const a = g[0].v, ult = g[g.length - 1];
      let v = Math.round(ult.v / 360) * 360;
      if (Math.abs(v - a) < 1e-6 && Math.abs(ult.v - a) >= 180) v += 360 * Math.sign(ult.v - a);
      ult.v = v; ponerCurva(g, 'ultimo', 'salida');
    } else if (g.length === 1) g[0].v = Math.round(g[0].v / 360) * 360;
    if (g.length) { base.giro = g; salidaPistas.set('giro', g); }
    k.frenteAjustado = true;
  }
  // «…y con rebote» suelto: la curva es del movimiento anterior (o del siguiente si va primero)
  let curvaSuelta = null;
  camaras.forEach((k, i) => {
    if (!k.curva || Object.keys(k.metas).length) return;
    const otro = camaras.slice(0, i).reverse().find(o => Object.keys(o.metas).length) || camaras.slice(i + 1).find(o => Object.keys(o.metas).length);
    if (otro) { if (!otro.curva) otro.curva = k.curva; } else curvaSuelta = k.curva;
  });
  ventanas(conMetas, D);
  // un salto con corte necesita un plano antes: si cae al principio, el corte va a la mitad de su tramo
  for (const k of conMetas) if (k.corteAlInicio) {
    if (k.a < 0.3) { if (k.b - k.a > 1) k.a = Math.min(D / 2, (k.a + k.b) / 2); else k.corteAlInicio = false; }
    if (k.corteAlInicio) k.a = aCuadro(k.a);
  }
  const tocadas = new Set(conMetas.flatMap(k => Object.keys(k.metas)));
  const ultimas = {};
  for (const id of PISTAS_IDS) {
    if (!tocadas.has(id)) continue;
    const ini = conMetas.find(k => k.inicial && k.metas[id]);
    const v0 = ini ? objetivo(id, ini.metas[id], vBase(id), ctx) : vBase(id);
    const { claves, ultima } = construirPista(id, conMetas, v0, D, ctx);
    salidaPistas.set(id, claves); ultimas[id] = ultima;
  }
  // el giro no se queda congelado al final: sigue un poquito (salvo que se pida quieta, de frente o en bucle)
  const g = salidaPistas.get('giro'), ug = ultimas.giro;
  if (g && ug && !preset && bucleTxt !== 'si' && !ug.meta.quieta && !ug.meta.frente && !ug.meta.lado && !ug.meta.detras && !ug.meta.vaiven) {
    const ult = g[g.length - 1];
    if (ult.t < D - 1) {
      const dir = Math.sign(ult.v - g[0].v) || ctx.dirGiro || 1;
      g.push({ t: D, v: r4(limitar(ult.v + dir * Math.min(25, 8 * (D - ult.t)), PISTAS.giro.min, PISTAS.giro.max)), curva: 'suave' });
    }
  }
  // modificadores sueltos: «frena al final», «rápido al inicio», «con rebote», «más lento»
  const mods = Object.assign({}, ...camaras.map(k => k.mods));
  const conMovimiento = id => (salidaPistas.get(id) || base[id]).length >= 2 && tramosConMovimiento(salidaPistas.get(id) || base[id]).length > 0;
  const editar = id => { if (!salidaPistas.has(id)) salidaPistas.set(id, base[id].map(c => ({ ...c }))); return salidaPistas.get(id); };
  const modTxt = [];
  let alargar = 0;
  if (mods.frenaFinal && !conMetas.some(k => k.mods.frenaFinal)) {
    const ids = PISTAS_IDS.filter(conMovimiento);
    for (const id of ids) ponerCurva(editar(id), 'ultimo', 'salida');
    if (ids.length) modTxt.push('frena suave al final');
  }
  if (mods.rapidoInicio) {
    const ids = PISTAS_IDS.filter(conMovimiento);
    for (const id of ids) ponerCurva(editar(id), 'primero', 'salida');
    if (ids.length) modTxt.push('arranca rápido');
  }
  if (curvaSuelta) {
    const prev = ['zoom', 'giro', 'inclinacion', 'foco'].find(conMovimiento);
    if (prev) { ponerCurva(editar(prev), 'ultimo', curvaSuelta); modTxt.push(`${{ rebote: 'con rebote', elastico: 'con efecto resorte', escalon: 'con corte seco', entrada: 'acelerando', lineal: 'a velocidad constante', salida: 'frenando al final', suave: 'suave' }[curvaSuelta]} (${PISTAS[prev].nombre.toLowerCase()})`); }
  }
  if (mods.velocidad && !conMetas.some(k => k.metas.giro?.delta !== undefined) && conMovimiento('giro')) {
    const gi = editar('giro'), a = gi[0].v, f = mods.velocidad;
    const bucleActivo = bucleTxt === 'si' || (bucleTxt === null && P.bucle);
    if (f < 1 && bucleActivo && Math.abs(Math.abs(gi[gi.length - 1].v - a) - 360) < 1 && D * 1.5 <= DURACION_MAX) {
      // una sola vuelta en bucle: para que vaya más despacio sin romper el bucle, el video se alarga
      salidaPistas.delete('giro');
      alargar = r2(Math.min(DURACION_MAX, D * 1.5));
      modTxt.push(`gira más despacio: alargué el video a ${seg(alargar)} para no romper el bucle`);
    } else {
      for (const c of gi) c.v = r4(limitar(a + (c.v - a) * f, PISTAS.giro.min, PISTAS.giro.max));
      if (bucleActivo) cerrarBucle(gi, 'giro', D);
      modTxt.push(f > 1 ? 'gira más rápido' : 'gira más despacio');
    }
  }
  // bucle
  let bucle = bucleTxt;
  if (mods.frenaFinal && bucle === null && P.bucle && modTxt.length) { bucle = 'no'; notas.push('Lo dejé sin bucle para que el frenado se sienta como el final.'); }
  if (bucle === 'si') {
    for (const id of PISTAS_IDS) {
      const claves = salidaPistas.get(id) || base[id];
      if (claves.length >= 2 && !cierra(claves, id)) { const c = editar(id); cerrarBucle(c, id, D); }
    }
  } else if (bucle === null && salidaPistas.size) {
    const final = PISTAS_IDS.every(id => cierra(salidaPistas.get(id) || base[id], id));
    if (preset && MOVIMIENTOS[preset].bucle !== P.bucle) bucle = MOVIMIENTOS[preset].bucle ? 'si' : 'no';
    else if (!final && P.bucle) { bucle = 'no'; notas.push('Lo dejé sin bucle para que el video cierre en ese plano.'); }
  }
  if (bucle && (bucle === 'si') !== P.bucle) salida.bucle = bucle;
  else if (bucleTxt) salida.bucle = bucleTxt;
  if (bucleTxt === 'si') notas.push(P.bucle ? 'Queda en bucle: el final empalma con el inicio.' : 'Ahora va en bucle: el final empalma con el inicio.');
  else if (bucleTxt === 'no') notas.push('Lo dejé sin bucle.');
  // vueltas completas que ocupan todo el video y van en bucle: a velocidad constante, para que el empalme no se note
  const gi = salidaPistas.get('giro'), kg = ultimas.giro?.k;
  const enBucle = bucle === 'si' || (bucle === null && P.bucle);
  if (enBucle && gi?.length === 2 && kg && gi[0].t < 1e-3 && gi[1].t > D - 1e-3 && Math.abs(gi[1].v - gi[0].v) >= 359 && cierra(gi, 'giro') && !kg.curva && !kg.rapido && !kg.mods.frenaFinal && !mods.rapidoInicio) gi[0].curva = 'lineal';

  // ----- cortes -----
  const pedCortes = cls.filter(k => k.cortes), frasesCortes = [], nuevosDe = new Map();
  const existentes = normalizarCortes(P.cortes.map(c => ({ t: (+c.t || 0) * escala, transicion: c.transicion })), D);
  let cortes = existentes.map(c => ({ ...c })), cortesFinales = existentes, planosAlternos = false, quitarTodos = false, ritmoTxt = '';
  // el ritmo: de la música que se pide en este mismo mensaje, o de la que ya tiene
  const ritmo = (() => {
    const pedida = cls.map(k => k.musica).filter(Boolean).reduce((a, b) => ({ ...a, ...b }), null);
    if (pedida?.estilo === 'ninguna') return null;
    if (pedida?.estilo && MUSICA_INFO[pedida.estilo]) return { bpm: MUSICA_INFO[pedida.estilo].bpm, inicio: 0, nombre: MUSICA_INFO[pedida.estilo].nombre };
    const m = P.audio.musica;
    return m && +m.bpm > 0 ? { bpm: +m.bpm, inicio: esNum(+m.inicio) ? +m.inicio : 0, nombre: m.archivo ? 'tu canción' : MUSICA_INFO[m.estilo]?.nombre } : null;
  })();
  const reparto = n => Array.from({ length: n }, (_, i) => aCuadro(D * (i + 1) / (n + 1)));
  const cadaTanto = paso => { const out = []; for (let t = paso; t < D - 0.3; t += paso) out.push(aCuadro(t)); return out; };
  for (const k of pedCortes) {
    const c = k.cortes, tr = c.transicion;
    if (c.quitar) { cortes = []; quitarTodos = true; continue; }
    let tiempos = [], reemplaza = false;
    if (k.corteAlInicio && conMetas.includes(k)) tiempos = [k.a];
    else if (c.ritmo) {
      reemplaza = true;
      if (ritmo) {
        // un corte cada 1, 2, 4 u 8 tiempos: lo justo para que cada plano dure al menos 1,2 s
        const pulso = 60 / ritmo.bpm, n = [1, 2, 4, 8].find(x => x * pulso >= 1.2) || 8, paso = n * pulso, fase = ((ritmo.inicio % paso) + paso) % paso;
        for (let t = paso - fase; t < D - 0.3; t += paso) if (t > 0.3) tiempos.push(aCuadro(t));
        ritmoTxt = `al ritmo de la música: uno cada ${n} ${n === 1 ? 'tiempo' : 'tiempos'} (${seg(paso)}${ritmo.nombre ? `, ${ritmo.nombre} a ${Math.round(ritmo.bpm)} bpm` : ''})`;
      } else { tiempos = cadaTanto(2); notas.push('Todavía no hay música con un ritmo conocido: puse un corte cada 2 s. Si eliges una música, pídemelo otra vez y los pongo a su ritmo.'); }
    } else if (c.cada > 0) { reemplaza = true; tiempos = cadaTanto(Math.max(0.5, c.cada)); }
    else if (c.tiempos.length) tiempos = c.tiempos.map(t => (t === 'mitad' ? aCuadro(D / 2) : t)).filter(esNum);
    else if (c.n > 0) { reemplaza = true; tiempos = reparto(Math.min(c.n, 30)); }
    else if (tr && cortes.length) { for (const x of cortes) x.transicion = tr; frasesCortes.push(`los cortes ahora van con ${TRANSICIONES[tr].toLowerCase()}`); continue; }
    else { reemplaza = true; tiempos = reparto(Math.max(1, Math.round(D / 2.2) - 1)); }   // «ponle cortes»: uno cada 2 s más o menos
    if (reemplaza) cortes = [];
    const fuera = tiempos.filter(t => t < CUADRO - 1e-4 || t > D - CUADRO + 1e-4), validos = tiempos.filter(t => !fuera.includes(t));
    if (fuera.length) notas.push(`Un corte necesita algo antes y después: no puse ${fuera.length === 1 ? 'el' : 'los'} de ${fuera.map(seg).join(', ')} (el video dura ${seg(D)}).`);
    for (const t of validos) {
      const ya = cortes.find(x => Math.abs(x.t - t) < 1 / 15);
      if (ya) { if (tr) ya.transicion = tr; } else cortes.push({ t, transicion: tr || 'seco' });
    }
    nuevosDe.set(k, validos);
    if (!k.corteAlInicio && validos.length) planosAlternos = true;
  }
  // un movimiento base es continuo: si no se piden cortes, los que había se quitan
  if (preset && existentes.length && !pedCortes.length) { cortes = []; notas.push(`Quité los cortes: el movimiento «${MOVIMIENTOS[preset].nombre}» es continuo.`); }
  cortesFinales = normalizarCortes(cortes, D);
  const nuevos = cortesFinales.filter(c => !existentes.some(x => Math.abs(x.t - c.t) < 1e-3));
  const cambianCortes = cortesFinales.length !== existentes.length || cortesFinales.some((c, i) => Math.abs(c.t - existentes[i].t) > 1e-3 || c.transicion !== existentes[i].transicion);
  let alternados = false;
  // En un corte no se interpola: sin más, la cámara se congelaría hasta él. Las pistas que cambió este pedido siguen
  // moviéndose a través de todos los cortes, y todas las pistas a través de los cortes nuevos.
  const V2 = Object.fromEntries(PISTAS_IDS.map(id => [id, (salidaPistas.get(id) || base[id]).map(c => ({ ...c }))]));
  const separar = (ids, tiempos) => {
    const tmp = { duracion: D, pistas: Object.fromEntries(ids.map(id => [id, V2[id]])) };
    for (const t of tiempos) for (const id of separarPlanos(tmp, t)) salidaPistas.set(id, V2[id]);
  };
  // el zoom y el foco quietos, o armados solo para los cortes de antes (los planos que alternan): se pueden volver a armar
  const quieta = id => !V2[id].length || V2[id].every(x => Math.abs(x.v - V2[id][0].v) < 1e-6);
  const deCostura = id => existentes.length > 0 && V2[id].every(k => k.t < 1e-3 || k.t > D - 1e-3 || existentes.some(c => Math.abs(k.t - c.t) < TOLERANCIA || Math.abs(k.t - (c.t - CUADRO)) < TOLERANCIA));
  const planosLibres = !tocadas.has('zoom') && !tocadas.has('foco') && ['zoom', 'foco'].every(id => quieta(id) || deCostura(id));
  const deCosturaAntes = { zoom: deCostura('zoom') && !quieta('zoom'), foco: deCostura('foco') && !quieta('foco') };
  if (cortesFinales.length) separar([...salidaPistas.keys()], cortesFinales.map(c => c.t));
  if (cambianCortes) {
    salida.cortes = { cambiar: true, lista: cortesFinales };
    // los cortes que se van se llevan su costura (si no, quedaría un salto de un cuadro donde ya no hay corte); si ya no
    // queda ningún corte, el zoom y el foco que se armaron para ellos vuelven a quedarse quietos
    const quitados = existentes.filter(c => !cortesFinales.some(x => Math.abs(x.t - c.t) < 1e-3));
    const tmpTodo = { duracion: D, pistas: V2 };
    for (const c of quitados) for (const id of unirPlanos(tmpTodo, c.t)) salidaPistas.set(id, V2[id]);
    if (!cortesFinales.length) for (const id of ['zoom', 'foco']) if (deCosturaAntes[id] && !tocadas.has(id)) { const v = V2[id][0].v; V2[id] = Math.abs(v - PISTAS[id].def) < 1e-9 ? [] : [{ t: 0, v, curva: 'suave' }]; salidaPistas.set(id, V2[id]); }
    separar(PISTAS_IDS, nuevos.map(c => c.t));
    // cortes sin un plano nuevo no se notan: si el zoom y el foco están quietos, cada plano alterna entre la pieza completa
    // y un acercamiento a la piedra (con un empujón lento hacia adelante)
    if (planosAlternos && nuevos.length && planosLibres && !preset) {
      const z0 = V2.zoom[0]?.v ?? PISTAS.zoom.def, f0 = V2.foco[0]?.v ?? PISTAS.foco.def;
      const zc = r2(limitar(Math.max(1.8, z0 * 1.6), ZOOM.min, 3.2)), fc = info.tienePiedras === false ? 0.5 : 1;
      const limites = [0, ...cortesFinales.map(c => c.t), D], zoom = [], foco = [];
      for (let i = 0; i < limites.length - 1; i++) {
        const a = limites[i], b = i === limites.length - 2 ? D : limites[i + 1] - CUADRO, cerca = i % 2 === 1;
        zoom.push({ t: a, v: cerca ? zc : z0, curva: 'lineal' }, { t: b, v: cerca ? r2(Math.min(ZOOM.max, zc * 1.06)) : z0, curva: 'lineal' });
        foco.push({ t: a, v: cerca ? fc : f0, curva: 'lineal' }, { t: b, v: cerca ? fc : f0, curva: 'lineal' });
      }
      salidaPistas.set('zoom', limpiar(zoom, 'zoom', D)); salidaPistas.set('foco', limpiar(foco, 'foco', D));
      alternados = true;
    }
    // la respuesta
    // (los cortes de «con un corte acércate…» ya los cuenta la frase de la cámara)
    const deCamara = conMetas.filter(k => k.corteAlInicio).map(k => k.a);
    const ts = nuevos.map(c => c.t).filter(t => !deCamara.some(a => Math.abs(a - t) < 1e-3)), trs = [...new Set(nuevos.filter(c => ts.includes(c.t)).map(c => c.transicion))];
    const conTr = trs.length === 1 ? (trs[0] === 'seco' ? (ts.length === 1 ? 'seco' : 'secos') : `con ${TRANSICIONES[trs[0]].toLowerCase()}`) : 'con varias transiciones';
    const enLista = l => (l.length === 1 ? `en ${seg(l[0])}` : `en ${l.slice(0, -1).map(t => seg(t).replace(' s', '')).join(', ')} y ${seg(l.at(-1))}`);
    if (quitarTodos && !cortesFinales.length) frasesCortes.unshift('quité los cortes');
    else if (ts.length) frasesCortes.unshift(ritmoTxt ? `puse ${ts.length} ${ts.length === 1 ? 'corte' : 'cortes'} ${conTr} ${ritmoTxt}` : ts.length > 6 ? `puse ${ts.length} cortes ${conTr} (de ${seg(ts[0])} a ${seg(ts.at(-1))})` : `puse ${ts.length === 1 ? 'un corte' : `${ts.length} cortes`} ${conTr} ${enLista(ts)}`);
    if (alternados) frasesCortes.push(`cada plano alterna entre la pieza completa y un acercamiento a ${info.tienePiedras === false ? 'la parte de arriba' : 'la piedra'}`);
    else if (ts.length && !conMetas.some(k => k.corteAlInicio) && trs.every(x => x === 'seco')) notas.push('A cada lado del corte la cámara sigue igual: para cambiar de plano dime, por ejemplo, «con un corte acércate a la piedra».');
  }

  // ----- escena -----
  const pedEscena = cls.filter(k => k.escena).map(k => k.escena), frasesEscena = [];
  if (pedEscena.length) {
    const E = { superficie: {}, fondo: {}, luz: {} };
    for (const e of pedEscena) {
      if (e.ninguna) { Object.assign(E, { ninguna: true, preset: null, generica: false, superficie: {}, fondo: {}, luz: {} }); continue; }
      E.ninguna = false; if (e.preset) E.preset = e.preset; if (e.generica) E.generica = true;
      for (const g of ['superficie', 'fondo', 'luz']) Object.assign(E[g], e[g]);
    }
    const actual = info.escena;   // undefined: no se sabe cuál hay
    const idActual = typeof actual === 'string' ? actual : esObj(actual) ? actual.id : null;
    const conEscena = actual === undefined ? null : !!idActual && idActual !== 'ninguna';
    if (E.ninguna) {
      if (conEscena === false) notas.push('Ya tienes el fondo liso de marca.');
      else { salida.escena = { cambiar: true, id: 'ninguna', cambios: null }; frasesEscena.push('volví al fondo liso de marca (sin superficie)'); }
    } else {
      const sup = { ...E.superficie }, fon = { ...E.fondo }, L = E.luz, luz = {}, relativos = {};
      for (const [g, k] of [['superficie', 'altura'], ['superficie', 'tamano'], ['fondo', 'distancia']]) {
        const o = g === 'superficie' ? sup : fon;
        if (o[k] === '+' || o[k] === '-') { relativos[k] = o[k]; delete o[k]; }
      }
      if (sup.material && !sup.color) sup.color = COLOR_MATERIAL[sup.material];
      if (fon.material && !fon.color) fon.color = COLOR_MATERIAL[fon.material];
      const id = E.preset || (E.generica && !conEscena ? ESCENA_INICIAL : 'actual');
      const nada = !E.preset && E.generica && conEscena && !Object.keys(sup).length && !Object.keys(fon).length && !Object.keys(L).length;
      const ref = escenaDesdeAccion({ id, cambios: null }, actual);   // los valores de ahora (para «más suave», «más cálida»)
      const rel = (k, d) => r2(limitar(ref.luz[k] + d, RANGOS[k].min, RANGOS[k].max));
      const PASO = { altura: 0.4, tamano: 0.3, distancia: 0.6 };
      for (const [k, signo] of Object.entries(relativos)) {
        const g = k === 'distancia' ? 'fondo' : 'superficie', o = g === 'fondo' ? fon : sup;
        o[k] = r2(limitar(ref[g][k] + (signo === '+' ? 1 : -1) * PASO[k], RANGOS[k].min, RANGOS[k].max));
      }
      for (const k of ['gobo', 'angulo', 'elevacion']) if (L[k] !== undefined) luz[k] = L[k];
      if (L.suavidad) luz.suavidad = L.suavidad === '+' ? Math.max(rel('suavidad', 0.3), 0.7) : Math.min(rel('suavidad', -0.3), 0.2);
      if (L.calidez) luz.calidez = L.calidez === '+' ? Math.max(rel('calidez', 0.35), 0.6) : Math.min(rel('calidez', -0.5), -0.25);
      if (L.intensidad) luz.intensidad = rel('intensidad', L.intensidad === '+' ? 0.35 : -0.35);
      const cambios = {};
      if (Object.keys(sup).length) cambios.superficie = sup;
      if (Object.keys(fon).length) cambios.fondo = fon;
      if (Object.keys(luz).length) cambios.luz = luz;
      if (nada) notas.push(`Ya tienes una escena 3D («${ESCENAS[escenaDesdeAccion({ id: 'actual' }, actual).base || idActual]?.nombre || 'personalizada'}»). Dime qué cambiar: «pedestal de mármol», «fondo rosa», «sombras de persiana»…`);
      else salida.escena = { cambiar: true, id, cambios: Object.keys(cambios).length ? cambios : null };
      // la respuesta
      const final = escenaDesdeAccion(salida.escena.cambiar ? salida.escena : { id: 'actual' }, actual), nombreBase = ESCENAS[final.base || final.id]?.nombre;
      if (nada) { /* ya lo dice la nota */ }
      else if (E.preset) frasesEscena.push(`puse la escena «${ESCENAS[E.preset].nombre}»`);
      else if (id !== 'actual' || conEscena === false) frasesEscena.push(`puse la escena «${nombreBase}»`);
      const FORMA = { cilindro: 'un pedestal redondo', cubo: 'un bloque', losa: 'una losa baja', escalones: 'unos escalones', cojin: 'un cojín', piso: 'el piso' };
      const mat = m => MATERIALES_ESCENA[m].toLowerCase();
      if (relativos.altura) frasesEscena.push(relativos.altura === '+' ? 'el pedestal quedó más alto' : 'el pedestal quedó más bajo');
      if (relativos.tamano) frasesEscena.push(relativos.tamano === '+' ? 'el pedestal quedó más ancho' : 'el pedestal quedó más angosto');
      if (relativos.distancia) frasesEscena.push(relativos.distancia === '+' ? 'el fondo quedó más lejos (más desenfocado)' : 'el fondo quedó más cerca');
      if (sup.forma) frasesEscena.push(`la joya queda sobre ${FORMA[sup.forma]}${sup.material ? ` de ${mat(sup.material)}` : ''}`);
      else if (sup.material) frasesEscena.push(`la superficie ahora es de ${mat(sup.material)}`);
      else if (sup.color) frasesEscena.push(`la superficie ahora es ${NOMBRE_COLOR[sup.color] || 'de otro color'}`);
      if (fon.forma) frasesEscena.push(fon.forma === 'arco' ? 'el fondo es un nicho con arco' : fon.forma === 'pared' ? 'el fondo es una pared con piso' : 'el fondo es curvo, sin esquinas');
      if (fon.material) frasesEscena.push(`el fondo es de ${mat(fon.material)}`);
      else if (fon.color) frasesEscena.push(`el fondo ahora es ${NOMBRE_COLOR[fon.color] || 'de otro color'}`);
      // todo lo de la luz en una sola frase: «la luz viene desde la izquierda, entra con sombras de persiana y es más cálida»
      const deLuz = [];
      if (L.lado) deLuz.push(/derecha|izquierda/.test(L.lado) ? `viene desde la ${L.lado}` : /atras|detras|contraluz/.test(L.lado) ? 'viene desde atrás (contraluz)' : 'viene de frente');
      if (luz.elevacion) deLuz.push(luz.elevacion > 45 ? 'cae desde más arriba' : 'llega más baja, rasante');
      if (luz.gobo) deLuz.push(luz.gobo === 'ninguno' ? 'es pareja, sin sombras' : luz.gobo === 'foco' ? 'es un foco que ilumina la joya' : `entra con sombras de ${GOBOS[luz.gobo].toLowerCase()}`);
      if (luz.suavidad !== undefined) deLuz.push(L.suavidad === '+' ? 'quedó más suave (sombras difusas)' : 'quedó más dura (sombras marcadas)');
      if (luz.calidez !== undefined) deLuz.push(L.calidez === '+' ? 'es más cálida' : 'es más fría');
      if (luz.intensidad !== undefined) deLuz.push(L.intensidad === '+' ? 'es más intensa' : 'es más tenue');
      if (deLuz.length) frasesEscena.push('la luz ' + (deLuz.length === 1 ? deLuz[0] : `${deLuz.slice(0, -1).join(', ')} y ${deLuz.at(-1)}`));
      if (!frasesEscena.length && !nada) frasesEscena.push(`puse la escena «${nombreBase}»`);
    }
  }

  // ----- puesta en escena (v4): satén, luz, flotar, par, estuche o caja, elementos y la tapa que se abre -----
  // (si el «cuándo» de la tapa quedó en otra cláusula, «…que se abra | al final», viene en k.t)
  const pedPuesta = cls.filter(k => k.puesta).map(k => (k.puesta.abrir && k.puesta.abrir.t === null && k.t?.algo
    ? { ...k.puesta, abrir: { ...k.puesta.abrir, t: k.t.final || k.t.ultimos ? 'final' : esNum(k.t.a) ? k.t.a : 0 } } : k.puesta));
  if (pedPuesta.length) {
    const Q = {}, nuevos = [];
    for (const q of pedPuesta) for (const [c, v] of Object.entries(q)) { if (c === 'elementos') nuevos.push(...v); else Q[c] = v; }
    const actual = info.escena, ahora = escenaDesdeAccion({ id: 'actual' }, actual);
    const cambios = {}, fr = [];
    if (Q.esquema) { cambios.luz = { esquema: Q.esquema }; fr.push(`la luz es de ${ESQUEMAS_LUZ[Q.esquema].replace(/\s*\(.*\)$/, '').toLowerCase()}`); }
    let u = Q.utileria;
    const sinEstuche = !ahora.utileria || ahora.utileria.tipo === 'ninguna';
    if (Q.abrir && !u && sinEstuche) u = { tipo: tipoUtileriaPedido(Q.abrir.que || 'estuche', x), posicion: 'asiento' };
    if (u) {
      cambios.utileria = u.tipo === 'ninguna' ? { tipo: 'ninguna' } : { ...u, ...(Q.abrir ? {} : { apertura: u.tipo === 'pila-cajas' ? 0 : u.posicion === 'asiento' ? 1 : 0 }) };
      if (u.tipo === 'ninguna') fr.push(sinEstuche ? 'no hay estuche que quitar' : 'quité el estuche');
      else {
        const nom = TIPOS_UTILERIA[u.tipo].toLowerCase(), col = u.color ? ` ${NOMBRE_MARCA[u.color] ? 'color ' + NOMBRE_MARCA[u.color] : 'de otro color'}` : '', cin = u.cinta ? ` con cinta ${NOMBRE_MARCA[u.cinta] ? 'color ' + NOMBRE_MARCA[u.cinta] : 'de otro color'}` : '';
        fr.push(u.posicion === 'asiento' && u.tipo !== 'pila-cajas' ? `puse la joya en ${/^caja|^bandeja/.test(u.tipo) ? 'una' : 'un'} ${nom}${col}${cin}` : `puse ${/^caja|^bandeja|^pila/.test(u.tipo) ? 'una' : 'un'} ${nom}${col}${cin} ${u.posicion === 'al-lado' ? 'al lado de la joya' : u.tipo === 'pila-cajas' ? 'alrededor de la joya' : 'gigante como escenario'}`);
      }
    }
    if (Q.flotar !== undefined) { cambios.flotar = { activo: Q.flotar }; fr.push(Q.flotar ? 'la joya flota en el aire' : 'la joya ya no flota: queda apoyada'); }
    if (Q.par !== undefined) { cambios.par = { activo: Q.par }; fr.push(Q.par ? 'se ven las dos piezas del par, lado a lado' : 'se ve una sola pieza'); }
    if (Q.quitarElementos) { cambios.elementos = { modo: 'quitar', lista: [] }; fr.push('quité los elementos'); }
    else if (nuevos.length) {
      cambios.elementos = { modo: 'agregar', lista: nuevos };
      const NOMBRE_EL = g => (g.forma === 'cinta' ? `una cinta de satén en ${g.recorrido === 'corazon' ? 'corazón' : g.recorrido}` : g.forma === 'cadena' ? 'una cadena que cuelga de la joya' : g.material === 'cristal' ? 'una esfera de cristal'
        : `${{ perla: 'perlas', esfera: 'esferas', cuenta: 'cuentas' }[g.forma]} que ${{ 'caer-en-circulo': 'caen y forman un círculo', rodar: 'ruedan y frenan', rebotar: 'caen y rebotan', 'fila-flotante': 'flotan en fila', orbitar: 'orbitan alrededor', lluvia: 'caen como lluvia', volar: 'vuelan', quieto: 'quedan quietas', entrar: 'entran' }[g.coreografia] || 'se mueven'}`);
      fr.push('agregué ' + nuevos.map(NOMBRE_EL).join(' y '));
    }
    if (Q.saten) fr.unshift(`puse el fondo de ${(nombreEscenaLista(Q.saten) || 'satén').replace(/^Satén/, 'satén')}`);
    // se junta con lo que ya pidió de la escena en la misma frase
    const prev = salida.escena.cambiar && salida.escena.id !== 'ninguna' ? salida.escena.cambios || {} : {};
    const junto = { ...prev, ...cambios, ...(prev.luz || cambios.luz ? { luz: { ...(prev.luz || {}), ...(cambios.luz || {}) } } : {}) };
    const id = Q.saten || (salida.escena.cambiar && salida.escena.id !== 'ninguna' ? salida.escena.id : 'actual');
    if (Q.saten || Object.keys(junto).length) {
      salida.escena = { cambiar: true, id, cambios: Object.keys(junto).length ? junto : null };
      frasesEscena.push(...fr);
    }
    // la tapa se abre (o se cierra) en ese segundo: keys en la pista «apertura»
    if (Q.abrir && PISTAS.apertura) {
      const t = Q.abrir.t === 'final' ? D - 1.4 : esNum(Q.abrir.t) ? Q.abrir.t : 0.5;
      const t0 = r4(aCuadro(limitar(t, 0, Math.max(0, D - 0.4)))), t1 = r4(aCuadro(Math.min(D, t0 + 1.2)));
      const [de0, a1] = Q.abrir.cerrar ? [1, 0] : [0, 1];
      salidaPistas.set('apertura', [...(t0 > 0 ? [{ t: 0, v: de0, curva: 'lineal' }] : []), { t: t0, v: de0, curva: 'suave' }, { t: t1, v: a1, curva: 'lineal' }]);
      frasesEscena.push(`la tapa se ${Q.abrir.cerrar ? 'cierra' : 'abre'} ${t0 > 0 ? `en el ${seg(t0)}` : 'al empezar'}`);
    }
  }

  salida.pistas = [...salidaPistas.entries()].map(([pista, claves]) => ({ pista, claves: limpiar(claves, pista, D) }));

  // ----- proyecto virtual para ubicar sonidos (con las pistas nuevas) -----
  const V = { duracion: D, pistas: { ...base, ...Object.fromEntries(salida.pistas.map(p => [p.pista, p.claves])) } };
  const dt = 1 / 30, N = Math.round(D / dt), muestras = [];
  for (let i = 0; i <= N; i++) muestras.push({ t: Math.min(D, i * dt), ...evaluar(V, Math.min(D, i * dt)) });
  const vel = muestras.map((_, i) => {
    const a = muestras[Math.max(0, i - 1)], b = muestras[Math.min(N, i + 1)], h = b.t - a.t || dt;
    return Math.abs(b.giro - a.giro) / h / 240 + Math.abs(Math.log(b.zoom / a.zoom)) / h / 0.9 + Math.abs(b.inclinacion - a.inclinacion) / h / 70 + Math.abs(b.foco - a.foco) / h / 1.5 + Math.abs(b.rodar - a.rodar) / h / 60;
  });
  const picoVel = (a, b) => { let im = Math.round(a / dt); for (let i = Math.round(a / dt); i <= Math.min(N, Math.round(b / dt)); i++) if (vel[i] > vel[im]) im = i; return { t: muestras[im].t, v: vel[im] }; };
  const maxFoco = Math.max(...muestras.map(m => m.foco)), maxZoom = Math.max(...muestras.map(m => m.zoom));
  const momentoPiedra = muestras[0].foco >= 0.6 && muestras[0].foco >= maxFoco - 0.05 ? 0.15
    : maxFoco >= 0.5 ? muestras.find(m => m.foco >= maxFoco * 0.98).t
    : maxZoom >= 1.3 ? muestras.find(m => m.zoom >= maxZoom * 0.98).t : null;
  const vueltasEn = () => { const out = []; for (let i = 1; i <= N; i++) { const a = Math.floor(muestras[i - 1].giro / 360), b = Math.floor(muestras[i].giro / 360); if (a !== b) out.push(muestras[i].t); } return out.slice(0, 6); };

  // ----- textos -----
  const textosNuevos = [];
  const quitarTextos = cls.some(k => k.quitar.textos), quitarPrecio = cls.some(k => k.quitar.precio);
  const origen = new Map();   // capa simple → capa del proyecto (su tamaño, fondo y si está oculta: para medir su caja)
  let simples = quitarTextos ? [] : P.textos.filter(c => c.tipo !== 'marca' && typeof c.texto === 'string' && c.texto.trim()).map(c => {
    const s = {
      texto: c.texto, estilo: de(ESTILOS_TEXTO, c.estilo, 'libre'), y: limitar(+c.y || 0.5, 0.02, 0.98),
      entra: r2(limitar((+c.entra || 0) * escala, 0, D)), sale: esNum(c.sale) ? r2(limitar(c.sale * escala, 0, D)) : -1, animacion: ANIMACIONES_IDS.includes(c.animacion) ? c.animacion : 'aparecer',
    };
    origen.set(s, c); return s;
  });
  if (quitarPrecio) simples = simples.filter(s => s.estilo !== 'precio');
  // primer lugar libre de la zona pedida: con la caja real de cada capa (no solo su y: la marca mide casi 0,08 del alto hacia
  // abajo) y solo contra las que se ven al mismo tiempo; en 9:16 la joya ocupa el centro
  const [W, H] = MEDIDAS_FORMATO[info.formato] || MEDIDAS_FORMATO.reel, margen = 18 * Math.min(W, H) / 1080 / H;
  const HUECOS = { arriba: [0.17, 0.235, 0.3, 0.12, 0.36], abajo: [0.84, 0.78, 0.9, 0.72, 0.66], centro: [0.5, 0.44, 0.56] };
  const BANDAS = { arriba: [0.03, 0.44], abajo: [0.56, 0.97], centro: [0.36, 0.64] };
  const tramo = o => [+o.entra || 0, esNum(o.sale) && o.sale >= 0 ? o.sale : D];
  const hueco = (pos, nuevo) => {
    const [n0, n1] = tramo(nuevo), juntas = o => { const [a, b] = tramo(o); return a < n1 && n0 < b; };
    const marcas = P.textos.filter(c => c.tipo === 'marca').map(c => ({ ...c, entra: (+c.entra || 0) * escala, sale: esNum(c.sale) ? c.sale * escala : -1 }));
    const otras = [...simples.map(s => ({ ...(origen.get(s) || {}), ...s })), ...marcas].filter(o => !o.oculta && juntas(o)).map(o => cajaVertical(o, W, H));
    const caja = y => cajaVertical({ ...nuevo, y }, W, H);
    const choque = y => { const [a, b] = caja(y); return otras.reduce((t, [c, d]) => t + Math.max(0, Math.min(b, d + margen) - Math.max(a, c - margen)), 0); };
    const [lo, hi] = BANDAS[pos], [a5, b5] = caja(0.5), sube = 0.5 - a5, baja = b5 - 0.5;
    const dentro = y => y >= lo && y <= hi && y - sube >= 0.02 && y + baja <= 0.98;
    // además de los lugares de siempre, justo debajo o encima de cada capa que ya está
    const ref = HUECOS[pos][0], junto = otras.flatMap(([c, d]) => [d + margen + sube + 1e-3, c - margen - baja - 1e-3]).sort((x, y) => Math.abs(x - ref) - Math.abs(y - ref));
    const candidatos = [...HUECOS[pos], ...junto].filter(dentro);
    const libre = candidatos.find(y => choque(y) === 0) ?? [...candidatos].sort((x, y) => choque(x) - choque(y))[0];
    return r4(libre ?? HUECOS[pos][0]);
  };
  const tiempoTexto = (k, estilo) => {
    const T = k.t; let entra = 0.5, sale = -1;
    if (T.a !== undefined) entra = T.a; else if (T.ultimos !== undefined) entra = D - T.ultimos; else if (T.inicio) entra = 0; else if (T.final) entra = Math.max(0, D - 2.5);
    if (estilo === 'gancho' && T.a === undefined && T.ultimos === undefined && !T.final) entra = 0;   // el gancho sale desde el primer cuadro
    if (T.b !== undefined) sale = T.b; else if (T.len !== undefined) sale = entra + T.len; else if (T.inicio && estilo === 'gancho') sale = Math.min(D, 2.2);
    if (k.cuando === 'piedra' && momentoPiedra !== null) entra = momentoPiedra;
    entra = r2(limitar(entra, 0, Math.max(0, D - 0.5)));
    return { entra, sale: sale > entra + 0.2 && sale < D ? r2(sale) : -1 };
  };
  for (const k of cls) for (const tx of k.textos) {
    const texto = tx.texto;
    // una pregunta o exclamación es un gancho (arriba, en los primeros segundos)
    const estilo = tx.estilo || ((tx.pos === 'arriba' || !tx.pos && /[?!¿¡]/.test(texto)) ? (/[?!¿¡]/.test(texto) || texto.length <= 18 ? 'gancho' : 'subtitulo') : texto.length <= 24 ? 'titulo' : 'detalle');
    const pos = tx.pos || (estilo === 'gancho' || estilo === 'subtitulo' ? 'arriba' : 'abajo');
    const { entra, sale } = tiempoTexto(k, estilo);
    const s = { texto, estilo, y: hueco(pos, { texto, estilo, entra, sale }), entra, sale, animacion: tx.anim || (estilo === 'gancho' ? 'zoom' : estilo === 'titulo' ? 'subir' : estilo === 'subtitulo' ? 'maquina' : 'aparecer') };
    simples.push(s); textosNuevos.push(`«${texto}» ${pos === 'arriba' ? 'arriba' : pos === 'centro' ? 'en el centro' : 'abajo'}`);
  }
  if (precio) {
    const k = cls.find(c => c.precio) || { t: {}, precio: {} };
    const existente = simples.find(s => s.estilo === 'precio');
    if (existente) existente.texto = precio;
    else {
      const t = tiempoTexto(k, 'precio'), entra = k.t.a === undefined && !k.t.inicio && !k.t.final ? Math.min(1, D / 4) : t.entra, sale = t.sale;
      simples.push({ texto: precio, estilo: 'precio', y: hueco(k.precio?.pos || 'abajo', { texto: precio, estilo: 'precio', entra, sale }), entra, sale, animacion: k.precio?.anim || 'zoom' });
    }
    textosNuevos.push(`precio ${precio.replace(/\$ /, '$\u00a0')}`);   // en la respuesta el precio no se parte en dos líneas
  }
  if (textosNuevos.length || quitarTextos || quitarPrecio) salida.textos = { cambiar: true, capas: simples.slice(0, 10) };

  // ----- sonidos -----
  const quitarSonidos = cls.some(k => k.quitar.sonidos);
  let clips = quitarSonidos ? [] : P.audio.clips.filter(c => Object.hasOwn(EFECTOS_INFO, c.efecto)).map(c => ({ efecto: c.efecto, t: r4(limitar((+c.t || 0) * escala, 0, D)), volumen: r2(esNum(c.volumen) ? c.volumen : 0.8) })).filter(c => c.t < D);
  const pedidos = cls.flatMap(k => k.sonidos.map(id => ({ id, k })));
  if (preset === 'destello' && !pedidos.length) pedidos.push({ id: 'whoosh', k: { t: {} } }, { id: 'brillo', k: { t: {} } });
  const entradaTexto = estilo => simples.filter(s => !estilo || s.estilo === estilo).map(s => s.entra).sort((a, b) => a - b)[0];
  const sonidosTxt = [];
  for (const { id, k } of pedidos) {
    const E = EFECTOS_INFO[id], T = k.t || {};
    const golpes = [];
    const tieneVentana = k.a !== undefined && !k.inicial && Object.keys(k.metas || {}).length;
    const subida = ['riser', 'whooshInverso', 'reverseCymbal'].includes(id), aire = ['whoosh', 'whooshCorto', 'swipe'].includes(id);
    if (k.cuando === 'cortes') {
      const ts = nuevosDe.get(k)?.length ? nuevosDe.get(k) : cortesFinales.map(c => c.t);
      if (!ts.length) notas.push('Todavía no hay cortes: dime dónde cortar, por ejemplo «un corte a los 3 segundos con un whoosh».');
      golpes.push(...ts.slice(0, 24));
    } else if (T.a !== undefined && !tieneVentana) golpes.push(T.a);
    else if (T.ultimos !== undefined && !tieneVentana) golpes.push(D - T.ultimos);
    else if (k.brillaPiedra && tieneVentana) golpes.push(Math.min(D, Math.max(k.a, k.b - 0.7) + 0.12));   // con el pico del destello
    else if (k.cuando === 'piedra') golpes.push(momentoPiedra ?? D / 2);
    else if (k.cuando === 'precio') golpes.push(entradaTexto('precio') ?? D * 0.6);
    else if (k.cuando === 'texto') golpes.push(entradaTexto() ?? 0.5);
    else if (k.cuando === 'vueltas') golpes.push(...(vueltasEn().length ? vueltasEn() : [picoVel(0, D).t]));
    else if (k.cuando === 'movimientos') golpes.push(...conMetas.filter(c => !c.inicial).map(c => picoVel(c.a, c.b).t).slice(0, 6));
    else if (tieneVentana) golpes.push(aire ? picoVel(k.a, k.b).t : subida ? k.b : k.b - 0.05);
    else if (T.inicio) golpes.push(aire ? E.ancla * E.d : subida ? Math.min(D / 2, E.d) : 0.1);
    else if (T.final) golpes.push(id === 'obturador' ? D - 0.45 : subida ? D - 0.4 : aire ? D - 1 : D - 0.6);
    else if (aire) { const p = picoVel(0, D * 0.6); golpes.push(p.v > 0.3 ? p.t : E.ancla * E.d); }
    else if (subida) golpes.push(momentoPiedra ?? picoVel(0, D).t ?? D / 2);
    else if (id === 'impacto' || id === 'drop808') { const c0 = conMetas.find(c => !c.inicial); golpes.push(c0 && c0.b <= D / 2 ? c0.b : Math.min(0.6, D / 4)); }
    else if (id === 'brillo') golpes.push(momentoPiedra ?? entradaTexto('titulo') ?? D / 2);
    else if (id === 'campana' || id === 'cajaRegistradora') golpes.push(entradaTexto('precio') ?? D * 0.6);
    else if (id === 'pop') golpes.push(entradaTexto() ?? 0.3);
    else if (id === 'obturador') golpes.push(D - 0.45);
    else if (id === 'glitch') golpes.push(conMetas.length > 1 ? conMetas[1].a : D / 2);
    else golpes.push(id === 'click' ? 0.2 : 0);
    for (const golpe of golpes) {
      const t = r4(limitar(golpe - E.ancla * E.d, 0, Math.max(0, D - 0.1)));
      if (clips.some(c => c.efecto === id && Math.abs(c.t - t) < 0.3)) continue;
      clips.push({ efecto: id, t, volumen: subida ? 0.55 : ['whoosh', 'whooshCorto', 'swipe', 'pop', 'click'].includes(id) ? 0.7 : 0.75 });
      sonidosTxt.push(`${E.nombre} (${seg(t + E.ancla * E.d)})`);
    }
    if (k.cuando === 'piedra' && momentoPiedra === null) notas.push('La cámara no llega a enfocar la piedra; puse el sonido en la mitad del video.');
  }
  if (sonidosTxt.length || quitarSonidos) salida.sonidos = { cambiar: true, clips: clips.sort((a, b) => a.t - b.t).slice(0, 24) };

  // ----- música -----
  const mus = cls.map(k => k.musica).filter(Boolean).reduce((a, b) => ({ ...a, ...b }), null);
  const actual = P.audio.musica;
  let musicaTxt = '';
  const nombrada = !!mus?.estilo && mus.estilo !== 'auto';
  const hayActual = esObj(actual) && (!!actual.archivo || Object.hasOwn(MUSICA_INFO, actual.estilo ?? ''));
  if (mus && !nombrada && hayActual) {
    // sin nombrar un estilo se conserva la música que hay (también la canción que subió) y solo cambia el volumen
    if (mus.volumen !== undefined) { salida.musica = { cambiar: true, estilo: 'actual', volumen: mus.volumen }; musicaTxt = `${actual.archivo ? 'Tu canción' : 'La música'} ahora suena ${mus.volumen < 0.5 ? 'más suave' : 'más fuerte'}.`; }
    else notas.push(actual.archivo ? 'Ya suena tu canción: la dejé como está.' : `Ya tiene música (${MUSICA_INFO[actual.estilo].nombre}): la dejé como está.`);
  } else if (mus) {
    const estilo = nombrada ? mus.estilo : 'lujo';
    const volumen = estilo === 'ninguna' ? 0 : mus.volumen ?? (actual && actual.estilo === estilo && esNum(actual.volumen) ? actual.volumen : 0.55);
    salida.musica = { cambiar: true, estilo, volumen };
    musicaTxt = estilo === 'ninguna' ? 'Quité la música.' : nombrada ? `Música: ${MUSICA_INFO[estilo].nombre}${mus.volumen ? (mus.volumen < 0.5 ? ', suave' : ', fuerte') : ''}.` : mus.volumen ? `Música ${mus.volumen < 0.5 ? 'más suave' : 'más fuerte'}.` : `Música: ${MUSICA_INFO[estilo].nombre}.`;
  } else if (cls.some(k => k.elegante) && !actual) {
    salida.musica = { cambiar: true, estilo: 'lujo', volumen: 0.5 };
    musicaTxt = 'Le puse música de Lujo (piano suave).';
  } else if (preset === 'destello' && !actual) {
    salida.musica = { cambiar: true, estilo: 'popViral', volumen: 0.55 };
    musicaTxt = 'Le puse música Pop viral.';
  }

  // ----- respuesta -----
  const nombrePiedra = palabra => {
    if (info.tienePiedras === false) return 'la parte de arriba de la pieza';
    const p = String(palabra || '').replace(/s$/, '');
    if (NOMBRES_PIEDRA[p]) return NOMBRES_PIEDRA[p];
    const nombre = String(info.piedra || '').toLowerCase().replace(/\s+laboratorio$/, '');
    return NOMBRES_PIEDRA[nombre] || 'la piedra';
  };
  const conA = n => `a ${n}`.replace(/^a el\b/, 'al');
  const describir = k => {
    const M = k.metas, partes = [];
    const frente = M.giro?.frente || k.frenteAjustado;
    if (M.giro) {
      const g = M.giro;
      if (g.quieta) partes.push('se queda quieta');
      else if (g.vaiven) partes.push('hace un vaivén de lado a lado');
      else {
        const pg = [];
        const dir = g.dir || (g.reves ? -1 : 0);
        if (g.delta !== undefined) {
          // el giro tiene tope (±3 vueltas en total): se cuenta lo que de verdad gira, no lo que se pidió
          const real = g.a !== undefined && g.de !== undefined && !g.frente && !g.lado && !g.detras ? Math.abs(g.a - g.de) : Math.abs(g.delta);
          if (real < Math.abs(g.delta) - 1) notas.push(`El giro llega hasta 3 vueltas en total (${PISTAS.giro.max}°): no cabe más en la pista de giro.`);
          pg.push(`gira ${vueltasTxt(real)}${dir < 0 ? ' a la derecha' : dir > 0 ? ' a la izquierda' : ''}`);
        }
        if (g.lado) pg.push('queda de perfil'); else if (g.detras) pg.push('muestra la parte de atrás');
        if (pg.length) partes.push(pg.join(' y '));
      }
    }
    if (M.zoom?.dir > 0) partes.push(M.zoom.piedra ? `se acerca ${conA(nombrePiedra(M.foco?.piedra))}` : M.zoom.detalle ? 'hace zoom al detalle' : M.zoom.poco ? 'se acerca un poco' : 'se acerca');
    else if (M.zoom?.dir < 0) partes.push(M.zoom.poco ? 'se aleja un poco' : 'se aleja hasta ver toda la pieza');
    else if (M.foco?.valor === 1) partes.push(`enfoca ${nombrePiedra(M.foco.piedra)}`);
    else if (M.foco?.valor === 0) partes.push('vuelve al centro de la pieza');
    const inc = M.inclinacion, sentido = inc && inc.a !== undefined && inc.de !== undefined ? (inc.a < inc.de - 0.5 ? 'baja' : inc.a > inc.de + 0.5 ? 'sube' : '') : '';
    if (frente) partes.push(sentido && inc?.valor === 8 ? `${sentido} hasta quedar de frente` : 'queda de frente');
    else if (inc) partes.push(inc.valor !== undefined ? (sentido ? `${sentido} a ${inc.txt}` : `pasa a ${inc.txt}`) : inc.txt);
    if (M.rodar) partes.push(M.rodar.oscilar ? 'se balancea' : M.rodar.valor ? 'inclina la cámara' : 'endereza la cámara');
    if (M.altura?.txt) partes.push(M.altura.txt); else if (M.lateral?.txt) partes.push(M.lateral.txt);
    if (M.exposicion) partes.push(M.exposicion.destello ? 'destello de luz' : M.exposicion.valor > 1.2 ? 'con más luz' : 'con menos luz');
    if (M.desenfoque) partes.push(M.desenfoque.valor ? 'desenfoque macro' : 'todo nítido');
    const txt = partes.filter(Boolean).join(' y ');
    const extra = { rebote: ' con rebote', elastico: ' con efecto resorte', escalon: ' con corte seco', entrada: ' acelerando', lineal: ' a velocidad constante' }[k.curva] || (k.mods.frenaFinal || k.curva === 'salida' ? ' frenando al final' : k.rapido ? ' rápido' : k.lento ? ' despacio' : '');
    return txt ? txt + extra : '';
  };
  // la vista con la que empieza, o la de todo el video si va sola («desde arriba», «de frente»…)
  const describirInicio = k => {
    const M = k.metas, p = [];
    if (M.inclinacion?.txt) p.push(M.inclinacion.valor === 8 ? 'a la altura de la pieza' : M.inclinacion.txt);
    if (M.giro?.frente) p.push('de frente'); else if (M.giro?.lado) p.push('de perfil'); else if (M.giro?.detras) p.push('desde atrás');
    if (M.zoom?.dir > 0) p.push(M.zoom.piedra ? `cerca de ${nombrePiedra(M.foco?.piedra)}`.replace('de el', 'del') : 'en primer plano');
    else if (M.zoom?.dir < 0) p.push('en plano abierto');
    if (M.rodar) p.push(M.rodar.valor ? 'con la cámara inclinada' : 'con la cámara derecha');
    if (M.altura?.txt) p.push(M.altura.delta > 0 ? 'con la pieza más arriba' : M.altura.delta < 0 ? 'con la pieza más abajo' : 'con la pieza centrada');
    else if (M.lateral?.txt) p.push(M.lateral.delta < 0 ? 'con la pieza a la izquierda' : 'con la pieza a la derecha');
    if (M.exposicion) p.push(M.exposicion.valor > 1.2 ? 'con más luz' : 'con menos luz');
    if (M.desenfoque) p.push(M.desenfoque.valor ? 'con desenfoque macro' : 'con todo nítido');
    return p.map(f => f.replace(/^vista/, 'con vista').replace(/^contrapicado/, 'en contrapicado')).join(', ');
  };
  const frases = [];
  if (preset) frases.push(`apliqué el movimiento «${MOVIMIENTOS[preset].nombre}»`);
  const conVentana = conMetas.filter(k => !k.inicial);
  const inicial = conMetas.find(k => k.inicial);
  if (inicial && describirInicio(inicial)) frases.push((conVentana.length ? 'empieza ' : 'todo el video va ') + describirInicio(inicial));
  for (const k of conMetas) if (k.frenteAjustado && !conVentana.includes(k)) frases.push('termina de frente');
  const todoElVideo = k => k.a < 0.05 && k.b > D - 0.05;
  conVentana.forEach((k, i) => {
    const d = describir(k); if (!d) return;
    // lo que va «al mismo tiempo» se cuenta en la misma frase
    if (k.junto && i > 0 && frases.length) { frases[frases.length - 1] += ` y al mismo tiempo ${d}`; return; }
    const solo = conVentana.filter(o => !o.junto).length === 1;
    frases.push(solo && todoElVideo(k) ? d : `del ${seg(k.a).replace(' s', '')} al ${seg(k.b)} ${d}`);
  });
  for (const k of conVentana) if (k.corteAlInicio) {
    // el plano nuevo empieza con un corte (eso ya lo cuenta la frase de la cámara, aquí solo se dice dónde)
    const i = frases.findIndex(f => f.includes(`del ${seg(k.a).replace(' s', '')} al`));
    const tr = k.cortes?.transicion, conTr = tr && tr !== 'seco' ? ` con ${TRANSICIONES[tr].toLowerCase()}` : '';
    if (i >= 0) frases[i] = frases[i].replace(`del ${seg(k.a).replace(' s', '')} al`, `con un corte${conTr} en ${seg(k.a)}, del ${seg(k.a).replace(' s', '')} al`);
    else frases.push(`hay un corte${conTr} en ${seg(k.a)}`);
  }
  frases.push(...frasesCortes, ...frasesEscena);
  frases.push(...modTxt);
  if (textosNuevos.length) frases.push(`agregué ${textosNuevos.length === 1 ? 'el texto' : 'los textos'} ${textosNuevos.join(', ')}`.replace('el texto precio', 'el precio'));
  if (quitarTextos) frases.push('quité los textos (la marca se queda)'); else if (quitarPrecio) frases.push('quité el precio');
  if (sonidosTxt.length) frases.push(`agregué ${sonidosTxt.length === 1 ? 'un sonido' : 'sonidos'}: ${sonidosTxt.join(', ')}`);
  if (quitarSonidos) frases.push('quité los efectos de sonido');
  const cuerpo = frases.length ? frases.map((f, i) => i ? f : f[0].toUpperCase() + f.slice(1)).join('; ') + '.' : '';
  const todo = ['Listo.', cuerpo, musicaTxt, ...new Set(notas)].filter(Boolean).join(' ').replace(/[ \t\r\n]+/g, ' ').trim();   // sin tocar los espacios duros
  // «más lento» en bucle alarga el video: todo lo calculado se lleva a la nueva duración
  if (alargar) {
    const f = alargar / D;
    salida.duracion = alargar;
    for (const p of salida.pistas) for (const c of p.claves) c.t = r4(c.t * f);
    for (const c of salida.textos.capas) { c.entra = r2(c.entra * f); if (c.sale >= 0) c.sale = r2(c.sale * f); }
    for (const c of salida.sonidos.clips) c.t = r4(c.t * f);
    for (const c of salida.cortes.lista) c.t = r4(c.t * f);
  }
  salida.respuesta = hayCambios(salida) ? todo : notas.length ? notas.join(' ') : fueraDeAqui(x) || 'No encontré nada que cambiar. ' + AYUDA;
  if (info.tienePiedras === false && conMetas.some(k => k.metas.foco?.valor === 1)) salida.respuesta += ' (No encontré piedras en el modelo, así que enfoco la parte de arriba.)';
  return normalizarAcciones(salida, { duracion: P.duracion });
}
