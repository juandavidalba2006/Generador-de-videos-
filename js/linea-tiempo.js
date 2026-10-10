// Línea de tiempo con keyframes, al estilo de CapCut: una pista por cada ajuste de la cámara con sus rombos dorados,
// los textos como barras que se pueden mover y recortar, y los sonidos como bloques.
// Arriba, el inspector muestra el valor de cada ajuste en el cabezal: al moverlo se crea un keyframe ahí mismo.
import {
  PISTAS, CURVAS, MOVIMIENTOS, TOLERANCIA, valorEn, ponerClave, quitarClave, moverClave, claveEn,
  escalarTiempo, serializar, deserializar, movimientoDe, aplicarMovimiento, ajustarACuadro,
} from './proyecto.js';
import { escarabajo } from './marca.js';

// nombres para la columna de los carriles (la del inspector lleva el nombre completo)
const MEDIOS = { giro: 'Giro', inclinacion: 'Altura cámara', zoom: 'Zoom', altura: 'Pos. vertical', lateral: 'Pos. lateral', foco: 'Foco piedra', rodar: 'Roll', exposicion: 'Exposición', desenfoque: 'Desenfoque' };
const CORTOS = { giro: 'Giro', inclinacion: 'Altura', zoom: 'Zoom', altura: 'Vertical', lateral: 'Lateral', foco: 'Foco', rodar: 'Roll', exposicion: 'Exposición', desenfoque: 'Desenfoque' };
const DURACIONES = [6, 8, 10, 15, 20, 30];
const MAX_HISTORIAL = 50;
const IMAN = 6;        // px: a esta distancia del cabezal un rombo o un borde se pega a él
const MARGEN = 12;     // px de aire a cada lado de los carriles (el rombo del segundo 0 se ve entero); igual que --lt-m
const MIN_TEXTO = 0.2; // s: lo más corta que puede quedar la barra de un texto
const DOBLE_TOQUE = 350;

// Por si el módulo de sonido no carga: nombre, emoji y duración de cada efecto
const EFECTOS_RESPALDO = {
  whoosh: ['💨', 'Whoosh', 0.6], whooshCorto: ['💨', 'Whoosh corto', 0.35], whooshInverso: ['🌀', 'Whoosh inverso', 0.7],
  riser: ['📈', 'Subida', 2], impacto: ['💥', 'Impacto', 1.2], drop808: ['🔊', 'Drop 808', 1.4], brillo: ['✨', 'Brillo', 1],
  campana: ['🔔', 'Campana', 1.5], pop: ['🫧', 'Pop', 0.2], obturador: ['📸', 'Obturador', 0.3], click: ['🖱️', 'Clic', 0.1],
  glitch: ['📺', 'Glitch', 0.5], cajaRegistradora: ['💰', 'Caja registradora', 1], latido: ['💓', 'Latido', 1],
  swipe: ['👉', 'Swipe', 0.4], reverseCymbal: ['🥁', 'Platillo inverso', 2],
};
const ESTILOS_RESPALDO = { lujo: 'Lujo', lofi: 'Lo-fi', trap: 'Trap', house: 'House', phonk: 'Phonk', popViral: 'Pop viral', cinematico: 'Cinemático' };

const ICONOS = {
  deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  rehacer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  alejar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
  acercar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  plegar: '<path d="M6 9l6 6 6-6"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  oculto: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c5 0 9 4.5 10 7-0.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4"/>',
};
const icono = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[n]}</svg>`;

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const r4 = x => Math.round(x * 1e4) / 1e4;   // misma precisión que proyecto.js
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decimales = paso => (String(paso).split('.')[1] || '').length;
const num = (x, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const seg = t => `${num(t)} s`;
export const reloj = t => { const c = Math.round(Math.max(0, t) * 100); return `${String(Math.floor(c / 6000)).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')},${String(c % 100).padStart(2, '0')}`; };

// Cómo se lee cada valor (en las etiquetas de los carriles)
function mostrar(pista, v) {
  switch (pista) {
    case 'giro': case 'inclinacion': case 'rodar': return `${Math.round(v)}°`;
    case 'zoom': return `${num(v)}×`;
    case 'altura': case 'lateral': return `${v > 0.004 ? '+' : ''}${num(v)}`;
    case 'foco': case 'desenfoque': return `${Math.round(v * 100)} %`;
    default: return num(v);
  }
}

// Dibujo pequeño de una curva (para el selector de curva)
function dibujoCurva(id) {
  const f = CURVAS[id]?.fn || CURVAS.suave.fn, pts = [];
  for (let i = 0; i <= 32; i++) { const u = i / 32; pts.push(`${(2 + u * 32).toFixed(1)},${(20 - f(u) * 16).toFixed(1)}`); }
  return `<svg class="lt-curva-mini" viewBox="0 0 36 24" aria-hidden="true"><path d="M2 20H34M2 4H34" class="guia"/><polyline points="${pts.join(' ')}"/></svg>`;
}

const leerLocal = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: no pasa nada */ } };
const editable = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
  (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes(el.type)));

let instancias = 0;

export class LineaTiempo {
  constructor(contenedor, { obtenerProyecto, alCambiar, alMoverCabezal, alSeleccionar, efectos, estilosMusica } = {}) {
    this.cont = contenedor;
    this.obtenerProyecto = obtenerProyecto;
    this.alCambiar = alCambiar || (() => {});
    this.alMoverCabezal = alMoverCabezal || (() => {});
    this.alSeleccionar = alSeleccionar || (() => {});
    this.efectos = efectos || null; this.estilosMusica = estilosMusica || null;
    this.n = ++instancias;
    this.t = 0; this.zoom = 1; this._sel = null;
    this.historial = []; this.rehechos = []; this.archivos = new Map();
    this.plegados = new Set(leerLocal('lt-plegados') || []);
    this.anchoCarril = 0; this.arrastre = null; this.toque = null; this.gesto = null;
    this.armar();
    this.render();
    // los nombres y emojis reales de los efectos vienen del módulo de sonido (si está)
    if (!this.efectos) import('./sonido.js').then(m => { this.efectos ||= m.EFECTOS; this.estilosMusica ||= m.ESTILOS_MUSICA; this.render(); }).catch(() => {});
  }

  get proyecto() { return this.obtenerProyecto(); }
  get duracion() { return this.proyecto.duracion || 8; }
  get tiempo() { return this.t; }

  // Lo seleccionado: { tipo: 'clave', pista, clave } | { tipo: 'texto', id } | { tipo: 'sonido', id } | null
  get seleccion() { return this._sel; }

  // Selecciona desde fuera (por ejemplo, cuando el panel de textos escoge una capa), sin avisar de vuelta
  seleccionar(sel) { this._sel = sel || null; this.render(); }

  // ---------- Estructura fija ----------
  armar() {
    const id = `lt${this.n}`;
    const opcionesMov = Object.entries(MOVIMIENTOS).map(([k, m]) => `<option value="${k}">${esc(m.nombre)}</option>`).join('');
    this.cont.innerHTML = `
      <div class="lt" role="region" aria-label="Línea de tiempo">
        <div class="lt-cabecera">
          <div class="lt-titulo"><i class="lt-tit-rombo" aria-hidden="true"></i><h2>Línea de tiempo</h2><em>keyframes</em>
            <span class="lt-reloj" aria-live="off"><b data-reloj>00:00,00</b><span>/</span><span data-total>00:08,00</span></span></div>
          <div class="lt-herramientas">
            <label class="lt-campo lt-campo-mov"><span>Movimiento base</span><select data-control="movimiento">${opcionesMov}<option value="" disabled>Personalizado (editado)</option></select></label>
            <label class="lt-campo lt-campo-dur"><span>Duración</span><select data-control="duracion"></select></label>
            <label class="lt-interruptor" title="El final empalma con el principio (ideal para reels en bucle)"><input type="checkbox" data-control="bucle" role="switch"><i aria-hidden="true"></i><span>Bucle</span></label>
            <div class="lt-botones">
              <button class="btn chico lt-btn-todas" type="button" data-accion="claveTodas"><i class="lt-mini-rombo" aria-hidden="true"></i><span class="lt-largo">Añadir keyframe en todas</span><span class="lt-corto">Keyframe en todas</span></button>
              <button class="btn sec chico" type="button" data-accion="borrarTodas">Borrar keyframes</button>
            </div>
            <div class="lt-historial">
              <button class="lt-ico" type="button" data-accion="deshacer" aria-label="Deshacer" title="Deshacer (Ctrl+Z)">${icono('deshacer')}</button>
              <button class="lt-ico" type="button" data-accion="rehacer" aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)">${icono('rehacer')}</button>
            </div>
          </div>
        </div>
        <div class="lt-inspector">
          <div class="lt-seleccion" data-seleccion></div>
          <div class="lt-controles">${Object.entries(PISTAS).map(([k, P]) => `
            <div class="lt-ctl" data-ctl="${k}">
              <button class="lt-rombo" type="button" data-accion="rombo" data-pista="${k}" aria-pressed="false" aria-label="Keyframe de ${esc(P.nombre)} en el cabezal" title="Añadir o quitar un keyframe en el cabezal"></button>
              <label class="lt-ctl-nombre" for="${id}-r-${k}" title="${esc(P.nombre)}"><span class="lt-largo">${esc(P.nombre)}</span><span class="lt-corto">${MEDIOS[k]}</span></label>
              <input type="range" id="${id}-r-${k}" data-valor="${k}" min="${P.min}" max="${P.max}" step="${P.paso}" value="${P.def}">
              <span class="lt-num"><input type="number" data-numero="${k}" min="${P.min}" max="${P.max}" step="${P.paso}" value="${P.def}" aria-label="${esc(P.nombre)}"><i>${P.unidad}</i></span>
            </div>`).join('')}
          </div>
        </div>
        <div class="lt-pistas" data-scroll><div class="lt-lienzo" data-lienzo></div></div>
      </div>`;
    const $ = s => this.cont.querySelector(s);
    this.raiz = $('.lt'); this.pistas = $('[data-scroll]'); this.lienzo = $('[data-lienzo]');
    this.elReloj = $('[data-reloj]'); this.elTotal = $('[data-total]'); this.elSel = $('[data-seleccion]');
    this.selMov = $('[data-control=movimiento]'); this.selDur = $('[data-control=duracion]'); this.chkBucle = $('[data-control=bucle]');
    // referencias fijas del inspector (el cabezal las actualiza en cada cuadro de la reproducción)
    this.ctl = Object.fromEntries(Object.keys(PISTAS).map(k => [k, { r: $(`[data-valor="${k}"]`), n: $(`[data-numero="${k}"]`), b: $(`.lt-rombo[data-pista="${k}"]`) }]));

    this.raiz.addEventListener('pointerdown', e => this.presionar(e));
    this.raiz.addEventListener('pointermove', e => this.mover(e));
    this.raiz.addEventListener('pointerup', e => this.soltar(e));
    this.raiz.addEventListener('pointercancel', e => this.soltar(e, true));
    this.raiz.addEventListener('lostpointercapture', e => { if (this.arrastre?.id === e.pointerId) this.soltar(e, true); });
    this.raiz.addEventListener('click', e => this.clic(e));
    this.raiz.addEventListener('input', e => this.alEscribir(e));
    this.raiz.addEventListener('change', e => this.alConfirmar(e));
    this.raiz.addEventListener('keydown', e => this.teclaLocal(e));
    this.pistas.addEventListener('wheel', e => this.rueda(e), { passive: false });
    this.teclaGlobal = e => this.tecla(e);
    document.addEventListener('keydown', this.teclaGlobal);
    if (typeof ResizeObserver !== 'undefined') {
      let antes = 0;
      this.observador = new ResizeObserver(() => { const w = this.pistas.clientWidth; if (w !== antes) { antes = w; this.render(); } });
      this.observador.observe(this.pistas);
    }
  }

  destruir() { document.removeEventListener('keydown', this.teclaGlobal); this.observador?.disconnect(); this.cont.innerHTML = ''; }

  // ---------- Medidas ----------
  medir() {
    const et = parseFloat(getComputedStyle(this.raiz).getPropertyValue('--lt-et')) || 150;
    this.anchoEt = et;
    this.anchoCarril = Math.max(0, (this.pistas.clientWidth - et) * this.zoom - 2 * MARGEN);
  }
  get pps() { return this.anchoCarril > 40 ? this.anchoCarril / this.duracion : 100; }   // píxeles por segundo
  // instante bajo el puntero (cualquier carril sirve: todos comparten la misma escala)
  tiempoEn(clientX) {
    const r = this.lienzo.querySelector('.lt-regla')?.getBoundingClientRect();
    if (!r || r.width <= 2 * MARGEN) return 0;
    return limitar((clientX - r.left - MARGEN) / (r.width - 2 * MARGEN), 0, 1) * this.duracion;
  }
  // ajusta un tiempo al cuadro y lo pega al cabezal si está cerca
  imantar(t) {
    return Math.abs(t - this.t) * this.pps < IMAN ? this.t : ajustarACuadro(t);
  }

  // ---------- Dibujo ----------
  render() {
    const p = this.proyecto, d = this.duracion;
    this.validarSeleccion();
    this.medir();
    const foco = this.lienzo.contains(document.activeElement) ? document.activeElement : null;
    const enfocar = foco && (foco.classList.contains('lt-clave') ? 'clave' : foco.dataset.id);
    this.t = limitar(this.t, 0, d);
    this.lienzo.style.setProperty('--lt-zoom', this.zoom);
    this.lienzo.innerHTML = this.htmlRegla() + this.htmlCamara() + this.htmlTextos() + this.htmlSonido() +
      '<div class="lt-cabezal" aria-hidden="true"><i class="lt-cabezal-asa"></i></div>';
    this.cabezal = this.lienzo.querySelector('.lt-cabezal');
    this.salidas = Object.fromEntries([...this.lienzo.querySelectorAll('[data-salida]')].map(o => [o.dataset.salida, o]));
    this.rombos = [...this.lienzo.querySelectorAll('.lt-clave')].map(el => ({ el, c: p.pistas[el.dataset.pista][+el.dataset.claveI] }));
    if (enfocar) {   // si se estaba usando el teclado sobre un rombo o un bloque, que no pierda el foco
      const el = enfocar === 'clave' ? this.lienzo.querySelector('.lt-clave[aria-pressed=true]') : this.lienzo.querySelector(`.lt-bloque[data-id="${CSS.escape(enfocar)}"]`);
      el?.focus({ preventScroll: true });
    }
    this.renderHerramientas(p);
    this.renderSeleccion();
    this.ponerCabezal(this.t, { forzar: true });
  }

  renderHerramientas(p) {
    const d = this.duracion, mov = movimientoDe(p);
    this.selMov.value = mov || '';
    this.selMov.closest('.lt-campo').classList.toggle('editado', !mov);
    const lista = DURACIONES.includes(d) ? DURACIONES : [...DURACIONES, d].sort((a, b) => a - b);
    const html = lista.map(x => `<option value="${x}">${num(x, x % 1 ? 1 : 0)} segundos</option>`).join('');
    if (this.selDur.dataset.html !== html) { this.selDur.innerHTML = html; this.selDur.dataset.html = html; }
    this.selDur.value = String(d);
    this.chkBucle.checked = !!p.bucle;
    this.elTotal.textContent = reloj(d);
    this.raiz.querySelector('[data-accion=deshacer]').disabled = !this.historial.length;
    this.raiz.querySelector('[data-accion=rehacer]').disabled = !this.rehechos.length;
    this.raiz.querySelector('[data-accion=borrarTodas]').disabled = !Object.values(p.pistas || {}).some(c => c?.length);
  }

  htmlRegla() {
    const d = this.duracion, pps = this.pps;
    // marcas cada 0,5 s y números cada segundo; si no caben, se espacian (videos largos o pantallas angostas),
    // y con zoom aparecen marcas más finas (hasta décimas de segundo)
    const pasoNum = (this.zoom > 1 ? [0.5, 1, 2, 5, 10, 15, 30] : [1, 2, 5, 10, 15, 30]).find(x => x * pps >= 40) || 30;
    const pasoMarca = this.zoom > 1 ? ([0.1, 0.25, 0.5, 1, 2.5, 5].find(x => x * pps >= 9 && Math.abs(pasoNum / x - Math.round(pasoNum / x)) < 1e-6) || pasoNum)
      : (pasoNum / 2) * pps >= 7 ? pasoNum / 2 : pasoNum;
    this.lienzo.style.setProperty('--lt-div', d / pasoNum);   // rejilla tenue de los carriles, alineada con los números
    let marcas = '';
    for (let i = 0, t = 0; t <= d + 1e-6; t = ++i * pasoMarca) {
      const mayor = Math.abs(t / pasoNum - Math.round(t / pasoNum)) < 1e-6;
      marcas += `<i class="lt-marca${mayor ? ' mayor' : ''}" style="--p:${t / d}"></i>`;
      if (mayor) marcas += `<span class="lt-seg" style="--p:${t / d}">${num(t, t % 1 ? 1 : 0)} s</span>`;
    }
    return `<div class="lt-esquina lt-et">
        <button class="lt-ico chico" type="button" data-accion="alejar" aria-label="Alejar la línea de tiempo" title="Alejar"${this.zoom <= 1 ? ' disabled' : ''}>${icono('alejar')}</button>
        <button class="lt-ico chico" type="button" data-accion="acercar" aria-label="Acercar la línea de tiempo" title="Acercar"${this.zoom >= 8 ? ' disabled' : ''}>${icono('acercar')}</button>
      </div><div class="lt-regla">${marcas}</div>`;
  }

  htmlGrupo(id, nombre, resumen, extra = '') {
    const plegado = this.plegados.has(id);
    return `<button type="button" class="lt-et lt-grupo" data-accion="plegar" data-grupo="${id}" aria-expanded="${!plegado}">${icono('plegar', 'lt-chevron')}<span>${nombre}</span>${extra}</button>
      <div class="lt-carril lt-carril-grupo${plegado ? ' plegado' : ''}" data-grupo="${id}">${plegado ? resumen : ''}</div>`;
  }

  htmlCamara() {
    const p = this.proyecto, d = this.duracion, sel = this._sel;
    const animadas = Object.keys(PISTAS).filter(k => (p.pistas?.[k]?.length || 0) > 1).length;
    const tiempos = [...new Set(Object.values(p.pistas || {}).flatMap(c => (c || []).map(k => r4(k.t))))];
    const resumen = tiempos.map(t => `<i class="lt-punto" style="--p:${t / d}"></i>`).join('');
    let html = this.htmlGrupo('camara', 'Cámara', resumen, `<small title="${animadas} pista${animadas === 1 ? '' : 's'} con animación">${animadas ? `<i class="lt-mini-rombo" aria-hidden="true"></i>${animadas}` : 'quieta'}</small>`);
    if (this.plegados.has('camara')) return html;
    for (const [k, P] of Object.entries(PISTAS)) {
      const claves = p.pistas?.[k] || [];
      html += `<div class="lt-et lt-et-pista" data-pista="${k}" title="${esc(P.nombre)}"><span class="lt-largo">${MEDIOS[k]}</span><span class="lt-corto">${CORTOS[k]}</span><output data-salida="${k}"></output></div>
        <div class="lt-carril lt-carril-pista${claves.length ? '' : ' vacio'}" data-carril="camara" data-pista="${k}">${this.htmlCurva(k)}${claves.map((c, i) => {
          const s = sel?.tipo === 'clave' && sel.clave === c;
          return `<button type="button" class="lt-clave c-${c.curva}" data-pista="${k}" data-clave-i="${i}" style="--p:${limitar(c.t / d, 0, 1)}" aria-pressed="${s}" aria-label="Keyframe de ${esc(P.nombre)} en ${seg(c.t)}: ${mostrar(k, c.v)}" title="${seg(c.t)} · ${mostrar(k, c.v)} · ${CURVAS[c.curva]?.nombre || ''}"></button>`;
        }).join('')}</div>`;
    }
    return html;
  }

  // El valor de la pista dibujado como una curva tenue detrás de los rombos
  htmlCurva(pista) {
    const p = this.proyecto, claves = p.pistas?.[pista] || [], d = this.duracion;
    if (claves.length < 2) return `<span class="lt-constante"></span>`;
    const N = Math.min(240, Math.max(60, Math.round(this.anchoCarril / 3))), v = [];
    for (let i = 0; i <= N; i++) v.push(valorEn(p, pista, d * i / N));
    let mn = Math.min(...v), mx = Math.max(...v);
    if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
    const y = x => (92 - (x - mn) / (mx - mn) * 84).toFixed(2);
    const linea = v.map((x, i) => `${(i / N * 1000).toFixed(1)},${y(x)}`).join(' L');
    return `<svg class="lt-grafica" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="M0,100 L${linea} L1000,100Z"/><path class="trazo" d="M${linea}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  htmlTextos() {
    const p = this.proyecto, d = this.duracion, capas = p.textos || [];
    const barra = c => { const e = limitar(+c.entra || 0, 0, d), s = limitar(c.sale == null ? d : +c.sale, e, d); return { e, s }; };
    const resumen = capas.map(c => { const { e, s } = barra(c); return `<i class="lt-raya oro" style="--p:${e / d};--w:${(s - e) / d}"></i>`; }).join('');
    let html = this.htmlGrupo('textos', 'Textos', resumen, `<small>${capas.length || 'ninguno'}</small>`);
    if (this.plegados.has('textos')) return html;
    if (!capas.length) return html + `<div class="lt-et lt-et-vacia"></div><div class="lt-carril lt-carril-vacio" data-carril="textos"><span class="lt-pista-nota">Sin textos · agrégalos en la pestaña Textos</span></div>`;
    for (const c of capas) {
      const { e, s } = barra(c), sel = this._sel?.tipo === 'texto' && this._sel.id === c.id;
      const nombre = c.tipo === 'marca' ? 'Marca Atelier & Co' : (String(c.texto || '').replace(/\s+/g, ' ').trim() || 'Texto vacío');
      const corto = c.tipo === 'marca' ? 'Marca' : nombre;
      const ico = c.tipo === 'marca' ? escarabajo('currentColor', 'lt-ico-marca') : '<b class="lt-ico-texto" aria-hidden="true">T</b>';
      const anim = c.animacion && c.animacion !== 'ninguna' ? limitar((+c.dur || 0.9) / Math.max(s - e, 0.01), 0, 1) : 0;
      html += `<button type="button" class="lt-et lt-et-capa${c.oculta ? ' oculta' : ''}" data-accion="elegirTexto" data-id="${esc(c.id)}" title="${esc(nombre)}${c.oculta ? ' (oculto)' : ''}">${ico}<span>${esc(corto)}</span>${c.oculta ? icono('oculto', 'lt-ojo') : ''}</button>
        <div class="lt-carril lt-carril-texto" data-carril="textos">
          <div class="lt-bloque lt-texto${sel ? ' sel' : ''}${c.oculta ? ' oculta' : ''}${c.sale == null ? ' al-final' : ''}" tabindex="0" role="button" aria-pressed="${sel}" data-id="${esc(c.id)}" style="--p:${e / d};--w:${(s - e) / d};--anim:${anim}"
            aria-label="${esc(nombre)}: entra en ${seg(e)} y ${c.sale == null ? 'sigue hasta el final' : `sale en ${seg(s)}`}" title="${esc(nombre)} · ${seg(e)} → ${c.sale == null ? 'final' : seg(s)}">
            <i class="lt-asa" data-borde="ini" aria-hidden="true"></i><b class="lt-anim" aria-hidden="true"></b>${ico}<span>${esc(nombre)}</span><i class="lt-asa" data-borde="fin" aria-hidden="true"></i>
          </div>
        </div>`;
    }
    return html;
  }

  efecto(id) {
    const e = this.efectos?.[id], r = EFECTOS_RESPALDO[id];
    return { emoji: e?.emoji || r?.[0] || '🔊', nombre: e?.nombre || r?.[1] || String(id || 'Sonido'), duracion: +(e?.duracion ?? r?.[2] ?? 0.6) || 0.6 };
  }

  htmlSonido() {
    const p = this.proyecto, d = this.duracion, pps = this.pps, clips = p.audio?.clips || [], m = p.audio?.musica;
    const resumen = clips.map(c => `<i class="lt-punto esm" style="--p:${limitar(+c.t || 0, 0, d) / d}"></i>`).join('') + (m ? '<i class="lt-raya gra" style="--p:0;--w:1"></i>' : '');
    let html = this.htmlGrupo('sonido', 'Sonido', resumen, `<small title="${clips.length} efecto${clips.length === 1 ? '' : 's'}${m ? ' y música' : ''}">${clips.length || (m ? '' : 'vacío')}${m ? `${clips.length ? ' + ' : ''}♫` : ''}</small>`);
    if (this.plegados.has('sonido')) return html;
    if (!clips.length && !m) return html + `<div class="lt-et lt-et-vacia"></div><div class="lt-carril lt-carril-vacio" data-carril="sonido"><span class="lt-pista-nota">Sin sonidos · agrégalos en la pestaña Sonido</span></div>`;
    // reparte los efectos en renglones para que no se monten unos sobre otros
    const renglones = [];
    for (const c of [...clips].sort((a, b) => (+a.t || 0) - (+b.t || 0))) {
      const ef = this.efecto(c.efecto), t = limitar(+c.t || 0, 0, d), w = Math.max(ef.duracion, 32 / pps) + 2 / pps;   // ancho visible (mínimo 30 px)
      let r = renglones.find(x => x.fin <= t + 1e-6);
      if (!r) { r = { fin: 0, html: '' }; renglones.push(r); }
      r.fin = t + w;
      const sel = this._sel?.tipo === 'sonido' && this._sel.id === c.id;
      r.html += `<button type="button" class="lt-bloque lt-clip${sel ? ' sel' : ''}" data-id="${esc(c.id)}" aria-pressed="${sel}" style="--p:${t / d};--w:${Math.min(ef.duracion, d - t) / d}"
        aria-label="${esc(ef.nombre)} en ${seg(t)}" title="${esc(ef.nombre)} · ${seg(t)}"><span class="lt-emoji" aria-hidden="true">${ef.emoji}</span>${Math.min(ef.duracion, d - t) * pps >= 58 ? `<span>${esc(ef.nombre)}</span>` : ''}</button>`;
    }
    renglones.forEach((r, i) => {
      html += `<div class="lt-et lt-et-sonido">${i ? '' : '<span>Efectos</span>'}</div><div class="lt-carril lt-carril-sonido" data-carril="sonido">${r.html}</div>`;
    });
    if (m) {
      const sel = this._sel?.tipo === 'sonido' && this._sel.id === 'musica';
      const nombre = m.archivo?.nombre ? m.archivo.nombre : `${this.estilosMusica?.[m.estilo]?.nombre || ESTILOS_RESPALDO[m.estilo] || m.estilo || 'Música'}${m.bpm ? ` · ${Math.round(m.bpm)} bpm` : ''}`;
      const pulso = m.bpm > 0 ? `--pulso:${(60 / m.bpm) / d};` : '', fundido = limitar((+m.fundidoSalida || 0) / d, 0, 1);
      html += `<div class="lt-et lt-et-sonido"><span>Música</span></div><div class="lt-carril lt-carril-sonido" data-carril="sonido">
        <button type="button" class="lt-bloque lt-musica${sel ? ' sel' : ''}" data-id="musica" aria-pressed="${sel}" style="--p:0;--w:1;${pulso}--fundido:${fundido}" aria-label="Música: ${esc(nombre)}" title="Música · ${esc(nombre)}">
          <span class="lt-emoji" aria-hidden="true">♫</span><span>${esc(nombre)}</span></button></div>`;
    }
    return html;
  }

  renderSeleccion() {
    const s = this._sel, p = this.proyecto, d = this.duracion;
    this.raiz.querySelectorAll('.lt-ctl.activa').forEach(x => x.classList.remove('activa'));
    if (!s) {
      this.elSel.className = 'lt-seleccion';
      this.elSel.innerHTML = `<p class="lt-ayuda"><span><i class="lt-mini-rombo" aria-hidden="true"></i>Toca el rombo de un ajuste para fijar un keyframe en el cabezal.</span> <span>Doble clic en una pista crea uno · arrástralo para moverlo · <kbd>Supr</kbd> lo borra.</span></p>`;
      return;
    }
    this.elSel.className = 'lt-seleccion activa';
    if (s.tipo === 'clave') {
      const P = PISTAS[s.pista], c = s.clave, claves = p.pistas[s.pista], ultima = claves.at(-1) === c, dec = decimales(P.paso);
      this.raiz.querySelector(`.lt-ctl[data-ctl="${s.pista}"]`)?.classList.add('activa');
      this.elSel.innerHTML = `
        <span class="lt-sel-tit"><i class="lt-mini-rombo lleno" aria-hidden="true"></i>Keyframe de <b>${esc(P.nombre)}</b></span>
        <label class="lt-mini">Tiempo<span class="lt-num"><input type="number" data-sel="t" min="0" max="${d}" step="0.01" value="${r4(c.t)}"><i>s</i></span></label>
        <label class="lt-mini">Valor<span class="lt-num"><input type="number" data-sel="v" min="${P.min}" max="${P.max}" step="${P.paso}" value="${c.v.toFixed(dec)}"><i>${P.unidad}</i></span></label>
        <label class="lt-mini lt-mini-curva" title="${ultima ? 'Es el último keyframe: la curva se usa cuando hay otro después' : 'Cómo llega al siguiente keyframe'}">Curva<span class="lt-curva-campo"><select data-sel="curva"${ultima ? ' disabled' : ''}>${Object.entries(CURVAS).map(([k, x]) => `<option value="${k}"${k === c.curva ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>${dibujoCurva(c.curva)}</span></label>
        <span class="lt-sel-acciones"><button class="btn peligro chico" type="button" data-accion="quitarSeleccion">Eliminar</button><button class="lt-ico chico" type="button" data-accion="deseleccionar" aria-label="Cerrar">${icono('cerrar')}</button></span>`;
    } else if (s.tipo === 'texto') {
      const c = (p.textos || []).find(x => x.id === s.id);
      const nombre = c.tipo === 'marca' ? 'Marca Atelier & Co' : (c.texto || 'Texto');
      this.elSel.innerHTML = `<span class="lt-sel-tit"><b class="lt-ico-texto" aria-hidden="true">T</b>Texto <b>«${esc(nombre.length > 34 ? nombre.slice(0, 33) + '…' : nombre)}»</b></span>
        <span class="lt-sel-dato">Entra en ${seg(+c.entra || 0)} · ${c.sale == null ? 'sigue hasta el final' : `sale en ${seg(+c.sale)}`}</span>
        <span class="lt-sel-nota">Arrastra la barra para moverla y sus bordes para cambiar cuándo entra y sale.</span>
        <span class="lt-sel-acciones"><button class="btn peligro chico" type="button" data-accion="quitarSeleccion">Eliminar</button><button class="lt-ico chico" type="button" data-accion="deseleccionar" aria-label="Cerrar">${icono('cerrar')}</button></span>`;
    } else if (s.tipo === 'sonido') {
      const m = s.id === 'musica', c = m ? null : (p.audio?.clips || []).find(x => x.id === s.id), ef = c ? this.efecto(c.efecto) : null;
      this.elSel.innerHTML = `<span class="lt-sel-tit">${m ? '<span class="lt-emoji">♫</span>Música' : `<span class="lt-emoji">${ef.emoji}</span>Sonido <b>${esc(ef.nombre)}</b>`}</span>
        <span class="lt-sel-dato">${m ? 'Suena durante todo el video' : `En ${seg(+c.t || 0)}`}</span>
        <span class="lt-sel-nota">${m ? 'Cambia el estilo y el volumen en la pestaña Sonido.' : 'Arrástralo para que suene en otro momento.'}</span>
        <span class="lt-sel-acciones"><button class="btn peligro chico" type="button" data-accion="quitarSeleccion">${m ? 'Quitar música' : 'Eliminar'}</button><button class="lt-ico chico" type="button" data-accion="deseleccionar" aria-label="Cerrar">${icono('cerrar')}</button></span>`;
    }
  }

  // ---------- Cabezal ----------
  ponerCabezal(tSeg, { forzar = false } = {}) {
    const p = this.proyecto, d = this.duracion;
    const t = limitar(Number.isFinite(+tSeg) ? +tSeg : 0, 0, d);
    if (!forzar && Math.abs(t - this.t) < 1e-5 && this.cabezal?.isConnected) return;
    this.t = t;
    if (this.cabezal) this.cabezal.style.setProperty('--lt-p', t / d);
    this.elReloj.textContent = reloj(t);
    // valores del inspector y de las etiquetas en el cabezal
    const activo = document.activeElement;
    for (const [k, P] of Object.entries(PISTAS)) {
      const v = valorEn(p, k, t), { r, n, b } = this.ctl[k];
      if (this.gesto?.pista !== k) r.value = v;
      if (activo !== n) n.value = v.toFixed(decimales(P.paso));
      const hay = String(!!claveEn(p, k, t));
      if (b.getAttribute('aria-pressed') !== hay) {
        b.setAttribute('aria-pressed', hay);
        b.title = hay === 'true' ? 'Quitar el keyframe del cabezal' : 'Añadir un keyframe en el cabezal';
      }
      const o = this.salidas?.[k]; if (o) o.textContent = mostrar(k, v);
    }
    for (const { el, c } of this.rombos || []) el.classList.toggle('en-cabezal', !!c && Math.abs(c.t - t) < TOLERANCIA);
    if (!this.arrastre) this.seguirCabezal();
  }

  // con zoom, mantiene el cabezal a la vista
  seguirCabezal() {
    if (this.zoom <= 1) return;
    const x = this.anchoEt + MARGEN + this.t / this.duracion * this.anchoCarril, s = this.pistas;
    const izq = s.scrollLeft + this.anchoEt + 8, der = s.scrollLeft + s.clientWidth - 16;
    if (x < izq || x > der) s.scrollLeft = Math.max(0, x - this.anchoEt - (s.clientWidth - this.anchoEt) * 0.3);
  }

  moverCabezal(t) {
    this.ponerCabezal(t);
    this.alMoverCabezal(this.t);
  }

  // ---------- Historial (deshacer / rehacer) ----------
  // Llamar ANTES de cambiar el proyecto (también desde main.js, por ejemplo antes de aplicar lo que pidió el chat)
  guardarHistorial(foto) {
    const p = this.proyecto;
    const a = p.audio?.musica?.archivo; if (a?.buffer && a.nombre) this.archivos.set(a.nombre, a);   // la canción no va en el JSON
    foto ||= serializar(p);
    if (this.historial.at(-1) === foto) return;
    this.historial.push(foto);
    if (this.historial.length > MAX_HISTORIAL) this.historial.shift();
    this.rehechos = [];
  }

  restaurar(foto) {
    const p = this.proyecto, nuevo = deserializar(foto);
    const a = nuevo.audio?.musica?.archivo;
    if (a?.nombre && !a.buffer) { const guardado = p.audio?.musica?.archivo?.nombre === a.nombre ? p.audio.musica.archivo : this.archivos.get(a.nombre); if (guardado) nuevo.audio.musica.archivo = guardado; }
    // se cambia por dentro el mismo objeto: main.js y los otros paneles siguen apuntando a él
    for (const k of Object.keys(p)) if (!(k in nuevo)) delete p[k];
    Object.assign(p, nuevo);
  }

  deshacer() {
    if (!this.historial.length) return false;
    this.rehechos.push(serializar(this.proyecto));
    this.restaurar(this.historial.pop());
    this._sel = null; this.render(); this.alCambiar('deshacer');
    return true;
  }

  rehacer() {
    if (!this.rehechos.length) return false;
    this.historial.push(serializar(this.proyecto));
    this.restaurar(this.rehechos.pop());
    this._sel = null; this.render(); this.alCambiar('rehacer');
    return true;
  }

  // ---------- Selección ----------
  validarSeleccion() {
    const s = this._sel, p = this.proyecto;
    if (!s) return;
    const vale = s.tipo === 'clave' ? p.pistas?.[s.pista]?.includes(s.clave)
      : s.tipo === 'texto' ? (p.textos || []).some(c => c.id === s.id)
      : s.tipo === 'sonido' ? (s.id === 'musica' ? !!p.audio?.musica : (p.audio?.clips || []).some(c => c.id === s.id)) : false;
    if (!vale) this._sel = null;
  }

  // los keyframes se seleccionan solo aquí; los textos y sonidos también le avisan a main.js (para abrir su panel)
  elegir(sel) {
    this._sel = sel;
    if (sel && sel.tipo !== 'clave') this.alSeleccionar({ tipo: sel.tipo, id: sel.id });
  }

  quitarSeleccion() {
    const s = this._sel, p = this.proyecto;
    if (!s) return;
    this.guardarHistorial();
    let motivo = 'claves';
    if (s.tipo === 'clave') quitarClave(p, s.pista, s.clave);
    else if (s.tipo === 'texto') { const i = p.textos.findIndex(c => c.id === s.id); if (i >= 0) p.textos.splice(i, 1); motivo = 'textos'; }
    else if (s.tipo === 'sonido') {
      if (s.id === 'musica') p.audio.musica = null;
      else { const i = p.audio.clips.findIndex(c => c.id === s.id); if (i >= 0) p.audio.clips.splice(i, 1); }
      motivo = 'audio';
    }
    this._sel = null;
    this.render(); this.alCambiar(motivo);
  }

  // ---------- Puntero: arrastrar rombos, barras, sonidos y el cabezal ----------
  presionar(e) {
    if (e.button > 0 || this.arrastre) return;
    const el = e.target, p = this.proyecto;
    const rombo = el.closest('.lt-clave'), texto = el.closest('.lt-texto'), clip = el.closest('.lt-clip'), musica = el.closest('.lt-musica');
    const regla = el.closest('.lt-regla, .lt-cabezal-asa'), carril = el.closest('.lt-carril');
    if (!rombo && !texto && !clip && !musica && !regla && !carril) return;
    e.preventDefault();
    const a = { id: e.pointerId, x0: e.clientX, movido: false, antes: null };
    if (rombo) {
      const pista = rombo.dataset.pista, clave = p.pistas[pista][+rombo.dataset.claveI];
      Object.assign(a, { tipo: 'clave', pista, clave, t0: clave.t });
      this.elegir({ tipo: 'clave', pista, clave });
      rombo.focus({ preventScroll: true });
    } else if (texto) {
      const capa = (p.textos || []).find(c => c.id === texto.dataset.id); if (!capa) return;
      const d = this.duracion, ent = limitar(+capa.entra || 0, 0, d);
      Object.assign(a, { tipo: 'texto', capa, modo: el.closest('.lt-asa')?.dataset.borde || 'mover', e0: ent, s0: limitar(capa.sale == null ? d : +capa.sale, ent, d) });
      this.elegir({ tipo: 'texto', id: capa.id });
      texto.focus({ preventScroll: true });
    } else if (clip) {
      const c = (p.audio?.clips || []).find(x => x.id === clip.dataset.id); if (!c) return;
      Object.assign(a, { tipo: 'clip', clip: c, t0: +c.t || 0 });
      this.elegir({ tipo: 'sonido', id: c.id });
      clip.focus({ preventScroll: true });
    } else if (musica) {
      a.tipo = 'nada';
      this.elegir({ tipo: 'sonido', id: 'musica' });
    } else {
      // regla, cabezal o espacio vacío de un carril: mueve el cabezal (y con doble toque en una pista de cámara, crea un keyframe)
      a.tipo = 'cabezal';
      const pista = carril?.dataset.carril === 'camara' ? carril.dataset.pista : null;
      const ahora = performance.now(), tq = this.toque;
      if (pista && tq && tq.pista === pista && ahora - tq.cuando < DOBLE_TOQUE && Math.abs(tq.x - e.clientX) < 10) {
        this.toque = null;
        const t = this.imantar(this.tiempoEn(e.clientX));
        this.guardarHistorial();
        const nueva = ponerClave(p, pista, t, valorEn(p, pista, t));
        this.elegir({ tipo: 'clave', pista, clave: nueva });
        this.t = t; this.render(); this.alMoverCabezal(t); this.alCambiar('claves');
        return;
      }
      this.toque = pista ? { pista, cuando: ahora, x: e.clientX } : null;
      const t = this.tiempoEn(e.clientX);
      if (this._sel && !regla) { this._sel = null; this.render(); }
      this.moverCabezal(this.imantarCabezal(t));
    }
    if (a.tipo !== 'cabezal' && a.tipo !== 'nada') { a.antes = serializar(p); this.render(); }
    this.arrastre = a;
    try { this.raiz.setPointerCapture(e.pointerId); } catch (err) { /* puntero ya liberado */ }
  }

  // el cabezal se pega a los keyframes cercanos (así el rombo del inspector queda lleno)
  imantarCabezal(t) {
    const pps = this.pps, p = this.proyecto;
    let mejor = null, dm = IMAN / pps;
    for (const c of Object.values(p.pistas || {}).flat()) { const dd = Math.abs((c?.t ?? -99) - t); if (dd < dm) { dm = dd; mejor = c.t; } }
    return mejor ?? ajustarACuadro(t);
  }

  mover(e) {
    const a = this.arrastre; if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x0;
    if (!a.movido && Math.abs(dx) < 3) return;
    if (a.tipo === 'cabezal') { this.moverCabezal(this.imantarCabezal(this.tiempoEn(e.clientX))); return; }
    if (a.tipo === 'nada') return;
    if (!a.movido) { a.movido = true; this.guardarHistorial(a.antes); this.raiz.classList.add('arrastrando'); }
    const p = this.proyecto, d = this.duracion, dt = dx / this.pps;
    if (a.tipo === 'clave') {
      // mientras se arrastra no se borra nada: si cae encima de otro keyframe, se reemplaza al soltar
      a.clave.t = r4(limitar(this.imantar(a.t0 + dt), 0, d));
      p.pistas[a.pista].sort((x, y) => x.t - y.t);
      this.programar('claves');
    } else if (a.tipo === 'texto') {
      const c = a.capa, largo = a.s0 - a.e0;
      if (a.modo === 'mover') {
        let e0 = limitar(a.e0 + dt, 0, d - largo);
        const pegado = this.imantar(e0), pegadoFin = this.imantar(e0 + largo);
        e0 = Math.abs(pegado - e0) <= Math.abs(pegadoFin - largo - e0) ? pegado : pegadoFin - largo;
        e0 = limitar(e0, 0, d - largo);
        c.entra = r4(e0); c.sale = e0 + largo >= d - TOLERANCIA ? null : r4(e0 + largo);
      } else if (a.modo === 'ini') c.entra = r4(limitar(this.imantar(a.e0 + dt), 0, a.s0 - MIN_TEXTO));
      else { const s = limitar(this.imantar(a.s0 + dt), a.e0 + MIN_TEXTO, d); c.sale = s >= d - TOLERANCIA ? null : r4(s); }
      this.programar('textos');
    } else if (a.tipo === 'clip') {
      a.clip.t = r4(limitar(this.imantar(a.t0 + dt), 0, Math.max(0, d - 0.05)));
      this.programar('audio');
    }
  }

  // durante un arrastre se redibuja y se avisa a lo sumo una vez por cuadro de pantalla
  programar(motivo) {
    this.pendiente = motivo;
    if (this.cuadroPendiente) return;
    this.cuadroPendiente = requestAnimationFrame(() => { this.cuadroPendiente = 0; const m = this.pendiente; this.pendiente = null; if (m) { this.render(); this.alCambiar(m); } });
  }

  soltar(e, cancelado = false) {
    const a = this.arrastre; if (!a || (e.pointerId != null && a.id !== e.pointerId)) return;
    this.arrastre = null;
    this.raiz.classList.remove('arrastrando');
    try { this.raiz.releasePointerCapture(a.id); } catch (err) { /* ya estaba liberado */ }
    if (this.cuadroPendiente) { cancelAnimationFrame(this.cuadroPendiente); this.cuadroPendiente = 0; }
    const p = this.proyecto;
    if (a.movido) {
      if (a.tipo === 'clave') moverClave(p, a.pista, a.clave, a.clave.t);   // ahora sí: si quedó encima de otro, lo reemplaza
      this.render();
      this.alCambiar({ clave: 'claves', texto: 'textos', clip: 'audio' }[a.tipo]);
    } else if (!cancelado && a.tipo === 'clave') {
      this.moverCabezal(a.clave.t);   // tocar un rombo lleva el cabezal hasta él, como en CapCut
      this.renderSeleccion();
    } else if (!cancelado && (a.tipo === 'texto' || a.tipo === 'clip' || a.tipo === 'nada')) {
      this.render();
    }
  }

  // ---------- Botones, selectores y deslizadores ----------
  clic(e) {
    const b = e.target.closest('[data-accion]'); if (!b || !this.raiz.contains(b)) return;
    const p = this.proyecto, acc = b.dataset.accion;
    if (acc === 'rombo') this.alternarClave(b.dataset.pista);
    else if (acc === 'claveTodas') {
      this.guardarHistorial();
      const t = ajustarACuadro(this.t);
      for (const k of Object.keys(PISTAS)) ponerClave(p, k, t, valorEn(p, k, this.t));
      this.t = t; this.render(); this.alMoverCabezal(t); this.alCambiar('claves');
    } else if (acc === 'borrarTodas') {
      if (!confirm('¿Borrar todos los keyframes de la cámara?\nLa cámara queda quieta en la vista inicial. Puedes deshacerlo.')) return;
      this.guardarHistorial();
      for (const k of Object.keys(PISTAS)) p.pistas[k] = [];
      if (this._sel?.tipo === 'clave') this._sel = null;
      this.render(); this.alCambiar('claves');
    } else if (acc === 'deshacer') this.deshacer();
    else if (acc === 'rehacer') this.rehacer();
    else if (acc === 'acercar' || acc === 'alejar') this.cambiarZoom(acc === 'acercar' ? 1.6 : 1 / 1.6);
    else if (acc === 'plegar') {
      const g = b.dataset.grupo;
      this.plegados.has(g) ? this.plegados.delete(g) : this.plegados.add(g);
      guardarLocal('lt-plegados', [...this.plegados]);
      this.render();
    } else if (acc === 'quitarSeleccion') this.quitarSeleccion();
    else if (acc === 'deseleccionar') { this._sel = null; this.render(); }
    else if (acc === 'elegirTexto') { this.elegir({ tipo: 'texto', id: b.dataset.id }); this.render(); }
  }

  // ◆ del inspector: pone un keyframe con el valor actual en el cabezal, o quita el que hay
  alternarClave(pista) {
    const p = this.proyecto, c = claveEn(p, pista, this.t);
    this.guardarHistorial();
    if (c) { quitarClave(p, pista, c); if (this._sel?.clave === c) this._sel = null; }
    else {
      const t = ajustarACuadro(this.t);
      this.elegir({ tipo: 'clave', pista, clave: ponerClave(p, pista, t, valorEn(p, pista, this.t)) });
      this.t = t;
    }
    this.alMoverCabezal(this.t);
    this.render(); this.alCambiar('claves');
  }

  // Cambiar un ajuste en el inspector: con keyframes, crea o actualiza el del cabezal (auto-keyframe, como CapCut);
  // sin keyframes, cambia el valor fijo de toda la pista (un solo keyframe en el segundo 0)
  // El modo (fijo o keyframe) y el instante se deciden al empezar el gesto: si no, a mitad de un arrastre el valor fijo
  // se volvería animación, o la reproducción iría sembrando keyframes. Avisar alMoverCabezal hace que main.js pause.
  empezarGesto(pista) {
    this.guardarHistorial();
    this.gesto = { pista, fijo: !(this.proyecto.pistas?.[pista]?.length), t: ajustarACuadro(this.t) };
    this.t = this.gesto.t; this.alMoverCabezal(this.t);
    return this.gesto;
  }

  ponerValor(pista, v, { fijo, t }) {
    const p = this.proyecto;
    if (!Number.isFinite(v)) return;
    if (fijo) ponerClave(p, pista, 0, v);
    else {
      const c = ponerClave(p, pista, t, v);
      if (this._sel?.tipo === 'clave' && this._sel.pista === pista) this._sel.clave = c;
    }
    this.render(); this.alCambiar('claves');
  }

  alEscribir(e) {
    const el = e.target;
    if (el.dataset.valor) {   // deslizador del inspector: un solo paso de deshacer por cada arrastre
      const k = el.dataset.valor, g = this.gesto?.pista === k ? this.gesto : this.empezarGesto(k);
      this.ponerValor(k, +el.value, g);
    }
  }

  alConfirmar(e) {
    const el = e.target, p = this.proyecto;
    if (el.dataset.valor) { this.gesto = null; this.render(); return; }
    if (el.dataset.numero) {
      const k = el.dataset.numero, P = PISTAS[k];
      if (el.value === '') { this.render(); return; }
      const g = this.empezarGesto(k); this.gesto = null;
      this.ponerValor(k, limitar(+el.value, P.min, P.max), g); return;
    }
    if (el.dataset.sel && this._sel?.tipo === 'clave') {
      const s = this._sel, P = PISTAS[s.pista];
      if (el.value === '') { this.renderSeleccion(); return; }
      this.guardarHistorial();
      if (el.dataset.sel === 't') { moverClave(p, s.pista, s.clave, r4(limitar(+el.value, 0, this.duracion))); this.t = s.clave.t; this.alMoverCabezal(this.t); }
      else if (el.dataset.sel === 'v') s.clave.v = limitar(+el.value, P.min, P.max);
      else if (el.dataset.sel === 'curva' && el.value in CURVAS) s.clave.curva = el.value;
      this.render(); this.alCambiar('claves');
      return;
    }
    const control = el.dataset.control;
    if (control === 'movimiento') this.cambiarMovimiento(el.value);
    else if (control === 'duracion') this.cambiarDuracion(+el.value);
    else if (control === 'bucle') { this.guardarHistorial(); p.bucle = el.checked; this.render(); this.alCambiar('bucle'); }
  }

  cambiarMovimiento(id) {
    const p = this.proyecto, m = MOVIMIENTOS[id];
    if (!m) return;
    const editado = !movimientoDe(p) && Object.values(p.pistas || {}).some(c => c?.length);
    if (editado && !confirm(`Vas a cambiar tus keyframes de cámara por el movimiento «${m.nombre}».\n¿Continuar? (Puedes deshacerlo)`)) { this.render(); return; }
    this.guardarHistorial();
    aplicarMovimiento(p, id);
    if (this._sel?.tipo === 'clave') this._sel = null;
    this.render(); this.alCambiar('movimiento');
  }

  cambiarDuracion(d) {
    const p = this.proyecto;
    if (!Number.isFinite(d) || d === p.duracion) return;
    this.guardarHistorial();
    const mov = movimientoDe(p), bucle = p.bucle, fraccion = this.t / (p.duracion || 8);
    escalarTiempo(p, d);
    if (mov) { aplicarMovimiento(p, mov); p.bucle = bucle; }   // un movimiento base se vuelve a crear a la nueva duración
    this.validarSeleccion();
    this.t = ajustarACuadro(fraccion * p.duracion);
    this.render(); this.alMoverCabezal(this.t); this.alCambiar('duracion');
  }

  cambiarZoom(f, xCliente) {
    const antes = this.zoom, z0 = limitar(antes * f, 1, 8), z = z0 < 1.02 ? 1 : Math.round(z0 * 1000) / 1000;
    if (z === antes) return;
    const s = this.pistas, ancla = xCliente != null ? xCliente - s.getBoundingClientRect().left : null;
    const tAncla = ancla != null ? this.tiempoEn(xCliente) : this.t;
    this.zoom = z; this.render();
    // deja el mismo instante bajo el puntero (o el cabezal a la vista)
    const x = this.anchoEt + MARGEN + tAncla / this.duracion * this.anchoCarril;
    s.scrollLeft = Math.max(0, x - (ancla ?? this.anchoEt + (s.clientWidth - this.anchoEt) * 0.4));
  }

  rueda(e) {
    if (!(e.ctrlKey || e.metaKey)) return;   // Ctrl + rueda (o pellizco en el trackpad) acerca la línea de tiempo
    e.preventDefault();
    this.cambiarZoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, e.clientX);
  }

  // ---------- Teclado ----------
  tecla(e) {
    if (!this.raiz.isConnected || editable(e.target)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.altKey) { e.preventDefault(); e.shiftKey ? this.rehacer() : this.deshacer(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.rehacer(); return; }
    const aqui = !document.activeElement || document.activeElement === document.body || this.raiz.contains(document.activeElement);
    if ((e.key === 'Delete' || e.key === 'Backspace') && this._sel && !mod && aqui) { e.preventDefault(); this.quitarSeleccion(); }
  }

  // flechas sobre un rombo, una barra o un sonido: lo corren un cuadro (con Mayús, diez)
  teclaLocal(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const el = e.target, p = this.proyecto, d = this.duracion, paso = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1) / 30;
    if (el.classList.contains('lt-clave')) {
      const pista = el.dataset.pista, c = p.pistas[pista][+el.dataset.claveI];
      this.guardarHistorial(); this.elegir({ tipo: 'clave', pista, clave: c });
      moverClave(p, pista, c, ajustarACuadro(c.t + paso)); this.t = c.t; this.alMoverCabezal(c.t);
      e.preventDefault(); this.render(); this.alCambiar('claves');
    } else if (el.classList.contains('lt-texto')) {
      const c = (p.textos || []).find(x => x.id === el.dataset.id); if (!c) return;
      const ent = +c.entra || 0, largo = (c.sale == null ? d : +c.sale) - ent, n = r4(limitar(ent + paso, 0, d - largo));
      e.preventDefault(); if (Math.abs(n - ent) < 1e-6) return;   // ya está en el borde
      this.guardarHistorial(); c.entra = n; if (c.sale != null) c.sale = n + largo >= d - TOLERANCIA ? null : r4(n + largo);
      e.preventDefault(); this.render(); this.alCambiar('textos');
    } else if (el.classList.contains('lt-clip')) {
      const c = (p.audio?.clips || []).find(x => x.id === el.dataset.id); if (!c) return;
      this.guardarHistorial(); c.t = r4(limitar((+c.t || 0) + paso, 0, d - 0.05));
      e.preventDefault(); this.render(); this.alCambiar('audio');
    }
  }
}
