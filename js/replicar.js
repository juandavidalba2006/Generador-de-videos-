// Panel de la pestaña Replicar: la joyera pega el enlace de un reel de Instagram (o sube el video), el estudio lo mira en su
// equipo (cortes, movimiento de la cámara, colores de la escena) y, si hay IA, Claude mira la joya y el fondo. Del análisis
// sale un plan (replica.js) que se aplica al proyecto con un clic. El panel no toca el proyecto ni el estudio: entrega el plan
// por alAplicar(plan, opciones) y main.js guarda para deshacer, pone la escena y los materiales y aplica el resto
// (aplicarReplica de replica.js).
//
//   new PanelReplicar(contenedor, { analizar, descargarReel, pedirIA, hayIA, alAplicar, duracionProyecto })
//     analizar(fuente, { alAvanzar(paso, p), cancelado }) → análisis            (por defecto analizarVideo de analizador.js)
//     descargarReel(url, { alAvanzar(p, info), cancelado }) → Blob              (por defecto el de reel.js)
//     pedirIA(analisis, { cancelado }) → lo que vio la IA, o lanza (e.sinIA)    (por defecto pedirAnalisisIA de analisis-ia.js)
//     hayIA() → Promise<boolean>   (opcional: para decir de entrada si la IA está; por defecto iaDisponible)
//     alAplicar(plan, opciones)    opciones: { movimientos, cortes, escena, materiales, textos, sonidos, musica, duracion }
//     duracionProyecto() → s       (opcional: para decir a qué duración se ajusta si no se usa la del video)
//   render(), reiniciar(), analizarArchivo(archivo), analizarEnlace(texto), cancelar(), bloquear(si)
//   estado: 'inicio' | 'descargando' | 'analizando' | 'resultado' | 'error'; plan, analisis, ia: lo último que se analizó
import { construirReplica, NOMBRE_TRANSICION } from './replica.js';
import { ESCENAS, FORMAS_SUPERFICIE, FORMAS_FONDO, MATERIALES_ESCENA, GOBOS } from './escenas.js';
import { ENCUADRES } from './analisis-ia.js';
import { dibujarMiniatura } from './panel-escena.js';

const MAX_MB = 300;   // un reel pesa unos pocos MB; más que esto casi seguro no es un reel
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const decimal = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');
const mb = b => decimal(b / (1024 * 1024), b < 10 * 1024 * 1024 ? 1 : 0);
const esAborto = e => e?.name === 'AbortError';

// Iconos de línea (mismo trazo que el resto de la página)
const ICONO = {
  enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  subir: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  seco: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7L18 4M15.7 15.7L6 4"/>',
  flash: '<path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5"/><circle cx="12" cy="12" r="2.6"/>',
  negro: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  barrido: '<path d="M3 8h11M6 12h14M3 16h11"/><path d="M17 5l3 3-3 3" opacity=".55"/>',
  joya: '<path d="M7 4h10l3 5-8 11L4 9z"/><path d="M4 9h16M9.5 4L12 9l2.5-5M12 9v11"/>',
  hecho: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  aviso: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  ia: '<path d="M12 3l1.6 4.6L18 9.2l-4.4 1.6L12 15.5l-1.6-4.7L6 9.2l4.4-1.6z"/><path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  otra: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
};
const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONO[k] || ''}</svg>`;

// Pasos del análisis (en el orden en que se ven)
const PASOS = [
  ['leyendo', 'Leyendo los cuadros del video'],
  ['cortes', 'Buscando los cortes'],
  ['movimiento', 'Midiendo el movimiento de la cámara'],
  ['ia', 'La IA mira la joya y el fondo'],
];
// Lo que se puede aplicar (las casillas del resultado)
const PARTES = [
  ['movimientos', 'Movimientos y cortes', 'Los keyframes de la cámara en cada plano y los cortes con su transición.'],
  ['escena', 'Escena', 'La superficie, el fondo y la luz parecidos a los del video.'],
  ['materiales', 'Metal y piedra', 'El metal y la piedra que vio la IA.'],
  ['textos', 'Textos', 'Los textos que aparecen en el video (revísalos: son los de otra marca).'],
  ['sonidos', 'Sonidos en los cortes', 'Un whoosh o un golpe justo en cada corte, al estilo viral.'],
  ['musica', 'Música parecida', 'Un estilo de música y un ritmo como los del video.'],
  ['duracion', 'Duración igual al video', ''],
];

export class PanelReplicar {
  constructor(contenedor, opciones = {}) {
    this.cont = contenedor;
    const o = opciones;
    // los módulos de verdad se cargan solo cuando hacen falta (el analizador y la IA no pesan en el arranque de la página)
    this.op = {
      analizar: o.analizar || ((f, x) => import('./analizador.js').then(m => m.analizarVideo(f, x))),
      descargarReel: o.descargarReel || ((u, x) => import('./reel.js').then(m => m.descargarReel(u, x))),
      pedirIA: o.pedirIA || ((a, x) => import('./analisis-ia.js').then(m => m.pedirAnalisisIA(a, x))),
      hayIA: o.hayIA || (() => import('./analisis-ia.js').then(m => m.iaDisponible())),
      alAplicar: o.alAplicar || null,
      duracionProyecto: o.duracionProyecto || null,
    };
    this.estado = 'inicio';
    this.trabajo = 0;            // cada análisis tiene su número: cancelar sube el número y lo que llegue tarde se ignora
    this.plan = null; this.analisis = null; this.ia = null; this.notaIA = null;
    this.error = null; this.fuente = null; this.enlace = '';
    this.marcas = null;          // las casillas del resultado
    this.aplicado = false; this.bloqueado = false;
    this.iaLista = null;         // true / false cuando se sepa
    contenedor.classList.add('rpl');
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('change', e => this.alCambiar(e));
    contenedor.addEventListener('submit', e => { e.preventDefault(); this.analizarEnlace(this.$('.rpl-enlace input')?.value || ''); });
    contenedor.addEventListener('input', e => { if (e.target.matches('.rpl-enlace input')) this.enlace = e.target.value; });
    // soltar el video sobre la zona (o sobre cualquier parte del panel, mientras se espera un video)
    contenedor.addEventListener('dragover', e => { if (this.esperaVideo() && hayArchivos(e)) { e.preventDefault(); this.$('.rpl-soltar')?.classList.add('encima'); } });
    contenedor.addEventListener('dragleave', e => { if (!contenedor.contains(e.relatedTarget)) this.$('.rpl-soltar')?.classList.remove('encima'); });
    contenedor.addEventListener('drop', e => {
      if (!this.esperaVideo() || !hayArchivos(e)) return;
      e.preventDefault(); this.$('.rpl-soltar')?.classList.remove('encima');
      const f = e.dataTransfer.files[0]; if (f) this.analizarArchivo(f);
    });
    this.render();
    // ¿hay IA? (solo para decirlo de entrada; si falla, se sabrá al analizar)
    Promise.resolve().then(() => this.op.hayIA()).then(si => { this.iaLista = si === true; if (this.estado === 'inicio' || this.estado === 'error') this.render(); }, () => {});
  }

  $(s) { return this.cont.querySelector(s); }
  esperaVideo() { return this.estado === 'inicio' || this.estado === 'error'; }

  // ---------- Acciones ----------
  analizarEnlace(texto) {
    const t = String(texto || '').trim();
    this.enlace = t;
    if (!t) { this.mostrarError({ mensaje: 'Pega primero el enlace del reel (en Instagram: Compartir → Copiar enlace).' }); return; }
    return this.procesar({ enlace: t });
  }
  analizarArchivo(archivo) {
    if (!archivo || typeof archivo.size !== 'number') return;
    if (archivo.type && !/^video\//.test(archivo.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(archivo.name || '')) {
      this.mostrarError({ mensaje: 'Ese archivo no es un video. Sube el reel en MP4, MOV o WebM.' }); return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) { this.mostrarError({ mensaje: `Ese video pesa más de ${MAX_MB} MB. Recórtalo a la parte que quieres copiar o expórtalo más liviano.` }); return; }
    if (!archivo.size) { this.mostrarError({ mensaje: 'Ese archivo está vacío. Vuelve a descargar el reel y súbelo de nuevo.' }); return; }
    return this.procesar({ archivo });
  }
  cancelar() {
    this.trabajo++;
    this.ir(this.plan ? 'resultado' : 'inicio');
  }
  reiniciar() {
    this.trabajo++;
    Object.assign(this, { plan: null, analisis: null, ia: null, notaIA: null, error: null, fuente: null, marcas: null, aplicado: false });
    this.ir('inicio');
    this.$('.rpl-enlace input')?.focus();
  }
  // mientras se crea el video no se aplica nada (el proyecto está congelado)
  bloquear(si) { this.bloqueado = !!si; const b = this.$('[data-accion=aplicar]'); if (b) b.disabled = this.bloqueado || !this.algoMarcado(); }

  // Todo el camino: (bajar el reel) → analizar en el equipo → pedirle a la IA → armar el plan
  async procesar({ enlace = null, archivo = null }) {
    const yo = ++this.trabajo, cancelado = () => yo !== this.trabajo;
    this.error = null; this.fuente = { enlace, archivo }; this.aplicado = false;
    try {
      let video = archivo;
      if (enlace) {
        this.descarga = { p: 0, etapa: 'buscando', recibido: 0, total: 0 };
        this.ir('descargando');
        video = await this.op.descargarReel(enlace, { cancelado, alAvanzar: (p, info) => { if (!cancelado()) this.avanceDescarga(p, info); } });
        if (cancelado()) return;
        this.fuente = { enlace, archivo: video };   // si algo falla después, se reintenta sin volver a bajarlo
      }
      this.pasos = Object.fromEntries(PASOS.map(([k]) => [k, { estado: 'espera', p: 0 }]));
      this.ir('analizando');
      const analisis = await this.op.analizar(video, { cancelado, alAvanzar: (paso, p) => { if (!cancelado()) this.avancePaso(paso, p); } });
      if (cancelado()) return;
      for (const k of ['leyendo', 'cortes', 'movimiento']) this.marcarPaso(k, 'hecho', 1);
      this.marcarPaso('ia', 'curso', 0);
      let ia = null, notaIA = null;
      try {
        ia = await this.op.pedirIA(analisis, { cancelado });
        this.iaLista = true;
      } catch (e) {
        if (cancelado()) return;
        if (esAborto(e)) throw e;
        // sin IA (o si falla) se sigue con lo medido en el equipo: se dice por qué
        notaIA = { sinIA: !!e?.sinIA, texto: textoError(e) || 'La IA no pudo mirar el video ahora. Se usa solo el análisis hecho en tu equipo.' };
        if (e?.sinIA) this.iaLista = false;
      }
      if (cancelado()) return;
      this.marcarPaso('ia', ia ? 'hecho' : 'omitido', 1);
      const plan = construirReplica(analisis, ia);
      Object.assign(this, { analisis, ia, notaIA, plan, marcas: marcasIniciales(plan) });
      this.ir('resultado');
    } catch (e) {
      if (cancelado()) return;
      if (esAborto(e)) { this.ir(this.plan ? 'resultado' : 'inicio'); return; }
      console.warn('Replicar:', e);
      this.mostrarError({ mensaje: textoError(e) || 'No se pudo analizar el video. Prueba con otro archivo.', codigo: e?.codigo, reintentar: true });
    }
  }
  mostrarError(err) { this.error = err; this.ir('error'); }

  aplicar() {
    if (!this.plan || this.bloqueado || !this.algoMarcado()) return;
    const m = this.marcas;
    const opciones = {
      movimientos: m.movimientos, cortes: m.movimientos, escena: m.escena && !!this.plan.escena, materiales: m.materiales && !!this.plan.materiales,
      textos: m.textos && this.plan.textos.length > 0, sonidos: m.sonidos && this.plan.sonidos.length > 0, musica: m.musica && !!this.plan.musica, duracion: m.duracion,
    };
    const mal = e => { console.warn('Replicar: aplicar', e); this.aplicado = false; this.avisoAplicar('No se pudo aplicar al proyecto: ' + (textoError(e) || e), true); };
    const bien = () => { this.aplicado = true; this.avisoAplicar('Listo: se aplicó al proyecto. Si no te gusta, usa Deshacer.'); };
    // main.js puede aplicar de una vez o con una promesa (p. ej. si la escena tarda en armarse)
    let r;
    try { r = this.op.alAplicar?.(this.plan, opciones); } catch (e) { mal(e); return; }
    if (r && typeof r.then === 'function') r.then(bien, mal); else bien();
  }
  algoMarcado() { return !!this.marcas && PARTES.some(([k]) => k !== 'duracion' && this.marcas[k] && this.disponible(k)); }
  // ¿la parte tiene algo para aplicar?
  disponible(k) {
    const p = this.plan; if (!p) return false;
    return k === 'movimientos' ? true : k === 'escena' ? !!p.escena : k === 'materiales' ? !!p.materiales : k === 'textos' ? p.textos.length > 0
      : k === 'sonidos' ? p.sonidos.length > 0 : k === 'musica' ? !!p.musica : true;
  }

  // ---------- Eventos ----------
  alClic(e) {
    const b = e.target.closest('[data-accion]'); if (!b || !this.cont.contains(b) || b.disabled) return;
    const a = b.dataset.accion;
    if (a === 'cancelar') this.cancelar();
    else if (a === 'otro') this.reiniciar();
    else if (a === 'aplicar') this.aplicar();
    else if (a === 'reintentar') { const f = this.fuente; if (f?.archivo) this.procesar({ archivo: f.archivo }); else if (f?.enlace) this.procesar({ enlace: f.enlace }); else this.ir('inicio'); }
    else if (a === 'volver') { this.error = null; this.ir(this.plan ? 'resultado' : 'inicio'); }
  }
  alCambiar(e) {
    const t = e.target;
    if (t.matches('.rpl-soltar input[type=file]')) { const f = t.files?.[0]; t.value = ''; if (f) this.analizarArchivo(f); return; }
    if (t.matches('[data-parte]') && this.marcas) {
      this.marcas[t.dataset.parte] = t.checked;
      this.aplicado = false;
      const b = this.$('[data-accion=aplicar]'); if (b) b.disabled = this.bloqueado || !this.algoMarcado();
      const nota = this.$('.rpl-hecho'); if (nota) nota.hidden = true;
      if (t.dataset.parte === 'duracion') { const d = this.$('.rpl-duracion-nota'); if (d) d.textContent = this.notaDuracion(); }
    }
  }

  // ---------- Progreso (sin volver a dibujar todo el panel) ----------
  avanceDescarga(p, info = {}) {
    this.descarga = { p, ...info };
    const barra = this.$('.rpl-prog i'), txt = this.$('.rpl-prog-texto');
    if (barra) barra.style.width = `${Math.round(Math.max(0.03, p) * 100)}%`;
    if (txt) txt.textContent = textoDescarga(this.descarga);
  }
  avancePaso(paso, p) {
    // el análisis del equipo dice 'escena' cuando arma la paleta y los fotogramas: es parte de «midiendo el movimiento»
    const k = paso === 'escena' ? 'movimiento' : paso;
    if (!this.pasos?.[k]) return;
    const orden = PASOS.map(([x]) => x), i = orden.indexOf(k);
    orden.slice(0, i).forEach(x => { if (this.pasos[x].estado !== 'hecho') this.marcarPaso(x, 'hecho', 1); });
    this.marcarPaso(k, 'curso', paso === 'escena' ? 0.9 + 0.1 * p : p);
  }
  marcarPaso(k, estado, p) {
    if (!this.pasos?.[k]) return;
    Object.assign(this.pasos[k], { estado, p });
    const li = this.$(`.rpl-pasos [data-paso=${k}]`);
    if (!li) return;
    li.dataset.estado = estado;
    const n = li.querySelector('.rpl-paso-p');
    if (n) n.textContent = estado === 'curso' && p > 0 && p < 1 && k !== 'ia' ? `${Math.round(p * 100)} %` : estado === 'omitido' ? 'sin IA' : '';
    const ic = li.querySelector('.rpl-paso-icono');
    if (ic) ic.innerHTML = estado === 'hecho' ? svg('hecho') : estado === 'omitido' ? svg('aviso') : '';
  }

  ir(estado) { this.estado = estado; this.render(); }

  // ---------- Dibujo ----------
  render() {
    const c = this.cont;
    c.dataset.estado = this.estado;
    c.setAttribute('aria-busy', this.estado === 'descargando' || this.estado === 'analizando' ? 'true' : 'false');
    c.innerHTML = this.estado === 'descargando' ? this.htmlDescarga() : this.estado === 'analizando' ? this.htmlAnalisis()
      : this.estado === 'resultado' ? this.htmlResultado() : this.htmlInicio();
    if (this.estado === 'resultado') {
      const lienzo = this.$('.rpl-escena canvas');
      if (lienzo && this.plan?.escena) dibujarMiniatura(lienzo, this.plan.escena);
    }
    if (this.estado === 'descargando') this.avanceDescarga(this.descarga?.p || 0, this.descarga);
  }

  htmlInicio() {
    const err = this.estado === 'error' && this.error;
    const ia = this.iaLista === true ? `<p class="rpl-ia si">${svg('ia')}<span>Con IA: además de los movimientos, reconoce la joya, el metal, la piedra y el fondo.</span></p>`
      : this.iaLista === false ? `<p class="rpl-ia">${svg('aviso')}<span>Sin IA en este sitio: se replican los movimientos, los cortes y los colores con el análisis de tu equipo. La joya y los textos se reconocen en la página publicada con ANTHROPIC_API_KEY.</span></p>` : '';
    return `
      <div class="rpl-cab">
        <h3>Replicar un reel</h3>
        <p class="rpl-ayuda">Copia los movimientos de cámara, los cortes y el fondo de un video que te guste, con tu joya.</p>
      </div>
      ${err ? `<div class="rpl-error" role="alert">${svg('aviso')}<div><p>${esc(err.mensaje)}</p>
        <div class="rpl-botones">${err.reintentar && this.fuente ? '<button type="button" class="btn chico" data-accion="reintentar">Volver a intentar</button>' : ''}${this.plan ? '<button type="button" class="btn sec chico" data-accion="volver">Ver el análisis anterior</button>' : ''}</div></div></div>` : ''}
      <form class="rpl-enlace" novalidate>
        <label for="rpl-url-${this.idUnico()}">Pega el enlace del reel de Instagram</label>
        <div class="rpl-fila">
          <span class="rpl-campo">${svg('enlace')}<input id="rpl-url-${this.idUnico()}" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://www.instagram.com/reel/…" value="${esc(this.enlace)}"></span>
          <button type="submit" class="btn">Analizar</button>
        </div>
      </form>
      <div class="rpl-o"><span>o sube el video</span></div>
      <label class="rpl-soltar">
        ${svg('subir')}
        <b>Suelta aquí el video</b>
        <span class="rpl-ayuda">o haz clic para buscarlo (MP4, MOV o WebM, hasta 60 s).</span>
        <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm">
      </label>
      <p class="rpl-nota">El enlace solo funciona con reels <b>públicos</b> y cuando Instagram lo permite. Si no, descarga el reel (o graba la pantalla mientras se reproduce) y súbelo aquí. El video se usa solo como referencia: se analiza en tu navegador y no se guarda.</p>
      ${ia}`;
  }
  idUnico() { return (this._id ||= Math.random().toString(36).slice(2, 8)); }

  htmlDescarga() {
    return `
      <div class="rpl-cab"><h3>Bajando el reel</h3><p class="rpl-ayuda">${esc(cortar(enlaceVisible(this.fuente?.enlace), 70))}</p></div>
      <div class="rpl-progreso" role="status" aria-live="polite">
        <div class="rpl-prog"><i></i></div>
        <p class="rpl-prog-texto">${esc(textoDescarga(this.descarga))}</p>
      </div>
      <div class="rpl-botones"><button type="button" class="btn sec" data-accion="cancelar">Cancelar</button></div>`;
  }

  htmlAnalisis() {
    const enlace = enlaceVisible(this.fuente?.enlace);
    const nombre = this.fuente?.archivo?.name && !enlace ? this.fuente.archivo.name : enlace;
    return `
      <div class="rpl-cab"><h3>Analizando el video</h3><p class="rpl-ayuda">${esc(cortar(nombre, 70))}</p></div>
      <ol class="rpl-pasos" role="status" aria-live="polite">
        ${PASOS.map(([k, t]) => {
          const p = this.pasos?.[k] || { estado: 'espera', p: 0 };
          return `<li data-paso="${k}" data-estado="${p.estado}"><span class="rpl-paso-icono">${p.estado === 'hecho' ? svg('hecho') : p.estado === 'omitido' ? svg('aviso') : ''}</span><span class="rpl-paso-t">${t}</span><span class="rpl-paso-p"></span></li>`;
        }).join('')}
      </ol>
      <p class="rpl-ayuda">Todo se mide en tu equipo; solo unos fotogramas pequeños van a la IA, si está disponible.</p>
      <div class="rpl-botones"><button type="button" class="btn sec" data-accion="cancelar">Cancelar</button></div>`;
  }

  htmlResultado() {
    const p = this.plan, a = this.analisis || {};
    const conIA = p.conIA;
    const avisos = [...(this.notaIA ? [this.notaIA.texto] : []), ...p.avisos.filter(x => !(this.notaIA && /^Sin IA/.test(x)))];
    const planos = p.planos.map((pl, i) => {
      const mini = pl.miniatura || (Array.isArray(a.miniaturas) ? a.miniaturas[pl.analizado] : null);
      const tr = i > 0 ? `<li class="rpl-tr" title="${esc(NOMBRE_TRANSICION[pl.transicion] || '')}">${svg(pl.transicion || 'seco')}<span>${esc(primeraMayus(NOMBRE_TRANSICION[pl.transicion] || 'corte'))}</span></li>` : '';
      return `${tr}<li class="rpl-plano">
          <span class="rpl-foto">${mini ? `<img src="${esc(mini)}" alt="" loading="lazy">` : ''}<em>${i + 1}</em></span>
          <span class="rpl-plano-dato"><b>${decimal(pl.duracion)} s</b>${pl.encuadre && conIA ? ` · ${esc(ENCUADRES[pl.encuadre] || '')}` : ''}</span>
          <span class="rpl-plano-desc">${esc(pl.descripcion)}</span>
        </li>`;
    }).join('');
    const e = p.escena;
    const base = e ? ESCENAS[e.base || e.id] : null;
    const nombreEscena = !e ? 'Sin escena' : e.id === 'ninguna' ? ESCENAS.ninguna.nombre : e.id === 'personalizada' || e.base ? `Parecida a «${base?.nombre || 'personalizada'}»` : base?.nombre || 'Escena';
    const detalleEscena = !e || e.id === 'ninguna' ? 'Fondo claro y parejo: el degradado de la marca, sin pedestal.'
      : [`${FORMAS_SUPERFICIE[e.superficie.forma] || ''} de ${(MATERIALES_ESCENA[e.superficie.material] || '').toLowerCase()}`, FORMAS_FONDO[e.fondo.forma], `luz: ${(GOBOS[e.luz.gobo] || '').toLowerCase()} desde la ${e.luz.angulo < 0 ? 'izquierda' : 'derecha'}`].filter(Boolean).join(' · ');
    const muestras = e && e.id !== 'ninguna' ? `<span class="rpl-muestras"><i style="--c:${esc(e.fondo.color)}" title="Fondo ${esc(e.fondo.color)}"></i><i style="--c:${esc(e.superficie.color)}" title="Superficie ${esc(e.superficie.color)}"></i></span>` : '';
    const j = p.joya;
    const joya = j ? `<div class="rpl-tarjeta rpl-joya">${svg('joya', 'rpl-ic')}<div><h4>${esc(j.nombreTipo)}</h4><p>${esc([j.metal, j.piedra].filter(Boolean).join(' · ') || 'Metal y piedra sin reconocer')}</p>${j.descripcion ? `<p class="rpl-ayuda">${esc(j.descripcion)}</p>` : ''}</div></div>`
      : `<div class="rpl-tarjeta rpl-joya">${svg('joya', 'rpl-ic')}<div><h4>La joya</h4><p class="rpl-ayuda">${conIA ? 'La IA no reconoció la joya.' : 'Sin IA no se reconoce la joya: se queda la tuya, con su metal y su piedra.'}</p></div></div>`;
    const casillas = PARTES.filter(([k]) => k !== 'musica' || p.musica).map(([k, t, ayuda]) => {
      const disp = this.disponible(k), on = disp && this.marcas[k];
      const extra = k === 'duracion' ? `<span class="rpl-ayuda rpl-duracion-nota">${esc(this.notaDuracion())}</span>`
        : k === 'materiales' && !disp ? '<span class="rpl-ayuda">Hace falta la IA para reconocerlos.</span>'
        : k === 'textos' && !disp ? `<span class="rpl-ayuda">${conIA ? 'La IA no vio textos en el video.' : 'Hace falta la IA para leerlos.'}</span>`
        : k === 'sonidos' && !disp ? '<span class="rpl-ayuda">El video no tiene cortes.</span>'
        : k === 'musica' ? `<span class="rpl-ayuda">${esc(nombreMusica(p.musica))}</span>` : `<span class="rpl-ayuda">${esc(ayuda)}</span>`;
      return `<label class="rpl-casilla${disp ? '' : ' apagada'}"><input type="checkbox" data-parte="${k}"${on ? ' checked' : ''}${disp ? '' : ' disabled'}><span><b>${t}</b>${extra}</span></label>`;
    }).join('');
    return `
      <div class="rpl-cab">
        <h3>Así es el video</h3>
        <p class="rpl-sello${conIA ? ' ia' : ''}">${svg(conIA ? 'ia' : 'aviso')}${conIA ? 'Analizado con IA' : 'Analizado en tu equipo (sin IA)'}</p>
      </div>
      <p class="rpl-resumen">${esc(p.resumen)}</p>
      ${avisos.length ? `<ul class="rpl-avisos">${avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <section class="rpl-bloque">
        <h4>${p.planos.length === 1 ? 'Un solo plano' : `${p.planos.length} planos`} · ${decimal(p.duracion)} s</h4>
        <ol class="rpl-tira">${planos}</ol>
      </section>
      <section class="rpl-bloque rpl-dos">
        <div class="rpl-tarjeta rpl-escena"><canvas width="96" height="120" aria-hidden="true"></canvas><div><h4>${esc(nombreEscena)}</h4><p class="rpl-ayuda">${esc(detalleEscena)}</p>${muestras}</div></div>
        ${joya}
      </section>
      <fieldset class="rpl-bloque rpl-partes">
        <legend>Qué aplicar al proyecto</legend>
        ${casillas}
      </fieldset>
      <div class="rpl-botones">
        <button type="button" class="btn" data-accion="aplicar"${this.bloqueado || !this.algoMarcado() ? ' disabled' : ''}>Aplicar al proyecto</button>
        <button type="button" class="btn sec" data-accion="otro">${svg('otra')}Analizar otro</button>
      </div>
      <p class="rpl-hecho" role="status"${this.aplicado ? '' : ' hidden'}>Listo: se aplicó al proyecto. Si no te gusta, usa Deshacer.</p>`;
  }
  avisoAplicar(texto, mal = false) {
    const n = this.$('.rpl-hecho'); if (!n) return;
    n.textContent = texto; n.hidden = false; n.classList.toggle('mal', mal);
  }
  notaDuracion() {
    const p = this.plan; if (!p) return '';
    const dv = p.duracionVideo, dp = typeof this.op.duracionProyecto === 'function' ? Number(this.op.duracionProyecto()) : NaN;
    if (this.marcas?.duracion) return Math.abs(dv - p.duracion) > 0.05 ? `El video dura ${decimal(dv)} s; el proyecto quedará de ${decimal(p.duracion)} s.` : `El proyecto quedará de ${decimal(p.duracion)} s, como el video.`;
    return Number.isFinite(dp) ? `Se deja la duración del proyecto (${decimal(dp)} s) y el video se ajusta a ella.` : 'Se deja la duración del proyecto y el video se ajusta a ella.';
  }
}

// Casillas marcadas al llegar el resultado: lo que hay, menos los textos (son los de otra marca) y la música (puede tener la suya)
function marcasIniciales(plan) {
  return { movimientos: true, escena: !!plan.escena, materiales: !!plan.materiales, textos: false, sonidos: plan.sonidos.length > 0, musica: false, duracion: true };
}
const hayArchivos = e => Array.from(e.dataTransfer?.types || []).includes('Files');
const cortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// el enlace sin el texto que venía pegado con él («Mira este reel 😍 https://…»)
const enlaceVisible = t => (t ? t.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*instagram\.com\/\S+/i)?.[0] || t : '');
const primeraMayus = s => s.charAt(0).toUpperCase() + s.slice(1);
function textoDescarga(d = {}) {
  if (!d || d.etapa === 'buscando' || !d.total) return 'Buscando el video del reel…';
  return `Bajando el video: ${mb(d.recibido || 0)} de ${mb(d.total)} MB`;
}
function nombreMusica(m) {
  if (!m) return '';
  const n = { lujo: 'Lujo', lofi: 'Lo-fi', trap: 'Trap', house: 'House', phonk: 'Phonk', popViral: 'Pop viral', cinematico: 'Cinemático' }[m.estilo] || m.estilo;
  return `${n} a ${m.bpm} pulsos por minuto${m.porRitmo ? ', al ritmo de los cortes' : ''}.`;
}
// Mensaje para la joyera: los errores de los módulos ya vienen en español; uno técnico no se muestra tal cual
function textoError(e) {
  const m = typeof e?.message === 'string' ? e.message.trim() : '';
  if (!m) return '';
  if (/^(TypeError|ReferenceError|SyntaxError|RangeError)$/.test(e?.name) || /is not a function|undefined|null|Cannot read/i.test(m)) return 'Algo falló al analizar el video. Vuelve a intentarlo; si sigue, prueba con otro archivo.';
  return m;
}
