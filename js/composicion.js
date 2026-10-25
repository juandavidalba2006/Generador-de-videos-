// Composición de cada cuadro: fondo de marca, sombra de contacto, la joya y las capas de texto del proyecto.
import { dibujarTextos, marcoSeleccion } from './textos.js';

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

export async function cargarFuentes() {
  try {
    await Promise.all([
      document.fonts.load(`500 40px 'Bodoni Moda'`), document.fonts.load(`italic 400 40px 'Bodoni Moda'`), document.fonts.load(`400 40px 'Bodoni Moda'`), document.fonts.load(`600 40px 'Bodoni Moda'`),
      document.fonts.load(`500 20px 'Instrument Sans'`), document.fonts.load(`400 20px 'Instrument Sans'`), document.fonts.load(`600 20px 'Instrument Sans'`),
    ]);
  } catch (e) { /* si no cargan, el lienzo usa las fuentes de respaldo */ }
}

// sRGB (0..255) → lineal, para medir la luminancia relativa del cuadro
const LINEAL = Float32Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });

export class Compositor {
  constructor(lienzo) { this.lienzo = lienzo; this.ctx = lienzo.getContext('2d'); this.capa = document.createElement('canvas'); this.cache = {}; this.tonos = new Map(); }

  // Con escena 3D: lo que hay detrás de cada texto en el cuadro (el render ya hecho, sin textos), en una grilla chica de
  // luminancia. La tarjeta achica el cuadro y solo se lee la grilla (leer el cuadro entero en cada cuadro cuesta).
  // medir(caja) da los percentiles 10 y 90 detrás de la caja; memoria guarda el tono elegido de cada capa (ver textos.js)
  fondoTextos(render3D, W, H) {
    const gw = Math.min(W, 120), gh = Math.max(1, Math.round(H * gw / W));
    const a = this.grilla || (this.grilla = document.createElement('canvas')), b = this.grillaLeida || (this.grillaLeida = document.createElement('canvas'));
    for (const c of [a, b]) if (c.width !== gw || c.height !== gh) { c.width = gw; c.height = gh; }
    const xa = a.getContext('2d'), xb = b.getContext('2d', { willReadFrequently: true });
    xa.imageSmoothingEnabled = true; xa.imageSmoothingQuality = 'medium';
    xa.clearRect(0, 0, gw, gh); xa.drawImage(render3D, 0, 0, gw, gh);
    xb.clearRect(0, 0, gw, gh); xb.drawImage(a, 0, 0);
    const d = xb.getImageData(0, 0, gw, gh).data, L = new Float32Array(gw * gh);
    // (un píxel transparente no dice nada de lo que hay detrás: no cuenta)
    for (let i = 0; i < L.length; i++) L[i] = d[4 * i + 3] < 200 ? -1 : 0.2126 * LINEAL[d[4 * i]] + 0.7152 * LINEAL[d[4 * i + 1]] + 0.0722 * LINEAL[d[4 * i + 2]];
    if (this.tonos.size > 64) this.tonos.clear();   // (capas sin id fijo: no se acumulan)
    const kx = gw / W, ky = gh / H;
    return {
      memoria: this.tonos,
      medir: caja => {
        const x0 = Math.max(0, Math.floor(caja.x * kx)), x1 = Math.min(gw - 1, Math.ceil((caja.x + caja.w) * kx) - 1);
        const y0 = Math.max(0, Math.floor(caja.y * ky)), y1 = Math.min(gh - 1, Math.ceil((caja.y + caja.h) * ky) - 1);
        if (x1 < x0 || y1 < y0) return null;   // la caja quedó fuera del cuadro
        const v = [];
        let n = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++, n++) if (L[y * gw + x] >= 0) v.push(L[y * gw + x]);
        if (v.length < n / 2) return null;   // casi todo transparente: manda el tono de la escena
        v.sort((p, q) => p - q);
        return { bajo: v[Math.floor((v.length - 1) * 0.1)], alto: v[Math.ceil((v.length - 1) * 0.9)] };
      },
    };
  }

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

  // Dibuja el cuadro completo. render3D: lienzo WebGL; mascara: silueta (solo en el render final con trazado de rayos).
  // capas: los textos del proyecto; t: segundo del video (null = todos quietos y completos); seleccion: capa con marco (solo vista previa)
  // opaco: el render 3D trae su propia escena (pedestal y fondo) y cubre todo: no van el fondo de marca ni la sombra 2D.
  // oscuro: si se da, decide el color de los textos (con escena lo dice la escena); si no, el del fondo de marca.
  // Con escena, ese es solo el tono preferido: cada texto «auto» se ajusta a lo que tiene detrás en el cuadro
  cuadro({ fondo, render3D, sombra, intensidadSombra = 1, mascara = null, capas = [], t = null, duracion, seleccion = null, opaco = false, oscuro = null }) {
    const ctx = this.ctx, W = this.lienzo.width, H = this.lienzo.height, f = FONDOS[fondo] || FONDOS.perla;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (opaco) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }   // (nunca debería verse: la escena cubre todo el cuadro)
    else ctx.drawImage(this.fondo(fondo), 0, 0);
    if (!opaco && sombra && intensidadSombra > 0) {
      const capa = this.capa; capa.width = W; capa.height = H; const c = capa.getContext('2d');
      c.save(); c.translate(sombra.x, sombra.y); c.rotate(sombra.ang || 0); c.scale(1, sombra.ry / sombra.rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, sombra.rx * 1.25), a = f.sombra * intensidadSombra;
      g.addColorStop(0, `rgba(12,9,4,${a})`); g.addColorStop(0.35, `rgba(12,9,4,${a * 0.55})`); g.addColorStop(1, 'rgba(12,9,4,0)');
      c.fillStyle = g; c.fillRect(-sombra.rx * 1.3, -sombra.rx * 1.3, sombra.rx * 2.6, sombra.rx * 2.6); c.restore();
      if (mascara) { c.globalCompositeOperation = 'destination-out'; c.drawImage(mascara, 0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
      ctx.drawImage(capa, 0, 0);
    }
    if (render3D) ctx.drawImage(render3D, 0, 0, W, H);
    const fondoTextos = opaco && render3D && capas?.some(c => c && !c.oculta) ? this.fondoTextos(render3D, W, H) : null;
    dibujarTextos(ctx, capas, { W, H, t, oscuro: typeof oscuro === 'boolean' ? oscuro : f.oscuro, duracion, fondo: fondoTextos });
    if (seleccion) marcoSeleccion(ctx, seleccion, { W, H });
  }
}

function mezclar(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
