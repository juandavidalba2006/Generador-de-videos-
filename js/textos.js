// Textos del video como capas editables (al estilo de CapCut): modelo, plantillas para reels,
// dibujo animado sobre el lienzo, arrastre directo en la vista previa y el panel para editarlas.
import { logoPath, LOGO_W, LOGO_H, escarabajo } from './marca.js';

const SERIF = "'Bodoni Moda', Didot, 'Times New Roman', serif";
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const ORO_LOGO = '#C49022';
const LEMA = 'joyería de alta calidad';
const PIE = 'Hecha a mano · 100 % colombiana';

// Presets de cada estilo (tam en px para un lado corto de 1080; en 9:16)
export const ESTILOS = {
  titulo:    { nombre: 'Título',    fuente: 'serif',         tam: 76, peso: 500, espaciado: 0.044, color: 'auto' },
  subtitulo: { nombre: 'Subtítulo', fuente: 'sans-mayus',    tam: 24, peso: 500, espaciado: 0.3,   color: 'oro' },
  detalle:   { nombre: 'Detalle',   fuente: 'sans-mayus',    tam: 21, peso: 500, espaciado: 0.16,  color: 'auto' },
  precio:    { nombre: 'Precio',    fuente: 'serif',         tam: 40, peso: 500, espaciado: 0,     color: 'auto' },
  pie:       { nombre: 'Pie',       fuente: 'sans',          tam: 19, peso: 400, espaciado: 0.06,  color: 'auto' },
  gancho:    { nombre: 'Gancho',    fuente: 'sans',          tam: 64, peso: 600, espaciado: -0.01, color: 'auto' },
  libre:     { nombre: 'Libre',     fuente: 'serif-italica', tam: 46, peso: 400, espaciado: 0,     color: 'auto' },
};
export const FUENTES = { serif: 'Serif', 'serif-italica': 'Itálica', sans: 'Sans', 'sans-mayus': 'Mayúsculas' };
export const ANIMACIONES = { aparecer: 'Aparecer', subir: 'Subir', maquina: 'Máquina de escribir', zoom: 'Zoom', brillo: 'Brillo dorado', deslizar: 'Deslizar', ninguna: 'Sin animación' };
export const FONDOS_TEXTO = { ninguno: 'Sin fondo', pastilla: 'Pastilla', 'linea-oro': 'Línea dorada' };
const PESOS = [400, 500, 600], ALINEAR = ['centro', 'izquierda', 'derecha'];

// Tamaños de los formatos (los mismos de composicion.js; se repiten para no importar en círculo)
const MEDIDAS = { reel: [1080, 1920], post: [1080, 1350], cuadrado: [1080, 1080], catalogo: [1920, 1080] };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const c01 = v => clamp(v, 0, 1);
const facil = p => 1 - Math.pow(1 - c01(p), 3);
const rebote = p => { const c = 1.7, q = c01(p) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);

// Separa en grafemas para que la máquina de escribir no parta un emoji ni una tilde combinada
const segmentador = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
const grafemas = s => (segmentador ? Array.from(segmentador.segment(s), g => g.segment) : Array.from(s));

// ---------- Modelo de capa ----------
let contador = 0;
function nuevoId(capas = []) {
  for (const c of capas) { const m = /^tx(\d+)$/.exec(c?.id || ''); if (m) contador = Math.max(contador, +m[1]); }
  return 'tx' + (++contador);
}

const MARCA = { estilo: 'libre', fuente: 'serif', tam: 34, peso: 400, espaciado: 0.12, color: 'auto' };

// Completa y valida una capa (sirve también para proyectos guardados o capas que llegan del asistente)
export function normalizarCapa(c = {}) {
  const tipo = c.tipo === 'marca' ? 'marca' : 'texto';
  const estilo = ESTILOS[c.estilo] ? c.estilo : 'libre';
  const p = tipo === 'marca' ? MARCA : ESTILOS[estilo];
  const color = c.color === 'auto' || c.color === 'oro' || /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : p.color;
  const entra = clamp(num(c.entra, 0), 0, 600);
  const sale = typeof c.sale === 'number' && Number.isFinite(c.sale) && c.sale >= 0 ? Math.max(c.sale, entra) : null;
  return {
    ...c,
    id: typeof c.id === 'string' && c.id ? c.id : nuevoId(),
    tipo, estilo,
    texto: typeof c.texto === 'string' ? c.texto : '',
    fuente: FUENTES[c.fuente] ? c.fuente : p.fuente,
    tam: clamp(num(c.tam, p.tam), 6, 400),
    peso: PESOS.includes(c.peso) ? c.peso : p.peso,
    color,
    x: c01(num(c.x, 0.5)), y: c01(num(c.y, 0.5)),
    alinear: ALINEAR.includes(c.alinear) ? c.alinear : 'centro',
    espaciado: clamp(num(c.espaciado, p.espaciado), -0.2, 1),
    entra, sale,
    animacion: ANIMACIONES[c.animacion] ? c.animacion : 'aparecer',
    dur: clamp(num(c.dur, 0.9), 0.05, 10),
    fondo: FONDOS_TEXTO[c.fondo] ? c.fondo : 'ninguno',
    sombra: !!c.sombra,
    ancho: clamp(num(c.ancho, 0.86), 0.1, 1),
    oculta: !!c.oculta,
    // auto: la posición horizontal la decide el formato (centrada; a la izquierda en 16:9)
    auto: c.auto !== false,
    // formato al que corresponden x/y (para recolocar al cambiar de formato)
    formato: MEDIDAS[c.formato] ? c.formato : 'reel',
  };
}
export const normalizarCapas = capas => (Array.isArray(capas) ? capas.filter(c => c && typeof c === 'object').map(normalizarCapa) : []);

// Capa nueva a partir de un estilo: crearCapa({ estilo: 'precio', texto: '$ 4.800.000', y: 0.8 })
export function crearCapa(props = {}) {
  const tipo = props.tipo === 'marca' ? 'marca' : 'texto';
  const estilo = ESTILOS[props.estilo] ? props.estilo : 'libre';
  const { nombre, ...preset } = tipo === 'marca' ? { nombre: '', ...MARCA } : ESTILOS[estilo];
  return normalizarCapa({ id: nuevoId(), tipo, ...preset, estilo, x: 0.5, y: 0.5, alinear: 'centro', entra: 0, sale: null, animacion: 'aparecer', dur: 0.9, fondo: 'ninguno', sombra: false, ancho: 0.86, ...props });
}

// ---------- Disposición según el formato (la misma de Compositor.disposicion) ----------
// acepta la clave ('reel'…) o un objeto { w, h } con la misma proporción de alguno de los formatos
function claveFormato(formato) {
  if (MEDIDAS[formato]) return formato;
  const w = formato?.w || formato?.W, h = formato?.h || formato?.H;
  return w && h ? Object.keys(MEDIDAS).find(k => Math.abs(MEDIDAS[k][0] / MEDIDAS[k][1] - w / h) < 0.01) || null : null;
}
function anclas(W, H) {
  const u = Math.min(W, H) / 1080, vertical = H / W > 1.5, apaisado = W > H;
  return {
    W, H, u, vertical, apaisado,
    arriba: vertical ? H * 0.085 : H * 0.07,     // borde superior de la marca
    base: vertical ? H * 0.80 : H * 0.905,        // línea base del bloque de abajo (nombre, detalle, precio)
    pie: vertical ? H * 0.865 : H - 34 * u,
  };
}
const tamTitulo = A => (A.vertical ? 76 : 64);

// Recoloca y verticalmente: la banda de arriba conserva la distancia a la marca, la de abajo la distancia
// a la línea base, y lo que está en el centro conserva su fracción (así un formato ida y vuelta queda igual)
function mapearY(y, A, B) {
  const yp = y * A.H; let r;
  if (y < 0.45) {
    r = yp <= A.arriba ? yp / A.arriba * B.arriba : B.arriba + (yp - A.arriba) * B.u / A.u;
    return clamp(r / B.H, 0, 0.449);
  }
  if (y > 0.55) {
    if (yp <= A.base) r = B.base + (yp - A.base) * B.u / A.u;
    else if (yp <= A.pie) r = B.base + (yp - A.base) / (A.pie - A.base) * (B.pie - B.base);
    else r = B.pie + (yp - A.pie) / Math.max(1, A.H - A.pie) * (B.H - B.pie);
    return clamp(r / B.H, 0.551, 1);
  }
  return y;
}

function colocarX(c, B) {
  if (c.auto === false) return;
  if (B.apaisado) {
    // catálogo 16:9: los textos a la izquierda y el pie a la derecha, como en el diseño original
    if (c.estilo === 'pie' && c.tipo !== 'marca') { c.alinear = 'derecha'; c.x = 0.935; }
    else { c.alinear = 'izquierda'; c.x = 0.065; }
    c.ancho = c.estilo === 'titulo' ? 0.34 : 0.42;
  } else { c.alinear = 'centro'; c.x = 0.5; c.ancho = 0.86; }
}

// Pasa las capas al formato indicado ('reel' | 'post' | 'cuadrado' | 'catalogo'). Modifica y devuelve el mismo arreglo.
// Llamarla otra vez con el mismo formato no cambia nada.
export function adaptarAFormato(capas, formato) {
  const destino = claveFormato(formato); if (!destino || !Array.isArray(capas)) return capas;
  const B = anclas(...MEDIDAS[destino]);
  for (const c of capas) {
    if (!c || typeof c !== 'object') continue;
    const origen = MEDIDAS[c.formato] ? c.formato : 'reel';
    if (origen !== destino) {
      const A = anclas(...MEDIDAS[origen]);
      c.y = mapearY(num(c.y, 0.5), A, B);
      // el nombre es un poco más pequeño fuera del 9:16 (76 → 64 px), igual que antes
      if ((c.estilo === 'titulo' || c.estilo === 'gancho') && c.tipo !== 'marca' && A.vertical !== B.vertical) c.tam = Math.round(num(c.tam, 76) * tamTitulo(B) / tamTitulo(A) * 10) / 10;
      // solo al entrar o salir del 16:9 cambia la colocación horizontal (las capas movidas a mano se quedan donde están)
      if (A.apaisado !== B.apaisado) colocarX(c, B);
    }
    c.formato = destino;
  }
  return capas;
}

// Capas que reproducen el diseño de siempre: marca arriba, nombre, línea dorada + detalle y el pie (en 9:16)
export function textosPorDefecto(nombre = 'Solitario Aurora', detalle = '', extra = {}) {
  const A = anclas(1080, 1920), u = A.u, abajo = [];
  // el bloque de abajo se arma desde la línea base hacia arriba, igual que antes
  let y = A.base;
  const precio = (extra.precio || '').trim();
  if (precio) { abajo.unshift({ estilo: 'precio', texto: precio, y: y / A.H }); y -= 62 * u; }
  if ((detalle || '').trim()) { abajo.unshift({ estilo: 'detalle', texto: detalle.trim(), y: y / A.H }); y -= 44 * u; }
  y -= 30 * u;   // la línea dorada va entre el nombre y el detalle
  if ((nombre || '').trim()) abajo.unshift({ estilo: 'titulo', texto: nombre.trim(), y: y / A.H, fondo: 'linea-oro' });
  const capas = [crearCapa({ tipo: 'marca', y: A.arriba / A.H, entra: 0.1, dur: 1.1, animacion: 'aparecer' })];
  for (const c of abajo) capas.push(crearCapa({ ...c, entra: 0.7, dur: 1, animacion: 'subir' }));
  const pie = extra.pie ?? PIE;
  if (pie) capas.push(crearCapa({ estilo: 'pie', texto: pie, y: A.pie / A.H, entra: 1.3, dur: 1, animacion: 'aparecer' }));
  return capas;
}

// Convierte las capas simples del asistente ({ texto, estilo, y, entra, sale (-1 = hasta el final), animacion })
// en capas completas. Conserva la marca que ya hubiera si el asistente no la menciona.
export function textosDesdeAcciones(simples = [], { formato = 'reel', capasActuales = [] } = {}) {
  const f = claveFormato(formato) || 'reel', B = anclas(...MEDIDAS[f]);
  const nuevas = (Array.isArray(simples) ? simples : []).filter(s => s && typeof s.texto === 'string' && s.texto.trim()).map(s => {
    const estilo = ESTILOS[s.estilo] ? s.estilo : 'libre';
    const c = crearCapa({ estilo, texto: s.texto.trim(), y: c01(num(s.y, 0.5)), entra: Math.max(0, num(s.entra, 0)), sale: num(s.sale, -1) < 0 ? null : s.sale, animacion: ANIMACIONES[s.animacion] ? s.animacion : 'aparecer', formato: f, fondo: estilo === 'titulo' ? 'linea-oro' : estilo === 'precio' ? 'pastilla' : 'ninguno' });
    if (estilo === 'titulo' && !B.vertical) c.tam = 64;
    colocarX(c, B);
    return c;
  });
  const marcas = (capasActuales || []).filter(c => c?.tipo === 'marca').map(c => ({ ...c }));
  return [...marcas, ...nuevas];
}

// ---------- Plantillas de un clic (pensadas para reels de joyería con gancho en los primeros segundos) ----------
function datosPlantilla(d = {}) {
  const detalle = (d.detalle ?? 'Oro amarillo 18k · Diamante').trim();
  const partes = detalle.split('·').map(s => s.trim()).filter(Boolean);
  return {
    nombre: (d.nombre || 'Solitario Aurora').trim(), detalle,
    precio: (d.precio || '$ 4.800.000').trim(),
    piedra: (d.piedra || (partes.length > 1 ? partes[partes.length - 1] : 'Diamante')).replace(/s$/i, '').trim() || 'Diamante',
    k: clamp(num(d.duracion, 8), 3, 60) / 8,      // las plantillas se pensaron para 8 s; se estiran o encogen con la duración
  };
}
const Y = px => px / 1920;     // posiciones en un cuadro de 1080 × 1920
const marcaArriba = (entra = 0.1) => crearCapa({ tipo: 'marca', y: 0.085, entra, dur: 1.1, animacion: 'aparecer' });
// cada plantilla es una función datos → capas, con su nombre, una descripción y el segundo que mejor la resume (miniatura)
const plantilla = (nombre, descripcion, miniatura, fn) => Object.assign(fn, { nombre, descripcion, miniatura });

export const PLANTILLAS = {
  lanzamiento: plantilla('Lanzamiento', 'Marca, «Nueva colección» y el nombre de la pieza', 8, datos => {
    const d = datosPlantilla(datos);
    return [
      marcaArriba(),
      crearCapa({ estilo: 'subtitulo', texto: 'Nueva colección', y: Y(1356), entra: 0.5, dur: 0.8, animacion: 'maquina' }),
      crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1462), entra: 1.1, dur: 1, animacion: 'subir', fondo: 'linea-oro' }),
      ...(d.detalle ? [crearCapa({ estilo: 'detalle', texto: d.detalle, y: Y(1536), entra: 1.4, dur: 1, animacion: 'subir' })] : []),
    ];
  }),
  ganchoViral: plantilla('Gancho viral', 'Una pregunta grande en los primeros 2 s y después la pieza', 1, datos => {
    const d = datosPlantilla(datos), k = d.k;
    return [
      crearCapa({ estilo: 'gancho', texto: '¿Te lo pondrías? 💍', color: '#FFFFFF', fondo: 'pastilla', y: Y(262), entra: 0, sale: 2.2 * k, dur: 0.35, animacion: 'zoom' }),
      marcaArriba(2.3 * k),
      crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1462), entra: 2.2 * k, dur: 1, animacion: 'subir', fondo: 'linea-oro' }),
      ...(d.detalle ? [crearCapa({ estilo: 'detalle', texto: d.detalle, y: Y(1536), entra: 2.5 * k, dur: 1, animacion: 'subir' })] : []),
    ];
  }),
  precioEspecial: plantilla('Precio especial', 'El precio en pastilla y «Solo esta semana»', 8, datos => {
    const d = datosPlantilla(datos);
    return [
      marcaArriba(),
      crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1440), entra: 0.6, dur: 1, animacion: 'subir' }),
      crearCapa({ estilo: 'precio', texto: d.precio, tam: 50, color: '#FFFFFF', fondo: 'pastilla', y: Y(1562), entra: 1.3, dur: 0.5, animacion: 'zoom' }),
      crearCapa({ estilo: 'subtitulo', texto: 'Solo esta semana', y: Y(1672), entra: 1.9, dur: 0.9, animacion: 'brillo' }),
    ];
  }),
  hechoAMano: plantilla('Hecho a mano', 'Frases del proceso que cambian cada 2 s y cierran con la pieza', 3.6, datos => {
    const d = datosPlantilla(datos), k = d.k;
    const frase = (texto, entra, sale) => crearCapa({ estilo: 'libre', texto, y: Y(1500), entra: entra * k, sale: sale * k, dur: 0.7, animacion: 'maquina' });
    return [
      marcaArriba(),
      frase('Dibujada a mano…', 0.3, 2.3),
      frase('fundida y pulida en el taller…', 2.4, 4.4),
      frase('engastada piedra por piedra.', 4.5, 6.2),
      crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1462), entra: 6.2 * k, dur: 1, animacion: 'subir', fondo: 'linea-oro' }),
      crearCapa({ estilo: 'pie', texto: PIE, y: Y(1536), entra: 6.6 * k, dur: 1, animacion: 'aparecer', tam: 21 }),
    ];
  }),
  detallePiedra: plantilla('Detalle de la piedra', 'Nombre de la piedra con brillo y sus quilates', 8, datos => {
    const d = datosPlantilla(datos);
    return [
      marcaArriba(),
      crearCapa({ estilo: 'libre', texto: d.piedra, tam: 64, y: Y(1462), entra: 0.8, dur: 1.4, animacion: 'brillo', fondo: 'linea-oro' }),
      crearCapa({ estilo: 'detalle', texto: '0,50 quilates · talla brillante', y: Y(1536), entra: 1.3, dur: 1, animacion: 'subir' }),
      crearCapa({ estilo: 'pie', texto: d.nombre + ' · Atelier & Co', y: 0.865, entra: 1.8, dur: 1, animacion: 'aparecer' }),
    ];
  }),
  minimal: plantilla('Minimal', 'Solo el nombre de la pieza', 8, datos => {
    const d = datosPlantilla(datos);
    return [crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1536), entra: 0.5, dur: 1.4, animacion: 'aparecer' })];
  }),
  regalo: plantilla('Para regalar', 'Gancho de regalo, la pieza y el precio', 1.5, datos => {
    const d = datosPlantilla(datos), k = d.k;
    return [
      crearCapa({ estilo: 'gancho', texto: '¿Buscas el regalo perfecto? 🎁', y: Y(262), entra: 0, sale: 2.6 * k, dur: 0.8, animacion: 'maquina', sombra: true }),
      marcaArriba(2.7 * k),
      crearCapa({ estilo: 'titulo', texto: d.nombre, y: Y(1440), entra: 2.6 * k, dur: 1, animacion: 'subir' }),
      crearCapa({ estilo: 'precio', texto: d.precio, fondo: 'pastilla', y: Y(1556), entra: 3.1 * k, dur: 0.5, animacion: 'zoom' }),
    ];
  }),
};

// ---------- Medidas de cada capa ----------
let medidor = null;
function ctxMedidas() {
  if (medidor === null) {
    try { medidor = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8).getContext('2d') : typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : false; }
    catch (e) { medidor = false; }
  }
  return medidor || null;
}

// Ancho real del texto con el espaciado entre letras (sin el espacio que sobra después de la última)
function anchoTexto(ctx, texto, fuente, sep, tam) {
  const n = grafemas(texto).length; if (!n) return 0;
  if (!ctx) return n * tam * 0.56 + sep * (n - 1);   // en Node no hay lienzo: una aproximación basta
  ctx.font = fuente;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return ctx.measureText(texto).width + sep * (n - 1);
}
const inicioX = (al, X, w) => (al === 'izquierda' ? X : al === 'derecha' ? X - w : X - w / 2);

function colores(oscuro) {
  return { tinta: oscuro ? '#FFFFFF' : '#1E1B15', tinta2: oscuro ? 'rgba(244,241,234,.78)' : '#5E5A50', oro: oscuro ? '#D9A83A' : '#B8871F' };
}
// 'auto' = tinta sobre fondos claros y blanco sobre oscuros; el detalle y el pie van en la tinta secundaria
function colorDe(capa, oscuro) {
  const c = colores(oscuro);
  if (capa.color === 'oro') return c.oro;
  if (!capa.color || capa.color === 'auto') return capa.tipo !== 'marca' && (capa.estilo === 'detalle' || capa.estilo === 'pie') ? c.tinta2 : c.tinta;
  return capa.color;
}
const luminancia = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 1; const v = parseInt(m[1], 16); return (0.299 * (v >> 16) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255; };

// Calcula fuente, líneas y caja de una capa en reposo (sin animación)
function disponer(ctx, capa, W, H) {
  const u = Math.min(W, H) / 1080, X = capa.x * W, Yb = capa.y * H, al = capa.alinear;
  if (capa.tipo === 'marca') {
    const k = capa.tam / 34, lh = 64 * k * u, lw = lh * LOGO_W / LOGO_H;
    const tM = 34 * k * u, tL = 22 * k * u, sep = capa.espaciado * tM;
    const fM = `${capa.peso} ${tM}px ${SERIF}`, fL = `italic 400 ${tL}px ${SERIF}`;
    // el lema lleva el mismo espaciado en px que ATELIER&CO (así se ha visto siempre en Chrome)
    const wM = anchoTexto(ctx, 'ATELIER&CO', fM, sep, tM), wL = anchoTexto(ctx, LEMA, fL, sep, tL);
    const lineas = [
      { texto: 'ATELIER&CO', fuente: fM, sep, tam: tM, x: inicioX(al, X, wM), y: Yb + lh + 46 * k * u, w: wM },
      { texto: LEMA, fuente: fL, sep, tam: tL, x: inicioX(al, X, wL), y: Yb + lh + 80 * k * u, w: wL, lema: true },
    ];
    const logo = { x: inicioX(al, X, lw), y: Yb, w: lw, h: lh };
    const x0 = Math.min(logo.x, ...lineas.map(l => l.x)), x1 = Math.max(logo.x + lw, ...lineas.map(l => l.x + l.w));
    return { u, marca: true, logo, lineas, caja: { x: x0, y: Yb, w: x1 - x0, h: lh + 80 * k * u + tL * 0.24 } };
  }
  const mayus = capa.fuente === 'sans-mayus', ital = capa.fuente === 'serif-italica' ? 'italic ' : '';
  const familia = capa.fuente === 'serif' || capa.fuente === 'serif-italica' ? SERIF : SANS;
  const textos = (mayus ? capa.texto.toLocaleUpperCase('es-CO') : capa.texto).split('\n');
  const fuente = s => `${ital}${capa.peso} ${s}px ${familia}`;
  let tam = capa.tam * u;
  let anchos = textos.map(t => anchoTexto(ctx, t, fuente(tam), capa.espaciado * tam, tam));
  const max = capa.ancho * W, mayor = Math.max(0, ...anchos);
  if (mayor > max) {
    // se achica en pasos de 2 px (como antes) hasta caber, sin bajar de un tercio del tamaño;
    // el primer salto se calcula de una vez (el ancho es casi proporcional) y luego se verifica
    const minimo = Math.min(tam, Math.max(12 * u, tam * 0.32)), medir = () => textos.map(t => anchoTexto(ctx, t, fuente(tam), capa.espaciado * tam, tam));
    tam = Math.max(minimo, tam - Math.ceil((tam - tam * max / mayor) / (2 * u)) * 2 * u);
    anchos = medir();
    for (let i = 0; i < 40 && tam > minimo && Math.max(...anchos) > max; i++) { tam = Math.max(minimo, tam - 2 * u); anchos = medir(); }
  }
  const sep = capa.espaciado * tam, ih = tam * 1.18;
  const lineas = textos.map((t, i) => ({ texto: t, fuente: fuente(tam), sep, tam, x: inicioX(al, X, anchos[i]), y: Yb + i * ih, w: anchos[i] }));
  const asc = tam * 0.78, desc = tam * (mayus ? 0.08 : 0.22);
  let x0 = Math.min(...lineas.map(l => l.x)), x1 = Math.max(...lineas.map(l => l.x + l.w));
  if (x1 - x0 < 1) { x0 = X - tam * 0.3; x1 = X + tam * 0.3; }   // texto vacío: una caja mínima para poder agarrarla
  let y0 = Yb - asc, y1 = Yb + (lineas.length - 1) * ih + desc;
  let pastilla = null, regla = null;
  if (capa.fondo === 'pastilla') {
    const px = Math.max(12 * u, tam * 0.55), py = Math.max(6 * u, tam * 0.3);
    pastilla = { x: x0 - px, y: y0 - py, w: x1 - x0 + 2 * px, h: y1 - y0 + 2 * py };
    pastilla.r = Math.min(pastilla.h / 2, tam * 0.9);
    x0 = pastilla.x; x1 = pastilla.x + pastilla.w; y0 = pastilla.y; y1 = pastilla.y + pastilla.h;
  } else if (capa.fondo === 'linea-oro') {
    // filete dorado bajo el texto: 30 px bajo la línea base y 120 px de ancho para el nombre de 76 px
    const k = clamp(capa.tam / 76, 0.55, 1.5), w = 120 * k * u, ultima = Yb + (lineas.length - 1) * ih;
    regla = { x: inicioX(al, X, w), y: ultima + 30 * k * u, w, h: Math.max(1, 1.5 * u) };
    x0 = Math.min(x0, regla.x); x1 = Math.max(x1, regla.x + w); y1 = Math.max(y1, regla.y + regla.h);
  }
  return { u, tam, lineas, pastilla, regla, caja: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// Caja de la capa en px del lienzo (para tocarla, arrastrarla y dejarle espacio a la joya)
export function cajaCapa(ctx, capa, { W, H } = {}) {
  const c = ctx || ctxMedidas();
  W = W || c?.canvas?.width || 1080; H = H || c?.canvas?.height || 1920;
  if (c) c.save();
  try { return { ...disponer(c, normalizarSiHaceFalta(capa), W, H).caja }; }
  finally { if (c) c.restore(); }
}
// las capas que vienen del panel ya están completas; las demás (proyectos viejos, asistente) se completan al vuelo
const completa = c => c && typeof c.texto === 'string' && FUENTES[c.fuente] && ALINEAR.includes(c.alinear) && ANIMACIONES[c.animacion] && FONDOS_TEXTO[c.fondo]
  && [c.tam, c.peso, c.x, c.y, c.espaciado, c.entra, c.dur, c.ancho].every(Number.isFinite) && (c.sale === null || Number.isFinite(c.sale));
const normalizarSiHaceFalta = c => (completa(c) ? c : normalizarCapa(c));

// Franja libre para la joya: lo que ocupan los textos arriba y abajo (sin importar el tiempo, para que la cámara no salte)
export function zonaLibre(capas, { W, H, ctx } = {}) {
  W = W || 1080; H = H || 1920;
  const u = Math.min(W, H) / 1080, margen = 34 * u, apaisado = W > H;
  let abajoDeArriba = -Infinity, arribaDeAbajo = Infinity;
  for (const capa of capas || []) {
    if (!capa || capa.oculta) continue;
    const c = cajaCapa(ctx, capa, { W, H }), cy = (c.y + c.h / 2) / H;
    // en 16:9 los textos van a un lado de la pieza: no le quitan altura
    if (apaisado && (c.x + c.w <= 0.42 * W || c.x >= 0.58 * W)) continue;
    if (cy < 0.45) abajoDeArriba = Math.max(abajoDeArriba, c.y + c.h);
    else if (cy > 0.55) arribaDeAbajo = Math.min(arribaDeAbajo, c.y);
  }
  return {
    arriba: Number.isFinite(abajoDeArriba) ? clamp((abajoDeArriba + margen) / H, 0.03, 0.45) : 0.03,
    abajo: Number.isFinite(arribaDeAbajo) ? clamp((arribaDeAbajo - margen) / H, 0.55, 0.97) : 0.97,
  };
}

// ---------- Dibujo ----------
function pintarTexto(ctx, l, hasta = Infinity) {
  let texto = l.texto;
  if (hasta < Infinity) texto = grafemas(texto).slice(0, Math.max(0, hasta)).join('');
  if (!texto) return;
  ctx.font = l.fuente; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) { ctx.letterSpacing = `${l.sep}px`; ctx.fillText(texto, l.x, l.y); ctx.letterSpacing = '0px'; return; }
  if (!l.sep) { ctx.fillText(texto, l.x, l.y); return; }
  // navegadores sin letterSpacing: letra por letra
  let x = l.x;
  for (const g of grafemas(texto)) { ctx.fillText(g, x, l.y); x += ctx.measureText(g).width + l.sep; }
}

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Progreso de la animación de entrada (0..1) y opacidad de salida; null si la capa no se ve en t
function tiempos(capa, t) {
  if (t == null) return { p: 1, salida: 1, desde: Infinity };
  if (t < capa.entra || (capa.sale != null && t >= capa.sale)) return null;
  const p = capa.animacion === 'ninguna' ? 1 : c01((t - capa.entra) / Math.max(0.05, capa.dur));
  // la salida es un fundido suave de 0,35 s que termina justo en "sale"
  const q = capa.sale != null ? c01((capa.sale - t) / 0.35) : 1, salida = q * q * (3 - 2 * q);
  return { p, salida, desde: t - capa.entra };
}

// Posición del brillo dorado que cruza el texto: durante la entrada y luego cada 3,2 s
function barrido(capa, tm) {
  if (capa.animacion !== 'brillo' || tm.desde === Infinity) return null;
  if (tm.p < 1) return tm.p < 0.15 ? null : (tm.p - 0.15) / 0.85;
  const ciclo = (tm.desde - capa.dur) % 3.2;
  return ciclo < 1 ? ciclo : null;
}

function dibujarCapa(ctx, capa, W, H, t, oscuro) {
  const tm = tiempos(capa, t); if (!tm) return;
  const L = disponer(ctx, capa, W, H), u = L.u, caja = L.caja, e = facil(tm.p);
  let alfa = tm.salida, dx = 0, dy = 0, escala = 1, hasta = Infinity, cursor = null;
  switch (capa.animacion) {
    case 'aparecer': alfa *= e; break;
    case 'subir': alfa *= e; dy = (1 - e) * Math.max(24 * u, (L.tam || 34 * u) * 0.32); break;
    case 'zoom': alfa *= facil(tm.p * 2); escala = 0.6 + 0.4 * rebote(tm.p); break;
    case 'deslizar': alfa *= facil(tm.p * 1.6); dx = (capa.alinear === 'derecha' ? 1 : -1) * (1 - facil(tm.p)) * W * 0.14; break;
    case 'brillo': alfa *= facil(tm.p * 1.8); break;
    case 'maquina': {
      const total = L.lineas.reduce((s, l) => s + grafemas(l.texto).length, 0);
      hasta = tm.p >= 1 ? Infinity : Math.floor(tm.p * total + 0.001);
      // cursor dorado mientras escribe y medio segundo después, parpadeando
      cursor = tm.desde !== Infinity && tm.desde < capa.dur + 0.6 && (tm.p < 1 || Math.floor(tm.desde * 3) % 2 === 0);
      break;
    }
  }
  if (alfa <= 0.001) return;
  const col = colorDe(capa, oscuro), oro = colores(oscuro).oro;
  ctx.save();
  ctx.globalAlpha *= alfa * (capa.estilo === 'pie' && capa.tipo !== 'marca' ? 0.9 : 1);
  if (dx || dy) ctx.translate(dx, dy);
  if (escala !== 1) { const cx = caja.x + caja.w / 2, cy = caja.y + caja.h / 2; ctx.translate(cx, cy); ctx.scale(escala, escala); ctx.translate(-cx, -cy); }

  if (L.pastilla) {
    const P = L.pastilla, claro = luminancia(col) > 0.55;
    rectRedondo(ctx, P.x, P.y, P.w, P.h, P.r);
    ctx.fillStyle = claro ? 'rgba(23,21,15,.78)' : 'rgba(252,251,248,.94)'; ctx.fill();
    ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeStyle = claro ? 'rgba(217,168,58,.55)' : 'rgba(184,135,31,.55)'; ctx.stroke();
  }
  if (capa.sombra) { ctx.shadowColor = oscuro ? 'rgba(0,0,0,.55)' : 'rgba(30,27,21,.35)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 3 * u; }

  if (L.marca && logoPath) {
    const g = L.logo, s = g.h / LOGO_H, baja = capa.animacion === 'aparecer' ? (1 - e) * 10 * u : 0;
    ctx.save(); ctx.globalAlpha *= capa.animacion === 'maquina' ? e : 1;
    ctx.translate(g.x, g.y + baja); ctx.scale(s, s); ctx.fillStyle = ORO_LOGO; ctx.fill(logoPath, 'evenodd'); ctx.restore();
  }
  // la máquina de escribir reparte los caracteres visibles entre las líneas; el cursor va tras el último
  let quedan = hasta, ultimo = null;
  for (const l of L.lineas) {
    const n = grafemas(l.texto).length, v = Math.min(n, quedan);
    quedan -= v;
    ctx.fillStyle = l.lema ? oro : col;
    pintarTexto(ctx, l, v >= n ? Infinity : v);
    if (v > 0 || !ultimo) ultimo = { l, v, n };
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (cursor && ultimo) {
    const { l, v, n } = ultimo, parte = v >= n ? l.texto : grafemas(l.texto).slice(0, v).join('');
    const w = parte ? anchoTexto(ctx, parte, l.fuente, l.sep, l.tam) + l.sep : 0;
    ctx.fillStyle = oro; ctx.fillRect(l.x + w + l.tam * 0.04, l.y - l.tam * 0.74, Math.max(1.5 * u, l.tam * 0.055), l.tam * 0.86);
  }
  if (L.regla) {
    const R = L.regla, w = R.w * (capa.animacion === 'ninguna' ? 1 : e);
    const x = capa.alinear === 'izquierda' ? R.x : capa.alinear === 'derecha' ? R.x + R.w - w : R.x + (R.w - w) / 2;
    ctx.save(); ctx.globalAlpha *= 0.9; ctx.fillStyle = oro; ctx.fillRect(x, R.y, w, R.h); ctx.restore();
  }

  // brillo: una franja dorada en diagonal que recorre las letras (se vuelven a pintar con un degradado transparente → oro)
  const q = barrido(capa, tm);
  if (q != null) {
    const ancho = Math.max(caja.w * 0.22, (L.tam || 34 * u) * 1.2), cx = caja.x - ancho + q * (caja.w + 2 * ancho);
    const g = ctx.createLinearGradient(cx - ancho, caja.y, cx + ancho, caja.y + caja.h * 0.7);
    const luz = oscuro ? '255,232,170' : '214,163,52';
    g.addColorStop(0, `rgba(${luz},0)`); g.addColorStop(0.42, `rgba(${luz},.55)`); g.addColorStop(0.5, oscuro ? 'rgba(255,248,225,.95)' : `rgba(${luz},.9)`);
    g.addColorStop(0.58, `rgba(${luz},.55)`); g.addColorStop(1, `rgba(${luz},0)`);
    ctx.globalCompositeOperation = 'source-over';
    for (const l of L.lineas) { ctx.fillStyle = g; pintarTexto(ctx, l); }
    if (L.marca && logoPath) {
      // el degradado se interpreta en el espacio del logo: hay que llevar sus puntos a ese espacio
      const G = L.logo, s = G.h / LOGO_H, a = v => (v - G.x) / s, b = v => (v - G.y) / s;
      const gl = ctx.createLinearGradient(a(cx - ancho), b(caja.y), a(cx + ancho), b(caja.y + caja.h * 0.7));
      gl.addColorStop(0, 'rgba(255,240,200,0)'); gl.addColorStop(0.5, 'rgba(255,240,200,.7)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.save(); ctx.translate(G.x, G.y); ctx.scale(s, s); ctx.fillStyle = gl; ctx.fill(logoPath, 'evenodd'); ctx.restore();
    }
  }
  ctx.restore();
}

// Dibuja todas las capas visibles en t (segundos). Con t null se dibujan completas y quietas (fotos, miniaturas).
// duracion se acepta por contrato; sale null ya significa "hasta el final", así que no hace falta para dibujar.
export function dibujarTextos(ctx, capas, { W, H, t = null, oscuro = false, duracion } = {}) {
  if (!ctx || !Array.isArray(capas)) return;
  W = W || ctx.canvas.width; H = H || ctx.canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'alphabetic';
  for (const c of capas) {
    if (!c || c.oculta) continue;
    dibujarCapa(ctx, normalizarSiHaceFalta(c), W, H, t, oscuro);
  }
  ctx.restore();
}

// Marco punteado alrededor de la capa elegida (solo para la vista previa, no se exporta)
export function marcoSeleccion(ctx, capa, { W, H } = {}) {
  if (!ctx || !capa) return;
  W = W || ctx.canvas.width; H = H || ctx.canvas.height;
  const c = cajaCapa(ctx, capa, { W, H }), u = Math.min(W, H) / 1080, m = 10 * u;
  ctx.save();
  ctx.lineWidth = Math.max(1, 2 * u); ctx.setLineDash([8 * u, 6 * u]); ctx.strokeStyle = 'rgba(196,144,34,.95)';
  ctx.strokeRect(c.x - m, c.y - m, c.w + 2 * m, c.h + 2 * m);
  ctx.setLineDash([]); ctx.fillStyle = '#C49022';
  for (const [x, y] of [[c.x - m, c.y - m], [c.x + c.w + m, c.y - m], [c.x - m, c.y + c.h + m], [c.x + c.w + m, c.y + c.h + m]]) ctx.fillRect(x - 4 * u, y - 4 * u, 8 * u, 8 * u);
  ctx.restore();
}

// ---------- Arrastrar las capas directamente sobre la vista previa ----------
export function arrastrarEnLienzo(lienzo, { obtenerCapas, alMover, alSeleccionar, alSoltar, obtenerTiempo, W, H } = {}) {
  const val = v => (typeof v === 'function' ? v() : v);
  const dims = () => ({ W: lienzo.width || val(W), H: lienzo.height || val(H) });
  const ctx = () => (lienzo.getContext ? lienzo.getContext('2d') : null) || ctxMedidas();
  const aLienzo = e => { const r = lienzo.getBoundingClientRect(), d = dims(); return { x: (e.clientX - r.left) / r.width * d.W, y: (e.clientY - r.top) / r.height * d.H, kx: d.W / r.width, d }; };

  // la capa de más arriba que esté bajo el puntero (prefiere las que se ven en el momento actual)
  function buscar(p) {
    const capas = (obtenerCapas?.() || []).filter(c => c && !c.oculta), t = val(obtenerTiempo), cx = ctx();
    const holgura = 8 * p.kx;
    const dentro = c => { const b = cajaCapa(cx, c, p.d); return p.x >= b.x - holgura && p.x <= b.x + b.w + holgura && p.y >= b.y - holgura && p.y <= b.y + b.h + holgura; };
    const visibles = typeof t === 'number' ? capas.filter(c => t >= c.entra && (c.sale == null || t < c.sale)) : capas;
    for (const lista of [visibles, capas]) for (let i = lista.length - 1; i >= 0; i--) if (dentro(lista[i])) return lista[i];
    return null;
  }

  let arrastre = null;
  const abajo = e => {
    if (e.button > 0) return;
    const p = aLienzo(e), capa = buscar(p); if (!capa) return;
    e.preventDefault();
    alSeleccionar?.(capa.id);
    arrastre = { id: capa.id, capa, x0: p.x, y0: p.y, cx: capa.x, cy: capa.y, auto: capa.auto !== false, movio: false, puntero: e.pointerId };
    try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    lienzo.style.cursor = 'grabbing';
  };
  const mover = e => {
    const p = aLienzo(e);
    if (!arrastre) { lienzo.style.cursor = buscar(p) ? 'grab' : ''; return; }
    if (e.pointerId !== arrastre.puntero) return;
    const ddx = p.x - arrastre.x0, ddy = p.y - arrastre.y0;
    if (!arrastre.movio && Math.hypot(ddx, ddy) < 3 * p.kx) return;
    arrastre.movio = true;
    let x = c01(arrastre.cx + ddx / p.d.W), y = c01(arrastre.cy + ddy / p.d.H);
    // imán suave al centro horizontal
    if (arrastre.capa.alinear === 'centro' && Math.abs(x - 0.5) * p.d.W < 10 * p.kx) x = 0.5;
    arrastre.capa.x = Math.round(x * 1000) / 1000; arrastre.capa.y = Math.round(y * 1000) / 1000;
    // si se corrió hacia un lado deja de estar colocada por el formato (moverla solo en vertical no la cambia)
    arrastre.capa.auto = arrastre.auto && arrastre.capa.x === arrastre.cx;
    alMover?.(arrastre.capa);
  };
  const arriba = e => {
    if (!arrastre || e.pointerId !== arrastre.puntero) return;
    const a = arrastre; arrastre = null; lienzo.style.cursor = '';
    try { lienzo.releasePointerCapture(e.pointerId); } catch (err) { /* nada */ }
    if (a.movio) alSoltar?.(a.capa);
  };
  // en pantallas táctiles solo se bloquea el desplazamiento de la página si el dedo cae sobre un texto
  const tocar = e => { const tt = e.touches[0]; if (tt && buscar(aLienzo(tt))) e.preventDefault(); };
  lienzo.addEventListener('pointerdown', abajo);
  lienzo.addEventListener('pointermove', mover);
  lienzo.addEventListener('pointerup', arriba);
  lienzo.addEventListener('pointercancel', arriba);
  lienzo.addEventListener('touchstart', tocar, { passive: false });
  return () => {
    lienzo.removeEventListener('pointerdown', abajo); lienzo.removeEventListener('pointermove', mover);
    lienzo.removeEventListener('pointerup', arriba); lienzo.removeEventListener('pointercancel', arriba);
    lienzo.removeEventListener('touchstart', tocar);
    lienzo.style.cursor = '';
  };
}

// ---------- Panel de textos ----------
const ICONOS = {
  asa: '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>',
  ojo: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  ojoNo: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>',
  duplicar: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></svg>',
  borrar: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
  izquierda: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
  centro: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
  derecha: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
  cabezal: '<svg viewBox="0 0 24 24"><path d="M12 9v12M7 3h10v3l-5 4-5-4z"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};
const MUESTRAS = [['auto', 'Automático (según el fondo)'], ['#1E1B15', 'Tinta'], ['oro', 'Oro'], ['#FFFFFF', 'Blanco'], ['#F1EFEA', 'Perla']];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('es-CO');
const familiaDe = f => (f === 'serif' || f === 'serif-italica' ? 'var(--serif)' : 'var(--sans)');

export class PanelTextos {
  // opciones extra (no obligatorias): alSeleccionar(id), obtenerFormato() → 'reel'…, obtenerDatos() → { nombre, detalle, precio, piedra }
  constructor(contenedor, { obtenerProyecto, alCambiar, obtenerTiempo, alSeleccionar, obtenerFormato, obtenerDatos } = {}) {
    this.cont = contenedor;
    Object.assign(this, { obtenerProyecto, alCambiarExt: alCambiar, obtenerTiempo, alSeleccionarExt: alSeleccionar, obtenerFormato, obtenerDatos });
    this.sel = null; this.editorDe = null; this.respaldo = null;
    contenedor.classList.add('ptx');
    contenedor.innerHTML = `
      <section class="ptx-bloque">
        <div class="ptx-cab"><h3>Plantillas</h3><span class="ptx-ayuda">Un clic y luego editas cada texto</span></div>
        <div class="ptx-plantillas" role="group" aria-label="Plantillas de texto">
          ${Object.entries(PLANTILLAS).map(([k, f]) => `<button type="button" class="ptx-plantilla" data-plantilla="${k}" title="${esc(f.descripcion)}"><canvas width="72" height="128" aria-hidden="true"></canvas><b>${esc(f.nombre)}</b></button>`).join('')}
        </div>
      </section>
      <section class="ptx-bloque">
        <div class="ptx-cab"><h3>Capas</h3>
          <div class="ptx-mas">
            <button type="button" class="btn sec chico" data-accion="nuevoTexto">${ICONOS.mas}Texto</button>
            <button type="button" class="btn sec chico" data-accion="nuevaMarca">${ICONOS.mas}Marca</button>
          </div>
        </div>
        <ol class="ptx-lista" aria-label="Capas de texto (la última se dibuja al frente)"></ol>
        <div class="ptx-aviso" role="status" hidden><span></span><button type="button" class="ptx-enlace" data-accion="deshacer">Deshacer</button></div>
        <p class="ptx-ayuda ptx-pista">Arrastra los textos sobre la vista previa para moverlos. La capa de más abajo en la lista queda al frente.</p>
      </section>
      <section class="ptx-editor"></section>`;
    this.$lista = contenedor.querySelector('.ptx-lista');
    this.$editor = contenedor.querySelector('.ptx-editor');
    this.$aviso = contenedor.querySelector('.ptx-aviso');
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alEditar(e));
    contenedor.addEventListener('change', e => this.alEditar(e, true));
    contenedor.addEventListener('pointerdown', e => { const a = e.target.closest('.ptx-asa'); if (a) this.arrastrarFila(e, a.closest('li')); });
    contenedor.addEventListener('keydown', e => this.alTeclado(e));
    // las miniaturas se repintan cuando llegan las fuentes o cambia el modo oscuro
    this.pintarMiniaturas();
    try { document.fonts?.ready.then(() => this.pintarMiniaturas()); } catch (e) { /* nada */ }
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.pintarMiniaturas()); } catch (e) { /* nada */ }
    this.render();
  }

  get seleccion() { return this.sel; }
  proyecto() { const p = this.obtenerProyecto?.() || {}; if (!Array.isArray(p.textos)) p.textos = []; return p; }
  capas() { return this.proyecto().textos; }
  capa(id = this.sel) { return this.capas().find(c => c.id === id) || null; }
  duracion() { return num(this.proyecto().duracion, 8); }
  formato() { const f = this.obtenerFormato?.(); return MEDIDAS[f] ? f : this.capas().find(c => MEDIDAS[c.formato])?.formato || 'reel'; }
  cabezal() { return clamp(Math.round(num(this.obtenerTiempo?.(), 0) * 10) / 10, 0, this.duracion()); }
  cambio() { this.alCambiarExt?.('textos'); }

  seleccionar(id) {
    if (id != null && !this.capa(id)) return;
    this.sel = id;
    this.render();
    this.$lista.querySelector(`[data-id="${CSS.escape(String(id))}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  render() {
    const capas = this.capas();
    // capas de proyectos guardados o del asistente: se completan aquí sin cambiar el objeto (la línea de tiempo lo comparte)
    for (let i = capas.length - 1; i >= 0; i--) {
      if (!capas[i] || typeof capas[i] !== 'object') capas.splice(i, 1);
      else if (!completa(capas[i])) Object.assign(capas[i], normalizarCapa(capas[i]));
    }
    if (!capas.some(c => c.id === this.sel)) this.sel = capas.find(c => c.tipo !== 'marca')?.id ?? capas[0]?.id ?? null;
    this.pintarLista();
    this.pintarEditor();
  }

  // ----- Lista de capas -----
  pintarLista() {
    // conserva el foco si estaba en un botón de la lista (se reconstruye entera)
    const act = document.activeElement, foco = this.$lista.contains(act) ? { id: act.closest('li')?.dataset.id, accion: act.dataset.accion } : null;
    const capas = this.capas();
    this.$lista.innerHTML = capas.length ? capas.map(c => this.htmlFila(c)).join('') : '<li class="ptx-vacia">No hay textos. Agrega uno o escoge una plantilla.</li>';
    if (foco?.id) this.$lista.querySelector(`li[data-id="${CSS.escape(foco.id)}"] [data-accion="${foco.accion}"]`)?.focus();
  }
  htmlFila(c) {
    const marca = c.tipo === 'marca', titulo = marca ? 'Marca Atelier & Co' : (c.texto.split('\n')[0].trim() || 'Texto vacío');
    const ico = marca ? escarabajo('#C49022') : `<span style="font-family:${familiaDe(c.fuente)};font-style:${c.fuente === 'serif-italica' ? 'italic' : 'normal'}">${c.fuente === 'sans-mayus' ? 'AA' : 'Aa'}</span>`;
    return `<li class="ptx-capa${c.oculta ? ' oculta' : ''}" data-id="${esc(c.id)}" aria-current="${c.id === this.sel}">
      <button type="button" class="ptx-asa" data-accion="asa" aria-label="Mover «${esc(titulo)}»: arrastra o usa las flechas">${ICONOS.asa}</button>
      <button type="button" class="ptx-elegir" data-accion="elegir"><span class="ptx-ico">${ico}</span><span class="ptx-nom">${esc(titulo)}</span><span class="ptx-meta">${this.meta(c)}</span></button>
      <button type="button" class="ptx-ib" data-accion="ver" aria-pressed="${!c.oculta}" aria-label="${c.oculta ? 'Mostrar' : 'Ocultar'}" title="${c.oculta ? 'Mostrar' : 'Ocultar'}">${c.oculta ? ICONOS.ojoNo : ICONOS.ojo}</button>
      <button type="button" class="ptx-ib" data-accion="duplicar" aria-label="Duplicar" title="Duplicar">${ICONOS.duplicar}</button>
      <button type="button" class="ptx-ib peligro" data-accion="borrar" aria-label="Eliminar" title="Eliminar">${ICONOS.borrar}</button>
    </li>`;
  }
  meta(c) { return `${fmt(c.entra)} s → ${c.sale == null ? 'final' : fmt(c.sale) + ' s'} · ${ANIMACIONES[c.animacion] || ''}`; }
  actualizarFila(c) {
    const li = this.$lista.querySelector(`li[data-id="${CSS.escape(c.id)}"]`); if (!li) return;
    const marca = c.tipo === 'marca';
    li.querySelector('.ptx-nom').textContent = marca ? 'Marca Atelier & Co' : (c.texto.split('\n')[0].trim() || 'Texto vacío');
    li.querySelector('.ptx-meta').textContent = this.meta(c);
    const ico = li.querySelector('.ptx-ico > span');
    if (ico) { ico.style.fontFamily = familiaDe(c.fuente); ico.style.fontStyle = c.fuente === 'serif-italica' ? 'italic' : 'normal'; ico.textContent = c.fuente === 'sans-mayus' ? 'AA' : 'Aa'; }
  }

  // reordenar arrastrando el asa (puntero: sirve con mouse y con el dedo)
  arrastrarFila(e, li) {
    if (!li || e.button > 0) return;
    e.preventDefault();
    const lista = this.$lista, antes = [...lista.children].map(x => x.dataset.id);
    li.classList.add('arrastrando');
    const mover = ev => {
      const otros = [...lista.children].filter(x => x !== li);
      const destino = otros.find(o => { const r = o.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }) || null;
      if (destino !== li.nextElementSibling || (!destino && lista.lastElementChild !== li)) lista.insertBefore(li, destino);
    };
    const soltar = () => {
      removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar); removeEventListener('pointercancel', soltar);
      li.classList.remove('arrastrando');
      const orden = [...lista.children].map(x => x.dataset.id);
      if (orden.join() !== antes.join()) this.reordenar(orden);
    };
    addEventListener('pointermove', mover); addEventListener('pointerup', soltar); addEventListener('pointercancel', soltar);
  }
  reordenar(orden) {
    const capas = this.capas(), porId = new Map(capas.map(c => [c.id, c]));
    const nuevas = orden.map(id => porId.get(id)).filter(Boolean);
    if (nuevas.length !== capas.length) return;
    capas.splice(0, capas.length, ...nuevas);
    this.pintarLista(); this.cambio();
  }
  mover(id, paso) {
    const capas = this.capas(), i = capas.findIndex(c => c.id === id), j = i + paso;
    if (i < 0 || j < 0 || j >= capas.length) return;
    [capas[i], capas[j]] = [capas[j], capas[i]];
    this.pintarLista(); this.cambio();
    this.$lista.querySelector(`li[data-id="${CSS.escape(id)}"] .ptx-asa`)?.focus();
  }

  alTeclado(e) {
    const asa = e.target.closest('.ptx-asa');
    if (asa && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.mover(asa.closest('li').dataset.id, e.key === 'ArrowUp' ? -1 : 1); }
  }

  alClic(e) {
    const b = e.target.closest('button'); if (!b || !this.cont.contains(b)) return;
    const li = b.closest('li[data-id]'), id = li?.dataset.id;
    if (b.dataset.plantilla) return this.aplicarPlantilla(b.dataset.plantilla);
    switch (b.dataset.accion) {
      case 'elegir': this.sel = id; this.render(); this.alSeleccionarExt?.(id); return;
      case 'ver': { const c = this.capa(id); c.oculta = !c.oculta; this.pintarLista(); this.cambio(); return; }
      case 'duplicar': return this.duplicar(id);
      case 'borrar': return this.borrar(id);
      case 'nuevoTexto': return this.agregar('texto');
      case 'nuevaMarca': return this.agregar('marca');
      case 'deshacer': return this.deshacer();
      case 'cabezalEntra': case 'cabezalSale': {
        const c = this.capa(); if (!c) return;
        const t = this.cabezal();
        if (b.dataset.accion === 'cabezalEntra') { c.entra = t; if (c.sale != null && c.sale <= t) c.sale = null; }
        else { c.sale = Math.max(t, c.entra + 0.1); }
        return this.tras(c);
      }
    }
    // botones de opciones del editor (fuente, peso, alinear, fondo, color)
    if (b.dataset.campo && b.dataset.valor != null) {
      const c = this.capa(); if (!c) return;
      let v = b.dataset.valor;
      if (b.dataset.campo === 'peso') v = +v;
      c[b.dataset.campo] = v;
      if (b.dataset.campo === 'alinear') { c.auto = false; }
      this.tras(c);
    }
  }

  // ----- Agregar, duplicar, borrar, plantillas -----
  agregar(tipo) {
    const capas = this.capas(), f = this.formato(), B = anclas(...MEDIDAS[f]);
    const entra = clamp(this.cabezal(), 0, Math.max(0, this.duracion() - 1));
    const c = tipo === 'marca'
      ? crearCapa({ tipo: 'marca', y: B.arriba / B.H, entra, dur: 1.1, animacion: 'aparecer', formato: f })
      : crearCapa({ estilo: 'libre', texto: 'Escribe aquí', y: 0.5, entra, animacion: 'subir', formato: f });
    c.id = nuevoId(capas);
    colocarX(c, B);
    capas.push(c); this.sel = c.id;
    this.render(); this.cambio(); this.alSeleccionarExt?.(c.id);
    if (tipo !== 'marca') { const ta = this.$editor.querySelector('textarea'); ta?.focus(); ta?.select(); }
  }
  duplicar(id) {
    const capas = this.capas(), i = capas.findIndex(c => c.id === id); if (i < 0) return;
    const copia = { ...capas[i], id: nuevoId(capas), y: c01(capas[i].y + 0.04) };
    capas.splice(i + 1, 0, copia); this.sel = copia.id;
    this.render(); this.cambio(); this.alSeleccionarExt?.(copia.id);
  }
  borrar(id) {
    const capas = this.capas(), i = capas.findIndex(c => c.id === id); if (i < 0) return;
    const c = capas[i];
    this.guardarRespaldo(`Se eliminó «${c.tipo === 'marca' ? 'la marca' : (c.texto.split('\n')[0].trim() || 'texto vacío').slice(0, 28)}».`);
    capas.splice(i, 1);
    if (this.sel === id) this.sel = capas[Math.min(i, capas.length - 1)]?.id ?? null;
    this.render(); this.cambio();
  }
  datos() {
    const capas = this.capas(), de = e => capas.find(c => c.estilo === e && c.tipo !== 'marca')?.texto?.trim();
    return { nombre: de('titulo'), detalle: de('detalle'), precio: de('precio'), ...(this.obtenerDatos?.() || {}), duracion: this.duracion() };
  }
  aplicarPlantilla(clave) {
    const fn = PLANTILLAS[clave]; if (!fn) return;
    const capas = this.capas();
    this.guardarRespaldo(`Plantilla «${fn.nombre}» aplicada.`);
    const nuevas = adaptarAFormato(fn(this.datos()), this.formato());
    capas.splice(0, capas.length, ...nuevas);
    this.sel = nuevas.find(c => c.tipo !== 'marca')?.id ?? nuevas[0]?.id ?? null;
    this.render(); this.cambio(); this.alSeleccionarExt?.(this.sel);
  }
  guardarRespaldo(mensaje) {
    this.respaldo = JSON.parse(JSON.stringify(this.capas()));
    this.$aviso.querySelector('span').textContent = mensaje; this.$aviso.hidden = false;
    clearTimeout(this.tAviso); this.tAviso = setTimeout(() => { this.$aviso.hidden = true; this.respaldo = null; }, 9000);
  }
  deshacer() {
    if (!this.respaldo) return;
    this.capas().splice(0, this.capas().length, ...this.respaldo);
    this.respaldo = null; this.$aviso.hidden = true;
    this.render(); this.cambio();
  }

  pintarMiniaturas() {
    const oscuro = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
    for (const b of this.cont.querySelectorAll('.ptx-plantilla')) {
      const fn = PLANTILLAS[b.dataset.plantilla], lienzo = b.querySelector('canvas'), dpr = Math.min(3, globalThis.devicePixelRatio || 1);
      const W = Math.round(72 * dpr), H = Math.round(128 * dpr); lienzo.width = W; lienzo.height = H;
      const ctx = lienzo.getContext('2d');
      const g = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, H * 0.7);
      g.addColorStop(0, oscuro ? '#2E2A21' : '#FCFBF8'); g.addColorStop(1, oscuro ? '#0E0D0A' : '#E2DCCF');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // un anillo sugerido en el centro, para leer la plantilla como un cuadro del video
      ctx.save(); ctx.translate(W / 2, H * 0.47); ctx.strokeStyle = oscuro ? 'rgba(227,181,74,.75)' : 'rgba(184,135,31,.7)'; ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath(); ctx.ellipse(0, 0, W * 0.2, W * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = oscuro ? 'rgba(244,241,234,.85)' : 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(0, -W * 0.16); ctx.lineTo(W * 0.06, -W * 0.08); ctx.lineTo(0, -W * 0.05); ctx.lineTo(-W * 0.06, -W * 0.08); ctx.closePath(); ctx.fill(); ctx.restore();
      dibujarTextos(ctx, fn({}), { W, H, t: fn.miniatura, oscuro, duracion: 8 });
    }
  }

  // ----- Editor de la capa elegida -----
  pintarEditor() {
    const c = this.capa();
    if (!c) { this.$editor.innerHTML = ''; this.editorDe = null; return; }
    const clave = c.id + ':' + c.tipo;
    if (this.editorDe !== clave) { this.$editor.innerHTML = this.htmlEditor(c); this.editorDe = clave; }
    this.sincronizar(c);
  }
  htmlEditor(c) {
    const marca = c.tipo === 'marca';
    const seg = (campo, opciones, etiqueta) => `<div class="ptx-seg" role="group" aria-label="${etiqueta}">${opciones.map(([v, txt, extra = '']) => `<button type="button" data-campo="${campo}" data-valor="${v}" ${extra}>${txt}</button>`).join('')}</div>`;
    const rango = (campo, txt, min, max, paso) => `<label class="rango"><span>${txt}</span><input type="range" data-campo="${campo}" min="${min}" max="${max}" step="${paso}"><output data-salida="${campo}"></output></label>`;
    return `
      <div class="ptx-cab"><h3>${marca ? 'Marca' : 'Editar texto'}</h3>${marca ? '' : `<label class="ptx-estilo"><span class="vh">Estilo</span><select data-campo="estilo" aria-label="Estilo">${Object.entries(ESTILOS).map(([k, e]) => `<option value="${k}">${e.nombre}</option>`).join('')}</select></label>`}</div>
      ${marca ? '<p class="ptx-ayuda ptx-nota">El escarabajo, ATELIER&amp;CO y «joyería de alta calidad», igual que en la página.</p>' : '<label class="ptx-campo"><span class="vh">Texto</span><textarea data-campo="texto" rows="2" maxlength="140" placeholder="Escribe el texto…" spellcheck="true"></textarea></label>'}
      <div class="ptx-grupo">
        <span class="ptx-et">Letra</span>
        ${marca ? '' : seg('fuente', Object.entries(FUENTES).map(([k, n]) => [k, k === 'sans-mayus' ? 'MAYÚS' : n, `class="ptx-f-${k}" title="${n}" aria-label="${n}"`]), 'Fuente')}
        ${seg('peso', [[400, 'Normal'], [500, 'Media'], [600, 'Gruesa']], 'Grosor')}
        ${rango('tam', 'Tamaño', 10, 200, 1)}
      </div>
      <div class="ptx-grupo">
        <span class="ptx-et">Color</span>
        <div class="ptx-colores" role="group" aria-label="Color">
          ${MUESTRAS.map(([v, n]) => `<button type="button" class="ptx-muestra" data-campo="color" data-valor="${v}" title="${n}" aria-label="${n}" style="--m:${v === 'oro' ? 'var(--oro-vivo)' : v === 'auto' ? 'transparent' : v}"${v === 'auto' ? ' data-auto' : ''}></button>`).join('')}
          <label class="ptx-muestra ptx-propio" title="Otro color"><span class="vh">Otro color</span><input type="color" data-campo="colorPropio"></label>
        </div>
      </div>
      <div class="ptx-grupo">
        <span class="ptx-et">Posición</span>
        ${seg('alinear', [['izquierda', ICONOS.izquierda, 'aria-label="Alinear a la izquierda" title="Izquierda"'], ['centro', ICONOS.centro, 'aria-label="Centrar" title="Centro"'], ['derecha', ICONOS.derecha, 'aria-label="Alinear a la derecha" title="Derecha"']], 'Alineación')}
        <div class="grid2">${rango('x', 'Horizontal', 0, 1, 0.005)}${rango('y', 'Vertical', 0, 1, 0.005)}</div>
        <div class="grid2">${rango('espaciado', 'Espaciado', -0.1, 0.6, 0.01)}${marca ? '' : rango('ancho', 'Ancho máximo', 0.2, 1, 0.01)}</div>
      </div>
      <div class="ptx-grupo">
        <span class="ptx-et">Tiempo</span>
        <div class="ptx-tiempos">
          <div class="ptx-tiempo"><label>Entra<span class="ptx-num"><input type="number" data-campo="entra" min="0" step="0.1" inputmode="decimal"><i>s</i></span></label>
            <button type="button" class="btn sec chico" data-accion="cabezalEntra" title="Usar el momento donde está el cabezal">${ICONOS.cabezal}<span class="ptx-largo">Usar el cabezal</span><span class="ptx-corto">Cabezal</span></button></div>
          <div class="ptx-tiempo"><label>Sale<span class="ptx-num"><input type="number" data-campo="sale" min="0" step="0.1" inputmode="decimal" placeholder="final"><i>s</i></span></label>
            <button type="button" class="btn sec chico" data-accion="cabezalSale" title="Usar el momento donde está el cabezal">${ICONOS.cabezal}<span class="ptx-largo">Usar el cabezal</span><span class="ptx-corto">Cabezal</span></button></div>
        </div>
        <label class="check"><input type="checkbox" data-campo="hastaFinal"> Hasta el final del video</label>
      </div>
      <div class="ptx-grupo">
        <span class="ptx-et">Animación de entrada</span>
        <div class="grid2">
          <label><span class="vh">Animación</span><select data-campo="animacion" aria-label="Animación">${Object.entries(ANIMACIONES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
          ${rango('dur', 'Duración', 0.2, 3, 0.05)}
        </div>
      </div>
      <div class="ptx-grupo">
        <span class="ptx-et">Fondo</span>
        ${seg('fondo', Object.entries(FONDOS_TEXTO), 'Fondo del texto')}
        <label class="check"><input type="checkbox" data-campo="sombra"> Sombra suave (se lee mejor sobre la joya)</label>
      </div>`;
  }

  sincronizar(c = this.capa()) {
    if (!c) return;
    const ed = this.$editor, activo = document.activeElement;
    const salidas = { tam: `${Math.round(c.tam)} px`, x: `${Math.round(c.x * 100)} %`, y: `${Math.round(c.y * 100)} %`, espaciado: `${fmt(c.espaciado, 2)} em`, ancho: `${Math.round(c.ancho * 100)} %`, dur: `${fmt(c.dur, 2)} s` };
    for (const el of ed.querySelectorAll('[data-campo]')) {
      const campo = el.dataset.campo;
      if (el.tagName === 'BUTTON') {
        const v = c[campo];
        el.setAttribute('aria-pressed', String(campo === 'color' ? v === el.dataset.valor : String(v) === el.dataset.valor));
        continue;
      }
      if (el === activo && el.type !== 'checkbox') continue;
      if (campo === 'hastaFinal') el.checked = c.sale == null;
      else if (campo === 'sombra') el.checked = !!c.sombra;
      else if (campo === 'colorPropio') { const propio = /^#[0-9a-f]{6}$/i.test(c.color) && !MUESTRAS.some(([v]) => v.toLowerCase() === c.color.toLowerCase()); el.value = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toLowerCase() : '#b8871f'; el.parentElement.toggleAttribute('data-activo', propio); el.parentElement.style.setProperty('--m', propio ? c.color : ''); }
      else if (campo === 'sale') el.value = c.sale == null ? '' : String(Math.round(c.sale * 100) / 100);
      else if (campo === 'entra') el.value = String(Math.round(c.entra * 100) / 100);
      else el.value = c[campo] ?? '';
    }
    for (const o of ed.querySelectorAll('output[data-salida]')) o.textContent = salidas[o.dataset.salida] ?? '';
    const dur = this.duracion();
    for (const n of ed.querySelectorAll('input[type=number]')) n.max = String(dur);
    // la duración de la animación no aplica cuando no hay animación
    const r = ed.querySelector('[data-campo="dur"]'); if (r) r.disabled = c.animacion === 'ninguna';
  }

  alEditar(e, alSoltar = false) {
    const el = e.target, campo = el.dataset?.campo;
    if (!campo || el.tagName === 'BUTTON') return;
    // los selectores y casillas se aplican con "change"; lo demás en vivo con "input"
    const porChange = el.tagName === 'SELECT' || el.type === 'checkbox';
    if (porChange !== alSoltar) return;
    const c = this.capa(); if (!c) return;
    const dur = this.duracion();
    switch (campo) {
      case 'texto': c.texto = el.value; break;
      case 'estilo': {
        const p = ESTILOS[el.value]; if (!p) return;
        c.estilo = el.value; c.fuente = p.fuente; c.peso = p.peso; c.espaciado = p.espaciado; c.color = p.color;
        c.tam = (el.value === 'titulo' || el.value === 'gancho') && !anclas(...MEDIDAS[MEDIDAS[c.formato] ? c.formato : 'reel']).vertical ? Math.round(p.tam * 64 / 76) : p.tam;
        if (el.value === 'titulo' && c.fondo === 'ninguno') c.fondo = 'linea-oro';
        break;
      }
      case 'tam': case 'x': case 'y': case 'espaciado': case 'ancho': case 'dur': {
        const v = parseFloat(el.value); if (!Number.isFinite(v)) return;
        c[campo] = v;
        if (campo === 'x') c.auto = false;
        break;
      }
      case 'entra': { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; c.entra = clamp(v, 0, dur); if (c.sale != null && c.sale < c.entra) c.sale = c.entra; break; }
      case 'sale': {
        if (el.value === '') { c.sale = null; break; }
        const v = parseFloat(el.value); if (!Number.isFinite(v)) return; c.sale = clamp(v, c.entra, dur); break;
      }
      case 'hastaFinal': c.sale = el.checked ? null : clamp(Math.max(c.entra + 2, this.cabezal()), c.entra + 0.1, dur); break;
      case 'animacion': c.animacion = el.value; break;
      case 'sombra': c.sombra = el.checked; break;
      case 'colorPropio': c.color = el.value.toUpperCase(); break;
      default: return;
    }
    this.tras(c);
  }

  // después de cada cambio: fila, editor y aviso a main.js
  tras(c) {
    this.actualizarFila(c);
    this.sincronizar(c);
    this.cambio();
  }
}
