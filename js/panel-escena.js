// Panel de la pestaña Escena: las escenas listas (tarjetas con un dibujito de la superficie, el fondo y la luz) y
// «Personalizar» (forma, material y color de la superficie y del fondo, la luz con su ventana y el relleno).
// No sabe de three.js: arma la configuración (validada con normalizarEscena) y la entrega por alCambiar(cfg);
// main.js se la pasa al estudio (estudio.ponerEscena). poner(cfg) la cambia desde afuera (chat, deshacer, abrir) sin avisar.
import { ESCENAS, FORMAS_SUPERFICIE, FORMAS_FONDO, MATERIALES_ESCENA, GOBOS, RANGOS, normalizarEscena, escenaDe } from './escenas.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const copia = o => JSON.parse(JSON.stringify(o));

// Colores sugeridos para la superficie y el fondo (la paleta de las fotos de joyería: neutros cálidos y dos de la marca)
const MUESTRAS = [
  ['#EEE7DE', 'Marfil'], ['#D8CFC4', 'Arena'], ['#B8A592', 'Taupe'], ['#CBB9A2', 'Lino'], ['#EACFCB', 'Rosa empolvado'],
  ['#B9C2B0', 'Salvia'], ['#C98F72', 'Terracota'], ['#1F4D3F', 'Esmeralda'], ['#2A2724', 'Carbón'],
];

// Iconos de línea (mismo trazo que el resto de la página)
const ICONO = {
  cilindro: '<ellipse cx="12" cy="8" rx="7" ry="2.6"/><path d="M5 8v8c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6V8"/>',
  cubo: '<path d="M5 9l7-3 7 3v8l-7 3-7-3z"/><path d="M5 9l7 3 7-3M12 12v8"/>',
  losa: '<path d="M3 13l9-3.5 9 3.5v2.5l-9 3.5-9-3.5z"/><path d="M3 13l9 3.5 9-3.5M12 16.5V19"/>',
  escalones: '<path d="M8.5 7.5h7M8.5 7.5v3h7v-3M5.5 10.5h13v3.5h-13zM3 14h18v4H3z"/>',
  cojin: '<path d="M4 12c0-2.4 3.6-4 8-4s8 1.6 8 4-3.6 5-8 5-8-2.6-8-5z"/><path d="M7 11.5c1.4.9 3.1 1.3 5 1.3s3.6-.4 5-1.3"/>',
  piso: '<path d="M2 17h20"/><circle cx="12" cy="12" r="4"/><path d="M5 20h14" opacity=".5"/>',
  curva: '<path d="M4 4v9a6 6 0 0 0 6 6h10"/>',
  pared: '<path d="M6 4v13h14"/><path d="M6 17l-3 3"/>',
  arco: '<path d="M4 20V10a8 8 0 0 1 16 0v10"/><path d="M8 20v-9a4 4 0 0 1 8 0v9"/>',
  ninguno: '<circle cx="12" cy="12" r="7.5" opacity=".35"/><circle cx="12" cy="12" r="4"/>',
  ventana: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M12 4v16M5 12h14"/>',
  persiana: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  hojas: '<path d="M4 20C9 15 12 10 20 4"/><path d="M9 15l-4-2M9 15l1 4M13 11l-4-3M13 11l2 4M17 7l-3-3M17 7l3 2"/>',
  foco: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2"/>',
  reiniciar: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
};
const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONO[k] || ''}</svg>`;

// ---------- Dibujo de las tarjetas (sin 3D: el fondo, la luz insinuada y el pedestal en sus colores) ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const tono = (h, k) => hex(rgb(h).map(v => (k >= 0 ? v + (255 - v) * k : v * (1 + k))));   // k > 0 aclara, k < 0 oscurece

export function dibujarMiniatura(lienzo, cfg) {
  const x = lienzo.getContext('2d'), W = lienzo.width, H = lienzo.height;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
  x.save(); x.scale(W / 120, H / 150);
  if (!cfg || cfg.id === 'ninguna') { miniaturaLisa(x); x.restore(); return; }
  const f = cfg.fondo, s = cfg.superficie, l = cfg.luz, oscuro = rgb(f.color).reduce((a, v) => a + v, 0) < 240;
  // fondo: degradado suave y, según la forma, el piso con la esquina, la curva o el nicho
  const g = x.createLinearGradient(0, 0, 0, 150);
  g.addColorStop(0, tono(f.color, -0.06)); g.addColorStop(0.62, tono(f.color, 0.06)); g.addColorStop(1, tono(f.color, -0.04));
  x.fillStyle = g; x.fillRect(0, 0, 120, 150);
  if (f.forma === 'pared') { x.fillStyle = tono(f.color, 0.1); x.fillRect(0, 104, 120, 46); x.fillStyle = tono(f.color, -0.12); x.fillRect(0, 103.5, 120, 1); }
  else if (f.forma === 'arco') {
    x.fillStyle = tono(f.color, -0.13); x.beginPath(); x.moveTo(30, 112); x.lineTo(30, 50); x.arc(60, 50, 30, Math.PI, 0); x.lineTo(90, 112); x.fill();
    x.fillStyle = tono(f.color, 0.1); x.fillRect(0, 112, 120, 38);
  } else {
    const p = x.createLinearGradient(0, 80, 0, 150); p.addColorStop(0, 'rgba(255,255,255,0)'); p.addColorStop(1, 'rgba(255,255,255,.16)');
    x.fillStyle = p; x.fillRect(0, 80, 120, 70);
  }
  // la luz: la ventana, la persiana, las hojas, el arco o el foco, insinuados en el fondo
  luzMiniatura(x, l, oscuro);
  // la superficie
  const tope = superficieMiniatura(x, s, f);
  // un anillo de oro parado encima, con su sombrita
  const lado = l.angulo < 0 ? 1 : -1;
  x.fillStyle = 'rgba(20,14,6,.28)'; x.beginPath(); x.ellipse(60 + lado * 7, tope + 0.5, 13, 2.2, 0, 0, Math.PI * 2); x.fill();
  const oro = x.createLinearGradient(48, 0, 72, 0); oro.addColorStop(0, '#9C6F14'); oro.addColorStop(0.4, '#F5D27A'); oro.addColorStop(1, '#B0801F');
  x.strokeStyle = oro; x.lineWidth = 3; x.beginPath(); x.ellipse(60, tope - 10.5, 9, 10, 0, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#F4F7FA'; x.beginPath(); x.moveTo(56.5, tope - 21); x.lineTo(63.5, tope - 21); x.lineTo(60, tope - 25.5); x.fill();
  x.restore();
}
function miniaturaLisa(x) {
  // el fondo liso de marca: el óvalo de luz perla y la sombra 2D bajo la pieza
  x.fillStyle = '#E2DCCF'; x.fillRect(0, 0, 120, 150);
  const g = x.createRadialGradient(60, 66, 0, 60, 66, 92); g.addColorStop(0, '#FCFBF8'); g.addColorStop(0.5, '#EFEAE0'); g.addColorStop(1, '#E2DCCF');
  x.fillStyle = g; x.fillRect(0, 0, 120, 150);
  const s = x.createRadialGradient(60, 98, 0, 60, 98, 20); s.addColorStop(0, 'rgba(12,9,4,.3)'); s.addColorStop(1, 'rgba(12,9,4,0)');
  x.save(); x.translate(60, 98); x.scale(1, 0.22); x.translate(-60, -98); x.fillStyle = s; x.fillRect(30, 70, 60, 60); x.restore();
  const oro = x.createLinearGradient(48, 0, 72, 0); oro.addColorStop(0, '#9C6F14'); oro.addColorStop(0.4, '#F5D27A'); oro.addColorStop(1, '#B0801F');
  x.strokeStyle = oro; x.lineWidth = 3; x.beginPath(); x.ellipse(60, 85, 9, 10, 0, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#F4F7FA'; x.beginPath(); x.moveTo(56.5, 74.5); x.lineTo(63.5, 74.5); x.lineTo(60, 70); x.fill();
}
function luzMiniatura(x, l, oscuro) {
  const k = l.intensidad, izq = l.angulo < 0, nitido = 1 - 0.7 * l.suavidad;
  x.save();
  const luz = a => `rgba(255,248,232,${(a * k * (oscuro ? 0.75 : 1)).toFixed(3)})`, sombra = a => `rgba(30,20,8,${(a * k).toFixed(3)})`;
  if (l.gobo === 'ventana' || l.gobo === 'arco') {
    // una ventana inclinada: los vidrios claros y los parales en sombra
    x.translate(izq ? 18 : 102, 8); x.transform(1, 0, izq ? 0.32 : -0.32, 1, 0, 0); if (!izq) x.scale(-1, 1);
    x.fillStyle = luz(0.34 * nitido + 0.08);
    if (l.gobo === 'arco') { x.beginPath(); x.moveTo(6, 98); x.lineTo(6, 40); x.arc(36, 40, 30, Math.PI, 0); x.lineTo(66, 98); x.fill(); x.fillStyle = sombra(0.16); x.fillRect(34, 10, 4, 88); }
    else { for (const [a, b, c, d] of [[4, 8, 30, 36], [38, 8, 30, 36], [4, 50, 30, 46], [38, 50, 30, 46]]) x.fillRect(a, b, c, d); }
  } else if (l.gobo === 'persiana') {
    x.translate(60, 60); x.rotate(izq ? 0.42 : -0.42);
    x.fillStyle = luz(0.3 * nitido + 0.06);
    for (let y = -90; y < 90; y += 13) x.fillRect(-90, y, 180, 6.5);
  } else if (l.gobo === 'hojas') {
    x.fillStyle = luz(0.2); x.fillRect(0, 0, 120, 150);
    x.strokeStyle = sombra(0.24 * nitido + 0.06); x.lineCap = 'round';
    const hoja = (x0, y0, x1, y1, n) => {
      x.lineWidth = 1.2; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 8, x1, y1); x.stroke();
      x.lineWidth = 2.6;
      for (let i = 1; i < n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * 8, L = 9 * Math.sin(Math.PI * Math.min(1, t + 0.15));
        x.beginPath(); x.moveTo(px, py); x.lineTo(px - L * 0.5, py - L); x.moveTo(px, py); x.lineTo(px + L * 0.6, py + L * 0.3); x.stroke();
      }
    };
    hoja(izq ? -6 : 126, 6, izq ? 44 : 76, 34, 8); hoja(izq ? 128 : -8, 26, izq ? 84 : 36, 50, 7); hoja(izq ? -4 : 124, 84, izq ? 30 : 90, 70, 5);
  } else if (l.gobo === 'foco') {
    const g = x.createRadialGradient(60, 92, 0, 60, 92, 46 + 24 * l.suavidad); g.addColorStop(0, luz(0.5)); g.addColorStop(0.55, luz(0.22)); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 120, 150);
    x.fillStyle = sombra(0.18); x.globalCompositeOperation = 'multiply'; x.fillRect(0, 0, 120, 150);
  } else {
    const g = x.createLinearGradient(izq ? 0 : 120, 0, izq ? 120 : 0, 60); g.addColorStop(0, luz(0.3)); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 120, 150);
  }
  x.restore();
}
function superficieMiniatura(x, s, f) {
  const c = s.color, tam = limitar(s.tamano, 0.6, 2.5), alt = limitar(s.altura, 0.2, 2);
  const lado = (y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, tono(c, -0.1)); g.addColorStop(1, tono(c, -0.22)); return g; };
  const vetas = (cx, cy, rx, ry) => {   // un toque del material: vetas, poros o grano
    x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.clip();
    if (/marmol/.test(s.material)) { x.strokeStyle = s.material === 'marmolNegro' ? 'rgba(235,225,205,.55)' : 'rgba(90,85,80,.35)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(cx - rx, cy - 2); x.bezierCurveTo(cx - 10, cy + 6, cx + 6, cy - 7, cx + rx, cy + 3); x.stroke(); }
    else if (s.material === 'travertino' || s.material === 'arena') { x.fillStyle = 'rgba(80,60,40,.25)'; for (let i = 0; i < 14; i++) x.fillRect(cx - rx + (i * 37 % (2 * rx)), cy - ry + (i * 23 % (2 * ry)), 2, 0.8); }
    else if (s.material === 'madera') { x.strokeStyle = 'rgba(90,60,30,.3)'; x.lineWidth = 0.6; for (let i = -2; i <= 2; i++) { x.beginPath(); x.ellipse(cx, cy + i * 3, rx * 0.9, 1.2, 0, 0, Math.PI * 2); x.stroke(); } }
    else if (s.material === 'acrilico' || s.material === 'terciopelo') { const g = x.createLinearGradient(cx - rx, 0, cx + rx, 0); g.addColorStop(0.2, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.28)'); g.addColorStop(0.8, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - rx, cy - ry, 2 * rx, 2 * ry); }
    x.restore();
  };
  if (s.forma === 'piso') {
    // la joya va directo en el piso: el piso con el color de la superficie y una línea de horizonte suave
    const g = x.createLinearGradient(0, 96, 0, 150); g.addColorStop(0, tono(c, -0.05)); g.addColorStop(1, tono(c, 0.08));
    x.fillStyle = g; x.fillRect(0, 96, 120, 54);
    vetas(60, 124, 70, 26);
    return 112;
  }
  if (s.forma === 'cubo' || s.forma === 'losa' || s.forma === 'cojin') {
    const w = (s.forma === 'losa' ? 44 : 34) * Math.sqrt(tam), h = (s.forma === 'losa' ? 12 : s.forma === 'cojin' ? 16 : 34) * alt, top = 128 - h, d = s.forma === 'cubo' ? 8 : 6;
    const r = s.forma === 'cojin' ? 8 : 1.5;
    x.fillStyle = lado(top, 128); x.beginPath(); x.roundRect(60 - w, top, 2 * w, h + 4, r); x.fill();
    x.fillStyle = tono(c, 0.08); x.beginPath(); x.roundRect(60 - w, top - d, 2 * w, 2 * d, r); x.fill();
    vetas(60, top, w, d);
    return top;
  }
  // cilindro y escalones: elipses con su costado
  const R = 30 * Math.sqrt(tam), ry = 7, alto = 30 * alt;
  const disco = (r, y, h) => {
    x.fillStyle = lado(y, y + h); x.beginPath(); x.ellipse(60, y + h, r, ry * r / R, 0, 0, Math.PI); x.lineTo(60 - r, y); x.ellipse(60, y, r, ry * r / R, 0, Math.PI, 0, true); x.closePath(); x.fill();
    x.fillStyle = tono(c, 0.1); x.beginPath(); x.ellipse(60, y, r, ry * r / R, 0, 0, Math.PI * 2); x.fill();
  };
  if (s.forma === 'escalones') {
    const h = alto * 0.38;
    disco(R * 1.5, 150 - h, h + 4); disco(R * 1.22, 150 - 2 * h, h); disco(R * 0.95, 150 - 3 * h, h);
    vetas(60, 150 - 3 * h, R * 0.95, ry * 0.95);
    return 150 - 3 * h;
  }
  disco(R, 150 - alto, alto + 4);
  vetas(60, 150 - alto, R, ry);
  return 150 - alto;
}

// ---------- El panel ----------
export class PanelEscena {
  constructor(contenedor, { estudio = null, alCambiar = null } = {}) {
    this.cont = contenedor; this.estudio = estudio; this.alCambiar = alCambiar;
    this.cfg = normalizarEscena(estudio?.escena3D ?? 'ninguna');
    this.pendiente = null; this.ultimoAviso = 0;
    contenedor.classList.add('pes');
    contenedor.innerHTML = this.html();
    this.ranuraLiso = contenedor.querySelector('[data-ranura=liso]');   // main.js pone aquí «Fondo» y «Sombra bajo la pieza»
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alMover(e, false));
    contenedor.addEventListener('change', e => this.alMover(e, true));
    this.render();
  }

  // La escena de ahora (copia: cambiarla no toca el panel)
  get valor() { return copia(this.cfg); }
  // Cambio desde afuera (chat, deshacer, abrir un proyecto): no se avisa con alCambiar
  poner(cfg) { this.cfg = normalizarEscena(cfg); clearTimeout(this.pendiente); this.pendiente = null; this.render(); }
  // Durante la exportación la escena queda congelada
  bloquear(si) { for (const f of this.cont.querySelectorAll('fieldset')) f.disabled = !!si; }

  html() {
    const rango = (grupo, campo, txt, min, max, paso) => `<label class="rango"><span>${txt}</span><input type="range" data-grupo="${grupo}" data-campo="${campo}" min="${min}" max="${max}" step="${paso}"><output data-salida="${grupo}-${campo}"></output></label>`;
    const fichas = (grupo, campo, lista) => `<div class="pes-chips" role="group">${Object.entries(lista).map(([k, n]) => `<button type="button" data-grupo="${grupo}" data-campo="${campo}" data-v="${k}" aria-pressed="false">${svg(k)}<span>${esc(n)}</span></button>`).join('')}</div>`;
    const colores = grupo => `<div class="pes-colores">
        <label class="pes-color" title="Otro color"><input type="color" data-grupo="${grupo}" data-campo="color" aria-label="Color"></label>
        ${MUESTRAS.map(([c, n]) => `<button type="button" class="pes-muestra" data-grupo="${grupo}" data-campo="color" data-v="${c}" style="--c:${c}" title="${n}" aria-label="${n}" aria-pressed="false"></button>`).join('')}
      </div>`;
    const materiales = grupo => `<select data-grupo="${grupo}" data-campo="material" aria-label="Material">${Object.entries(MATERIALES_ESCENA).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>`;
    return `
      <section class="pes-bloque">
        <div class="pes-cab"><h3>Escena</h3><span class="pes-ayuda">Dónde se apoya la joya, el fondo y cómo le llega la luz</span></div>
        <fieldset class="pes-campos">
          <legend class="vh">Escenas listas</legend>
          <div class="pes-galeria" role="group" aria-label="Escenas listas">
            ${Object.entries(ESCENAS).map(([id, e]) => `<button type="button" class="pes-ficha" data-escena="${id}" aria-pressed="false" title="${esc(e.descripcion)}"><span class="pes-marco"><canvas class="pes-mini" width="240" height="300" aria-hidden="true"></canvas><i class="pes-ajustada" hidden>Ajustada</i></span><b>${esc(e.nombre)}</b></button>`).join('')}
          </div>
        </fieldset>
        <div class="pes-liso" data-ranura="liso" hidden><p class="pes-ayuda">Sin superficie: la joya flota sobre el degradado de la marca, con su sombra suave.</p></div>
      </section>
      <details class="pes-bloque pes-personalizar" data-personalizar>
        <summary><span>Personalizar</span><span class="pes-ayuda" data-resumen></span></summary>
        <fieldset class="pes-campos">
          <legend class="vh">Personalizar la escena</legend>
          <div class="pes-grupo">
            <h4>Superficie</h4>
            ${fichas('superficie', 'forma', FORMAS_SUPERFICIE)}
            <div class="grid2 pes-par"><label>Material${materiales('superficie')}</label><div class="campo"><span class="et">Color</span>${colores('superficie')}</div></div>
            <div class="grid2">${rango('superficie', 'tamano', 'Ancho', RANGOS.tamano.min, RANGOS.tamano.max, 0.05)}${rango('superficie', 'altura', 'Alto', RANGOS.altura.min, RANGOS.altura.max, 0.05)}</div>
          </div>
          <div class="pes-grupo">
            <h4>Fondo</h4>
            ${fichas('fondo', 'forma', FORMAS_FONDO)}
            <div class="grid2 pes-par"><label>Material${materiales('fondo')}</label><div class="campo"><span class="et">Color</span>${colores('fondo')}</div></div>
            ${rango('fondo', 'distancia', 'Distancia del fondo', RANGOS.distancia.min, RANGOS.distancia.max, 0.05)}
          </div>
          <div class="pes-grupo">
            <h4>Luz</h4>
            ${fichas('luz', 'gobo', GOBOS)}
            <div class="grid2">
              ${rango('luz', 'angulo', 'De dónde viene', -90, 90, 1)}${rango('luz', 'elevacion', 'Altura de la luz', RANGOS.elevacion.min, RANGOS.elevacion.max, 1)}
              ${rango('luz', 'suavidad', 'Suavidad de las sombras', 0, 1, 0.01)}${rango('luz', 'intensidad', 'Intensidad', RANGOS.intensidad.min, RANGOS.intensidad.max, 0.01)}
              ${rango('luz', 'calidez', 'Calidez', RANGOS.calidez.min, RANGOS.calidez.max, 0.01)}${rango('escena', 'ambiente', 'Relleno (luz del estudio)', RANGOS.ambiente.min, RANGOS.ambiente.max, 0.01)}
            </div>
          </div>
          <div class="pes-pie"><p class="pes-ayuda" data-base></p><button type="button" class="btn sec chico" data-accion="reiniciar">${svg('reiniciar')}Volver a la escena lista</button></div>
        </fieldset>
      </details>`;
  }

  // ---------- Eventos ----------
  alClic(e) {
    const ficha = e.target.closest('[data-escena]');
    if (ficha) {
      const id = ficha.dataset.escena;
      // la tarjeta de la escena de ahora (ajustada) no la reinicia: para eso está «Volver a la escena lista»
      if (id === (this.cfg.base || this.cfg.id)) return;
      this.cfg = escenaDe(id); this.render(); this.avisar(true);
      return;
    }
    if (e.target.closest('[data-accion=reiniciar]')) { this.cfg = escenaDe(this.cfg.base || this.cfg.id); this.render(); this.avisar(true); return; }
    const b = e.target.closest('button[data-grupo][data-v]');
    if (b) this.cambiar(b.dataset.grupo, b.dataset.campo, b.dataset.v, true);
  }
  alMover(e, final) {
    const c = e.target.closest('input[data-grupo], select[data-grupo]');
    if (!c) return;
    const v = c.type === 'range' ? +c.value : c.value;
    this.cambiar(c.dataset.grupo, c.dataset.campo, v, final || c.tagName === 'SELECT');
  }
  cambiar(grupo, campo, v, final) {
    if (this.cfg.id === 'ninguna') return;
    const n = copia(this.cfg);
    if (grupo === 'escena') n[campo] = v; else n[grupo][campo] = campo === 'color' ? String(v).toUpperCase() : v;
    this.cfg = normalizarEscena(n);
    this.render(); this.avisar(final);
  }
  // Mientras se arrastra un deslizador se avisa como mucho cada 90 ms (rehacer texturas o la ventana cuesta unas décimas)
  avisar(final) {
    const ahora = performance.now(), enviar = () => { this.pendiente = null; this.ultimoAviso = performance.now(); this.alCambiar?.(this.valor); };
    clearTimeout(this.pendiente); this.pendiente = null;
    if (final || ahora - this.ultimoAviso > 90) enviar();
    else this.pendiente = setTimeout(enviar, 90 - (ahora - this.ultimoAviso));
  }

  // ---------- Dibujo ----------
  render() {
    const c = this.cfg, ninguna = c.id === 'ninguna', idBase = c.base || c.id, cont = this.cont;
    for (const f of cont.querySelectorAll('[data-escena]')) {
      const id = f.dataset.escena, sel = id === idBase;
      f.setAttribute('aria-pressed', String(sel));
      f.querySelector('.pes-ajustada').hidden = !(sel && c.id === 'personalizada');
      // la tarjeta elegida muestra la escena tal como quedó (con los ajustes); las demás, la escena lista
      const cfgMini = sel ? c : (id === 'ninguna' ? { id } : escenaDe(id)), clave = JSON.stringify(cfgMini), lz = f.querySelector('canvas');
      if (lz.dataset.dibujo !== clave) { dibujarMiniatura(lz, cfgMini); lz.dataset.dibujo = clave; }
    }
    cont.querySelector('[data-ranura=liso]').hidden = !ninguna;
    const det = cont.querySelector('[data-personalizar]');
    det.hidden = ninguna;
    if (ninguna) return;
    const valor = (g, k) => (g === 'escena' ? c[k] : c[g][k]);
    for (const b of cont.querySelectorAll('button[data-grupo][data-v]')) {
      const g = b.dataset.grupo, k = b.dataset.campo;
      b.setAttribute('aria-pressed', String(String(valor(g, k)).toUpperCase() === String(b.dataset.v).toUpperCase()));
    }
    for (const el of cont.querySelectorAll('input[data-grupo], select[data-grupo]')) {
      const g = el.dataset.grupo, k = el.dataset.campo, v = valor(g, k);
      if (el.type === 'range') {
        const r = k === 'angulo' ? limitar(v, -90, 90) : v;
        if (+el.value !== r && document.activeElement !== el) el.value = r;
        const o = cont.querySelector(`[data-salida="${g}-${k}"]`); if (o) o.textContent = texto(k, v);
        // sin pedestal no hay ancho ni alto que tocar
        el.disabled = g === 'superficie' && c.superficie.forma === 'piso';
      } else if (el.type === 'color') { if (el.value.toUpperCase() !== v) el.value = v.toLowerCase(); }
      else if (el.value !== v) el.value = v;
    }
    const base = ESCENAS[idBase];
    cont.querySelector('[data-resumen]').textContent = `${FORMAS_SUPERFICIE[c.superficie.forma]} · ${MATERIALES_ESCENA[c.superficie.material]} · ${GOBOS[c.luz.gobo]}`;
    cont.querySelector('[data-base]').textContent = c.id === 'personalizada' ? `Ajustada a partir de «${base.nombre}».` : `Es la escena «${base.nombre}» tal cual.`;
    cont.querySelector('[data-accion=reiniciar]').disabled = c.id !== 'personalizada';
  }
}

// Texto de cada deslizador
function texto(k, v) {
  const n = (x, d = 0) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (k === 'angulo') { const a = Math.round(v); return Math.abs(a) < 4 ? 'De frente' : `${n(Math.min(90, Math.abs(a)))}° ${a < 0 ? 'izq.' : 'der.'}`; }
  if (k === 'elevacion') return `${n(v)}°`;
  if (k === 'suavidad') return v < 0.2 ? 'Dura' : v < 0.55 ? 'Media' : 'Muy suave';
  if (k === 'calidez') return Math.abs(v) < 0.12 ? 'Neutra' : v < 0 ? 'Fría' : 'Cálida';
  if (k === 'intensidad' || k === 'ambiente') return `${n(v * 100)} %`;
  return `×${n(v, 2)}`;
}
