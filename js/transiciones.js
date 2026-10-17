// Transiciones de los cortes: flash blanco, fundido a negro y barrido. Se dibujan encima del cuadro ya compuesto
// (fondo, joya y textos), en la vista previa y al exportar. Es 2D puro (canvas): no sabe nada de three.js.
// main.js, después de componer cada cuadro: const e = efectoTransicion(proyecto.cortes, t, fps); if (e) dibujarTransicion(ctx, W, H, e, lienzo)
export { TRANSICIONES } from './proyecto.js';

// Cuánto dura cada una antes y después del corte (s). El corte seco no tiene nada que dibujar.
export const TIEMPOS_TRANSICION = {
  flash:   { antes: 0.04, despues: 0.15 },   // un destello que revienta en el primer cuadro del plano nuevo y se apaga rápido
  negro:   { antes: 0.12, despues: 0.12 },   // baja a negro y vuelve
  barrido: { antes: 0.08, despues: 0.08 },   // un latigazo de cámara: la imagen se barre hacia un lado
};

const suave = s => s * s * (3 - 2 * s);
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));

// Qué transición se ve en el instante t: null | { tipo, fuerza (0..1), fase: 'antes' | 'despues', t (el del corte) }.
// fps: con él, el pico cae en el primer cuadro que ya muestra el plano nuevo (al exportar, los cuadros caen en n / fps).
// Si dos cortes están muy juntos, gana el más fuerte.
export function efectoTransicion(cortes, t, fps = 30) {
  if (!Array.isArray(cortes) || !cortes.length || !Number.isFinite(t)) return null;
  const f = Number.isFinite(fps) && fps > 0 ? fps : 30;
  let mejor = null;
  for (const c of cortes) {
    const T = TIEMPOS_TRANSICION[c?.transicion];
    if (!T || !Number.isFinite(c.t)) continue;
    if (t < c.t - T.antes || t > c.t + T.despues + 1 / f) continue;
    const primero = Math.ceil(c.t * f - 1e-6) / f;   // el primer cuadro después del corte
    let fuerza = 0, fase;
    if (t < c.t) {
      fase = 'antes';
      const s = limitar(1 - (c.t - t) / T.antes, 0, 1);
      fuerza = c.transicion === 'flash' ? 0.45 * s * s : suave(s);
    } else {
      fase = 'despues';
      const u = limitar(Math.max(0, t - primero) / T.despues, 0, 1);
      fuerza = c.transicion === 'flash' ? (1 - u) * (1 - u) : suave(1 - u);
    }
    if (fuerza > 0.002 && (!mejor || fuerza > mejor.fuerza)) mejor = { tipo: c.transicion, fuerza: Math.round(fuerza * 1e4) / 1e4, fase, t: c.t };
  }
  return mejor;
}

// Lienzos de trabajo (se reutilizan): para leer el cuadro sin dibujarlo sobre sí mismo y para armar el barrido a media resolución
const lienzos = {};
function lienzo(nombre, w, h) {
  let c = lienzos[nombre];
  if (!c || c.width !== w || c.height !== h) {
    c = lienzos[nombre] = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  return c;
}
function copia(fuente, w, h) {
  const c = lienzo('copia', w, h), x = c.getContext('2d');
  x.globalCompositeOperation = 'copy';
  x.drawImage(fuente, 0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  return c;
}

// Dibuja la transición encima de lo que ya tiene ctx (W × H). fuenteCanvas: el cuadro compuesto (puede ser el mismo lienzo
// de ctx); el flash y el barrido lo necesitan, el negro no.
export function dibujarTransicion(ctx, W, H, efecto, fuenteCanvas) {
  if (!ctx || !efecto || !(efecto.fuerza > 0.002) || !(W > 0) || !(H > 0)) return;
  const f = limitar(efecto.fuerza, 0, 1), fuente = fuenteCanvas || ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (efecto.tipo === 'negro') {
    ctx.fillStyle = `rgba(8, 7, 5, ${f})`;   // casi negro, con un punto cálido como la tinta de la marca
    ctx.fillRect(0, 0, W, H);
  } else if (efecto.tipo === 'flash') {
    // primero sobreexpone la imagen (se ve el brillo de la joya reventar) y luego la cubre de blanco
    if (fuente) {
      const img = copia(fuente, Math.max(2, Math.round(W / 2)), Math.max(2, Math.round(H / 2)));   // a media resolución: queda como un resplandor
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = f * 0.8;
      ctx.drawImage(img, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 253, 248, ${Math.min(1, Math.pow(f, 1.3) * 0.97)})`;
    ctx.fillRect(0, 0, W, H);
  } else if (efecto.tipo === 'barrido' && fuente) {
    // promedio de varias copias corridas a lo ancho (a media resolución: el barrido borra el detalle igual), un poco más
    // grande para que el corrimiento no deje bordes vacíos
    const w = Math.max(2, Math.round(W / 2)), h = Math.max(2, Math.round(H / 2));
    const img = copia(fuente, w, h), acum = lienzo('barrido', w, h), ax = acum.getContext('2d');
    const s = f * 0.2 * w, n = Math.round(4 + 8 * f), k = 1 + s / w, ancho = w * k, alto = h * k, y0 = (h - alto) / 2;
    ax.globalCompositeOperation = 'source-over';
    ax.imageSmoothingEnabled = true;
    for (let i = 0; i < n; i++) {
      ax.globalAlpha = 1 / (i + 1);   // así todas las copias pesan lo mismo
      ax.drawImage(img, (w - ancho) / 2 + s * (i / Math.max(1, n - 1) - 0.5), y0, ancho, alto);
    }
    ax.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(acum, 0, 0, W, H);
    // un velo claro muy leve, como la luz que se arrastra en un barrido real
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 252, 244, ${0.06 * f})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
