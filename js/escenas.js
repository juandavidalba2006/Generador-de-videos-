// Escenas 3D donde se apoya la joya: pedestal o superficie, fondo, piso y una luz con sombras de ventana (gobo).
// Este módulo es puro (sin three.js ni DOM): solo los datos y su validación. Lo usan el estudio 3D (escenario3d.js),
// el panel de Escena, el replicador de videos, el chat y las funciones del servidor (api/) para validar a la IA.
// Todas las medidas son relativas al tamaño de la joya, así la escena se ve igual con un arete que con un collar.

export const FORMAS_SUPERFICIE = {
  cilindro:  'Pedestal redondo',
  cubo:      'Bloque',
  losa:      'Losa baja',
  escalones: 'Escalones',
  cojin:     'Cojín',
  piso:      'Directo en el piso',
};
export const FORMAS_FONDO = {
  curva:   'Fondo curvo (sin esquinas)',
  pared:   'Pared y piso',
  arco:    'Nicho con arco',
};
export const MATERIALES_ESCENA = {
  yeso:         'Yeso mate',
  travertino:   'Travertino',
  marmolBlanco: 'Mármol blanco',
  marmolNegro:  'Mármol negro',
  concreto:     'Concreto pulido',
  terciopelo:   'Terciopelo',
  lino:         'Lino',
  arena:        'Arena',
  madera:       'Madera clara',
  acrilico:     'Acrílico brillante',
};
export const GOBOS = {
  ninguno:  'Luz suave (sin sombras)',
  ventana:  'Ventana',
  persiana: 'Persiana',
  hojas:    'Hojas de palmera',
  arco:     'Ventana con arco',
  foco:     'Foco (círculo de luz)',
};

// Rangos de los valores numéricos (los usa normalizarEscena y los deslizadores del panel)
export const RANGOS = {
  tamano:     { min: 0.6, max: 2.5, def: 1 },      // ancho del pedestal en relación con la joya
  altura:     { min: 0.2, max: 2,   def: 1 },      // alto del pedestal en relación con la joya
  distancia:  { min: 0.6, max: 3,   def: 1 },      // qué tan lejos queda el fondo detrás de la pieza
  angulo:     { min: -180, max: 180, def: -35 },   // de dónde viene la luz, en grados (negativo = desde la izquierda)
  elevacion:  { min: 10,  max: 80,  def: 40 },     // altura de la luz sobre el horizonte, en grados
  suavidad:   { min: 0,   max: 1,   def: 0.45 },   // 0 = sombra dura de sol, 1 = muy difusa
  intensidad: { min: 0,   max: 2,   def: 1 },
  calidez:    { min: -1,  max: 1,   def: 0.3 },    // -1 = luz fría, 1 = luz cálida de atardecer
  ambiente:   { min: 0,   max: 1.5, def: 1 },      // cuánto aporta el estudio de fondo (relleno)
};

const S = (forma, material, color, extra = {}) => ({ forma, material, color, tamano: 1, altura: 1, ...extra });
const F = (forma, material, color, extra = {}) => ({ forma, material, color, distancia: 1, ...extra });
const L = (gobo, extra = {}) => ({ gobo, angulo: -35, elevacion: 40, suavidad: 0.45, intensidad: 1, calidez: 0.3, ...extra });

// Escenas listas. 'ninguna' es el fondo liso de marca de siempre (el de la pestaña Escena → Fondo liso)
export const ESCENAS = {
  ninguna: { nombre: 'Fondo liso de marca', descripcion: 'El degradado de siempre, sin superficie.', ninguna: true },
  'pedestal-arena': {
    nombre: 'Pedestal arena', descripcion: 'Pedestal redondo de yeso, fondo taupe y luz de ventana.',
    superficie: S('cilindro', 'yeso', '#D8CFC4', { tamano: 1.15, altura: 1.4 }), fondo: F('curva', 'yeso', '#B8A592'),
    luz: L('ventana', { angulo: -38, elevacion: 38, suavidad: 0.4, calidez: 0.35 }), ambiente: 0.9,
  },
  travertino: {
    nombre: 'Travertino', descripcion: 'Bloque de travertino con sombras de persiana.',
    superficie: S('cubo', 'travertino', '#E4D6C1', { tamano: 1.1, altura: 1.2 }), fondo: F('pared', 'yeso', '#CBB9A2'),
    luz: L('persiana', { angulo: 40, elevacion: 34, suavidad: 0.3, calidez: 0.25 }), ambiente: 0.9,
  },
  'marmol-blanco': {
    nombre: 'Mármol blanco', descripcion: 'Losa de mármol con vetas y fondo perla.',
    superficie: S('losa', 'marmolBlanco', '#F1EEEA', { tamano: 1.6, altura: 0.5 }), fondo: F('curva', 'yeso', '#E6E2DC'),
    luz: L('ninguno', { angulo: -25, elevacion: 55, suavidad: 0.8, calidez: 0.05 }), ambiente: 1.1,
  },
  'marmol-negro': {
    nombre: 'Mármol negro', descripcion: 'Bloque oscuro con un foco de luz: elegante y nocturno.',
    superficie: S('cubo', 'marmolNegro', '#1D1C1B', { tamano: 1.1, altura: 1.1 }), fondo: F('pared', 'concreto', '#2A2724'),
    luz: L('foco', { angulo: -20, elevacion: 55, suavidad: 0.35, intensidad: 1.3, calidez: 0.15 }), ambiente: 0.45,
  },
  escalones: {
    nombre: 'Podio de escalones', descripcion: 'Tres niveles de yeso, como una vitrina de joyería.',
    superficie: S('escalones', 'yeso', '#E7DDD1', { tamano: 1.3, altura: 1.2 }), fondo: F('curva', 'yeso', '#D6C6B4'),
    luz: L('ventana', { angulo: 30, elevacion: 42, suavidad: 0.5, calidez: 0.3 }), ambiente: 0.95,
  },
  arco: {
    nombre: 'Nicho con arco', descripcion: 'Pared con un arco y la joya sobre un pedestal.',
    superficie: S('cilindro', 'yeso', '#E1D5C5', { tamano: 1, altura: 1.3 }), fondo: F('arco', 'yeso', '#C9B39C'),
    luz: L('arco', { angulo: -45, elevacion: 36, suavidad: 0.45, calidez: 0.4 }), ambiente: 0.9,
  },
  hojas: {
    nombre: 'Sombras de palmera', descripcion: 'Luz de sol entre hojas sobre yeso claro.',
    superficie: S('cilindro', 'yeso', '#EEE5D9', { tamano: 1.2, altura: 1.1 }), fondo: F('pared', 'yeso', '#E2D0B8'),
    luz: L('hojas', { angulo: 50, elevacion: 40, suavidad: 0.25, intensidad: 1.15, calidez: 0.6 }), ambiente: 0.85,
  },
  terciopelo: {
    nombre: 'Terciopelo esmeralda', descripcion: 'Cojín de terciopelo verde, como un estuche de joyería.',
    superficie: S('cojin', 'terciopelo', '#1F4D3F', { tamano: 1.4, altura: 0.7 }), fondo: F('pared', 'terciopelo', '#163A30'),
    luz: L('ninguno', { angulo: -30, elevacion: 50, suavidad: 0.7, intensidad: 1.2, calidez: 0.2 }), ambiente: 0.6,
  },
  espejo: {
    nombre: 'Acrílico espejo', descripcion: 'Superficie brillante que refleja la joya.',
    superficie: S('losa', 'acrilico', '#F3F1EE', { tamano: 1.8, altura: 0.35 }), fondo: F('curva', 'yeso', '#ECE7E0'),
    luz: L('ninguno', { angulo: 20, elevacion: 50, suavidad: 0.75, calidez: 0.1 }), ambiente: 1.1,
  },
  playa: {
    nombre: 'Arena y sol', descripcion: 'La joya sobre arena con luz dura de sol.',
    superficie: S('piso', 'arena', '#E5D3B5'), fondo: F('curva', 'arena', '#EADBC2', { distancia: 2 }),
    luz: L('ninguno', { angulo: -55, elevacion: 30, suavidad: 0.1, intensidad: 1.25, calidez: 0.65 }), ambiente: 0.8,
  },
  rosa: {
    nombre: 'Rosa empolvado', descripcion: 'Pedestal rosa con luz de ventana: suave y romántico.',
    superficie: S('cilindro', 'yeso', '#EACFCB', { tamano: 1.15, altura: 1.3 }), fondo: F('curva', 'yeso', '#DDB7B2'),
    luz: L('ventana', { angulo: 35, elevacion: 40, suavidad: 0.45, calidez: 0.25 }), ambiente: 0.95,
  },
};

export const ESCENA_INICIAL = 'pedestal-arena';   // la de un estudio recién abierto (los proyectos viejos sin escena quedan en 'ninguna')

const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, k) => { const R = RANGOS[k]; return Number.isFinite(v) ? limitar(v, R.min, R.max) : R.def; };
const clave = (lista, v, def) => (typeof v === 'string' && Object.hasOwn(lista, v) ? v : def);
const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : def);

// Configuración completa de una escena lista (copia independiente)
export function escenaDe(id) {
  const e = ESCENAS[clave(ESCENAS, id, ESCENA_INICIAL)];
  if (e.ninguna) return { id: 'ninguna' };
  return normalizarEscena({ id: clave(ESCENAS, id, ESCENA_INICIAL), superficie: e.superficie, fondo: e.fondo, luz: e.luz, ambiente: e.ambiente });
}

// Valida una escena que viene de un archivo, del chat o de la IA: completa lo que falte con la escena base (cfg.id)
// y recorta los valores a sus rangos. Nunca lanza: ante basura devuelve la escena inicial; 'ninguna' queda { id: 'ninguna' }.
// Si se toca algo respecto a la escena lista, el id pasa a 'personalizada' (y base guarda de cuál salió).
export function normalizarEscena(cfg) {
  if (typeof cfg === 'string') cfg = { id: cfg };
  if (!esObj(cfg)) return escenaDeBase(ESCENA_INICIAL);
  if (cfg.id === 'ninguna') return { id: 'ninguna' };
  const idBase = clave(ESCENAS, cfg.id, null) && cfg.id !== 'ninguna' ? cfg.id : clave(ESCENAS, cfg.base, ESCENA_INICIAL);
  const b = escenaDeBase(idBase === 'ninguna' ? ESCENA_INICIAL : idBase);
  const s = esObj(cfg.superficie) ? cfg.superficie : {}, f = esObj(cfg.fondo) ? cfg.fondo : {}, l = esObj(cfg.luz) ? cfg.luz : {};
  const r = {
    id: b.id,
    superficie: {
      forma: clave(FORMAS_SUPERFICIE, s.forma, b.superficie.forma), material: clave(MATERIALES_ESCENA, s.material, b.superficie.material),
      color: color(s.color, b.superficie.color), tamano: Number.isFinite(s.tamano) ? num(s.tamano, 'tamano') : b.superficie.tamano,
      altura: Number.isFinite(s.altura) ? num(s.altura, 'altura') : b.superficie.altura,
    },
    fondo: {
      forma: clave(FORMAS_FONDO, f.forma, b.fondo.forma), material: clave(MATERIALES_ESCENA, f.material, b.fondo.material),
      color: color(f.color, b.fondo.color), distancia: Number.isFinite(f.distancia) ? num(f.distancia, 'distancia') : b.fondo.distancia,
    },
    luz: {
      gobo: clave(GOBOS, l.gobo, b.luz.gobo),
      ...Object.fromEntries(['angulo', 'elevacion', 'suavidad', 'intensidad', 'calidez'].map(k => [k, Number.isFinite(l[k]) ? num(l[k], k) : b.luz[k]])),
    },
    ambiente: Number.isFinite(cfg.ambiente) ? num(cfg.ambiente, 'ambiente') : b.ambiente,
  };
  if (!igualesEscenas(r, b)) { r.id = 'personalizada'; r.base = b.id; }
  return r;
}
function escenaDeBase(id) {
  const e = ESCENAS[id];
  return { id, superficie: { ...e.superficie }, fondo: { ...e.fondo }, luz: { ...e.luz }, ambiente: e.ambiente };
}
function igualesEscenas(a, b) {
  const plano = e => JSON.stringify([e.superficie, e.fondo, e.luz, e.ambiente]);
  return plano(a) === plano(b);
}

// ¿El fondo de la escena es oscuro? (los textos del video se pintan claros sobre una escena oscura)
export function escenaOscura(cfg) {
  if (!esObj(cfg) || cfg.id === 'ninguna' || !esObj(cfg.fondo)) return false;
  const h = color(cfg.fondo.color, '#FFFFFF'), [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.12;
}

// Escena lista más parecida a unos colores de fondo y superficie (lo usa el replicador cuando no hay IA)
export function escenaParecida({ fondo, superficie, oscuro } = {}) {
  const rgb = h => { const c = color(h, null); return c ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null; };
  const F = rgb(fondo), Sp = rgb(superficie);
  let mejor = ESCENA_INICIAL, dm = Infinity;
  for (const [id, e] of Object.entries(ESCENAS)) {
    if (e.ninguna) continue;
    const d2 = (a, b) => (a && b ? (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 : 0);
    const d = d2(F, rgb(e.fondo.color)) + 0.6 * d2(Sp, rgb(e.superficie.color)) + (typeof oscuro === 'boolean' && oscuro !== escenaOscura(escenaDe(id)) ? 3e4 : 0);
    if (d < dm) { dm = d; mejor = id; }
  }
  return mejor;
}
