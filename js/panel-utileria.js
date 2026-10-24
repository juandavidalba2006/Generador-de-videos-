// Panel de utilería (va dentro de la pestaña Escena): el tipo de estuche o caja (tarjetas dibujadas), los estilos de la
// marca, los colores de la caja, del interior y de la cinta, el material, dónde va (adentro, al lado o de escenario), qué tan
// abierta, el tamaño, el logo, el grabado y la descarga del STL para imprimirla en 3D.
// No sabe de three.js: arma la configuración (validada con normalizarUtileria) y la entrega por alCambiar(cfg); main.js se
// la pasa al estudio. descargarSTL({ cfg, parte, nombre }) baja el archivo (main.js le da la joya de ahora).
// poner(cfg) la cambia desde afuera (chat, deshacer, abrir un proyecto) sin avisar.
import {
  UTILERIA, MATERIALES_UTILERIA, POSICIONES_UTILERIA, COLORES_MARCA, ESTILOS_UTILERIA, RANGOS_UTILERIA, MAX_GRABADO,
  normalizarUtileria, utileriaDe, estiloDe, partesSTL, nombreSTL,
} from './utileria.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const copia = o => JSON.parse(JSON.stringify(o));
const ICONO = {
  descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 19h14"/>',
  dado: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1.1"/><circle cx="15" cy="15" r="1.1"/><circle cx="15" cy="9" r="1.1"/><circle cx="9" cy="15" r="1.1"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONO[k] || ''}</svg>`;

// ---------- Miniaturas (sin 3D: la caja de cada tipo con los colores elegidos) ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const tono = (h, k) => hex(rgb(h).map(v => (k >= 0 ? v + (255 - v) * k : v * (1 + k))));
function oro(x, x0, x1) { const g = x.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#9C6F14'); g.addColorStop(0.45, '#F5D27A'); g.addColorStop(1, '#B0801F'); return g; }
function anillo(x, cx, cy, r) {
  x.strokeStyle = oro(x, cx - r, cx + r); x.lineWidth = Math.max(2, r * 0.32); x.beginPath(); x.ellipse(cx, cy, r, r * 1.05, 0, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#F4F7FA'; x.beginPath(); x.moveTo(cx - r * 0.4, cy - r * 1.05); x.lineTo(cx + r * 0.4, cy - r * 1.05); x.lineTo(cx, cy - r * 1.55); x.fill();
}
function caja(x, X, Y, w, h, d, c, r = 3) {
  // caja en perspectiva simple: frente, cara de arriba y un lado más oscuro
  x.fillStyle = tono(c, -0.18); x.beginPath(); x.moveTo(X + w, Y); x.lineTo(X + w + d, Y - d * 0.6); x.lineTo(X + w + d, Y + h - d * 0.6); x.lineTo(X + w, Y + h); x.fill();
  x.fillStyle = tono(c, 0.12); x.beginPath(); x.moveTo(X, Y); x.lineTo(X + d, Y - d * 0.6); x.lineTo(X + w + d, Y - d * 0.6); x.lineTo(X + w, Y); x.fill();
  const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, tono(c, 0.04)); g.addColorStop(1, tono(c, -0.08));
  x.fillStyle = g; x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill();
}
export function dibujarMiniatura(lienzo, cfg) {
  const x = lienzo.getContext('2d'), W = lienzo.width, H = lienzo.height, n = normalizarUtileria(cfg), c = n.color, i = n.interior, ci = n.cinta;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.save(); x.scale(W / 120, H / 120);
  const fondo = x.createRadialGradient(60, 52, 4, 60, 60, 80); fondo.addColorStop(0, '#FCFBF8'); fondo.addColorStop(1, '#E7E1D6');
  x.fillStyle = fondo; x.fillRect(0, 0, 120, 120);
  x.fillStyle = 'rgba(23,21,15,.16)'; x.beginPath(); x.ellipse(62, 96, 40, 6, 0, 0, Math.PI * 2); x.fill();
  const t = n.tipo;
  if (t === 'ninguna') { x.fillStyle = 'rgba(23,21,15,.2)'; x.beginPath(); x.ellipse(60, 92, 16, 3, 0, 0, Math.PI * 2); x.fill(); anillo(x, 60, 72, 15); }
  else if (t === 'estuche-anillo' || t === 'estuche-aretes' || t === 'cofre' || t === 'estuche-collar') {
    const ancho = t === 'estuche-collar' ? 70 : 52, X = 60 - ancho / 2 - 6, base = t === 'cofre' ? 16 : t === 'estuche-collar' ? 13 : 24, tapa = t === 'cofre' ? 42 : t === 'estuche-collar' ? 30 : 34;
    // tapa abierta (forro con el escarabajo insinuado)
    x.fillStyle = tono(c, -0.1); x.beginPath(); x.roundRect(X + 4, 92 - base - tapa - 6, ancho, tapa, 6); x.fill();
    x.fillStyle = i; x.beginPath(); x.roundRect(X + 7, 92 - base - tapa - 3, ancho - 6, tapa - 6, 4); x.fill();
    x.fillStyle = '#D9A83A'; x.beginPath(); x.arc(X + 4 + ancho / 2, 92 - base - tapa / 2 - 6, 2.4, 0, Math.PI * 2); x.fill();
    caja(x, X, 92 - base, ancho, base, 10, c, 4);
    x.fillStyle = tono(i, -0.08); x.beginPath(); x.moveTo(X + 3, 92 - base); x.lineTo(X + 12, 92 - base - 6); x.lineTo(X + ancho + 7, 92 - base - 6); x.lineTo(X + ancho - 2, 92 - base); x.fill();
    if (t !== 'cofre' && t !== 'estuche-collar') { x.strokeStyle = '#D9A83A'; x.lineWidth = 1; x.beginPath(); x.moveTo(X, 92 - base); x.lineTo(X + ancho, 92 - base); x.stroke(); }
    if (t === 'cofre') { x.fillStyle = '#E2B65E'; x.beginPath(); x.arc(X + ancho / 2, 92 - base / 2, 1.6, 0, Math.PI * 2); x.fill(); }
    if (t === 'estuche-aretes') { anillo(x, 54, 84 - base + 6, 6); anillo(x, 72, 84 - base + 6, 6); }
    else anillo(x, 61, 84 - base + 4, t === 'estuche-collar' ? 8 : 10);
  } else if (t === 'caja-regalo') {
    const esc = n.posicion === 'escenario';
    caja(x, esc ? 18 : 30, esc ? 56 : 52, esc ? 74 : 52, esc ? 40 : 40, esc ? 16 : 12, c, 2);
    const X = esc ? 18 : 30, w = esc ? 74 : 52, d = esc ? 16 : 12, Y = esc ? 56 : 52;
    x.fillStyle = ci; x.fillRect(X + w / 2 - 4, Y, 8, esc ? 40 : 40); x.beginPath(); x.moveTo(X + w / 2 - 4, Y); x.lineTo(X + w / 2 - 4 + d, Y - d * 0.6); x.lineTo(X + w / 2 + 4 + d, Y - d * 0.6); x.lineTo(X + w / 2 + 4, Y); x.fill();
    x.beginPath(); x.moveTo(X + d * 0.5, Y - d * 0.3 - 2.5); x.lineTo(X + w + d * 0.5, Y - d * 0.3 - 2.5); x.lineTo(X + w + d * 0.5, Y - d * 0.3 + 2.5); x.lineTo(X + d * 0.5, Y - d * 0.3 + 2.5); x.fill();
    if (n.mono) { x.fillStyle = ci; const bx = X + w / 2 + d / 2, by = Y - d * 0.3; x.beginPath(); x.ellipse(bx - 9, by - 7, 9, 5, -0.4, 0, Math.PI * 2); x.ellipse(bx + 9, by - 7, 9, 5, 0.4, 0, Math.PI * 2); x.fill(); x.fillStyle = tono(ci, -0.2); x.beginPath(); x.arc(bx, by - 4, 3.5, 0, Math.PI * 2); x.fill(); }
    if (esc) anillo(x, X + w / 2 + 6, Y - 18, 7); else if (!n.mono || n.posicion === 'asiento') anillo(x, 84, 40, 8);
  } else if (t === 'cajon') {
    caja(x, 38, 50, 46, 34, 14, c, 3);
    x.fillStyle = tono(c, 0.06); x.beginPath(); x.roundRect(22, 64, 46, 26, 3); x.fill();
    x.fillStyle = i; x.beginPath(); x.moveTo(24, 64); x.lineTo(34, 58); x.lineTo(70, 58); x.lineTo(66, 64); x.fill();
    x.fillStyle = '#E2B65E'; x.beginPath(); x.arc(45, 77, 2.4, 0, Math.PI * 2); x.fill();
    anillo(x, 50, 52, 8);
  } else if (t === 'bandeja') {
    x.fillStyle = tono(c, -0.12); x.beginPath(); x.ellipse(60, 84, 42, 12, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#D9A83A'; x.beginPath(); x.ellipse(60, 80, 42, 12, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = tono(i, -0.06); x.beginPath(); x.ellipse(60, 80, 38, 10, 0, 0, Math.PI * 2); x.fill();
    anillo(x, 60, 66, 12);
  } else if (t === 'pila-cajas') {
    caja(x, 8, 46, 26, 48, 8, tono(c, -0.06), 2); caja(x, 12, 30, 20, 16, 6, c, 2);
    caja(x, 82, 40, 26, 54, 8, c, 2); caja(x, 86, 26, 18, 14, 6, tono(c, 0.08), 2);
    caja(x, 36, 74, 46, 20, 8, tono(c, 0.04), 2);
    x.strokeStyle = '#D9A83A'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(32, 30); x.quadraticCurveTo(60, 72, 86, 26); x.stroke();
    x.fillStyle = '#E2B65E'; x.beginPath(); x.ellipse(60, 50, 6, 2.2, 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}

// ---------- El panel ----------
export class PanelUtileria {
  constructor(contenedor, { alCambiar = null, descargarSTL = null, valor = null } = {}) {
    this.cont = contenedor; this.alCambiar = alCambiar; this.descargarSTL = descargarSTL;
    this.cfg = normalizarUtileria(valor ?? 'ninguna');
    this.pendiente = null; this.ultimoAviso = 0;
    contenedor.classList.add('put');
    contenedor.innerHTML = this.html();
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alMover(e, false));
    contenedor.addEventListener('change', e => this.alMover(e, true));
    this.render();
  }
  get valor() { return copia(this.cfg); }
  poner(cfg) { this.cfg = normalizarUtileria(cfg); clearTimeout(this.pendiente); this.pendiente = null; this.render(); }
  bloquear(si) { for (const f of this.cont.querySelectorAll('fieldset')) f.disabled = !!si; }

  html() {
    const colores = campo => `<div class="put-colores" role="group">
        <label class="put-color" title="Otro color"><input type="color" data-campo="${campo}" aria-label="Otro color"></label>
        ${COLORES_MARCA.map(([c, n]) => `<button type="button" class="put-muestra" data-campo="${campo}" data-v="${c}" style="--c:${c}" title="${n}" aria-label="${n}" aria-pressed="false"></button>`).join('')}
      </div>`;
    const rango = (campo, txt, min, max, paso) => `<label class="rango put-rango"><span>${txt}</span><input type="range" data-campo="${campo}" min="${min}" max="${max}" step="${paso}"><output data-salida="${campo}"></output></label>`;
    return `
      <section class="put-bloque">
        <div class="put-cab"><h3>Estuche o caja</h3><span class="put-ayuda">Una caja de la marca que acompaña a la joya en el video. También la puedes imprimir en 3D.</span></div>
        <fieldset class="put-campos">
          <legend class="vh">Tipo de estuche</legend>
          <div class="put-galeria" role="group" aria-label="Tipos de estuche">
            ${Object.entries(UTILERIA).map(([id, u]) => `<button type="button" class="put-ficha" data-tipo="${id}" aria-pressed="false" title="${esc(u.descripcion)}"><span class="put-marco"><canvas class="put-mini" width="200" height="200" aria-hidden="true"></canvas></span><b>${esc(u.nombre)}</b></button>`).join('')}
          </div>
        </fieldset>
      </section>
      <section class="put-bloque" data-detalle>
        <fieldset class="put-campos">
          <legend class="vh">Personalizar el estuche</legend>
          <div class="put-grupo">
            <h4>Estilos de la marca</h4>
            <div class="put-chips" role="group" aria-label="Estilos de la marca">
              ${Object.entries(ESTILOS_UTILERIA).map(([id, e]) => `<button type="button" data-estilo="${id}" aria-pressed="false"><i class="put-trio" aria-hidden="true"><i style="--c:${e.color}"></i><i style="--c:${e.interior}"></i><i style="--c:${e.cinta}"></i></i><span>${esc(e.nombre)}</span></button>`).join('')}
            </div>
          </div>
          <div class="put-grupo">
            <h4>Colores y material</h4>
            <div class="campo"><span class="et">Caja</span>${colores('color')}</div>
            <div class="campo"><span class="et">Interior (cojín y forro)</span>${colores('interior')}</div>
            <div class="campo" data-solo="cinta"><span class="et">Cinta</span>${colores('cinta')}</div>
            <label class="put-par">Material de afuera<select data-campo="material">${Object.entries(MATERIALES_UTILERIA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
          </div>
          <div class="put-grupo">
            <h4>Dónde va y cómo se ve</h4>
            <div class="put-chips" role="group" aria-label="Dónde va la caja" data-posiciones>
              ${Object.entries(POSICIONES_UTILERIA).map(([k, v]) => `<button type="button" data-campo="posicion" data-v="${k}" aria-pressed="false"><span>${esc(v)}</span></button>`).join('')}
            </div>
            <div class="grid2 put-rangos">
              ${rango('apertura', 'Qué tan abierta', 0, 1, 0.01)}
              ${rango('tamano', 'Tamaño', RANGOS_UTILERIA.tamano.min, RANGOS_UTILERIA.tamano.max, 0.05)}
            </div>
            <div class="put-interruptores">
              <label class="put-check"><input type="checkbox" data-campo="logo"><span>Logo de Atelier &amp; Co en dorado</span></label>
              <label class="put-check" data-solo="mono"><input type="checkbox" data-campo="mono"><span>Moño de cinta</span></label>
              <label class="put-check" data-solo="pila"><input type="checkbox" data-campo="frente"><span>Caja desenfocada adelante</span></label>
            </div>
            <label class="put-grabado">Grabado en dorado <span class="put-ayuda">(opcional, hasta ${MAX_GRABADO} letras)</span>
              <span class="put-texto"><input type="text" data-campo="grabado" maxlength="${MAX_GRABADO}" placeholder="Por ejemplo: Para siempre" autocomplete="off" spellcheck="true"><output data-salida="grabado" aria-live="polite"></output></span>
            </label>
            <div data-solo="pila"><button type="button" class="btn sec chico" data-accion="semilla">${svg('dado')}Otra disposición de cajas</button></div>
          </div>
        </fieldset>
        <div class="put-grupo put-stl">
          <h4>Imprimir en 3D</h4>
          <p class="put-ayuda">Archivo STL en milímetros, del tamaño real de la caja para esta joya; cada parte es un sólido cerrado.</p>
          <div class="put-fila">
            <label class="put-par">Parte<select data-parte></select></label>
            <button type="button" class="btn chico" data-accion="stl">${svg('descargar')}Descargar STL</button>
          </div>
          <p class="put-ayuda" data-nombre></p>
        </div>
      </section>`;
  }

  // ---------- Eventos ----------
  alClic(e) {
    const ficha = e.target.closest('[data-tipo]');
    if (ficha) {
      const tipo = ficha.dataset.tipo;
      if (tipo === this.cfg.tipo) return;
      // cambiar de tipo conserva los colores y el logo; el material y lo demás, los de ese tipo
      const c = this.cfg, n = utileriaDe(tipo, 'tinta', { logo: c.logo, grabado: c.grabado, tamano: c.tamano });
      Object.assign(n, { color: c.color, interior: c.interior, cinta: c.cinta });
      if (c.tipo !== 'ninguna' && UTILERIA[c.tipo]?.material === UTILERIA[tipo]?.material) n.material = c.material;
      this.cfg = normalizarUtileria(n); this.render(); this.avisar(true);
      return;
    }
    const est = e.target.closest('[data-estilo]');
    if (est) { const s = ESTILOS_UTILERIA[est.dataset.estilo]; this.cambiarVarios({ color: s.color, interior: s.interior, cinta: s.cinta, material: this.cfg.tipo === 'caja-regalo' || this.cfg.tipo === 'pila-cajas' ? (s.material === 'cuero' ? 'papel' : s.material) : s.material }); return; }
    const acc = e.target.closest('[data-accion]');
    if (acc?.dataset.accion === 'semilla') { this.cambiarVarios({ semilla: (this.cfg.semilla % 9999) + 1 }); return; }
    if (acc?.dataset.accion === 'stl') { this.bajar(); return; }
    const b = e.target.closest('button[data-campo][data-v]');
    if (b) this.cambiarVarios({ [b.dataset.campo]: b.dataset.v });
  }
  alMover(e, final) {
    const c = e.target.closest('[data-campo]');
    if (c) {
      const k = c.dataset.campo, v = c.type === 'range' ? +c.value : c.type === 'checkbox' ? c.checked : c.value;
      // el grabado se avisa al soltar el campo (o cada tanto mientras se escribe)
      this.cambiarVarios({ [k]: k === 'color' || k === 'interior' || k === 'cinta' ? String(v).toUpperCase() : v }, final || c.tagName === 'SELECT' || c.type === 'checkbox');
      return;
    }
    if (e.target.matches('[data-parte]')) this.render();
  }
  cambiarVarios(cambios, final = true) {
    if (this.cfg.tipo === 'ninguna') return;
    this.cfg = normalizarUtileria({ ...this.cfg, ...cambios });
    this.render(); this.avisar(final);
  }
  avisar(final) {
    const ahora = performance.now(), enviar = () => { this.pendiente = null; this.ultimoAviso = performance.now(); this.alCambiar?.(this.valor); };
    clearTimeout(this.pendiente); this.pendiente = null;
    if (final || ahora - this.ultimoAviso > 90) enviar();
    else this.pendiente = setTimeout(enviar, 90 - (ahora - this.ultimoAviso));
  }
  async bajar() {
    const sel = this.cont.querySelector('[data-parte]'), parte = sel.value || 'todo', boton = this.cont.querySelector('[data-accion=stl]');
    if (!this.descargarSTL) return;
    boton.disabled = true;
    try { await this.descargarSTL({ cfg: this.valor, parte, nombre: nombreSTL(this.cfg, parte) }); }
    finally { boton.disabled = false; }
  }

  // ---------- Dibujo ----------
  render() {
    const c = this.cfg, cont = this.cont, ninguna = c.tipo === 'ninguna', def = UTILERIA[c.tipo];
    for (const f of cont.querySelectorAll('[data-tipo]')) {
      const id = f.dataset.tipo, sel = id === c.tipo, lz = f.querySelector('canvas');
      f.setAttribute('aria-pressed', String(sel));
      const cfgMini = { ...c, tipo: id, posicion: id === c.tipo ? c.posicion : 'asiento' }, clave = JSON.stringify([cfgMini.tipo, cfgMini.color, cfgMini.interior, cfgMini.cinta, cfgMini.posicion, cfgMini.mono]);
      if (lz.dataset.dibujo !== clave) { dibujarMiniatura(lz, cfgMini); lz.dataset.dibujo = clave; }
    }
    cont.querySelector('[data-detalle]').hidden = ninguna;
    if (ninguna) return;
    const estilo = estiloDe(c);
    for (const b of cont.querySelectorAll('[data-estilo]')) b.setAttribute('aria-pressed', String(b.dataset.estilo === estilo));
    for (const b of cont.querySelectorAll('button[data-campo][data-v]')) b.setAttribute('aria-pressed', String(String(c[b.dataset.campo]).toUpperCase() === String(b.dataset.v).toUpperCase()));
    // posiciones posibles para este tipo
    const pos = def.posiciones || ['asiento', 'al-lado'];
    for (const b of cont.querySelectorAll('[data-campo=posicion]')) b.hidden = !pos.includes(b.dataset.v);
    cont.querySelector('[data-posiciones]').hidden = pos.length < 2;
    const sinAbrir = !def.abre || c.posicion === 'escenario';
    for (const el of cont.querySelectorAll('input[data-campo], select[data-campo]')) {
      const k = el.dataset.campo, v = c[k];
      if (el.type === 'range') {
        if (+el.value !== v && document.activeElement !== el) el.value = v;
        el.disabled = k === 'apertura' && sinAbrir;
        const o = cont.querySelector(`[data-salida="${k}"]`); if (o) o.textContent = k === 'apertura' ? (sinAbrir ? '—' : v < 0.02 ? 'Cerrada' : `${Math.round(v * 100)} %`) : `×${v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'color') { if (el.value.toUpperCase() !== v) el.value = v.toLowerCase(); }
      else if (el.type === 'text') { if (el.value !== v && document.activeElement !== el) el.value = v; }
      else if (el.value !== v) el.value = v;
    }
    const grab = cont.querySelector('input[data-campo=grabado]');
    cont.querySelector('[data-salida=grabado]').textContent = `${Array.from(grab.value).length}/${MAX_GRABADO}`;
    for (const el of cont.querySelectorAll('[data-solo]')) {
      const s = el.dataset.solo;
      el.hidden = s === 'cinta' ? !(c.tipo === 'caja-regalo' || c.tipo === 'pila-cajas') : s === 'mono' ? c.tipo !== 'caja-regalo' : c.tipo !== 'pila-cajas';
    }
    // partes del STL (se conserva la elegida si sigue existiendo)
    const sel = cont.querySelector('[data-parte]'), partes = partesSTL(c), antes = sel.value;
    const clave = partes.map(p => p.id).join('|');
    if (sel.dataset.clave !== clave) { sel.innerHTML = partes.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join(''); sel.dataset.clave = clave; sel.value = partes.some(p => p.id === antes) ? antes : 'todo'; }
    cont.querySelector('[data-nombre]').textContent = `Se baja como «${nombreSTL(c, sel.value)}».`;
    cont.querySelector('[data-accion=stl]').disabled = !this.descargarSTL;
  }
}
