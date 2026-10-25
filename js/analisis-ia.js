// Lo que la IA (Claude) mira de un video de referencia para replicarlo: la joya, la escena (superficie, fondo, luz), el
// encuadre y el movimiento de cada plano, los textos en pantalla y el aire de la música. Este módulo es puro (sin DOM):
// lo comparten la función del servidor (api/analizar.js: el esquema y la validación de lo que responde la IA) y el
// navegador (pedirAnalisisIA, que le manda a /api/analizar los fotogramas y el análisis hecho en el equipo).
//
// Contrato con el panel Replicar:
//   pedirAnalisisIA(analisis, { fetch, cancelado, signal }) → resuelve con el análisis de la IA ya validado (la forma de
//   normalizarAnalisisIA; también trae .modelo y .ia, por si se lee como la respuesta del servidor) o rechaza con un
//   ErrorIA en español: e.sinIA === true cuando no hay IA (servidor local o sin ANTHROPIC_API_KEY), e.codigo dice el caso.
//   En los dos casos el panel sigue solo con el análisis del equipo.
import { ESCENAS, FORMAS_SUPERFICIE, FORMAS_FONDO, MATERIALES_ESCENA, GOBOS, RANGOS, ESCENA_INICIAL, escenaParecida, normalizarEscena } from './escenas.js';
import { METALES, PIEDRAS } from './catalogo.js';
import { PISTAS, CURVAS, TRANSICIONES, DURACION_MAX } from './proyecto.js';
import { ESTILOS_TEXTO_IDS, ANIMACIONES_IDS, ESTILOS_MUSICA_IDS } from './interprete.js';
import { ESQUEMAS_LUZ, TIPOS_UTILERIA, POSICIONES_UTILERIA, ELEMENTOS_IA, COREOGRAFIAS_IDS, RECORRIDOS_CINTA_IDS, IDS_ESCENA, FORMAS_FONDO_V4, ESCENAS_SATEN, completarEscena } from './escena-marca.js';

export const API_ANALIZAR = '/api/analizar';
export const TIPOS_JOYA = { anillo: 'Anillo', aretes: 'Aretes', collar: 'Collar', pulsera: 'Pulsera', dije: 'Dije', otro: 'Otra joya' };
export const ENCUADRES = { macro: 'Macro', detalle: 'Detalle', medio: 'Plano medio', general: 'Plano general' };
export const MAX_FOTOGRAMAS = 16;
export const MAX_PLANOS = 40;
export const MAX_TEXTOS = 8;
export const MAX_ELEMENTOS_IA = 6;
export const MAX_CUERPO_ANALISIS = 4 * 1024 * 1024;   // bytes del pedido (Vercel no recibe más de 4,5 MB)
export const MAX_BASE64 = 1_500_000;                 // un fotograma (≈ 1,1 MB de JPEG; los de 512 px pesan 30–90 KB)
// Valores «no se sabe» del esquema (las salidas estructuradas no llevan null: se usan estas palabras y aquí pasan a null)
const SIN_METAL = 'desconocido', SIN_PIEDRA = 'ninguna', PIEDRA_DUDOSA = 'desconocida', SIN_MUSICA = 'desconocido';

const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const numero = (x, def) => (esNum(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(+x) ? +x : def);
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const texto = (x, max) => (typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const de = (lista, v, def) => (typeof v === 'string' && (Array.isArray(lista) ? lista.includes(v) : Object.hasOwn(lista, v)) ? v : def);
const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function colorHex(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + [...s.slice(1)].map(c => c + c).join('')).toUpperCase();
  return null;
}

// =====================================================================================================
// ---------- Esquema de la salida estructurada ----------
// =====================================================================================================
// Reglas de las salidas estructuradas: todo objeto con additionalProperties: false y todas sus propiedades en required;
// sin minimum/maximum/minLength (los rangos se recortan en normalizarAnalisisIA).
const obj = (properties, description) => ({ type: 'object', ...(description ? { description } : {}), properties, required: Object.keys(properties), additionalProperties: false });
const num = description => ({ type: 'number', description });
const txt = description => ({ type: 'string', description });
const lista = (items, description) => ({ type: 'array', description, items });
const opcion = (ids, description) => ({ type: 'string', enum: [...ids], ...(description ? { description } : {}) });
const rangoP = id => `${PISTAS[id].min} a ${PISTAS[id].max}`;
const rangoE = k => `${RANGOS[k].min} a ${RANGOS[k].max}`;

export const ESQUEMA_ANALISIS = obj({
  joya: obj({
    tipo: opcion(Object.keys(TIPOS_JOYA)),
    metal: opcion([...METALES, SIN_METAL], 'El metal de la lista que más se parece; «desconocido» si no se distingue.'),
    piedra: opcion([...PIEDRAS, SIN_PIEDRA, PIEDRA_DUDOSA], 'La piedra principal; «ninguna» si la joya no tiene piedras, «desconocida» si no se distingue.'),
    descripcion: txt('Cómo es la joya, en una frase corta en español (forma, montura, piedras).'),
  }, 'La joya que aparece en el video.'),
  escena: obj({
    id: opcion(IDS_ESCENA, 'La escena lista más parecida al video («ninguna» solo si el fondo es liso, sin superficie visible; saten-* si el fondo y el piso son una tela de satén con pliegues).'),
    superficie: obj({
      forma: opcion(Object.keys(FORMAS_SUPERFICIE)), material: opcion(Object.keys(MATERIALES_ESCENA)),
      color: txt('Color de la superficie donde se apoya la joya, en #RRGGBB (la parte iluminada, sin la sombra).'),
    }),
    fondo: obj({
      forma: opcion(Object.keys(FORMAS_FONDO_V4), 'tela = una tela de satén o seda con pliegues que hace de fondo y de piso.'), material: opcion(Object.keys(MATERIALES_ESCENA)),
      color: txt('Color del fondo en #RRGGBB (la parte iluminada).'),
    }),
    luz: obj({
      gobo: opcion(Object.keys(GOBOS), 'La forma de las sombras que la luz proyecta en el fondo y la superficie.'),
      angulo: num(`De dónde viene la luz principal vista desde la cámara, en grados (${rangoE('angulo')}): negativo = desde la izquierda, positivo = desde la derecha, 0 = de frente, ±180 = contraluz.`),
      elevacion: num(`Altura de la luz sobre el horizonte, en grados (${rangoE('elevacion')}).`),
      suavidad: num(`0 = sombras duras y nítidas de sol, 1 = muy difusas (${rangoE('suavidad')}).`),
      calidez: num(`-1 = fría (azulada), 0 = neutra, 1 = cálida de atardecer (${rangoE('calidez')}).`),
    }),
  }, 'La escena donde está la joya.'),
  planos: lista(obj({
    indice: { type: 'integer', description: 'El mismo índice del plano en <analisis_local> (empieza en 0).' },
    encuadre: opcion(Object.keys(ENCUADRES), 'macro = la piedra o un detalle llena el cuadro; detalle = una parte de la joya; medio = la joya completa de cerca; general = la joya con bastante escena alrededor.'),
    transicion: opcion(Object.keys(TRANSICIONES), 'Cómo entra este plano desde el anterior: seco, flash (destello blanco), negro (fundido a negro) o barrido (latigazo borroso). El primer plano: seco.'),
    giro: num('Grados que la cámara rodea la pieza durante el plano: positivo = la cara de la pieza se va hacia la izquierda de la pantalla, negativo = hacia la derecha; 0 si no gira.'),
    zoomDesde: num(`Zoom al empezar el plano (${rangoP('zoom')}): 1 = la pieza completa, 0.85 = abierto, 1.7 = primer plano, 2.2 a 2.8 = la piedra, 3 o más = macro.`),
    zoomHasta: num('Zoom al terminar el plano.'),
    inclinacionDesde: num(`Altura de la cámara al empezar (${rangoP('inclinacion')}): 8 = a la altura de la pieza, 18 = normal, 35 = desde arriba, 78 = cenital, -12 = contrapicado.`),
    inclinacionHasta: num('Altura de la cámara al terminar el plano.'),
    rodar: num(`Cámara ladeada en grados (${rangoP('rodar')}); 0 = derecha. Positivo = la imagen queda girada en sentido contrario a las agujas del reloj.`),
    curva: opcion(Object.keys(CURVAS), 'Cómo avanza el movimiento: lineal, suave, entrada (acelera), salida (frena), rebote, elastico, escalon.'),
    descripcion: txt('El plano en una frase corta en español («Media vuelta lenta hacia la izquierda, plano medio, desde arriba»).'),
  }), 'Un elemento por cada plano de <analisis_local>, en el mismo orden.'),
  textos: lista(obj({
    texto: txt('El texto exacto que se ve (con tildes, mayúsculas y emojis).'),
    entra: num('Segundo en que aparece.'),
    sale: num('Segundo en que se va; -1 = hasta el final.'),
    y: num('Altura del texto en el cuadro: 0 = arriba, 1 = abajo.'),
    estilo: opcion(ESTILOS_TEXTO_IDS, 'titulo (nombre grande), subtitulo (mayúsculas pequeñas), detalle, precio, pie (línea pequeña), gancho (frase grande al inicio), libre.'),
    animacion: opcion(ANIMACIONES_IDS, 'Cómo aparece: aparecer, subir, maquina (letra por letra), zoom, brillo, deslizar, ninguna.'),
  }), 'Los textos que se ven en pantalla (sin logos ni marcas de agua de Instagram o TikTok). Lista vacía si no hay.'),
  musica: obj({
    estilo: opcion([...ESTILOS_MUSICA_IDS, SIN_MUSICA], 'El estilo de música que le va al ritmo del video; «desconocido» si no se puede decir.'),
    bpm: num('Pulsos por minuto que encajan con los cortes; 0 = no se sabe.'),
  }),
  luz_esquema: opcion(Object.keys(ESQUEMAS_LUZ), 'ventana = luz normal de estudio o de ventana; clave-baja = imagen oscura, fondo casi negro y el metal con reflejos fuertes y bandas oscuras; alta-clave = todo claro, luminoso y suave; contraluz = fondo claro y brillante con los objetos oscuros, casi en silueta.'),
  destellos: { type: 'boolean', description: 'true si en el fondo flotan puntitos de luz desenfocados (polvo brillante).' },
  flotando: { type: 'boolean', description: 'true si la joya flota en el aire sin apoyarse en nada (o cuelga de algo invisible).' },
  par: { type: 'boolean', description: 'true si se ven DOS piezas iguales lado a lado (un par de aretes, dos anillos iguales).' },
  utileria: obj({
    tipo: opcion(Object.keys(TIPOS_UTILERIA), 'El estuche o la caja que se ve: estuche-anillo, caja-regalo (caja con tapa suelta y moño), estuche-aretes, estuche-collar, cofre (tapa alta con bisagra), cajon, bandeja, pila-cajas (torres de cajas cerradas); ninguna si no hay.'),
    color: txt('Color del estuche o de la caja en #RRGGBB; "" si no hay.'),
    cinta: txt('Color de la cinta o del moño en #RRGGBB; "" si no tiene.'),
    posicion: opcion(POSICIONES_UTILERIA, 'asiento = la joya está dentro o encima; al-lado = la caja está al lado o debajo de la joya, que flota; escenario = una caja gigante hace de piso.'),
  }, 'El estuche, la caja de regalo o las cajas que acompañan a la joya.'),
  abre_estuche: obj({
    abre: { type: 'boolean', description: 'true si en el video se abre la tapa del estuche o de la caja.' },
    desde: num('Segundo en que la tapa empieza a abrirse; -1 si no se abre.'),
    hasta: num('Segundo en que queda abierta; -1 si no se abre.'),
  }),
  elementos: lista(obj({
    tipo: opcion(Object.keys(ELEMENTOS_IA), 'esferas = bolas grandes mate; perlas; cuentas = bolitas pequeñas; cristal = esfera de vidrio transparente; cinta = cinta de satén que dibuja una forma; cadena = cadena que cuelga.'),
    coreografia: opcion([...COREOGRAFIAS_IDS], 'Cómo se mueven: quieto, rodar (entra rodando y frena), rebotar (cae y rebota), fila-flotante, caer-en-circulo (caen y forman un círculo), orbitar, lluvia, entrar, volar.'),
    recorrido: opcion([...RECORRIDOS_CINTA_IDS, 'ninguno'], 'Solo para la cinta: la forma que dibuja; ninguno para lo demás.'),
  }), 'Objetos que acompañan a la joya (no la joya ni la caja). Lista vacía si no hay.'),
  resumen: txt('1 a 3 frases cortas en español de Colombia, tuteando, para la joyera: qué tipo de video es y qué se va a replicar.'),
});

// =====================================================================================================
// ---------- Validación de lo que responde la IA ----------
// =====================================================================================================
// Metal y piedra: los nombres exactos del catálogo; si la IA (o un archivo) trae algo parecido («oro rosa», «esmeraldas»)
// se busca el más cercano. Lo que no se reconoce queda en null.
function metalDe(v) {
  if (typeof v !== 'string') return null;
  const s = sinTildes(v);
  const exacto = METALES.find(m => sinTildes(m) === s);
  if (exacto) return exacto;
  if (!s || /desconocid|no se|ninguno|otro/.test(s)) return null;
  if (/platin/.test(s)) return 'Platino 950';
  if (/plata|silver|925/.test(s)) return 'Plata 925';
  if (/oro|gold|dorad/.test(s)) {
    const k14 = /14/.test(s);
    if (/rosa|rose/.test(s)) return 'Oro rosa 18k';
    if (/blanc|white/.test(s)) return 'Oro blanco 18k';
    return k14 ? 'Oro amarillo 14k' : 'Oro amarillo 18k';
  }
  return null;
}
const PIEDRAS_LARGO = [...PIEDRAS].sort((a, b) => b.length - a.length);
function piedraDe(v) {
  if (typeof v !== 'string') return null;
  const s = sinTildes(v);
  const exacta = PIEDRAS.find(p => sinTildes(p) === s);
  if (exacta) return exacta;
  if (!s || /desconocid|ninguna|no tiene|sin piedra/.test(s)) return null;
  const palabras = s.split(/[^a-z0-9]+/).filter(Boolean);
  // todas las palabras del nombre deben estar (como inicio de una palabra: «esmeraldas» → Esmeralda)
  return PIEDRAS_LARGO.find(p => sinTildes(p).split(/\s+/).every(w => palabras.some(x => x.startsWith(w)))) || null;
}

const encuadrePorZoom = z => (z >= 2.6 ? 'macro' : z >= 1.6 ? 'detalle' : z >= 1.15 ? 'medio' : 'general');

// Lo que se sabe de un plano medido en el equipo, venga del analizador (con .movimiento) o del resumen que se le manda a la IA
function datosPlano(p, k) {
  if (!esObj(p)) return { indice: k };
  const m = esObj(p.movimiento) ? p.movimiento : null;
  const n = (x, def) => numero(x, def);
  return {
    indice: Number.isInteger(p.indice) ? p.indice : k,
    inicio: n(p.inicio, NaN), fin: n(p.fin, NaN),
    giro: m ? n(m.giro?.grados, 0) : n(p.giro, 0),
    zoomDesde: m ? n(m.zoom?.desde, 1) : n(p.zoomDesde, 1),
    zoomHasta: m ? n(m.zoom?.hasta, n(m.zoom?.desde, 1)) : n(p.zoomHasta, n(p.zoomDesde, 1)),
    inclinacion: m ? n(m.inclinacion?.delta, 0) : n(p.inclinacion, 0),
    rodar: m ? n(m.rodar?.grados, 0) : n(p.rodar, 0),
    curva: de(CURVAS, m ? m.curva : p.curva, 'suave'),
    transicion: de(TRANSICIONES, p.transicion, 'seco'),
  };
}

const ESCENA_VACIA = null;
function normalizarEscenaIA(e) {
  if (!esObj(e)) return ESCENA_VACIA;
  const s = esObj(e.superficie) ? e.superficie : {}, f = esObj(e.fondo) ? e.fondo : {}, l = esObj(e.luz) ? e.luz : {};
  const colS = colorHex(s.color), colF = colorHex(f.color);
  // sin un id válido se escoge la escena lista de colores más parecidos; sin nada que sirva no hay escena
  let id = de(IDS_ESCENA, e.id, null);
  if (!id && (colS || colF)) id = escenaParecida({ fondo: colF, superficie: colS });
  const algoValido = id || de(FORMAS_SUPERFICIE, s.forma, null) || de(GOBOS, l.gobo, null);
  if (!algoValido) return ESCENA_VACIA;
  id ||= ESCENA_INICIAL;
  // para completar lo que falte (las de satén, de escenas.js o, si aún no las trae, de escena-marca.js)
  const b = ESCENAS[id] ? (ESCENAS[id].ninguna ? ESCENAS[ESCENA_INICIAL] : ESCENAS[id]) : ESCENAS_SATEN[id];
  const luzNum = k => { const x = numero(l[k], NaN); return esNum(x) ? r2(limitar(x, RANGOS[k].min, RANGOS[k].max)) : b.luz[k]; };
  return {
    id,
    superficie: { forma: de(FORMAS_SUPERFICIE, s.forma, b.superficie.forma), material: de(MATERIALES_ESCENA, s.material, b.superficie.material), color: colS || b.superficie.color },
    fondo: { forma: de(FORMAS_FONDO_V4, f.forma, b.fondo.forma), material: de(MATERIALES_ESCENA, f.material, b.fondo.material), color: colF || b.fondo.color },
    luz: { gobo: de(GOBOS, l.gobo, b.luz.gobo), angulo: luzNum('angulo'), elevacion: luzNum('elevacion'), suavidad: luzNum('suavidad'), calidez: luzNum('calidez') },
  };
}

function normalizarPlanoIA(c, ref) {
  const P = PISTAS;
  const z = (x, def) => { const v = numero(x, NaN); return r2(limitar(esNum(v) ? v : def, P.zoom.min, P.zoom.max)); };
  const inc = (x, def) => { const v = numero(x, NaN); return r2(limitar(esNum(v) ? v : def, P.inclinacion.min, P.inclinacion.max)); };
  // si la IA dio solo uno de los dos, el otro sale del acercamiento medido en el equipo (el factor entre inicio y fin)
  const factor = ref.zoomDesde > 0 && ref.zoomHasta > 0 ? ref.zoomHasta / ref.zoomDesde : 1;
  const zoomDesde = z(c.zoomDesde, esNum(numero(c.zoomHasta, NaN)) ? numero(c.zoomHasta, 1) / factor : ref.zoomDesde ?? 1);
  const zoomHasta = z(c.zoomHasta, zoomDesde * factor);
  const inclinacionDesde = inc(c.inclinacionDesde, P.inclinacion.def);
  const inclinacionHasta = inc(c.inclinacionHasta, inclinacionDesde + (ref.inclinacion || 0));
  const giro = numero(c.giro, NaN), rodar = numero(c.rodar, NaN);
  return {
    indice: ref.indice,
    encuadre: de(ENCUADRES, c.encuadre, encuadrePorZoom(Math.max(zoomDesde, zoomHasta))),
    transicion: de(TRANSICIONES, c.transicion, ref.transicion || 'seco'),
    giro: r2(limitar(esNum(giro) ? giro : ref.giro ?? 0, P.giro.min, P.giro.max)),
    zoomDesde, zoomHasta, inclinacionDesde, inclinacionHasta,
    rodar: r2(limitar(esNum(rodar) ? rodar : ref.rodar ?? 0, P.rodar.min, P.rodar.max)),
    curva: de(CURVAS, c.curva, ref.curva || 'suave'),
    descripcion: texto(c.descripcion, 240),
    porIA: c.porIA !== false,   // false = la IA no dijo nada de este plano (se llenó con lo medido en el equipo)
  };
}

function normalizarTextos(lista, D) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).filter(esObj).map(c => {
    const t = texto(c.texto, 140);
    if (!t) return null;
    const entra = r2(limitar(numero(c.entra, 0), 0, Math.max(0, D - 0.2)));
    let sale = numero(c.sale, -1);
    sale = sale < 0 || sale >= D - 1e-3 || sale <= entra + 0.1 ? -1 : r2(sale);
    return { texto: t, entra, sale, y: r3(limitar(numero(c.y, 0.8), 0.02, 0.98)), estilo: de(ESTILOS_TEXTO_IDS, c.estilo, 'libre'), animacion: de(ANIMACIONES_IDS, c.animacion, 'aparecer') };
  }).filter(c => c && !vistos.has(c.texto + '|' + c.entra) && vistos.add(c.texto + '|' + c.entra)).sort((a, b) => a.entra - b.entra).slice(0, MAX_TEXTOS);
}

// La forma vacía (sin IA o con basura)
/** @param {{ planos?: any[] | null, duracion?: any }} [opciones] */
export function analisisIAVacio({ planos, duracion } = {}) {
  return normalizarAnalisisIA({}, { planos, duracion });
}

/**
 * Valida lo que respondió la IA (o lo que venga): recorta a los rangos, corrige lo corregible y descarta la basura. Nunca lanza.
 * planos: los planos medidos en el equipo (del analizador o su resumen): la salida trae exactamente esos planos, en orden,
 * con el mismo indice (los que la IA no describió se llenan con lo medido y quedan con porIA: false).
 * → { joya:{ tipo, metal|null, piedra|null, descripcion }, escena:{ id, superficie:{forma,material,color}, fondo:{forma,material,color},
 *     luz:{gobo,angulo,elevacion,suavidad,calidez} } | null, planos:[{ indice, encuadre, transicion, giro, zoomDesde, zoomHasta,
 *     inclinacionDesde, inclinacionHasta, rodar, curva, descripcion, porIA }], textos:[{ texto, entra, sale, y, estilo, animacion }],
 *     musica:{ estilo|null, bpm|null }, resumen,
 *     luz_esquema: 'ventana'|'clave-baja'|'alta-clave'|'contraluz'|null, destellos, flotando, par (booleanos),
 *     utileria:{ tipo ('ninguna' si no hay), color|null, cinta|null, posicion }, abre_estuche:{ abre, desde, hasta (-1 = no se sabe) },
 *     elementos:[{ tipo: esferas|perlas|cuentas|cristal|cinta|cadena, coreografia|null, recorrido|null }] }
 * @param {any} crudo
 * @param {{ planos?: any[] | null, duracion?: any }} [opciones]
 */
export function normalizarAnalisisIA(crudo, { planos, duracion } = {}) {
  try {
    return normalizar(crudo, planos, duracion);
  } catch {
    try { return normalizar({}, planos, duracion); } catch { return normalizar({}, null, null); }
  }
}

function normalizar(crudo, planosRef, duracion) {
  const a = esObj(crudo) ? crudo : {};
  const refs = (Array.isArray(planosRef) ? planosRef : []).slice(0, MAX_PLANOS).map(datosPlano);
  const finRef = refs.reduce((m, p) => (esNum(p.fin) ? Math.max(m, p.fin) : m), 0);
  const D = limitar(numero(duracion, NaN) > 0 ? numero(duracion, 0) : finRef > 0 ? finRef : DURACION_MAX, 0.5, DURACION_MAX * 2);

  const j = esObj(a.joya) ? a.joya : {};
  const joya = { tipo: de(TIPOS_JOYA, j.tipo, 'otro'), metal: metalDe(j.metal), piedra: piedraDe(j.piedra), descripcion: texto(j.descripcion, 300) };

  // planos: los de la IA por índice (si contó desde 1 en vez de 0, se corrige)
  let crudos = (Array.isArray(a.planos) ? a.planos : []).filter(esObj).slice(0, MAX_PLANOS * 2);
  const indiceDe = c => { const x = numero(c.indice, NaN); return Number.isInteger(x) ? x : NaN; };
  if (refs.length) {
    const indices = refs.map(r => r.indice), dados = crudos.map(indiceDe).filter(Number.isInteger);
    const calzan = d => dados.filter(i => indices.includes(i - d)).length;
    if (dados.length && !dados.includes(indices[0]) && calzan(1) > calzan(0)) crudos = crudos.map(c => ({ ...c, indice: indiceDe(c) - 1 }));
  }
  const porIndice = new Map();
  for (const c of crudos) { const i = indiceDe(c); if (Number.isInteger(i) && i >= 0 && i < 1000) porIndice.set(i, c); }
  let planos;
  if (refs.length) planos = refs.map(r => normalizarPlanoIA(porIndice.get(r.indice) || { porIA: false }, r));
  else planos = [...porIndice.entries()].sort((x, y) => x[0] - y[0]).slice(0, MAX_PLANOS).map(([i, c]) => normalizarPlanoIA(c, { indice: i }));
  if (planos.length) planos[0].transicion = 'seco';   // el primer plano no viene de un corte

  const mu = esObj(a.musica) ? a.musica : {};
  const bpm = numero(mu.bpm, 0);
  const musica = { estilo: de(ESTILOS_MUSICA_IDS, mu.estilo, null), bpm: bpm >= 40 && bpm <= 220 ? Math.round(bpm) : null };

  return {
    joya, escena: normalizarEscenaIA(a.escena), planos, textos: normalizarTextos(a.textos, D), musica, resumen: texto(a.resumen, 600),
    luz_esquema: esquemaDe(a.luz_esquema ?? a.luzEsquema), destellos: siNo(a.destellos), flotando: siNo(a.flotando), par: siNo(a.par),
    utileria: normalizarUtileriaIA(a.utileria), abre_estuche: normalizarApertura(a.abre_estuche ?? a.abreEstuche, D), elementos: normalizarElementosIA(a.elementos),
  };
}

// ---------- Lo nuevo de v4: luz, flotar, par, estuches y cajas, elementos ----------
const siNo = v => v === true || (typeof v === 'string' && /^(si|sí|true|1)$/i.test(v.trim()));
function esquemaDe(v) {
  if (typeof v !== 'string') return null;
  if (Object.hasOwn(ESQUEMAS_LUZ, v)) return v;
  const s = sinTildes(v);
  return /clave\s*baja|low\s*key|oscur/.test(s) ? 'clave-baja' : /alta\s*clave|clave\s*alta|high\s*key/.test(s) ? 'alta-clave' : /contra\s*luz|back\s*light|silueta/.test(s) ? 'contraluz' : /ventana|normal|estudio/.test(s) ? 'ventana' : null;
}
// el tipo de estuche: el id exacto o lo que se le parezca («caja de regalo», «cajas apiladas», «estuche»)
function tipoUtileriaDe(v) {
  if (typeof v !== 'string') return 'ninguna';
  if (Object.hasOwn(TIPOS_UTILERIA, v)) return v;
  const s = sinTildes(v);
  if (!s || /ningun|sin |no hay/.test(s)) return 'ninguna';
  if (/pila|apilad|torre|cajas/.test(s)) return 'pila-cajas';
  if (/regalo|mono|gift/.test(s)) return 'caja-regalo';
  if (/cofre|tapa alta/.test(s)) return 'cofre';
  if (/cajon|drawer/.test(s)) return 'cajon';
  if (/bandeja|tray|plato/.test(s)) return 'bandeja';
  if (/estuche|caja|box/.test(s)) return /arete|pendiente/.test(s) ? 'estuche-aretes' : /collar|cadena|dije/.test(s) ? 'estuche-collar' : 'estuche-anillo';
  return 'ninguna';
}
function normalizarUtileriaIA(u) {
  const c = typeof u === 'string' ? { tipo: u } : esObj(u) ? u : {};
  const tipo = tipoUtileriaDe(c.tipo);
  return { tipo, color: tipo === 'ninguna' ? null : colorHex(c.color), cinta: tipo === 'ninguna' ? null : colorHex(c.cinta), posicion: de(POSICIONES_UTILERIA, c.posicion, tipo === 'pila-cajas' ? 'asiento' : 'asiento') };
}
function normalizarApertura(v, D) {
  const c = typeof v === 'boolean' || typeof v === 'string' ? { abre: siNo(v) } : esObj(v) ? v : {};
  const abre = siNo(c.abre);
  if (!abre) return { abre: false, desde: -1, hasta: -1 };
  let desde = numero(c.desde, -1), hasta = numero(c.hasta, -1);
  desde = desde >= 0 ? r2(limitar(desde, 0, Math.max(0, D - 0.2))) : -1;
  hasta = hasta >= 0 ? r2(limitar(hasta, 0, D)) : -1;
  if (desde >= 0 && hasta >= 0 && hasta < desde + 0.2) hasta = r2(Math.min(D, desde + 1));
  return { abre: true, desde, hasta };
}
function tipoElementoDe(v) {
  if (typeof v !== 'string') return null;
  if (Object.hasOwn(ELEMENTOS_IA, v)) return v;
  const s = sinTildes(v);
  return /cristal|vidrio|glass|transparen/.test(s) ? 'cristal' : /perla/.test(s) ? 'perlas' : /cuenta|bolita|bead/.test(s) ? 'cuentas' : /esfera|bola|sphere|pelota/.test(s) ? 'esferas'
    : /cinta|liston|ribbon|lazo/.test(s) ? 'cinta' : /cadena|chain/.test(s) ? 'cadena' : null;
}
function normalizarElementosIA(lista) {
  const out = [], vistos = new Set();
  for (const x of Array.isArray(lista) ? lista.slice(0, 40) : []) {
    const c = typeof x === 'string' ? { tipo: x } : esObj(x) ? x : null;
    const tipo = c && tipoElementoDe(c.tipo);
    if (!tipo || vistos.has(tipo) || out.length >= MAX_ELEMENTOS_IA) continue;
    vistos.add(tipo);
    out.push({ tipo, coreografia: de(COREOGRAFIAS_IDS, c.coreografia, null), recorrido: tipo === 'cinta' ? de(RECORRIDOS_CINTA_IDS, c.recorrido, 'corazon') : null });
  }
  return out;
}

// La configuración completa de la escena que vio la IA (lista para estudio.ponerEscena), o null
export function configEscenaIA(ia) {
  const e = esObj(ia?.escena) ? ia.escena : esObj(ia) && ia.id ? ia : null;
  if (!e) return null;
  // una de satén que escenas.js aún no conoce: se arma sobre su respaldo (completarEscena conserva la tela y lo demás)
  const sat = !ESCENAS[e.id] && ESCENAS_SATEN[e.id];
  return completarEscena(sat ? { ...JSON.parse(JSON.stringify(sat)), id: sat.respaldo, preset: e.id, superficie: { ...sat.superficie, ...e.superficie }, fondo: { ...sat.fondo, ...e.fondo }, luz: { ...sat.luz, ...e.luz } }
    : { id: e.id, superficie: e.superficie, fondo: e.fondo, luz: e.luz });
}

// =====================================================================================================
// ---------- El pedido: lo que se le manda a /api/analizar ----------
// =====================================================================================================
// Resumen de cada plano medido en el equipo (lo que la IA necesita saber del flujo, sin los pasos cuadro a cuadro)
export function resumenPlanos(planos, cortes = []) {
  const lista = (Array.isArray(planos) ? planos : []).filter(esObj).slice(0, MAX_PLANOS);
  const cs = (Array.isArray(cortes) ? cortes : []).filter(esObj);
  return lista.map((p, k) => {
    const d = datosPlano(p, k), m = esObj(p.movimiento) ? p.movimiento : {};
    const inicio = r2(limitar(numero(d.inicio, 0), 0, DURACION_MAX * 2)), fin = r2(limitar(numero(d.fin, inicio), inicio, DURACION_MAX * 2));
    const corte = k > 0 ? cs.find(c => Math.abs(numero(c.t, -9) - inicio) < 0.08) : null;
    return {
      indice: d.indice, inicio, fin, tipo: texto(m.tipo ?? p.tipo, 20) || 'quieto',
      transicion: k > 0 ? de(TRANSICIONES, corte?.transicion ?? p.transicion, 'seco') : 'seco',
      giro: r2(limitar(d.giro, -1080, 1080)), zoomDesde: r2(limitar(d.zoomDesde, 0.4, 4)), zoomHasta: r2(limitar(d.zoomHasta, 0.4, 4)),
      inclinacion: r2(limitar(d.inclinacion, -100, 100)), rodar: r2(limitar(d.rodar, -90, 90)),
      lateral: r3(limitar(numero(m.lateral?.delta ?? p.lateral, 0), -2, 2)), altura: r3(limitar(numero(m.altura?.delta ?? p.altura, 0), -2, 2)),
      curva: d.curva,
    };
  });
}

function limpiarPaleta(p) {
  if (!esObj(p)) return null;
  return {
    fondo: colorHex(p.fondo), superficie: colorHex(p.superficie), oscuro: p.oscuro === true,
    calidez: r2(limitar(numero(p.calidez, 0), -1, 1)), sombrasDuras: p.sombrasDuras === true,
    luzDesde: de(['izquierda', 'derecha', 'arriba', 'frente'], p.luzDesde, null),
  };
}

// Un fotograma JPEG en base64 (sin «data:»); null si no sirve
export function base64JPEG(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (s.startsWith('data:')) { const i = s.indexOf(','); s = i >= 0 && /;base64$/i.test(s.slice(0, i)) ? s.slice(i + 1) : ''; }
  s = s.replace(/\s+/g, '');
  if (!s || s.length > MAX_BASE64 || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  return s.startsWith('/9j/') ? s : null;   // FF D8 FF: así empieza un JPEG
}

/**
 * Limpia los datos de un análisis (lo usa el navegador antes de mandarlos y el servidor al recibirlos).
 * datos: el análisis de analizarVideo ({ duracion, cortes, planos, paleta, fotogramas }) o el cuerpo ya armado
 * ({ duracion, planos, paleta, cuadros }). → { duracion, planos, paleta, cuadros:[{ plano, t, base64 }] } (≤ 16 cuadros).
 */
export function limpiarDatosAnalisis(datos) {
  const d = esObj(datos) ? datos : {};
  const planos = resumenPlanos(d.planos, d.cortes);
  const finPlanos = planos.reduce((m, p) => Math.max(m, p.fin), 0);
  const duracion = r2(limitar(numero(d.duracion, finPlanos || 1), 0.1, DURACION_MAX * 2));
  const indices = new Set(planos.map(p => p.indice));
  const cuadros = [];
  for (const c of Array.isArray(d.cuadros) ? d.cuadros : Array.isArray(d.fotogramas) ? d.fotogramas : []) {
    if (!esObj(c) || cuadros.length >= MAX_FOTOGRAMAS) continue;
    const base64 = base64JPEG(c.base64);
    if (!base64) continue;
    const plano = numero(c.plano, NaN);
    cuadros.push({ plano: Number.isInteger(plano) && (!indices.size || indices.has(plano)) ? plano : (planos.find(p => numero(c.t, -1) >= p.inicio && numero(c.t, -1) < p.fin)?.indice ?? 0), t: r2(limitar(numero(c.t, 0), 0, duracion)), base64 });
  }
  return { duracion, planos, paleta: limpiarPaleta(d.paleta), cuadros };
}

// El cuerpo del pedido, sin pasar de MAX_CUERPO_ANALISIS: si se pasa, se quitan fotogramas (primero el segundo de los planos que tienen dos)
export function cuerpoAnalisis(datos, { maxBytes = MAX_CUERPO_ANALISIS } = {}) {
  const cuerpo = limpiarDatosAnalisis(datos);
  const medida = () => JSON.stringify(cuerpo).length + 1024;
  while (cuerpo.cuadros.length > 1 && medida() > maxBytes) {
    const cuenta = new Map();
    cuerpo.cuadros.forEach(c => cuenta.set(c.plano, (cuenta.get(c.plano) || 0) + 1));
    let i = cuerpo.cuadros.findLastIndex(c => cuenta.get(c.plano) > 1);
    if (i < 0) i = cuerpo.cuadros.reduce((m, c, k, l) => (c.base64.length > l[m].base64.length ? k : m), 0);   // el más pesado
    cuerpo.cuadros.splice(i, 1);
  }
  return cuerpo;
}

// =====================================================================================================
// ---------- Navegador: pedirle el análisis a la IA ----------
// =====================================================================================================
// codigo: 'sinIA' | 'local' | 'pedido' | 'grande' | 'limite' | 'origen' | 'rechazo' | 'ia' | 'red'
export class ErrorIA extends Error {
  constructor(mensaje, codigo, extra = {}) { super(mensaje); this.name = 'ErrorIA'; this.codigo = codigo; this.sinIA = codigo === 'sinIA' || codigo === 'local'; Object.assign(this, extra); }
}
const SOLO_EQUIPO = 'Se usa solo el análisis hecho en tu equipo.';
export const MENSAJES_IA = {
  sinIA: `El análisis con IA no está configurado (falta ANTHROPIC_API_KEY). ${SOLO_EQUIPO}`,
  local: `El análisis con IA solo funciona en la página publicada. ${SOLO_EQUIPO}`,
  pedido: `No hay fotogramas del video para que la IA los mire. ${SOLO_EQUIPO}`,
  grande: `Los fotogramas pesan demasiado para la IA. ${SOLO_EQUIPO}`,
  limite: 'Pediste muchos análisis seguidos. Espera un momento y vuelve a intentarlo.',
  origen: `El análisis con IA solo funciona desde la página del estudio. ${SOLO_EQUIPO}`,
  rechazo: `La IA no quiso analizar estos fotogramas. ${SOLO_EQUIPO}`,
  ia: `La IA no pudo analizar el video ahora. ${SOLO_EQUIPO}`,
  red: `No hay conexión con el servidor de la IA. ${SOLO_EQUIPO}`,
};

/**
 * Manda el análisis del equipo (planos, colores y fotogramas) a /api/analizar y devuelve lo que vio la IA, ya validado
 * (con .modelo y .ia sin enumerar).
 * @param {object} datos
 * @param {{ fetch?: typeof fetch, cancelado?: () => boolean, signal?: AbortSignal, api?: string }} [opciones]
 * @returns {Promise<ReturnType<typeof normalizarAnalisisIA>>}
 */
export async function pedirAnalisisIA(datos, { fetch: traer = globalThis.fetch?.bind(globalThis), cancelado, signal, api = API_ANALIZAR } = {}) {
  const cuerpo = cuerpoAnalisis(datos);
  if (!cuerpo.cuadros.length) throw new ErrorIA(MENSAJES_IA.pedido, 'pedido');
  if (typeof traer !== 'function') throw new ErrorIA(MENSAJES_IA.local, 'local');
  const ctrl = new AbortController();
  const revisar = () => { if (!ctrl.signal.aborted && (cancelado?.() || signal?.aborted)) ctrl.abort(); };
  const reloj = typeof cancelado === 'function' ? setInterval(revisar, 150) : null;
  signal?.addEventListener?.('abort', revisar);
  try {
    revisar();
    if (ctrl.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    let r;
    try {
      r = await traer(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') throw new DOMException('Cancelado', 'AbortError');
      throw new ErrorIA(MENSAJES_IA.red, 'red');
    }
    let datosR = null;
    if (/json/i.test(r.headers.get('content-type') || '')) { try { datosR = await r.json(); } catch { datosR = null; } }
    revisar();
    if (ctrl.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    const msg = typeof datosR?.error === 'string' && datosR.error.trim() ? datosR.error.trim() : null;
    // servidor estático (o una página sin /api): 404/405/501 en HTML, o un 200 que no es JSON
    if (!datosR && (r.ok || [404, 405, 501].includes(r.status))) throw new ErrorIA(MENSAJES_IA.local, 'local');
    if (!r.ok) {
      datosR ||= {};   // p. ej. un 413 o un 504 de la plataforma, en HTML
      if (r.status === 503 && datosR.sinIA) throw new ErrorIA(MENSAJES_IA.sinIA, 'sinIA');
      if (r.status === 429) throw new ErrorIA(msg || MENSAJES_IA.limite, 'limite', { reintentarEn: Number(datosR.reintentarEn || r.headers.get('retry-after')) || undefined });
      if (r.status === 413) throw new ErrorIA(msg ? `${msg} ${SOLO_EQUIPO}` : MENSAJES_IA.grande, 'grande');
      if (r.status === 403) throw new ErrorIA(MENSAJES_IA.origen, 'origen');
      if (r.status === 400) throw new ErrorIA(msg ? `${msg} ${SOLO_EQUIPO}` : MENSAJES_IA.pedido, 'pedido');
      if ([404, 405, 501].includes(r.status)) throw new ErrorIA(MENSAJES_IA.local, 'local');
      throw new ErrorIA(msg ? `${msg} ${SOLO_EQUIPO}` : MENSAJES_IA.ia, 'ia');
    }
    if (!esObj(datosR.ia)) throw new ErrorIA(datosR.rechazo ? MENSAJES_IA.rechazo : MENSAJES_IA.ia, datosR.rechazo ? 'rechazo' : 'ia');
    const ia = normalizarAnalisisIA(datosR.ia, { planos: cuerpo.planos, duracion: cuerpo.duracion });
    const modelo = typeof datosR.modelo === 'string' ? datosR.modelo : null;
    // también se puede leer como la respuesta del servidor ({ ia, modelo }) sin romper nada (no se enumeran: JSON queda igual)
    Object.defineProperty(ia, 'ia', { value: ia, enumerable: false });
    Object.defineProperty(ia, 'modelo', { value: modelo, enumerable: false });
    return ia;
  } finally {
    if (reloj) clearInterval(reloj);
    signal?.removeEventListener?.('abort', revisar);
  }
}

// ¿Hay IA en este servidor? (GET /api/analizar) — false en el servidor local o sin la clave
export async function iaDisponible({ fetch: traer = globalThis.fetch?.bind(globalThis), api = API_ANALIZAR } = {}) {
  try {
    const r = await traer(api, { cache: 'no-store' });
    if (!r.ok || !/json/i.test(r.headers.get('content-type') || '')) return false;
    return (await r.json())?.disponible === true;
  } catch { return false; }
}
