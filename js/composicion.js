// Composición de cada cuadro: fondo de marca, sombra de contacto, la joya y los textos de Atelier & Co.
import { logoPath, LOGO_W, LOGO_H } from './marca.js';

export const FONDOS = {
  perla:     { nombre: 'Perla',       centro: '#FCFBF8', borde: '#E2DCCF', oscuro: false, sombra: 0.30 },
  arena:     { nombre: 'Oro suave',   centro: '#FBF3E0', borde: '#E3CC98', oscuro: false, sombra: 0.28 },
  rosa:      { nombre: 'Rosa empolvado', centro: '#F7ECEC', borde: '#D9B6B9', oscuro: false, sombra: 0.26 },
  bosque:    { nombre: 'Bosque',      centro: '#2E2A21', borde: '#0E0D0A', oscuro: true,  sombra: 0.55, halo: 'rgba(196,144,34,.16)' },
  esmeralda: { nombre: 'Esmeralda',   centro: '#2A6B59', borde: '#0A2620', oscuro: true,  sombra: 0.5,  halo: 'rgba(255,240,210,.10)' },
  granate:   { nombre: 'Granate',     centro: '#8E2F3A', borde: '#2A0C11', oscuro: true,  sombra: 0.5,  halo: 'rgba(255,220,200,.10)' },
  noche:     { nombre: 'Negro estudio', centro: '#26241F', borde: '#030303', oscuro: true, sombra: 0.6, halo: 'rgba(255,255,255,.07)' },
};

export const FORMATOS = {
  reel:     { nombre: 'Reel / Historia 9:16', w: 1080, h: 1920 },
  post:     { nombre: 'Publicación 4:5',      w: 1080, h: 1350 },
  cuadrado: { nombre: 'Cuadrado 1:1',         w: 1080, h: 1080 },
  catalogo: { nombre: 'Catálogo 16:9',        w: 1920, h: 1080 },
};

const SERIF = "'Bodoni Moda', Didot, 'Times New Roman', serif";
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export async function cargarFuentes() {
  try {
    await Promise.all([
      document.fonts.load(`500 40px 'Bodoni Moda'`), document.fonts.load(`italic 400 40px 'Bodoni Moda'`), document.fonts.load(`400 40px 'Bodoni Moda'`),
      document.fonts.load(`500 20px 'Instrument Sans'`), document.fonts.load(`400 20px 'Instrument Sans'`),
    ]);
  } catch (e) { /* si no cargan, el lienzo usa las fuentes de respaldo */ }
}

const facil = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Compositor {
  constructor(lienzo) { this.lienzo = lienzo; this.ctx = lienzo.getContext('2d'); this.capa = document.createElement('canvas'); this.cache = {}; }

  tamano(w, h) { if (this.lienzo.width !== w || this.lienzo.height !== h) { this.lienzo.width = w; this.lienzo.height = h; } this.cache = {}; }

  fondo(clave) {
    const W = this.lienzo.width, H = this.lienzo.height, k = clave + W + 'x' + H;
    if (this.cache.fondo?.k === k) return this.cache.fondo.c;
    const f = FONDOS[clave] || FONDOS.perla, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = f.borde; x.fillRect(0, 0, W, H);
    // luz de estudio: un óvalo claro detrás de la pieza que se apaga hacia los bordes
    x.save(); x.translate(W / 2, H * 0.44); x.scale(1, H > W ? 1.25 : 0.9);
    const R = Math.hypot(W, H) * 0.55, g = x.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, f.centro); g.addColorStop(0.45, mezclar(f.centro, f.borde, 0.35)); g.addColorStop(1, f.borde);
    x.fillStyle = g; x.fillRect(-W, -H, W * 2, H * 2); x.restore();
    if (f.halo) { const h = x.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.min(W, H) * 0.5); h.addColorStop(0, f.halo); h.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = h; x.fillRect(0, 0, W, H); }
    // grano muy fino para que el degradado no se vea "escalonado" en Instagram
    const img = x.getImageData(0, 0, W, H), d = img.data;
    let s = 1234567;
    for (let i = 0; i < d.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = ((s >> 16) & 7) - 3.5; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    this.cache.fondo = { k, c };
    return c;
  }

  // Dibuja el cuadro completo. render3D: lienzo WebGL; mascara: silueta (solo en el render final con trazado de rayos)
  cuadro({ fondo, render3D, sombra, intensidadSombra = 1, mascara = null, textos, t }) {
    const ctx = this.ctx, W = this.lienzo.width, H = this.lienzo.height, f = FONDOS[fondo] || FONDOS.perla;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(this.fondo(fondo), 0, 0);
    if (sombra && intensidadSombra > 0) {
      const capa = this.capa; capa.width = W; capa.height = H; const c = capa.getContext('2d');
      c.save(); c.translate(sombra.x, sombra.y); c.scale(1, sombra.ry / sombra.rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, sombra.rx * 1.25), a = f.sombra * intensidadSombra;
      g.addColorStop(0, `rgba(12,9,4,${a})`); g.addColorStop(0.35, `rgba(12,9,4,${a * 0.55})`); g.addColorStop(1, 'rgba(12,9,4,0)');
      c.fillStyle = g; c.fillRect(-sombra.rx * 1.3, -sombra.rx * 1.3, sombra.rx * 2.6, sombra.rx * 2.6); c.restore();
      if (mascara) { c.globalCompositeOperation = 'destination-out'; c.drawImage(mascara, 0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
      ctx.drawImage(capa, 0, 0);
    }
    if (render3D) ctx.drawImage(render3D, 0, 0, W, H);
    if (textos?.mostrar) this.textos(textos, f.oscuro, t);
  }

  // Posiciones de los textos según el formato (las usa también la cámara para no tapar los textos con la joya)
  static disposicion(W, H, tx) {
    const u = Math.min(W, H) / 1080, vertical = H / W > 1.5, apaisado = W > H;
    const x = apaisado ? W * 0.065 : W / 2, alinear = apaisado ? 'left' : 'center';
    const marca = { y: vertical ? H * 0.085 : H * 0.07, lh: 64 * u };
    const tamNombre = (vertical ? 76 : 64) * u;
    const base = vertical ? H * 0.80 : H * 0.905;
    const pie = vertical ? H * 0.865 : H - 34 * u;
    let arriba = 0.03, abajo = 0.97;
    if (tx?.mostrar && !apaisado) {
      arriba = (marca.y + marca.lh + 80 * u + 34 * u) / H;
      if (tx.nombre || tx.detalle || tx.precio) {
        let y = base; if (tx.precio) y -= 62 * u; if (tx.detalle) y -= 44 * u; y -= 30 * u; if (tx.nombre) y -= tamNombre * 0.78;
        abajo = (y - 34 * u) / H;
      } else if (tx.pie) abajo = (pie - 19 * u - 34 * u) / H;
    }
    return { u, vertical, apaisado, x, alinear, marca, tamNombre, base, pie, arriba, abajo };
  }

  textos(tx, oscuro, t = 99) {
    const ctx = this.ctx, W = this.lienzo.width, H = this.lienzo.height;
    const D = Compositor.disposicion(W, H, tx), u = D.u, x = D.x;
    const tinta = oscuro ? '#FFFFFF' : '#1E1B15', tinta2 = oscuro ? 'rgba(244,241,234,.78)' : '#5E5A50', oro = oscuro ? '#D9A83A' : '#B8871F';
    const aparece = (desde, dur = 0.9) => tx.animar ? facil((t - desde) / dur) : 1;
    ctx.textAlign = D.alinear; ctx.textBaseline = 'alphabetic';

    // ----- Marca arriba: escarabajo + ATELIER&CO + "joyería de alta calidad" -----
    const aM = aparece(0.1, 1.1);
    if (aM > 0) {
      ctx.save(); ctx.globalAlpha = aM;
      const yTop = D.marca.y, lh = D.marca.lh, lw = lh * LOGO_W / LOGO_H;
      ctx.save(); ctx.translate(D.apaisado ? x : x - lw / 2, yTop + (1 - aM) * 10 * u); ctx.scale(lh / LOGO_H, lh / LOGO_H); ctx.fillStyle = '#C49022'; ctx.fill(logoPath, 'evenodd'); ctx.restore();
      ctx.fillStyle = tinta; ctx.font = `400 ${34 * u}px ${SERIF}`;
      espaciado(ctx, 'ATELIER&CO', x, yTop + lh + 46 * u, 0.12 * 34 * u);
      ctx.fillStyle = oro; ctx.font = `italic 400 ${22 * u}px ${SERIF}`;
      ctx.fillText('joyería de alta calidad', x, yTop + lh + 80 * u);
      ctx.restore();
    }

    // ----- Nombre de la pieza y detalles abajo -----
    const aN = aparece(0.7, 1.0);
    if (aN > 0 && (tx.nombre || tx.detalle || tx.precio)) {
      ctx.save(); ctx.globalAlpha = aN; const sube = (1 - aN) * 24 * u;
      let y = D.base + sube;
      if (tx.precio) { ctx.fillStyle = tinta; ctx.font = `500 ${40 * u}px ${SERIF}`; ctx.fillText(tx.precio, x, y); y -= 62 * u; }
      if (tx.detalle) { ctx.fillStyle = tinta2; ctx.font = `500 ${21 * u}px ${SANS}`; espaciado(ctx, tx.detalle.toUpperCase(), x, y, 0.16 * 21 * u); y -= 44 * u; }
      // línea dorada fina, como el filete bajo la marca en la página
      const ancho = 120 * u * aN; ctx.fillStyle = oro; ctx.globalAlpha = aN * 0.9; ctx.fillRect(D.apaisado ? x : x - ancho / 2, y, ancho, Math.max(1, 1.5 * u)); ctx.globalAlpha = aN;
      y -= 30 * u;
      if (tx.nombre) {
        ctx.fillStyle = tinta; let tam = D.tamNombre; ctx.font = `500 ${tam}px ${SERIF}`;
        const max = D.apaisado ? W * 0.34 : W * 0.86;
        while (ctx.measureText(tx.nombre).width > max && tam > 24 * u) { tam -= 2 * u; ctx.font = `500 ${tam}px ${SERIF}`; }
        ctx.fillText(tx.nombre, x, y);
      }
      ctx.restore();
    }
    const aP = aparece(1.3, 1.0);
    if (aP > 0 && tx.pie) {
      ctx.save(); ctx.globalAlpha = aP * 0.9; ctx.fillStyle = tinta2; ctx.font = `400 ${19 * u}px ${SANS}`;
      if (D.apaisado) { ctx.textAlign = 'right'; espaciado(ctx, tx.pie, W - x, D.pie, 0.06 * 19 * u); }
      else espaciado(ctx, tx.pie, x, D.pie, 0.06 * 19 * u);
      ctx.restore();
    }
  }
}

function espaciado(ctx, texto, x, y, sep) {
  const al = ctx.textAlign;
  if ('letterSpacing' in ctx) { const prev = ctx.letterSpacing; ctx.letterSpacing = `${sep}px`; ctx.fillText(texto, x + (al === 'center' ? sep / 2 : al === 'right' ? sep : 0), y); ctx.letterSpacing = prev; return; }
  const total = [...texto].reduce((s, c) => s + ctx.measureText(c).width, 0) + sep * (texto.length - 1);
  let cx = al === 'center' ? x - total / 2 : al === 'right' ? x - total : x; ctx.textAlign = 'left';
  for (const c of texto) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sep; }
  ctx.textAlign = al;
}

function mezclar(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
