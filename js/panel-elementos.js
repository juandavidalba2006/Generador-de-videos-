// Panel de Elementos (pestaña Escena): la utilería que se mueve alrededor de la joya. Una tarjeta por grupo (forma con su
// dibujito, color de la marca o uno libre, material, coreografía con inicio y duración, cantidad y tamaño) y, según la
// forma, lo propio de la cinta (recorrido, pasar por el agujero, crecer, aleteo), de la cadena (estilo, metal, de dónde
// cuelga, sobre qué se apoya) o del STL propio («Subir STL»). Abajo, «Descargar STL» (los elementos en milímetros).
// No sabe de three.js para dibujar: arma la lista (validada con normalizarElementos) y la entrega por alCambiar(lista);
// main.js se la pasa al estudio. poner(lista) la cambia desde afuera (deshacer, abrir) sin avisar.
import {
  FORMAS_ELEMENTO, MATERIALES_ELEMENTO, COREOGRAFIAS, RECORRIDOS_CINTA, ESTILOS_CADENA, METALES_CADENA, COLGAR_CADENA,
  COLORES_MARCA, RANGOS_ELEMENTO, MAX_GRUPOS, normalizarElementos, elementoNuevo, registrarSTL, exportarSTLElementos, nombreSTLElementos, infoSTL,
} from './elementos.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const copia = o => JSON.parse(JSON.stringify(o));
const n = (x, d = 0) => Number(x).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const ICONO = {
  quitar: '<path d="M6 6l12 12M18 6L6 18"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  subir: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  bajar: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  azar: '<path d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONO[k]}</svg>`;

// ---------- Dibujitos de las formas (canvas 2D, en el color del grupo) ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const tono = (h, k) => '#' + rgb(h).map(v => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k)))).toString(16).padStart(2, '0')).join('');
export function dibujarForma(lienzo, forma, color = '#1E5B4B', color2 = '#B8871F') {
  const x = lienzo.getContext('2d'), W = lienzo.width, H = lienzo.height;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.save(); x.scale(W / 48, H / 48);
  const sombra = (cx, cy, rx) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx); g.addColorStop(0, 'rgba(20,14,6,.35)'); g.addColorStop(1, 'rgba(20,14,6,0)'); x.save(); x.translate(cx, cy); x.scale(1, 0.28); x.translate(-cx, -cy); x.fillStyle = g; x.fillRect(cx - rx, cy - rx, 2 * rx, 2 * rx); x.restore(); };
  const bola = (cx, cy, r, c, brillo) => { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r); g.addColorStop(0, tono(c, brillo)); g.addColorStop(0.55, c); g.addColorStop(1, tono(c, -0.45)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const oro = (a, b) => { const g = x.createLinearGradient(a, 0, b, 0); g.addColorStop(0, '#9C6F14'); g.addColorStop(0.45, '#F5D27A'); g.addColorStop(1, '#B0801F'); return g; };
  switch (forma) {
    case 'esfera': sombra(24, 40, 15); bola(24, 25, 14, color, 0.25); break;
    case 'perla': sombra(24, 40, 13); bola(24, 26, 12, color, 0.6); x.fillStyle = 'rgba(255,230,236,.35)'; x.beginPath(); x.arc(24, 26, 12, 0.2, 1.4); x.lineTo(24, 26); x.fill(); break;
    case 'cuenta': for (const [cx, cy] of [[11, 30], [24, 25], [37, 30]]) { sombra(cx, cy + 8, 7); bola(cx, cy, 6, color, 0.5); } break;
    case 'cubo': {
      sombra(24, 40, 16);
      x.fillStyle = tono(color, 0.15); x.beginPath(); x.moveTo(24, 9); x.lineTo(38, 15); x.lineTo(24, 21); x.lineTo(10, 15); x.closePath(); x.fill();
      x.fillStyle = tono(color, -0.1); x.beginPath(); x.moveTo(10, 15); x.lineTo(24, 21); x.lineTo(24, 38); x.lineTo(10, 32); x.closePath(); x.fill();
      x.fillStyle = tono(color, -0.3); x.beginPath(); x.moveTo(38, 15); x.lineTo(24, 21); x.lineTo(24, 38); x.lineTo(38, 32); x.closePath(); x.fill();
      break;
    }
    case 'cilindro': {
      sombra(24, 41, 14);
      const g = x.createLinearGradient(12, 0, 36, 0); g.addColorStop(0, tono(color, -0.35)); g.addColorStop(0.4, tono(color, 0.1)); g.addColorStop(1, tono(color, -0.4));
      x.fillStyle = g; x.beginPath(); x.ellipse(24, 37, 12, 4, 0, 0, Math.PI); x.lineTo(12, 12); x.ellipse(24, 12, 12, 4, 0, Math.PI, 0, true); x.closePath(); x.fill();
      x.fillStyle = tono(color, 0.2); x.beginPath(); x.ellipse(24, 12, 12, 4, 0, 0, Math.PI * 2); x.fill();
      break;
    }
    case 'aro': sombra(24, 40, 15); x.strokeStyle = oro(10, 38); x.lineWidth = 4.5; x.beginPath(); x.ellipse(24, 26, 13, 13, 0, 0, Math.PI * 2); x.stroke(); break;
    case 'gema': {
      sombra(24, 41, 12);
      const g = x.createLinearGradient(10, 10, 38, 38); g.addColorStop(0, tono(color, 0.5)); g.addColorStop(0.5, color); g.addColorStop(1, tono(color, -0.5));
      x.fillStyle = g; x.beginPath(); x.moveTo(15, 13); x.lineTo(33, 13); x.lineTo(39, 20); x.lineTo(24, 39); x.lineTo(9, 20); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(9, 20); x.lineTo(39, 20); x.moveTo(15, 13); x.lineTo(20, 20); x.lineTo(24, 13); x.lineTo(28, 20); x.lineTo(33, 13); x.moveTo(20, 20); x.lineTo(24, 39); x.lineTo(28, 20); x.stroke();
      break;
    }
    case 'regalo': {
      sombra(24, 42, 15);
      x.fillStyle = color; x.fillRect(11, 18, 26, 21); x.fillStyle = tono(color, 0.12); x.fillRect(9, 14, 30, 6);
      x.fillStyle = color2; x.fillRect(21.5, 14, 5, 25); x.fillRect(9, 15.5, 30, 3);
      x.strokeStyle = color2; x.lineWidth = 2.4; x.beginPath(); x.ellipse(18, 11, 5.5, 3.5, -0.4, 0, Math.PI * 2); x.ellipse(30, 11, 5.5, 3.5, 0.4, 0, Math.PI * 2); x.stroke();
      break;
    }
    case 'stl': {
      x.strokeStyle = tono(color, -0.5); x.fillStyle = tono(color, -0.05); x.lineWidth = 1.2; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(24, 7); x.lineTo(40, 17); x.lineTo(36, 37); x.lineTo(12, 37); x.lineTo(8, 17); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(24, 7); x.lineTo(20, 24); x.lineTo(8, 17); x.moveTo(20, 24); x.lineTo(40, 17); x.moveTo(20, 24); x.lineTo(12, 37); x.moveTo(20, 24); x.lineTo(36, 37); x.stroke();
      break;
    }
    case 'cinta': {
      // un corazón de cinta, como el del reel, con su anillo
      x.strokeStyle = color; x.lineWidth = 3.4; x.lineCap = 'round';
      x.beginPath(); x.moveTo(25, 42); x.bezierCurveTo(44, 26, 40, 8, 30, 10); x.bezierCurveTo(25, 11, 24, 16, 24, 18); x.bezierCurveTo(24, 16, 22, 10, 17, 10); x.bezierCurveTo(7, 9, 4, 27, 23, 42); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.stroke();
      x.strokeStyle = oro(30, 42); x.lineWidth = 2.2; x.beginPath(); x.ellipse(36, 15, 5, 3, -0.5, 0, Math.PI * 2); x.stroke();
      break;
    }
    case 'cadena': {
      x.lineWidth = 1.8;
      for (let i = 0; i < 9; i++) { const t = i / 8, px = 6 + 36 * t, py = 10 + 26 * Math.sin(Math.PI * t); x.strokeStyle = oro(px - 4, px + 4); x.beginPath(); x.ellipse(px, py, i % 2 ? 1.6 : 3.4, i % 2 ? 3.2 : 2.2, Math.atan2(Math.cos(Math.PI * t), 1.4), 0, Math.PI * 2); x.stroke(); }
      x.fillStyle = oro(20, 28); x.beginPath(); x.moveTo(20, 38); x.lineTo(28, 38); x.lineTo(24, 46); x.fill();
      break;
    }
  }
  x.restore();
}

// ---------- El panel ----------
export class PanelElementos {
  // op: { alCambiar(lista), descargarSTL(lista) → ArrayBuffer|Blob|void, subirSTL(archivo) → { id, nombre }, opcionesSTL() → { joya, t, … } }
  constructor(contenedor, { alCambiar = null, descargarSTL = null, subirSTL = null, opcionesSTL = null } = {}) {
    this.cont = contenedor; this.alCambiar = alCambiar; this.descargar = descargarSTL; this.subir = subirSTL; this.opcionesSTL = opcionesSTL;
    this.lista = []; this.pendiente = null; this.ultimoAviso = 0; this.paraSTL = null;
    contenedor.classList.add('pel');
    contenedor.innerHTML = this.html();
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alMover(e, false));
    contenedor.addEventListener('change', e => this.alMover(e, true));
    this.render();
  }
  get valor() { return copia(this.lista); }
  poner(lista) { this.lista = normalizarElementos(lista); clearTimeout(this.pendiente); this.pendiente = null; this.render(); }
  bloquear(si) { for (const f of this.cont.querySelectorAll('fieldset, .pel-pie button')) f.disabled = !!si; }

  html() {
    const formas = Object.entries(FORMAS_ELEMENTO).filter(([k]) => k !== 'stl');
    return `
      <section class="pel-bloque">
        <div class="pel-cab"><h3>Elementos</h3><span class="pel-ayuda">Utilería que se mueve alrededor de la joya: esferas que ruedan, perlas que rebotan, una cinta que pasa por el anillo, una cadena para el dije o tu propio STL.</span></div>
        <fieldset class="pel-campos pel-agregar">
          <legend class="pel-et">Agregar</legend>
          <div class="pel-formas" role="group" aria-label="Agregar un elemento">
            ${formas.map(([k, f]) => `<button type="button" class="pel-forma" data-agregar="${k}" title="Agregar ${esc(f.nombre.toLowerCase())}" aria-label="Agregar ${esc(f.nombre.toLowerCase())}"><canvas width="96" height="96" data-mini="${k}" aria-hidden="true"></canvas><span>${esc(f.nombre)}</span></button>`).join('')}
            <label class="pel-forma pel-subir" title="Subir un STL tuyo (una caja, una escultura, un logo…)"><canvas width="96" height="96" data-mini="stl" aria-hidden="true"></canvas><span>Subir STL</span><input type="file" accept=".stl,model/stl,application/sla" data-subir="nuevo" class="pel-oculto"></label>
          </div>
        </fieldset>
        <p class="pel-estado" role="status" aria-live="polite" data-estado></p>
        <div class="pel-lista" data-lista></div>
        <p class="pel-vacio" data-vacio>Todavía no hay elementos. Escoge una forma arriba para agregarla.</p>
      </section>
      <div class="pel-pie">
        <button type="button" class="btn sec chico" data-accion="descargar">${svg('bajar')}Descargar STL</button>
        <span class="pel-ayuda">Los elementos como quedan en ese momento del video, en milímetros, listos para imprimir.</span>
      </div>`;
  }

  tarjeta(g, i) {
    const F = FORMAS_ELEMENTO[g.forma], id = esc(g.id), R = RANGOS_ELEMENTO;
    const rango = (campo, txt, min, max, paso, v) => `<label class="pel-rango"><span>${txt}</span><input type="range" data-campo="${campo}" min="${min}" max="${max}" step="${paso}" value="${v}"><output data-salida="${campo}"></output></label>`;
    const numero = (campo, txt, min, max, paso, v) => `<label class="pel-num"><span>${txt}</span><input type="number" inputmode="decimal" data-campo="${campo}" min="${min}" max="${max}" step="${paso}" value="${v}"><i>s</i></label>`;
    const sel = (campo, txt, lista, v) => `<label class="pel-sel"><span>${txt}</span><select data-campo="${campo}">${Object.entries(lista).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
    const colores = (campo, txt) => `<div class="pel-campo"><span class="pel-et">${txt}</span><div class="pel-colores" role="group" aria-label="${txt}">
        ${COLORES_MARCA.map(c => `<button type="button" class="pel-muestra" data-campo="${campo}" data-v="${c.hex}" style="--c:${c.hex}" title="${c.nombre}" aria-label="${c.nombre}" aria-pressed="${g[campo] === c.hex}"></button>`).join('')}
        <label class="pel-color" title="Otro color"><input type="color" data-campo="${campo}" value="${g[campo].toLowerCase()}" aria-label="${txt}: otro color"></label></div></div>`;
    const chips = (campo, lista, v) => `<div class="pel-chips" role="group">${Object.entries(lista).map(([k, x]) => `<button type="button" data-campo="${campo}" data-v="${k}" aria-pressed="${k === v}">${esc(x)}</button>`).join('')}</div>`;
    let propio = '';
    if (g.forma === 'cinta') propio = `
      <div class="pel-campo"><span class="pel-et">Recorrido</span>${chips('recorrido', RECORRIDOS_CINTA, g.recorrido)}</div>
      <label class="check pel-check"><input type="checkbox" data-campo="enhebrar"${g.enhebrar ? ' checked' : ''}> Pasar por el agujero de la joya</label>
      <div class="pel-grid">${rango('crecer', 'Se dibuja sola', R.crecer.min, R.crecer.max, 0.05, g.crecer)}${rango('aleteo', 'Ondea', R.aleteo.min, R.aleteo.max, 0.05, g.aleteo)}${rango('largo', 'Tamaño del recorrido', R.largo.min, R.largo.max, 0.05, g.largo)}${rango('tamano', 'Ancho', R.tamano.min, 2.5, 0.05, g.tamano)}</div>
      <div class="pel-grid">${numero('inicio', 'Empieza en', 0, 60, 0.1, g.inicio)}${numero('duracion', 'Tarda', 0.3, 30, 0.1, g.duracion)}</div>`;
    else if (g.forma === 'cadena') propio = `
      <div class="pel-grid">${sel('estilo', 'Eslabones', ESTILOS_CADENA, g.estilo)}${sel('metal', 'Metal', METALES_CADENA, g.metal)}${sel('colgar', 'Cuelga', COLGAR_CADENA, g.colgar)}
      ${sel('sobre', 'Se apoya sobre', { '': 'Nada', ...Object.fromEntries(this.lista.filter(o => o.id !== g.id && !FORMAS_ELEMENTO[o.forma].camino).map(o => [o.id, `${FORMAS_ELEMENTO[o.forma].nombre} (${o.id})`])) }, g.sobre)}</div>
      <div class="pel-grid">${rango('tamano', 'Grosor del alambre', R.tamano.min, 2, 0.05, g.tamano)}${rango('holgura', 'Cuánto cuelga', R.holgura.min, R.holgura.max, 0.01, g.holgura)}${rango('vaiven', 'Vaivén', R.vaiven.min, R.vaiven.max, 0.05, g.vaiven)}</div>`;
    else propio = `
      ${g.forma === 'stl' ? `<div class="pel-stl"><span>${g.stl ? `«${esc(g.stl.nombre || 'Mi STL')}»${infoSTL(g.stl.id) ? '' : ' <b>— falta el archivo: súbelo otra vez</b>'}` : 'Sin archivo'}</span><label class="btn sec chico">${svg('subir')}${g.stl ? 'Cambiar archivo' : 'Subir STL'}<input type="file" accept=".stl,model/stl,application/sla" data-subir="${id}" class="pel-oculto"></label></div>` : ''}
      <div class="pel-grid">${sel('material', 'Material', MATERIALES_ELEMENTO, g.material)}${sel('coreografia', 'Movimiento', COREOGRAFIAS, g.coreografia)}</div>
      <div class="pel-grid">${numero('inicio', 'Empieza en', 0, 60, 0.1, g.inicio)}${numero('duracion', 'Dura', 0.3, 30, 0.1, g.duracion)}</div>
      <div class="pel-grid">${F.max > 1 ? rango('cantidad', 'Cantidad', 1, F.max, 1, g.cantidad) : ''}${rango('tamano', 'Tamaño', R.tamano.min, R.tamano.max, 0.05, g.tamano)}${g.coreografia === 'volar' ? rango('estela', 'Estela de destellos', 0, 1, 0.05, g.estela) : ''}</div>`;
    return `<section class="pel-grupo" data-id="${id}" aria-label="${esc(F.nombre)} ${i + 1}">
      <fieldset class="pel-campos">
        <legend class="pel-vh">${esc(F.nombre)} ${i + 1}</legend>
        <div class="pel-tit"><canvas width="88" height="88" data-mini-grupo aria-hidden="true"></canvas><div><b>${esc(F.nombre)}</b><span class="pel-ayuda" data-resumen></span></div>
          <button type="button" class="pel-redondo" data-accion="variar" title="Otra variación" aria-label="Otra variación de ${esc(F.nombre.toLowerCase())}">${svg('azar')}</button>
          <button type="button" class="pel-redondo" data-accion="quitar" title="Quitar" aria-label="Quitar ${esc(F.nombre.toLowerCase())}">${svg('quitar')}</button></div>
        ${g.forma === 'cadena' ? '' : colores('color', g.forma === 'cinta' ? 'Color de la cinta' : 'Color')}
        ${g.forma === 'regalo' ? colores('color2', 'Color de la cinta') : ''}
        ${propio}
      </fieldset></section>`;
  }

  // ---------- Eventos ----------
  grupoDe(el) { const s = el.closest('[data-id]'); return s ? this.lista.find(g => g.id === s.dataset.id) : null; }
  alClic(e) {
    const add = e.target.closest('[data-agregar]');
    if (add) {
      if (this.lista.length >= MAX_GRUPOS) { this.estado(`Puedes tener hasta ${MAX_GRUPOS} grupos de elementos.`); return; }
      const g = elementoNuevo(add.dataset.agregar, this.lista);
      this.lista = normalizarElementos([...this.lista, g]); this.render(true); this.avisar(true);
      this.estado(`Se agregó: ${FORMAS_ELEMENTO[g.forma].nombre.toLowerCase()}.`);
      this.cont.querySelector(`[data-id="${g.id}"] select, [data-id="${g.id}"] button`)?.focus({ preventScroll: true });
      return;
    }
    const acc = e.target.closest('[data-accion]');
    if (acc) {
      if (acc.dataset.accion === 'descargar') { this.bajarSTL(); return; }
      const g = this.grupoDe(acc); if (!g) return;
      if (acc.dataset.accion === 'quitar') {
        this.lista = normalizarElementos(this.lista.filter(x => x !== g).map(x => (x.sobre === g.id ? { ...x, sobre: '' } : x)));
        this.render(true); this.avisar(true); this.estado(`Se quitó: ${FORMAS_ELEMENTO[g.forma].nombre.toLowerCase()}.`);
        this.cont.querySelector('[data-agregar]')?.focus({ preventScroll: true });
      } else if (acc.dataset.accion === 'variar') { this.cambiar(g, 'semilla', (g.semilla * 7 + 131) % 10000, true); }
      return;
    }
    const b = e.target.closest('button[data-campo][data-v]');
    if (b) { const g = this.grupoDe(b); if (g) this.cambiar(g, b.dataset.campo, b.dataset.v, true); }
  }
  alMover(e, final) {
    const sub = e.target.closest('input[data-subir]');
    if (sub) { if (final && sub.files?.length) this.subirArchivo(sub.files[0], sub.dataset.subir); return; }
    const c = e.target.closest('input[data-campo], select[data-campo]');
    if (!c) return;
    const g = this.grupoDe(c); if (!g) return;
    const v = c.type === 'checkbox' ? c.checked : c.type === 'range' || c.type === 'number' ? +c.value : c.value;
    if (c.type === 'number' && (!final || c.value === '' || !Number.isFinite(v))) return;
    this.cambiar(g, c.dataset.campo, v, final || c.tagName === 'SELECT' || c.type === 'checkbox');
  }
  cambiar(g, campo, v, final) {
    const nuevo = { ...g, [campo]: v };
    if (campo === 'forma') Object.assign(nuevo, { material: undefined, coreografia: undefined, cantidad: undefined, color: undefined });
    if (campo === 'coreografia') nuevo.duracion = undefined;   // cada movimiento trae su duración natural
    const rehacer = ['forma', 'coreografia', 'material', 'colgar'].includes(campo);
    this.lista = normalizarElementos(this.lista.map(x => (x === g ? nuevo : x)));
    this.render(rehacer); this.avisar(final);
  }
  // Mientras se arrastra un deslizador se avisa como mucho cada 90 ms
  avisar(final) {
    const ahora = performance.now(), enviar = () => { this.pendiente = null; this.ultimoAviso = performance.now(); this.alCambiar?.(this.valor); };
    clearTimeout(this.pendiente); this.pendiente = null;
    if (final || ahora - this.ultimoAviso > 90) enviar();
    else this.pendiente = setTimeout(enviar, 90 - (ahora - this.ultimoAviso));
  }
  estado(txt, error = false) { const s = this.cont.querySelector('[data-estado]'); s.textContent = txt; s.classList.toggle('error', error); }

  async subirArchivo(archivo, destino) {
    if (!/\.stl$/i.test(archivo.name) && !/stl|sla/.test(archivo.type)) { this.estado('Ese archivo no es un STL.', true); return; }
    if (archivo.size > 80 * 1024 * 1024) { this.estado('El STL pesa más de 80 MB: simplifícalo antes de subirlo.', true); return; }
    this.estado('Leyendo el STL…');
    try {
      const info = this.subir ? await this.subir(archivo) : registrarSTL(await archivo.arrayBuffer(), archivo.name);
      const stl = { id: info.id, nombre: info.nombre || archivo.name };
      const g = this.lista.find(x => x.id === destino);
      if (g) this.lista = normalizarElementos(this.lista.map(x => (x === g ? { ...x, forma: 'stl', stl } : x)));
      else {
        if (this.lista.length >= MAX_GRUPOS) { this.estado(`Puedes tener hasta ${MAX_GRUPOS} grupos de elementos.`, true); return; }
        this.lista = normalizarElementos([...this.lista, { ...elementoNuevo('stl', this.lista), stl }]);
      }
      this.render(true); this.avisar(true);
      const m = info.medidas; this.estado(`Listo: «${stl.nombre}»${m ? ` (${n(m.x, 1)} × ${n(m.y, 1)} × ${n(m.z, 1)} mm)` : ''}.`);
    } catch (e) { this.estado(e?.message || 'No se pudo leer el STL.', true); }
    finally { for (const i of this.cont.querySelectorAll('input[data-subir]')) i.value = ''; }
  }
  async bajarSTL() {
    if (!this.lista.length) { this.estado('Agrega un elemento para descargarlo en STL.', true); return; }
    try {
      let datos = this.descargar ? await this.descargar(this.valor) : exportarSTLElementos(this.lista, this.opcionesSTL?.() || {});
      if (!datos) return;
      const blob = datos instanceof Blob ? datos : new Blob([datos], { type: 'model/stl' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nombreSTLElementos(this.lista); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.estado(`Se descargó «${a.download}».`);
    } catch (e) { this.estado(e?.message || 'No se pudo armar el STL.', true); }
  }

  // ---------- Dibujo ----------
  render(rehacer = true) {
    const cont = this.cont, lista = cont.querySelector('[data-lista]');
    const ids = [...lista.querySelectorAll('[data-id]')].map(s => s.dataset.id).join('|');
    if (rehacer || ids !== this.lista.map(g => g.id).join('|')) lista.innerHTML = this.lista.map((g, i) => this.tarjeta(g, i)).join('');
    cont.querySelector('[data-vacio]').hidden = this.lista.length > 0;
    for (const c of cont.querySelectorAll('[data-mini]')) if (!c.dataset.hecho) { dibujarForma(c, c.dataset.mini, FORMAS_ELEMENTO_COLOR(c.dataset.mini), '#B8871F'); c.dataset.hecho = '1'; }
    for (const g of this.lista) {
      const s = lista.querySelector(`[data-id="${g.id}"]`); if (!s) continue;
      const lz = s.querySelector('[data-mini-grupo]'), k = g.forma + g.color + g.color2;
      if (lz.dataset.dibujo !== k) { dibujarForma(lz, g.forma, g.color, g.color2); lz.dataset.dibujo = k; }
      for (const b of s.querySelectorAll('button[data-campo][data-v]')) b.setAttribute('aria-pressed', String(String(g[b.dataset.campo]).toUpperCase() === String(b.dataset.v).toUpperCase()));
      for (const el of s.querySelectorAll('input[data-campo], select[data-campo]')) {
        const v = g[el.dataset.campo];
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'color') { if (el.value.toUpperCase() !== v) el.value = v.toLowerCase(); }
        else if (document.activeElement !== el && String(el.value) !== String(v)) el.value = v;
        const o = s.querySelector(`[data-salida="${el.dataset.campo}"]`); if (o) o.textContent = textoRango(el.dataset.campo, v);
      }
      s.querySelector('[data-resumen]').textContent = resumen(g);
    }
    cont.querySelector('[data-accion=descargar]').disabled = !this.lista.length;
  }
}
const FORMAS_ELEMENTO_COLOR = k => COLORES_MARCA.find(c => c.id === FORMAS_ELEMENTO[k].color)?.hex || '#1E5B4B';
function textoRango(k, v) {
  if (k === 'cantidad') return n(v);
  if (k === 'crecer') return v < 0.05 ? 'No' : `${n(v * 100)} %`;
  if (k === 'aleteo' || k === 'vaiven' || k === 'estela') return v < 0.05 ? 'Nada' : v < 0.4 ? 'Suave' : v < 0.75 ? 'Medio' : 'Mucho';
  if (k === 'holgura') return v < 0.03 ? 'Tensa' : v < 0.15 ? 'Suelta' : 'Muy suelta';
  return `×${n(v, 2)}`;
}
function resumen(g) {
  const F = FORMAS_ELEMENTO[g.forma];
  if (g.forma === 'cinta') return `${RECORRIDOS_CINTA[g.recorrido]}${g.enhebrar ? ' · por el agujero' : ''}`;
  if (g.forma === 'cadena') return `${ESTILOS_CADENA[g.estilo]} · ${COLGAR_CADENA[g.colgar].toLowerCase()}`;
  return `${F.max > 1 ? `${g.cantidad} · ` : ''}${COREOGRAFIAS[g.coreografia]} · desde ${n(g.inicio, 1)} s`;
}
