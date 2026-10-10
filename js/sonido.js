// Generador de sonidos para reels: efectos y música hechos con síntesis en el navegador (Web Audio).
// Nada se graba ni se descarga (no hay derechos de autor de por medio) y cada sonido sale igual siempre:
// el "azar" usa semillas fijas.
import { evaluar } from './proyecto.js';

export const FRECUENCIA = 48000;
const TECHO = 0.85;          // pico máximo de la mezcla final (≈ -1,4 dBFS): deja margen para la compresión de Instagram
const REF_MUSICA = -8.2;     // LUFS de la música con el volumen al 100 % (con el 55 % de fábrica la mezcla queda cerca de -14 LUFS)
const REF_EFECTO = -7.5;     // LUFS momentáneos (los 400 ms más fuertes) de cada efecto con el volumen al 100 %: sobresale de la música
const PICO_EFECTO = 1;       // y sin pasar de 0 dBFS (el limitador del master se encarga del resto)

const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const esNum = x => typeof x === 'number' && Number.isFinite(x);
const esObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const dB = x => 10 ** (x / 20);
const hz = m => 440 * 2 ** ((m - 69) / 12);
const r4 = x => Math.round(x * 1e4) / 1e4;

// Números pseudoaleatorios con semilla (mulberry32): el mismo sonido cada vez que se mezcla
function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Piezas de síntesis ----------
const recursos = new WeakMap();   // por contexto: ruidos, respuestas de sala y ondas ya creadas
const rec = ctx => { let r = recursos.get(ctx); if (!r) recursos.set(ctx, r = { ruido: {}, ir: {}, ondas: {} }); return r; };

// Ruido estéreo de 4 s (cada canal distinto: suena ancho) que se repite sin costura
function ruido(ctx, tipo = 'blanco') {
  const R = rec(ctx);
  if (R.ruido[tipo]) return R.ruido[tipo];
  const sr = ctx.sampleRate, n = sr * 4, x = Math.round(sr * 0.02), b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const a = azar(tipo.length * 977 + c * 131 + 7), d = new Float32Array(n + x);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, m = 0;
    for (let i = 0; i < n + x; i++) {
      const w = a() * 2 - 1;
      if (tipo === 'rosa') {   // filtro de Paul Kellet: -3 dB por octava, como el aire
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else if (tipo === 'marron') { m = (m + 0.02 * w) / 1.02; d[i] = m * 3.5; }
      else d[i] = w * 0.5;
    }
    // el principio se funde con la continuación del final: al dar la vuelta no hay clic
    const o = b.getChannelData(c);
    o.set(d.subarray(0, n));
    for (let i = 0; i < x; i++) { const u = i / x; o[i] = d[i] * u + d[n + i] * (1 - u); }
  }
  return (R.ruido[tipo] = b);
}

function fuenteRuido(ctx, tipo, t, dur, semilla = 0) {
  const s = ctx.createBufferSource();
  s.buffer = ruido(ctx, tipo); s.loop = true;
  s.start(t, (semilla * 0.6180339) % 3.9); s.stop(t + dur);
  return s;
}
function filtro(ctx, tipo, f, q = 0.707) { const b = ctx.createBiquadFilter(); b.type = tipo; b.frequency.value = f; b.Q.value = q; return b; }
function gan(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function panear(ctx, p) { const s = ctx.createStereoPanner(); s.pan.value = p; return s; }
function oscilador(ctx, tipo, f, t, fin, desafine = 0) {
  const o = ctx.createOscillator();
  if (typeof tipo === 'string') o.type = tipo; else o.setPeriodicWave(tipo);
  o.frequency.value = f; o.detune.value = desafine;
  o.start(t); o.stop(fin);
  return o;
}
const conectar = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

// Golpe percusivo: sube en `ataque` y cae exponencialmente (tau = segundos hasta ~37 %)
function golpe(param, t, pico, tau, ataque = 0.002) {
  param.setValueAtTime(0, t); param.linearRampToValueAtTime(pico, t + ataque); param.setTargetAtTime(0, t + ataque, tau);
}
// Lo mismo sobre un VCA compartido (muchos golpes en el mismo parámetro): sin saltos a cero, así no hay clics
function pegar(param, t, v, tau, ataque = 0.0008) { param.setTargetAtTime(v, t, ataque); param.setTargetAtTime(0, t + ataque * 4, tau); }
// Curva para setValueCurveAtTime a partir de f(u), u de 0 a 1
const curva = (f, n = 128) => Float32Array.from({ length: n }, (_, i) => f(i / (n - 1)));

const curvasSat = new Map();
function saturador(ctx, k = 2) {
  if (!curvasSat.has(k)) curvasSat.set(k, curva(u => Math.tanh(k * (u * 2 - 1)) / Math.tanh(k), 2049));
  const w = ctx.createWaveShaper(); w.curve = curvasSat.get(k); w.oversample = '4x';
  // siempre en estéreo: si un ruido estéreo se apaga mientras sigue un tono mono, el navegador reinicia
  // los filtros internos al cambiar de canales y se oye un clic
  w.channelCount = 2; w.channelCountMode = 'explicit';
  return w;
}

// Sala artificial: ruido que se apaga y se oscurece (la cola pierde agudos como en un salón real)
function reverb(ctx, segs = 2.2, { oscuro = 0.5, semilla = 3, pre = 0.012 } = {}) {
  const k = `${segs}|${oscuro}|${semilla}`, R = rec(ctx);
  if (!R.ir[k]) {
    const sr = ctx.sampleRate, n = Math.ceil(sr * segs), p = Math.round(pre * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const a = azar(semilla * 97 + c * 13 + 1), d = b.getChannelData(c);
      let lp = 0;
      for (let i = p; i < n; i++) {
        const u = (i - p) / (n - p);
        lp += (a() * 2 - 1 - lp) * 0.9 * (1 - oscuro * u) ** 2;
        d[i] = lp * Math.exp(-6.9 * u) * Math.min(1, (i - p) / (sr * 0.004));
      }
    }
    R.ir[k] = b;
  }
  const cv = ctx.createConvolver(); cv.buffer = R.ir[k];
  return cv;
}

// Salida de un efecto: volumen y tono (semitonos → factor de frecuencia)
function salidaEfecto(ctx, op = {}) {
  const out = gan(ctx, esNum(op.volumen) ? op.volumen : 1);
  out.connect(op.destino || ctx.destination);
  return { out, r: 2 ** (limitar(esNum(op.tono) ? op.tono : 0, -24, 24) / 12) };
}

// ---------- Efectos ----------
// Familia whoosh: ruido con un pasa banda que sube y baja (el "fiuuu"), volumen en campana y paso de un lado al otro
function barrido(ctx, t, op, { D, pico, f, q = 1.6, pan = [-0.8, 0.8], tipo = 'rosa', subida = 2.2, caida = 2.4, aire = 0.4, cuerpo = 0.3, semilla = 1 }) {
  const { out, r } = salidaEfecto(ctx, op);
  const [fa, fb, fc] = f.map(x => x * r);
  const env = u => u <= pico ? (u / pico) ** subida : (1 - (u - pico) / (1 - pico)) ** caida;
  const frec = u => u <= pico ? fa * (fb / fa) ** ((u / pico) ** 0.75) : fb * (fc / fb) ** (((u - pico) / (1 - pico)) ** 0.6);
  const vca = gan(ctx, 0); vca.gain.setValueCurveAtTime(curva(env), t, D);
  const p = ctx.createStereoPanner(); p.pan.setValueCurveAtTime(curva(u => pan[0] + (pan[1] - pan[0]) * u * u * (3 - 2 * u)), t, D);
  conectar(vca, filtro(ctx, 'highpass', 90, 0.7), p, out);
  const capa = (tipoR, tipoF, mult, qq, nivel, s) => {
    const fl = filtro(ctx, tipoF, fa * mult, qq);
    fl.frequency.setValueCurveAtTime(curva(u => Math.min(frec(u) * mult, 20000)), t, D);
    conectar(fuenteRuido(ctx, tipoR, t, D + 0.02, s), fl, gan(ctx, nivel), vca);
  };
  capa(tipo, 'bandpass', 1, q, 1, semilla);                    // el soplido principal
  capa('blanco', 'bandpass', 2.3, q * 0.7, aire, semilla + 1); // aire brillante encima
  capa('rosa', 'lowpass', 0.55, 0.7, cuerpo, semilla + 2);     // cuerpo
  return out;
}

// Clic mecánico corto (obturador, clic): ruido filtrado + un "tac" grave
function clicMecanico(ctx, out, t, f, nivel, r, cuerpo = 0.6, s = 1) {
  const bp = filtro(ctx, 'bandpass', f * r, 1.3), g = gan(ctx, 0); golpe(g.gain, t, nivel, 0.007, 0.0005);
  conectar(fuenteRuido(ctx, 'blanco', t, 0.08, s), bp, g, out);
  const hp = filtro(ctx, 'highpass', 6500, 0.7), g2 = gan(ctx, 0); golpe(g2.gain, t, nivel * 0.5, 0.0025, 0.0003);
  conectar(fuenteRuido(ctx, 'blanco', t, 0.03, s + 7), hp, g2, out);
  if (cuerpo) {
    const o = oscilador(ctx, 'sine', 190 * r, t, t + 0.1), g3 = gan(ctx, 0);
    o.frequency.setTargetAtTime(120 * r, t, 0.02); golpe(g3.gain, t, nivel * cuerpo, 0.012, 0.001);
    conectar(o, g3, out);
  }
}

// Campana de parciales (ratio, amplitud, caída): el timbre lo dan las proporciones entre frecuencias
function campanaParciales(ctx, dest, t, f0, parciales, nivel = 1) {
  for (const [ratio, amp, tau] of parciales) {
    const o = oscilador(ctx, 'sine', f0 * ratio, t, t + tau * 7 + 0.05), g = gan(ctx, 0);
    golpe(g.gain, t, amp * nivel, tau, 0.0015);
    conectar(o, g, dest);
  }
}

// ancla = fracción de la duración donde está el golpe (los que suben terminan ahí); agachar = cuánto se baja la música
// bajo el efecto: [dB, segundos que tarda en bajar hasta el ancla, segundos que se queda abajo, segundos para volver]
export const EFECTOS = {
  whoosh: {
    nombre: 'Whoosh', emoji: '💨', duracion: 1, ancla: 0.55, agachar: [3.5, 0.3, 0.1, 0.3],
    generar: (ctx, t, op) => barrido(ctx, t, op, { D: 1, pico: 0.55, f: [320, 3000, 650], q: 1.8, pan: [-0.85, 0.85], subida: 2.2, caida: 2.2, cuerpo: 0.2 }),
  },
  whooshCorto: {
    nombre: 'Whoosh corto', emoji: '💨', duracion: 0.45, ancla: 0.45, agachar: [3, 0.15, 0.05, 0.2],
    generar: (ctx, t, op) => barrido(ctx, t, op, { D: 0.45, pico: 0.45, f: [700, 4800, 1500], q: 1.3, pan: [-0.6, 0.7], subida: 1.8, caida: 2.4, aire: 0.5, cuerpo: 0.12, semilla: 4 }),
  },
  whooshInverso: {
    // el soplido "al revés": crece y se corta en seco (lo que se escucha antes de un cambio de plano)
    nombre: 'Whoosh inverso', emoji: '🌀', duracion: 1.1, ancla: 0.97, agachar: [4.5, 0.9, 0.05, 0.25],
    generar: (ctx, t, op) => barrido(ctx, t, op, { D: 1.1, pico: 0.965, f: [220, 5200, 4200], q: 1.4, pan: [0.7, -0.1], subida: 3.2, caida: 1, aire: 0.5, cuerpo: 0.15, semilla: 7 }),
  },
  riser: {
    nombre: 'Subida (riser)', emoji: '📈', duracion: 2.6, ancla: 1, agachar: [5, 2.2, 0.05, 0.3],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), D = 2.6, fin = t + D + 0.02;
      const corte = u => (u > 0.985 ? (1 - u) / 0.015 : 1);
      // ruido que se abre hacia los agudos
      const bp = filtro(ctx, 'bandpass', 350 * r, 1.1); bp.frequency.setValueCurveAtTime(curva(u => Math.min(350 * r * 26 ** (u ** 1.4), 20000)), t, D);
      const vR = gan(ctx, 0); vR.gain.setValueCurveAtTime(curva(u => 1.8 * u ** 2 * corte(u)), t, D);
      conectar(fuenteRuido(ctx, 'blanco', t, D + 0.02, 3), bp, vR);
      // tres sierras desafinadas que suben dos octavas
      const lp = filtro(ctx, 'lowpass', 500 * r, 2.5); lp.frequency.setValueCurveAtTime(curva(u => Math.min(500 * r * 18 ** (u ** 1.2), 20000)), t, D);
      const vS = gan(ctx, 0); vS.gain.setValueCurveAtTime(curva(u => 0.2 * u ** 1.8 * corte(u)), t, D);
      for (const [d, p] of [[-9, -0.6], [0, 0], [11, 0.6]]) {
        const o = oscilador(ctx, 'sawtooth', 110 * r, t, fin, d);
        o.frequency.setValueCurveAtTime(curva(u => 110 * r * 4 ** (u ** 1.5)), t, D);
        conectar(o, panear(ctx, p), lp);
      }
      lp.connect(vS);
      // trémolo que se acelera (de corcheas a fusas), como el "build-up" antes de un drop
      const trem = gan(ctx, 0.6), lfo = oscilador(ctx, 'triangle', 4, t, fin);
      lfo.frequency.setValueCurveAtTime(curva(u => 4 + 22 * u * u), t, D);
      conectar(lfo, gan(ctx, 0.4), trem.gain);
      vR.connect(trem); vS.connect(trem); trem.connect(out);
    },
  },
  impacto: {
    nombre: 'Impacto', emoji: '💥', duracion: 2.2, ancla: 0, cola: 0.8, agachar: [8, 0.01, 0.35, 0.8],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), fin = t + 2.2;
      const lp = filtro(ctx, 'lowpass', 7000 * Math.min(r, 1.5), 0.6), sat = saturador(ctx, 2.6);
      lp.connect(out); sat.connect(lp);
      // sub que cae de 60 a 35 Hz: el "buum" que se siente en el pecho
      const sub = oscilador(ctx, 'sine', 62 * r, t, fin), gs = gan(ctx, 0);
      sub.frequency.setTargetAtTime(34 * r, t + 0.02, 0.4);
      // cae sola hasta casi el silencio antes del final (sin cortar el retumbo a media altura)
      gs.gain.setValueAtTime(0, t); gs.gain.linearRampToValueAtTime(1, t + 0.004); gs.gain.setTargetAtTime(0, t + 0.06, 0.34); gs.gain.setTargetAtTime(0, fin - 0.35, 0.08);
      conectar(sub, gs, sat);
      // golpe medio
      const tri = oscilador(ctx, 'triangle', 160 * r, t, t + 1.2), gt = gan(ctx, 0);
      tri.frequency.setTargetAtTime(70 * r, t, 0.05); golpe(gt.gain, t, 0.9, 0.16);
      conectar(tri, gt, sat);
      // estallido de ruido que se oscurece enseguida
      const fN = filtro(ctx, 'lowpass', 6000 * r, 0.8), gN = gan(ctx, 0);
      fN.frequency.setTargetAtTime(280 * r, t + 0.005, 0.07); golpe(gN.gain, t, 0.9, 0.08, 0.001);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.9, 5), fN, gN, lp);
      // retumbo y cola de sala
      const fR = filtro(ctx, 'lowpass', 380 * r, 0.7), gR = gan(ctx, 0); golpe(gR.gain, t, 0.5, 0.5, 0.01);
      conectar(fuenteRuido(ctx, 'marron', t, 2.9, 6), fR, gR, lp);
      const rv = reverb(ctx, 1.8, { oscuro: 0.8, semilla: 11 });
      conectar(gN, gan(ctx, 0.5), rv, gan(ctx, 0.5), lp);
    },
  },
  drop808: {
    nombre: 'Drop 808', emoji: '🔊', duracion: 2.2, ancla: 0, agachar: [7, 0.01, 0.35, 0.7],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), fin = t + 2.2, f0 = 41.2 * r;   // Mi 1
      const sat = saturador(ctx, 3), env = gan(ctx, 0), lp = filtro(ctx, 'lowpass', 1800, 0.7);
      conectar(sat, env, lp, out);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.003); env.gain.setTargetAtTime(0.8, t + 0.02, 0.2);
      env.gain.setTargetAtTime(0, t + 0.5, 0.55); env.gain.setTargetAtTime(0, fin - 0.4, 0.1);
      // el bajo 808: baja de golpe hasta Mi 1 y se queda vibrando, saturado para que también se oiga en el celular
      const o = oscilador(ctx, 'sine', 130 * r, t, fin), g = gan(ctx, 1.6);
      o.frequency.setValueAtTime(130 * r, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.07); o.frequency.setTargetAtTime(f0 * 0.93, t + 0.4, 0.8);
      g.gain.setTargetAtTime(0.7, t + 0.05, 0.5);
      conectar(o, g, sat);
      // pegada de bombo y clic
      const k = oscilador(ctx, 'sine', 240 * r, t, t + 0.3), gk = gan(ctx, 0);
      k.frequency.setValueAtTime(240 * r, t); k.frequency.exponentialRampToValueAtTime(55 * r, t + 0.04); golpe(gk.gain, t, 0.9, 0.05, 0.001);
      conectar(k, gk, sat);
      const hp = filtro(ctx, 'highpass', 2500, 0.7), gc = gan(ctx, 0); golpe(gc.gain, t, 0.35, 0.004, 0.0005);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.05, 9), hp, gc, out);
    },
  },
  brillo: {
    // el "bling" de joyería: notas muy agudas en cascada, un poco desafinadas al azar, con eco brillante
    nombre: 'Brillo', emoji: '✨', duracion: 1.6, ancla: 0, cola: 0.8, agachar: [4, 0.02, 0.3, 0.5],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), a = azar(21);
      const seco = gan(ctx, 1), envio = gan(ctx, 0.55);
      seco.connect(out); seco.connect(envio);
      // eco cruzado izquierda/derecha que pierde los graves en cada vuelta (shimmer)
      const dL = ctx.createDelay(1), dR = ctx.createDelay(1); dL.delayTime.value = 0.083; dR.delayTime.value = 0.127;
      const hL = filtro(ctx, 'highpass', 3000, 0.7), hR = filtro(ctx, 'highpass', 3000, 0.7), une = ctx.createChannelMerger(2);
      conectar(envio, dL, hL, gan(ctx, 0.42), dR, hR, gan(ctx, 0.42), dL);
      hL.connect(une, 0, 0); hR.connect(une, 0, 1);
      conectar(une, gan(ctx, 0.6), out);
      const notas = [2637, 3136, 3951, 4699, 5274, 6272, 7902];   // Mi7 Sol7 Si7 Re8 Mi8 Sol8 Si8
      notas.forEach((f0, i) => {
        const ti = t + i * 0.038 + a() * 0.008, f = Math.min(f0 * r * 2 ** ((a() - 0.5) * 0.25 / 12), 20000);
        const p = panear(ctx, (a() - 0.5) * 1.2); p.connect(seco);
        const o = oscilador(ctx, i % 2 ? 'triangle' : 'sine', f, ti, ti + 1), g = gan(ctx, 0);
        golpe(g.gain, ti, i ? 0.42 + i * 0.02 : 0.28, 0.09 + a() * 0.07, 0.001);
        conectar(o, g, p);
        if (f * 2.76 < 20000) {   // parcial inarmónico de campanita
          const o2 = oscilador(ctx, 'sine', f * 2.76, ti, ti + 0.4), g2 = gan(ctx, 0);
          golpe(g2.gain, ti, 0.12, 0.05, 0.001); conectar(o2, g2, p);
        }
      });
      // destellos de ruido muy agudo (purpurina)
      const hp = filtro(ctx, 'highpass', 7500, 0.7), vg = gan(ctx, 0);
      for (let i = 0; i < 18; i++) pegar(vg.gain, t + 0.02 + i * 0.032 + a() * 0.01, 0.6 * (1 - i / 20) * (0.5 + a() * 0.5), 0.012);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.9, 12), hp, vg, panear(ctx, 0.2), seco);
    },
  },
  campana: {
    nombre: 'Ding', emoji: '🔔', duracion: 1.6, ancla: 0, cola: 0.7, agachar: [4, 0.01, 0.3, 0.5],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), f0 = 1318.5 * r;   // Mi6, limpio como una notificación
      const seco = gan(ctx, 1); seco.connect(out);
      campanaParciales(ctx, seco, t, f0, [[1, 1, 0.4], [1.0016, 0.35, 0.36], [2, 0.42, 0.24], [3.01, 0.2, 0.14], [4.17, 0.12, 0.1], [5.43, 0.07, 0.07]]);
      const hp = filtro(ctx, 'highpass', 4000, 0.7), g = gan(ctx, 0); golpe(g.gain, t, 0.3, 0.003, 0.0005);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.05, 2), hp, g, seco);
      conectar(seco, gan(ctx, 0.18), reverb(ctx, 1.2, { oscuro: 0.4, semilla: 4 }), out);
    },
  },
  pop: {
    nombre: 'Pop', emoji: '🫧', duracion: 0.2, ancla: 0, nivel: -3, pico: 0.8, agachar: [2.5, 0.005, 0.08, 0.2],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op);
      const o = oscilador(ctx, 'sine', 240 * r, t, t + 0.2), g = gan(ctx, 0);
      o.frequency.setValueAtTime(240 * r, t); o.frequency.exponentialRampToValueAtTime(1100 * r, t + 0.035); o.frequency.exponentialRampToValueAtTime(800 * r, t + 0.1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.002); g.gain.setTargetAtTime(0, t + 0.012, 0.025);
      conectar(o, g, out);
      const bp = filtro(ctx, 'bandpass', 2500 * r, 1), gc = gan(ctx, 0); golpe(gc.gain, t, 0.4, 0.002, 0.0003);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.03, 3), bp, gc, out);
    },
  },
  obturador: {
    // cámara de fotos: el "clac" del obturador, el resorte del espejo y el "clic" de vuelta
    nombre: 'Foto', emoji: '📸', duracion: 0.35, ancla: 0, nivel: -2, pico: 0.9, agachar: [3, 0.005, 0.15, 0.2],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op);
      clicMecanico(ctx, out, t, 2600, 1, r, 0.05, 1);
      const bp = filtro(ctx, 'bandpass', 1400 * r, 2), g = gan(ctx, 0);
      g.gain.setValueCurveAtTime(curva(u => 0.12 * Math.sin(Math.PI * u) * (1 + 0.5 * Math.sin(u * 40))), t + 0.012, 0.08);
      conectar(fuenteRuido(ctx, 'blanco', t + 0.012, 0.1, 5), bp, gan(ctx, 2), g, out);
      clicMecanico(ctx, out, t + 0.105, 3400, 0.75, r, 0.035, 2);
    },
  },
  click: {
    nombre: 'Clic', emoji: '🖱️', duracion: 0.08, ancla: 0, nivel: -3, pico: 0.7, agachar: [2, 0.005, 0.05, 0.15],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op);
      clicMecanico(ctx, out, t, 4200, 1, r, 0.05, 3);
      const o = oscilador(ctx, 'sine', 1800 * r, t, t + 0.04), g = gan(ctx, 0); golpe(g.gain, t, 0.25, 0.006, 0.0005);
      conectar(o, g, out);
    },
  },
  glitch: {
    // falla digital: trocitos de tonos y ruido que tartamudean, con bits recortados
    nombre: 'Glitch', emoji: '📺', duracion: 0.7, ancla: 0, nivel: -3, agachar: [3.5, 0.01, 0.6, 0.2],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), a = azar(33), paso = 0.045;
      const crush = ctx.createWaveShaper(); crush.curve = curva(u => Math.round((u * 2 - 1) * 6) / 6, 4096);
      conectar(crush, filtro(ctx, 'lowpass', 12000, 0.7), out);
      let previo = null;
      for (let i = 0; i < 14; i++) {
        const ti = t + i * paso, dur = paso * (0.6 + a() * 0.35);
        const pieza = previo && a() < 0.35 ? previo : { tipo: a(), f: [180, 240, 360, 480, 720, 960, 1440, 2400][Math.floor(a() * 8)] * r, pan: (a() - 0.5) * 1.4 };
        previo = pieza;
        if (pieza.tipo > 0.88) continue;   // un hueco de silencio
        const g = gan(ctx, 0), lvl = 0.5;
        g.gain.setValueAtTime(0, ti); g.gain.linearRampToValueAtTime(lvl, ti + 0.002); g.gain.setValueAtTime(lvl, ti + dur); g.gain.linearRampToValueAtTime(0, ti + dur + 0.002);
        conectar(g, panear(ctx, pieza.pan), crush);
        if (pieza.tipo < 0.45) oscilador(ctx, 'square', pieza.f, ti, ti + dur + 0.01).connect(g);
        else if (pieza.tipo < 0.75) conectar(fuenteRuido(ctx, 'blanco', ti, dur + 0.01, i), filtro(ctx, 'bandpass', pieza.f * 3, 3), g);
        else { const o = oscilador(ctx, 'sawtooth', pieza.f * 2, ti, ti + dur + 0.01); o.frequency.exponentialRampToValueAtTime(pieza.f / 2, ti + dur); o.connect(g); }
      }
    },
  },
  cajaRegistradora: {
    nombre: 'Cha-ching', emoji: '💰', duracion: 1.4, ancla: 0.08, cola: 0.5, agachar: [4, 0.1, 0.4, 0.5],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), a = azar(44);
      // "cha": el cajón que se abre
      const g1 = gan(ctx, 0); golpe(g1.gain, t, 0.8, 0.03, 0.001);
      conectar(fuenteRuido(ctx, 'blanco', t, 0.2, 1), filtro(ctx, 'bandpass', 1800 * r, 0.9), g1, out);
      const g2 = gan(ctx, 0); golpe(g2.gain, t + 0.01, 0.4, 0.05, 0.004);
      conectar(fuenteRuido(ctx, 'blanco', t + 0.01, 0.3, 2), filtro(ctx, 'bandpass', 4500 * r, 1.5), g2, out);
      const o = oscilador(ctx, 'sine', 110 * r, t, t + 0.2), g3 = gan(ctx, 0); golpe(g3.gain, t, 0.5, 0.03, 0.001);
      conectar(o, g3, out);
      // "ching": dos campanitas brillantes casi juntas, que vibran al principio
      const tb = t + 0.11, trem = gan(ctx, 1), lfo = oscilador(ctx, 'sine', 24, tb, tb + 1.4), prof = gan(ctx, 0.3);
      prof.gain.setTargetAtTime(0, tb + 0.15, 0.12);
      conectar(lfo, prof, trem.gain); trem.connect(out);
      campanaParciales(ctx, trem, tb, 2093 * r, [[1, 1, 0.36], [2.32, 0.5, 0.22], [4.25, 0.3, 0.14], [6.63, 0.15, 0.08]], 0.8);
      campanaParciales(ctx, trem, tb + 0.028, 2217 * r, [[1, 1, 0.32], [2.32, 0.45, 0.2], [4.25, 0.25, 0.12]], 0.55);
      // monedas
      for (let i = 0; i < 6; i++) {
        const ti = tb + 0.08 + i * 0.06 + a() * 0.03, og = oscilador(ctx, 'sine', (3000 + a() * 3000) * r, ti, ti + 0.25), gg = gan(ctx, 0);
        golpe(gg.gain, ti, 0.15 * (1 - i / 8), 0.03, 0.0005); conectar(og, gg, panear(ctx, (a() - 0.5) * 0.8), out);
      }
      conectar(trem, gan(ctx, 0.15), reverb(ctx, 1, { oscuro: 0.4, semilla: 9 }), out);
    },
  },
  latido: {
    // "pum-pum" del corazón: dos golpes graves (con armónicos para que se oigan en el celular)
    nombre: 'Latido', emoji: '💓', duracion: 0.9, ancla: 0, agachar: [4, 0.01, 0.4, 0.4],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), sat = saturador(ctx, 2.2);
      conectar(sat, filtro(ctx, 'lowpass', 400, 0.7), out);
      const latir = (ti, f0, f1, nivel, s) => {
        const o = oscilador(ctx, 'sine', f0 * r, ti, ti + 0.7), g = gan(ctx, 0);
        o.frequency.setTargetAtTime(f1 * r, ti, 0.03); golpe(g.gain, ti, nivel, 0.075, 0.006);
        conectar(o, g, sat);
        const gn = gan(ctx, 0); golpe(gn.gain, ti, nivel * 0.5, 0.04, 0.003);
        conectar(fuenteRuido(ctx, 'marron', ti, 0.45, s), filtro(ctx, 'lowpass', 160 * r, 0.7), gn, sat);
      };
      latir(t, 85, 46, 1, 1); latir(t + 0.27, 95, 52, 0.75, 2);
    },
  },
  swipe: {
    nombre: 'Swipe', emoji: '👉', duracion: 0.32, ancla: 0.4, nivel: -2, agachar: [3, 0.1, 0.05, 0.2],
    generar: (ctx, t, op) => barrido(ctx, t, op, { D: 0.32, pico: 0.4, f: [1400, 7500, 3000], q: 1, tipo: 'blanco', pan: [0.75, -0.75], subida: 1.6, caida: 2, aire: 0.6, cuerpo: 0.05, semilla: 9 }),
  },
  reverseCymbal: {
    // platillo al revés: el metal de una 808 (seis cuadradas inarmónicas) + ruido, creciendo hasta cortarse
    nombre: 'Platillo inverso', emoji: '🥁', duracion: 2, ancla: 1, agachar: [4.5, 1.6, 0.05, 0.25],
    generar(ctx, t, op) {
      const { out, r } = salidaEfecto(ctx, op), D = 2, fin = t + D + 0.02;
      const hp = filtro(ctx, 'highpass', 4200 * Math.min(r, 2), 0.7), hp2 = filtro(ctx, 'highpass', 3200 * Math.min(r, 2), 0.7), lp = filtro(ctx, 'lowpass', 3000, 0.5), vca = gan(ctx, 0);
      lp.frequency.setValueCurveAtTime(curva(u => 3000 + 15000 * u * u), t, D);
      vca.gain.setValueCurveAtTime(curva(u => Math.exp(-(1 - u) * 5.5) * u ** 0.3 * (u > 0.99 ? (1 - u) / 0.01 : 1)), t, D);
      conectar(hp, hp2, lp, vca, out);
      for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) conectar(oscilador(ctx, 'square', f * r * 1.2, t, fin), gan(ctx, 0.05), hp);
      conectar(fuenteRuido(ctx, 'blanco', t, D + 0.02, 8), hp);
    },
  },
};

// ---------- Música ----------
const ritmo = bpm => { const q = 60 / bpm; return { q, s: q / 4, c: q * 4 }; };

// Mesa de mezcla de una pista: maestro, sala (reverb) y "bombeo" (sidechain: lo armónico se agacha con cada bombo)
function mesa(ctx, destino, fin, { sala = 2.2, oscuro = 0.5, retorno = 0.35 } = {}) {
  const maestro = gan(ctx, 1); maestro.connect(destino);
  const rv = reverb(ctx, sala, { oscuro, semilla: 21 }); conectar(rv, gan(ctx, retorno), maestro);
  const bombeo = gan(ctx, 1); bombeo.connect(maestro);
  return {
    ctx, fin, maestro, rv, bombeo,
    envio(nodo, cantidad) { conectar(nodo, gan(ctx, cantidad), rv); return nodo; },
    agachar(t, prof = 0.55, rec = 0.2) { bombeo.gain.setTargetAtTime(1 - prof, t, 0.002); bombeo.gain.setTargetAtTime(1, t + 0.012, rec / 3); },
  };
}

// Batería: fuentes continuas (ruido y metal) que se abren con un VCA por instrumento; el bombo y los toms, golpe a golpe
function bateria(m) {
  const { ctx, fin } = m, hecho = {};
  const continuo = tipo => { const s = ctx.createBufferSource(); s.buffer = ruido(ctx, tipo); s.loop = true; s.start(0); s.stop(fin); return s; };
  const vca = (entrada, salida = m.maestro, envio = 0, pan = 0, nivel = 1) => {
    const g = gan(ctx, 0); conectar(entrada, gan(ctx, nivel), g, panear(ctx, pan), salida);
    if (envio) m.envio(g, envio);
    return g.gain;
  };
  const metal = () => hecho.metal ||= (() => {
    const mezcla = gan(ctx, 1);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) conectar(oscilador(ctx, 'square', f * 1.25, 0, fin), gan(ctx, 0.07), mezcla);
    conectar(continuo('blanco'), gan(ctx, 0.5), mezcla);
    return mezcla;
  })();
  return {
    hat(t, v = 0.5, abierto = false) {
      hecho.hat ||= vca(conectar(metal(), filtro(ctx, 'bandpass', 9000, 0.8), filtro(ctx, 'highpass', 6000, 0.7)), m.maestro, 0.06, 0.18, 3.5);
      pegar(hecho.hat, t, v, abierto ? 0.1 : 0.018);
    },
    platillo(t, v = 0.5) {
      hecho.plat ||= vca(conectar(metal(), filtro(ctx, 'highpass', 4500, 0.6)), m.maestro, 0.25, -0.2, 2);
      pegar(hecho.plat, t, v, 0.8, 0.001);
    },
    palma(t, v = 0.8) {
      const p = hecho.palma ||= vca(conectar(continuo('blanco'), filtro(ctx, 'bandpass', 1150, 0.9), filtro(ctx, 'highpass', 500, 0.7)), m.maestro, 0.28, 0, 1.6);
      // tres manos casi juntas: el "rrap" de unas palmas
      p.setTargetAtTime(v, t, 0.0004); p.setTargetAtTime(v * 0.15, t + 0.003, 0.002);
      p.setTargetAtTime(v * 0.9, t + 0.011, 0.0004); p.setTargetAtTime(v * 0.15, t + 0.014, 0.002);
      p.setTargetAtTime(v, t + 0.022, 0.0004); p.setTargetAtTime(0, t + 0.025, 0.06);
    },
    caja(t, v = 0.8) {
      hecho.caja ||= vca(conectar(continuo('blanco'), filtro(ctx, 'bandpass', 2600, 0.6), filtro(ctx, 'highpass', 900, 0.7)), m.maestro, 0.2, 0, 1.5);
      pegar(hecho.caja, t, v * 0.8, 0.075);
      const o = oscilador(ctx, 'triangle', 200, t, t + 0.25), g = gan(ctx, 0);
      o.frequency.setTargetAtTime(165, t, 0.02); golpe(g.gain, t, v * 0.7, 0.045, 0.001);
      conectar(o, g, m.maestro);
    },
    shaker(t, v = 0.3) {
      hecho.shaker ||= vca(conectar(continuo('blanco'), filtro(ctx, 'highpass', 5500, 0.7), filtro(ctx, 'bandpass', 8500, 0.7)), m.maestro, 0.05, -0.25, 2.5);
      pegar(hecho.shaker, t, v, 0.025, 0.004);
    },
    chasquido(t, v = 0.5) {
      hecho.chas ||= vca(conectar(continuo('rosa'), filtro(ctx, 'bandpass', 2200, 2.5)), m.maestro, 0.4, 0.1);
      pegar(hecho.chas, t, v * 2.2, 0.022, 0.0004);
    },
    bombo(t, v = 1, { f0 = 160, f1 = 50, caida = 0.035, tau = 0.16, clic = 0.25 } = {}) {
      const o = oscilador(ctx, 'sine', f0, t, t + 0.06 + tau * 6), g = gan(ctx, 0);
      o.frequency.setValueAtTime(f0, t); o.frequency.setTargetAtTime(f1, t, caida / 3);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0015); g.gain.setTargetAtTime(0, t + 0.02, tau);
      conectar(o, g, m.maestro);
      if (clic) {
        hecho.clic ||= vca(conectar(continuo('blanco'), filtro(ctx, 'highpass', 2500, 0.7)));
        pegar(hecho.clic, t, v * clic, 0.004, 0.0003);
      }
    },
    tom(t, f = 90, v = 0.8) {
      const o = oscilador(ctx, 'sine', f * 1.6, t, t + 1.4), g = gan(ctx, 0);
      o.frequency.setValueAtTime(f * 1.6, t); o.frequency.setTargetAtTime(f, t, 0.03); golpe(g.gain, t, v, 0.22, 0.002);
      conectar(o, g, m.maestro); m.envio(g, 0.3);
      hecho.tom ||= vca(conectar(continuo('rosa'), filtro(ctx, 'lowpass', 1200, 0.7)), m.maestro, 0.3);
      pegar(hecho.tom, t, v * 0.9, 0.04, 0.001);
    },
  };
}

// Bajo 808 monofónico: seno con pegada o deslizamiento entre notas, saturado
function bajo808(m, { sat = 2.6, corte = 1500, nivel = 0.9 } = {}) {
  const { ctx } = m, s = saturador(ctx, sat);
  conectar(s, filtro(ctx, 'lowpass', corte, 0.6), gan(ctx, nivel), m.maestro);
  let ultima = null;
  return (t, midi, dur, { desliz = false, v = 1 } = {}) => {
    const f = hz(midi), o = oscilador(ctx, 'sine', f, t, t + dur + 0.15), e = gan(ctx, 0);
    if (desliz && ultima) { o.frequency.setValueAtTime(ultima, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09); }
    else { o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); }
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.004); e.gain.setTargetAtTime(v * 0.7, t + 0.05, 0.4); e.gain.setTargetAtTime(0, t + dur, 0.03);
    conectar(o, e, s); ultima = f;
  };
}

// Piano suave: onda con los armónicos de un piano y un filtro que se va cerrando mientras suena la nota
function piano(m, salida, t, midi, v, dur = 2) {
  const { ctx } = m, R = rec(ctx), f = hz(midi);
  R.ondas.piano ||= ctx.createPeriodicWave(new Float32Array(11), Float32Array.from([0, 1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.05, 0.04, 0.02, 0.015]));
  const o = oscilador(ctx, R.ondas.piano, f, t, t + dur + 1.2), lp = filtro(ctx, 'lowpass', Math.min(f * 8, 12000), 0.5), g = gan(ctx, 0);
  lp.frequency.setTargetAtTime(Math.max(f * 2, 500), t + 0.01, 0.6);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004);
  g.gain.setTargetAtTime(v * 0.3, t + 0.005, 0.3); g.gain.setTargetAtTime(0, t + 0.9, 2); g.gain.setTargetAtTime(0, t + dur, 0.2);
  conectar(o, lp, g, salida);
}

// Pad: dos sierras desafinadas por nota, filtradas y con entrada lenta
function pad(m, salida, t, dur, notas, v, { corte = 1400, ataque = 0.8, suelta = 1.2, tipo = 'sawtooth' } = {}) {
  const { ctx } = m, lp = filtro(ctx, 'lowpass', corte, 0.4), g = gan(ctx, 0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + ataque); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + suelta);
  conectar(lp, g, salida);
  for (const n of notas) for (const d of [-7, 7]) oscilador(ctx, tipo, hz(n), t, t + dur + suelta + 0.05, d).connect(lp);
}

// Piano eléctrico (lo-fi): síntesis FM con índice que se apaga: ataque de campanita y cuerpo redondo
function rhodes(m, salida, t, midi, v, dur, vaiven) {
  const { ctx } = m, f = hz(midi), fin = t + dur + 2;
  const car = oscilador(ctx, 'sine', f, t, fin), mod = oscilador(ctx, 'sine', f, t, fin), gm = gan(ctx, 0), g = gan(ctx, 0);
  gm.gain.setValueAtTime(f * 2.2, t); gm.gain.setTargetAtTime(f * 0.35, t, 0.15);
  conectar(mod, gm, car.frequency);
  if (vaiven) { vaiven.connect(car.detune); vaiven.connect(mod.detune); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.setTargetAtTime(v * 0.5, t + 0.005, 0.6); g.gain.setTargetAtTime(0, t + dur, 0.3);
  conectar(car, g, salida);
}

// Campanita FM (melodías de trap)
function campanita(m, salida, t, midi, v, dur = 0.6) {
  const { ctx } = m, f = hz(midi), fin = t + dur + 1;
  const car = oscilador(ctx, 'sine', f, t, fin), mod = oscilador(ctx, 'sine', f * 3.5, t, fin), gm = gan(ctx, 0), g = gan(ctx, 0);
  gm.gain.setValueAtTime(f * 3, t); gm.gain.setTargetAtTime(f * 0.2, t, 0.12);
  conectar(mod, gm, car.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.002); g.gain.setTargetAtTime(0, t + 0.003, 0.45); g.gain.setTargetAtTime(0, t + dur, 0.12);
  conectar(car, g, salida);
}

// Cencerro de 808 afinado (la melodía del phonk): dos cuadradas a 540 y 800 Hz por un pasa banda
function cencerro(m, salida, t, midi, v) {
  const { ctx } = m, f = hz(midi), fin = t + 0.8, bp = filtro(ctx, 'bandpass', f * 2.1, 1.1), g = gan(ctx, 0);
  for (const k of [1, 1.4815]) conectar(oscilador(ctx, 'square', f * k, t, fin), gan(ctx, 0.5), bp);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.001); g.gain.setTargetAtTime(v * 0.3, t + 0.002, 0.012); g.gain.setTargetAtTime(0, t + 0.03, 0.11);
  conectar(bp, g, salida);
}

// Sierra con filtro que se cierra (pluck, acordes cortos, cuerdas en staccato)
function pulsada(m, salida, t, notas, v, dur, { ondas = [-10, 10], corte = 5000, fondo = 600, tauF = 0.08, tauA = 0.18, tipo = 'sawtooth' } = {}) {
  const { ctx } = m, lp = filtro(ctx, 'lowpass', corte, 0.8), g = gan(ctx, 0), fin = t + dur + 0.4;
  lp.frequency.setValueAtTime(corte, t); lp.frequency.setTargetAtTime(fondo, t + 0.002, tauF);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(v * 0.5, t + 0.006, tauA); g.gain.setTargetAtTime(0, t + dur, 0.05);
  conectar(lp, g, salida);
  for (const n of notas) for (const d of ondas) oscilador(ctx, tipo, hz(n), t, fin, d).connect(lp);
}

// Bajo redondo: seno + sierra filtrada
function bajo(m, salida, t, midi, v, dur, corte = 500) {
  const { ctx } = m, f = hz(midi), fin = t + dur + 0.1, lp = filtro(ctx, 'lowpass', corte * 1.8, 1), g = gan(ctx, 0);
  lp.frequency.setTargetAtTime(corte, t, 0.05);
  conectar(oscilador(ctx, 'sine', f, t, fin), gan(ctx, 0.9), lp);
  conectar(oscilador(ctx, 'sawtooth', f, t, fin), gan(ctx, 0.35), lp);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  conectar(lp, g, salida);
}

// Sub muy suave bajo los acordes (calidez en audífonos)
function sub(m, salida, t, midi, v, dur) {
  const { ctx } = m, g = gan(ctx, 0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.25); g.gain.setValueAtTime(v, t + dur - 0.2); g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
  conectar(oscilador(ctx, 'sine', hz(midi), t, t + dur + 0.25), g, salida);
}

// Pasos de una rejilla de semicorcheas, con swing opcional en las corcheas a contratiempo
const paso = (t0, s, k, swing = 0) => t0 + k * s + (k % 4 === 2 ? swing * s : 0);

function lujo(ctx, destino, { bpm, compases, fin }) {
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, destino, fin, { sala: 3.2, oscuro: 0.55, retorno: 0.5 }), b = bateria(m), a = azar(101);
  const pianos = gan(ctx, 1); pianos.connect(m.maestro); m.envio(pianos, 0.38);
  const pads = gan(ctx, 1); pads.connect(m.maestro); m.envio(pads, 0.7);
  // Re♭maj9 – Si♭m9 – Sol♭maj7 – La♭sus (acordes de lujo: novenas y séptimas mayores)
  const PROG = [
    { bajo: 37, acorde: [53, 56, 60, 63], arriba: [72, 75, 77, 80, 84] },
    { bajo: 34, acorde: [53, 56, 60, 61], arriba: [73, 72, 77, 80, 85] },
    { bajo: 30, acorde: [54, 58, 61, 65], arriba: [73, 77, 78, 82, 85] },
    { bajo: 32, acorde: [56, 58, 61, 63], arriba: [72, 75, 80, 82, 87] },
  ];
  const MOTIVOS = [[[3, 2], [4, 1], [6, 3]], [[2, 4], [5, 3], [7, 1]], [[3, 1], [4, 2], [5, 3], [7, 4]], [[2, 0], [6, 2]]];   // [corchea, nota de "arriba"]
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, P = PROG[i % 4];
    piano(m, pianos, t0, P.bajo, 0.22, c * 0.95); piano(m, pianos, t0 + 0.008, P.bajo + 12, 0.2, c * 0.95);
    P.acorde.forEach((n, j) => piano(m, pianos, t0 + 0.02 + j * 0.014, n, 0.3 + a() * 0.05, c * 0.9));
    P.acorde.slice(1).forEach((n, j) => piano(m, pianos, t0 + 2 * q + j * 0.012, n, 0.15, c * 0.45));
    for (const [k, idx] of MOTIVOS[i % 4]) piano(m, pianos, t0 + k * q / 2 + a() * 0.01, P.arriba[idx], 0.26 + a() * 0.06, q * 1.6);
    pad(m, pads, t0, c, P.acorde.map(n => n + 12), 0.035, { corte: 1900, ataque: 0.9, suelta: 1.4 });
    sub(m, m.maestro, t0, P.bajo + 12, 0.05, c);
    if (i >= 1) {   // a partir del segundo compás entra el ritmo, muy suave
      b.bombo(t0, 0.36, { f0: 120, f1: 50, tau: 0.12, clic: 0.1 }); b.bombo(t0 + 2 * q, 0.28, { f0: 120, f1: 50, tau: 0.12, clic: 0.08 });
      b.chasquido(t0 + q, 0.34); b.chasquido(t0 + 3 * q, 0.34);
    }
    if (i >= 2) for (let k = 0; k < 8; k++) b.shaker(t0 + k * q / 2, k % 2 ? 0.07 : 0.11);
  }
}

function lofi(ctx, destino, { bpm, compases, fin }) {
  // todo pasa por un filtro y una saturación suave: sonido de casete viejo
  const pre = gan(ctx, 1); conectar(pre, filtro(ctx, 'lowpass', 7000, 0.5), saturador(ctx, 1.3), destino);
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, pre, fin, { sala: 1.8, oscuro: 0.7, retorno: 0.3 }), b = bateria(m), a = azar(202), sw = 0.33;
  const teclas = gan(ctx, 1); teclas.connect(m.maestro); m.envio(teclas, 0.3);
  // "vaivén" de la cinta: desafina un poquito todo el piano eléctrico (dos vueltas por compás: el bucle cierra igual)
  const lfo = oscilador(ctx, 'sine', 2 / c, 0, fin), vaiven = gan(ctx, 9); lfo.connect(vaiven);
  const PROG = [  // Fa maj9 – Mi m7 – Re m9 – Do maj9
    { bajo: 41, acorde: [52, 57, 60, 67] }, { bajo: 40, acorde: [50, 55, 59, 64] },
    { bajo: 38, acorde: [53, 57, 60, 64] }, { bajo: 36, acorde: [52, 55, 59, 62] },
  ];
  const MELODIA = { 1: [[8, 76], [10, 74], [14, 71]], 3: [[6, 72], [8, 74], [12, 76], [14, 79]] };   // [semicorchea, nota] en los compases impares
  // crujido del vinilo y siseo de la cinta
  const crujido = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate), az = azar(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = crujido.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (az() * 2 - 1) * 0.012;
    for (let k = 0; k < 60; k++) { const p = Math.floor(az() * (d.length - 200)), amp = (az() < 0.15 ? 0.5 : 0.15) * (az() < 0.5 ? -1 : 1); for (let j = 0; j < 40; j++) d[p + j] += amp * Math.exp(-j / 6); }
  }
  const sc = ctx.createBufferSource(); sc.buffer = crujido; sc.loop = true; sc.start(0); sc.stop(fin);
  conectar(sc, filtro(ctx, 'bandpass', 2500, 0.4), gan(ctx, 0.8), m.maestro);
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, P = PROG[i % 4];
    P.acorde.forEach((n, j) => rhodes(m, teclas, t0 + j * 0.016 + a() * 0.006, n, 0.3 + a() * 0.04, c * 0.85, vaiven));
    P.acorde.slice(2).forEach((n, j) => rhodes(m, teclas, paso(t0, s, 10, sw) + j * 0.012, n, 0.14, q, vaiven));
    for (const [k, n] of MELODIA[i % 4] || []) rhodes(m, teclas, paso(t0, s, k, sw) + a() * 0.01, n, 0.2, q * 0.9, vaiven);
    bajo(m, m.maestro, t0, P.bajo, 0.26, s * 5, 420); bajo(m, m.maestro, paso(t0, s, 7), P.bajo, 0.16, s * 2, 420); bajo(m, m.maestro, paso(t0, s, 10, sw), P.bajo + 7, 0.22, s * 5, 420);
    // boom bap con swing
    b.bombo(paso(t0, s, 0), 0.55, { f0: 130, f1: 52, tau: 0.11, clic: 0.15 });
    b.bombo(paso(t0, s, 7), 0.3, { f0: 130, f1: 52, tau: 0.09, clic: 0.1 });
    b.bombo(paso(t0, s, 10, sw), 0.48, { f0: 130, f1: 52, tau: 0.11, clic: 0.15 });
    b.caja(paso(t0, s, 4), 0.75); b.caja(paso(t0, s, 12), 0.8);
    for (let k = 0; k < 16; k += 2) b.hat(paso(t0, s, k, sw), (k % 4 ? 0.3 : 0.48) * (0.85 + a() * 0.3));
    if (i % 2) b.hat(paso(t0, s, 15), 0.15);
  }
}

function trap(ctx, destino, { bpm, compases, fin }) {
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, destino, fin, { sala: 2, oscuro: 0.5, retorno: 0.35 }), b = bateria(m), a = azar(303);
  const tocar808 = bajo808(m, { sat: 2.4, corte: 1400, nivel: 0.36 });
  const mel = gan(ctx, 1); mel.connect(m.maestro); m.envio(mel, 0.4);
  // Sol menor: Sol – Sol – Mi♭ – Fa; la campanita repite un arpegio oscuro sobre cada acorde
  const RAIZ = [31, 31, 27, 29], ACORDES = [[79, 82, 86], [79, 82, 86], [75, 79, 82], [77, 81, 84]], PADS = [[55, 58, 62], [55, 58, 62], [55, 58, 63], [53, 57, 60]];
  const MOTIVO = [0, null, 2, 1, null, 2, 0, null, 1, null, 2, null, 0, 1, null, null];   // en corcheas, dos compases
  const P808 = [[[0, 6], [7, 3], [10, 6]], [[0, 6], [6, 2], [11, 3], [14, 2, true]]];   // [semicorchea, largo, deslizar]
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, k4 = i % 4;
    MOTIVO.slice((i % 2) * 8, (i % 2) * 8 + 8).forEach((g, k) => {
      if (g === null) return;
      campanita(m, mel, t0 + k * q / 2, ACORDES[k4][g], 0.34 + (k === 0 ? 0.06 : 0), q * 0.9);
      campanita(m, mel, t0 + k * q / 2, ACORDES[k4][g] - 12, 0.14, q * 0.9);
    });
    pad(m, m.maestro, t0, c, PADS[k4], 0.03, { corte: 1100, ataque: 0.4, suelta: 0.5 });
    // platillos: corcheas de base y redobles (semicorcheas, fusas y tresillos), la firma del trap
    for (let k = 0; k < 16; k += 2) b.hat(t0 + k * s, k % 4 ? 0.3 : 0.42);
    if (i >= 1) {
      if (i % 2 === 1) for (let j = 0; j < 8; j++) b.hat(t0 + 12 * s + j * s / 2, 0.22 + j * 0.035);
      if (k4 === 3) for (let j = 0; j < 6; j++) b.hat(t0 + 6 * s + j * s / 3, 0.25 + j * 0.03);
      if (k4 === 2) for (const k of [5, 7, 13]) b.hat(t0 + k * s, 0.2);
      if (k4 === 0) b.hat(t0 + 14 * s, 0.3, true);
    }
    if (i < 1) continue;   // el primer compás es la entrada: aquí cae el drop
    if (i === 1) b.platillo(t0, 0.5);
    for (const [k, largo, desliz] of P808[i % 2]) {
      const nota = RAIZ[k4] + (desliz ? 12 : 0);
      tocar808(t0 + k * s, nota, largo * s, { desliz, v: 1 });
      if (!desliz && k !== 6) b.bombo(t0 + k * s, 0.5, { f0: 200, f1: 55, tau: 0.08, clic: 0.4 });
    }
    b.palma(t0 + 8 * s, 0.9); b.caja(t0 + 8 * s, 0.55);
    if (k4 === 3) b.palma(t0 + 15 * s, 0.4);
  }
}

function house(ctx, destino, { bpm, compases, fin }) {
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, destino, fin, { sala: 1.6, oscuro: 0.5, retorno: 0.3 }), b = bateria(m), a = azar(404);
  // entrada filtrada: lo armónico se abre durante el primer compás
  const filtroEntrada = filtro(ctx, 'lowpass', 350, 0.9);
  m.bombeo.disconnect(); conectar(m.bombeo, filtroEntrada, m.maestro);
  filtroEntrada.frequency.setValueAtTime(350, 0); filtroEntrada.frequency.exponentialRampToValueAtTime(18000, c);
  const armonia = gan(ctx, 1); armonia.connect(m.bombeo); m.envio(armonia, 0.3);
  // La m9 – Fa maj9 – Re m9 – Mi m7
  const PROG = [{ bajo: 33, acorde: [55, 59, 60, 64] }, { bajo: 29, acorde: [55, 57, 60, 64] }, { bajo: 38, acorde: [53, 57, 60, 64] }, { bajo: 40, acorde: [55, 59, 62, 64] }];
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, P = PROG[i % 4];
    for (let k = 0; k < 4; k++) { b.bombo(t0 + k * q, 0.62, { f0: 170, f1: 52, tau: 0.12, clic: 0.3 }); m.agachar(t0 + k * q, 0.6, q * 0.85); }
    for (let k = 2; k < 16; k += 4) b.hat(t0 + k * s, 0.36, true);
    for (let k = 0; k < 16; k++) b.shaker(t0 + k * s, k % 4 === 2 ? 0.16 : k % 2 ? 0.06 : 0.1);
    pad(m, armonia, t0, c, P.acorde, 0.07, { corte: 2400, ataque: 0.05, suelta: 0.3 });
    for (const k of [0, 3, 6, 10, 13]) pulsada(m, armonia, t0 + k * s, P.acorde.map(n => n + 12), 0.09, s * 1.5, { corte: 3600, fondo: 1000, tauF: 0.06, tauA: 0.1, tipo: 'square', ondas: [0] });
    if (i < 1) continue;
    if (i === 1) b.platillo(t0, 0.45);
    b.palma(t0 + q, 0.8); b.palma(t0 + 3 * q, 0.8);
    for (const k of [2, 6, 10, 14]) bajo(m, m.bombeo, t0 + k * s, P.bajo + 12 + (k === 14 && i % 2 ? 12 : 0), 0.3, s * 1.6, 700);
  }
}

function phonk(ctx, destino, { bpm, compases, fin }) {
  const pre = gan(ctx, 1); conectar(pre, saturador(ctx, 1.4), destino);
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, pre, fin, { sala: 1.6, oscuro: 0.45, retorno: 0.32 }), b = bateria(m), a = azar(505);
  const tocar808 = bajo808(m, { sat: 4.5, corte: 2400, nivel: 0.17 });
  const campanas = gan(ctx, 1); conectar(campanas, saturador(ctx, 1.8), m.maestro); m.envio(campanas, 0.35);
  // el riff de cencerro (Fa menor) que identifica al drift phonk
  const RIFF = [[[0, 77], [3, 77], [6, 80], [8, 77], [10, 84], [12, 85], [14, 84]], [[0, 77], [3, 77], [6, 80], [8, 87], [10, 85], [12, 84], [14, 80]]];
  const RAIZ = [29, 29, 32, 34];   // Fa – Fa – La♭ – Si♭ (el 808 entre 43 y 58 Hz)
  const P808 = [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]];
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, k4 = i % 4;
    for (const [k, n] of RIFF[i % 2]) cencerro(m, campanas, t0 + k * s, n, k % 8 === 0 || k === 6 ? 0.85 : 0.65);
    for (let k = 0; k < 16; k += 2) b.hat(t0 + k * s, k % 4 ? 0.26 : 0.36);
    if (i < 1) continue;
    if (i === 1) b.platillo(t0, 0.5);
    for (const [k, largo] of P808) tocar808(t0 + k * s, RAIZ[k4], largo * s, { desliz: k === 12 && k4 === 3 });
    for (const k of [0, 6, 10]) b.bombo(t0 + k * s, 0.45, { f0: 210, f1: 55, tau: 0.08, clic: 0.5 });
    b.palma(t0 + 4 * s, 0.9); b.caja(t0 + 4 * s, 0.6); b.palma(t0 + 12 * s, 0.9); b.caja(t0 + 12 * s, 0.6);
    if (i % 2 === 1) for (let j = 0; j < 6; j++) b.hat(t0 + 13 * s + j * s / 2, 0.18 + j * 0.03);
    if (k4 === 2) b.hat(t0 + 14 * s, 0.3, true);
  }
}

function popViral(ctx, destino, { bpm, compases, fin }) {
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, destino, fin, { sala: 1.5, oscuro: 0.4, retorno: 0.3 }), b = bateria(m), a = azar(606);
  const acordes = gan(ctx, 1); acordes.connect(m.bombeo); m.envio(acordes, 0.22);
  // eco de corchea con puntillo para el arpegio (pegajoso)
  const arp = gan(ctx, 1), eco = ctx.createDelay(1); eco.delayTime.value = q * 0.75;
  arp.connect(m.bombeo); conectar(arp, eco, gan(ctx, 0.3), filtro(ctx, 'highpass', 600, 0.7), m.bombeo);
  // Sol – Re – Mi m – Do (I–V–vi–IV, la progresión más usada en el pop)
  const PROG = [{ bajo: 43, acorde: [59, 62, 67] }, { bajo: 38, acorde: [57, 62, 66] }, { bajo: 40, acorde: [59, 64, 67] }, { bajo: 36, acorde: [60, 64, 67] }];
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, P = PROG[i % 4];
    for (const k of [0, 3, 6, 10, 12]) pulsada(m, acordes, t0 + k * s, P.acorde, 0.17, s * 2.2, { corte: 5600, fondo: 1700, tauF: 0.12, tauA: 0.2, ondas: [-12, 0, 12] });
    b.chasquido(t0 + q, 0.35); b.chasquido(t0 + 3 * q, 0.35);
    if (i < 1) continue;
    if (i === 1) b.platillo(t0, 0.45);
    for (let k = 0; k < 4; k++) { b.bombo(t0 + k * q, 0.5, { f0: 150, f1: 55, tau: 0.12, clic: 0.35 }); m.agachar(t0 + k * q, 0.35, q * 0.7); }
    b.palma(t0 + q, 0.85); b.palma(t0 + 3 * q, 0.85);
    for (let k = 2; k < 16; k += 4) b.hat(t0 + k * s, 0.36);
    for (let k = 1; k < 16; k += 2) b.hat(t0 + k * s, 0.12);
    for (let k = 0; k < 16; k += 2) bajo(m, m.bombeo, t0 + k * s, P.bajo + (k % 4 === 2 ? 12 : 0), 0.16, s * 1.7, 700);
    const tonos = [...P.acorde.map(n => n + 12), P.acorde[0] + 24];
    for (let k = 0; k < 16; k++) pulsada(m, arp, t0 + k * s, [tonos[[0, 1, 2, 3, 2, 1][k % 6]]], 0.1, s * 0.8, { corte: 6000, fondo: 1400, tauF: 0.05, tauA: 0.08, ondas: [0] });
  }
}

function cinematico(ctx, destino, { bpm, compases, fin }) {
  const { q, s, c } = ritmo(bpm), m = mesa(ctx, destino, fin, { sala: 3.5, oscuro: 0.6, retorno: 0.45 }), b = bateria(m), a = azar(707);
  // dron grave que respira (filtro con un vaivén muy lento: una vuelta cada cuatro compases)
  const lp = filtro(ctx, 'lowpass', 220, 0.8), dron = gan(ctx, 0), lfo = oscilador(ctx, 'sine', 1 / (4 * c), 0, fin);
  conectar(lfo, gan(ctx, 110), lp.frequency);
  dron.gain.setValueAtTime(0, 0); dron.gain.linearRampToValueAtTime(0.06, Math.min(2, fin));
  conectar(lp, dron, m.maestro); m.envio(dron, 0.2);
  for (const [n, d] of [[26, -6], [26, 6], [38, -4], [38, 5]]) oscilador(ctx, 'sawtooth', hz(n), 0, fin, d).connect(lp);
  conectar(oscilador(ctx, 'sine', hz(26), 0, fin), gan(ctx, 0.6), dron);
  const cuerdas = gan(ctx, 1); cuerdas.connect(m.maestro); m.envio(cuerdas, 0.3);
  // Re m – Si♭ – Sol m – La (dos compases cada uno)
  const RAIZ = [50, 46, 43, 45], OST = [0, 0, 12, 0, 7, 0, 12, 7];
  const AC = [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]];
  for (let i = 0; i < compases; i++) {
    const t0 = i * c, h = Math.floor(i / 2) % 4, R = RAIZ[h];
    for (let k = 0; k < 16; k++) { const n = R + OST[k % 8] - (k % 8 === 2 && h === 3 ? 1 : 0); pulsada(m, cuerdas, t0 + k * s, [n, n + 12], k % 4 === 0 ? 0.13 : 0.08, s * 0.7, { corte: 3800, fondo: 1300, tauF: 0.05, tauA: 0.09 }); }
    if (i % 2 === 0) pad(m, cuerdas, t0, c * 2, AC[h].map(x => R + x), 0.035, { corte: 1400, ataque: 1, suelta: 1.5 });
    if (i >= 2) pad(m, m.maestro, t0, c, [74, 81].map(n => n + (R - 50)), 0.05, { corte: 4000, ataque: 1.2, suelta: 1.5, tipo: 'triangle' });
    if (i < 1) continue;
    // golpe grande (el mismo "Impacto" de los efectos) al entrar y cada cuatro compases, con platillo inverso antes
    if ((i - 1) % 4 === 0) {
      EFECTOS.impacto.generar(ctx, t0, { destino: m.maestro, volumen: 0.4 });
      if (t0 >= 2) EFECTOS.reverseCymbal.generar(ctx, t0 - 2, { destino: m.maestro, volumen: 0.25 });
    }
    for (const [k, f, v] of [[0, 70, 0.9], [3, 90, 0.5], [6, 80, 0.6], [8, 70, 0.8], [11, 100, 0.45], [14, 90, 0.55]]) b.tom(t0 + k * s, f * 1.25, v * 0.6 * (0.9 + a() * 0.2));
  }
}

// entrada = compás donde cae el ritmo (el "drop"); desde el compás `estable` todo se repite cada `ciclo` compases
export const ESTILOS_MUSICA = {
  lujo:       { nombre: 'Lujo',       emoji: '💎', descripcion: 'Piano suave y pad',            bpm: 76,  min: 62,  max: 92,  entrada: 1, estable: 2, ciclo: 4, generar: lujo },
  lofi:       { nombre: 'Lo-fi',      emoji: '☕', descripcion: 'Piano eléctrico y vinilo',      bpm: 82,  min: 70,  max: 95,  entrada: 0, estable: 0, ciclo: 4, generar: lofi },
  trap:       { nombre: 'Trap',       emoji: '🔥', descripcion: '808 y redobles de platillo',    bpm: 140, min: 120, max: 160, entrada: 1, estable: 2, ciclo: 4, generar: trap },
  house:      { nombre: 'House',      emoji: '🪩', descripcion: 'Bombo constante, para bailar', bpm: 122, min: 115, max: 130, entrada: 1, estable: 2, ciclo: 4, generar: house },
  phonk:      { nombre: 'Phonk',      emoji: '🏎️', descripcion: 'Cencerro y 808 distorsionado', bpm: 130, min: 110, max: 150, entrada: 1, estable: 2, ciclo: 4, generar: phonk },
  popViral:   { nombre: 'Pop viral',  emoji: '⚡', descripcion: 'Palmas y sintes alegres',      bpm: 116, min: 100, max: 130, entrada: 1, estable: 2, ciclo: 4, generar: popViral },
  cinematico: { nombre: 'Cinemático', emoji: '🎬', descripcion: 'Dron, cuerdas y golpes',       bpm: 90,  min: 70,  max: 110, entrada: 1, estable: 2, ciclo: 8, generar: cinematico },
};

// ---------- Sonoridad (BS.1770, la misma medida que usan Instagram, TikTok y YouTube) ----------
function filtrosK(sr) {
  // estante alto (+4 dB) y pasa altos (RLB), con fórmulas válidas para cualquier frecuencia de muestreo
  let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
  const e = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = 0.5003270373238773;
  const d = 1 + K / Q + K * K;
  return [e, [1, -2, 1, 2 * (K * K - 1) / d, (1 - K / Q + K * K) / d]];
}
// Suma acumulada de la potencia ponderada (todos los canales): permite medir cualquier ventana al instante
function potenciaK(b) {
  const n = b.length, P = new Float64Array(n + 1), fs = filtrosK(b.sampleRate), y = new Float64Array(n);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const x = b.getChannelData(ch);
    let src = x;
    for (const [b0, b1, b2, a1, a2] of fs) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) { const xi = src[i], yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi; }
      src = y;
    }
    for (let i = 0; i < n; i++) P[i + 1] += y[i] * y[i];
  }
  for (let i = 0; i < n; i++) P[i + 1] += P[i];
  return P;
}
const lufs = z => -0.691 + 10 * Math.log10(z || 1e-12);
function bloques(b) {
  const P = potenciaK(b), n = b.length, blk = Math.round(0.4 * b.sampleRate), hop = Math.round(0.1 * b.sampleRate), z = [];
  for (let i = 0; i + blk <= n; i += hop) z.push((P[i + blk] - P[i]) / blk);
  if (!z.length) z.push(P[n] / Math.max(1, blk));   // sonidos de menos de 400 ms: ventana completa con silencio
  return z;
}
// Sonoridad integrada (LUFS) con las dos compuertas de la norma
export function sonoridad(b) {
  const z = bloques(b), media = a => a.reduce((x, y) => x + y, 0) / a.length;
  let sel = z.filter(v => lufs(v) > -70); if (!sel.length) return -70;
  const rel = lufs(media(sel)) - 10; sel = sel.filter(v => lufs(v) > rel);
  return lufs(media(sel));
}
const sonoridadMaxima = b => Math.max(...bloques(b).map(lufs));
function pico(b) { let p = 0; for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v; } } return p; }
function escalar(b, g) { for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= g; } }

// ---------- Master: compresión suave + limitador que nunca deja pasar del techo ----------
function masterizar(b, { umbral = -14, ratio = 2, ataque = 0.015, relajo = 0.2, techo = TECHO } = {}) {
  const sr = b.sampleRate, n = b.length, L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
  // 1) compresor enlazado en estéreo: detector RMS de 30 ms, rodilla suave de 6 dB
  const aA = Math.exp(-1 / (ataque * sr)), aR = Math.exp(-1 / (relajo * sr)), aD = Math.exp(-1 / (0.03 * sr)), k = 1 - 1 / ratio;
  let ms = 0, gr = 0;
  for (let i = 0; i < n; i++) {
    ms = aD * ms + (1 - aD) * Math.max(L[i] * L[i], R[i] * R[i]);
    const sobre = 10 * Math.log10(ms + 1e-12) - umbral;
    const obj = sobre > 3 ? sobre * k : sobre > -3 ? k * (sobre + 3) ** 2 / 12 : 0;
    gr = obj > gr ? aA * gr + (1 - aA) * obj : aR * gr + (1 - aR) * obj;
    if (gr > 1e-4) { const g = 10 ** (-gr / 20); L[i] *= g; if (R !== L) R[i] *= g; }
  }
  // 2) limitador con anticipación de 3 ms: mínimo de la ganancia necesaria en la ventana que viene,
  //    suavizado con un promedio de la misma longitud (llega a tiempo sin cortar en seco) y soltando en 80 ms
  const la = Math.max(1, Math.round(0.003 * sr)), req = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); req[i] = p > techo ? techo / p : 1; }
  const mn = new Float32Array(n), cola = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) {   // mínimo deslizante de req[i .. i+la]
    while (t > h && req[cola[t - 1]] >= req[i]) t--;
    cola[t++] = i;
    while (cola[h] > i + la) h++;
    mn[i] = req[cola[h]];
  }
  const kR = 1 - Math.exp(-1 / (0.08 * sr));
  let suma = 0, g = 1;
  for (let i = 0; i < n; i++) {
    suma += mn[i] - (i >= la ? mn[i - la] : 1);
    const s = (suma + la) / la;   // promedio de las últimas `la` (antes del principio cuenta como 1)
    g = Math.min(s, g + (1 - g) * kR);
    if (g < 1) { L[i] *= g; if (R !== L) R[i] *= g; }
  }
  // 3) por si acaso (redondeos): nada pasa del techo
  const p = pico(b); if (p > techo) escalar(b, techo / p);
  return b;
}

// ---------- Renders en caché ----------
const cache = new Map();   // pocas entradas: cada base de música pesa varios MB
function enCache(clave, max, crear) {
  if (cache.has(clave)) { const v = cache.get(clave); cache.delete(clave); cache.set(clave, v); return v; }
  const v = crear(); cache.set(clave, v);
  v.catch?.(() => cache.delete(clave));
  const mismas = [...cache.keys()].filter(k => k.split('|')[0] === clave.split('|')[0]);
  while (mismas.length > max) cache.delete(mismas.shift());
  return v;
}

// Un efecto con su tono, renderizado una vez y nivelado: todos suenan parejo
function renderEfecto(id, tono = 0, sr = FRECUENCIA) {
  const e = EFECTOS[id], tt = Math.round(limitar(esNum(tono) ? tono : 0, -24, 24));
  return enCache(`ef|${id}|${tt}|${sr}`, 40, async () => {
    const ctx = new OfflineAudioContext(2, Math.ceil((e.duracion + (e.cola ?? 0.25)) * sr), sr);
    e.generar(ctx, 0, { destino: ctx.destination, volumen: 1, tono: tt });
    const b = await ctx.startRendering(), m = Math.min(b.length, Math.round(0.06 * sr));
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < m; i++) d[b.length - 1 - i] *= i / m; }
    const p = pico(b);
    if (p > 0) escalar(b, Math.min(dB(REF_EFECTO + (e.nivel || 0) - sonoridadMaxima(b)), (e.pico || PICO_EFECTO) / p));
    return b;
  });
}

// Base de música hecha aquí: compases enteros (sirve igual si la duración cambia un poco), nivelada a REF_MUSICA.
// Pasada la entrada todo se repite, así que nunca se sintetiza más de la entrada y un ciclo: el resto se repite
// en bucle (un video de 60 s cuesta lo mismo que uno de 20)
function renderEstilo(estilo, bpm, segs, sr = FRECUENCIA) {
  const E = ESTILOS_MUSICA[estilo], c = 240 / bpm, desde = E.estable + 1, hasta = desde + E.ciclo;
  const compases = Math.min(hasta, Math.max(1, Math.ceil(segs / c - 1e-6)));
  return enCache(`mu|${estilo}|${bpm}|${compases}|${sr}`, 4, async () => {
    const fin = compases * c, ctx = new OfflineAudioContext(2, Math.ceil(fin * sr), sr);
    const salida = gan(ctx, 1); salida.connect(ctx.destination);
    E.generar(ctx, salida, { bpm, compases, fin });
    const buffer = await ctx.startRendering();
    // el ciclo arranca un compás después de `estable`: así su principio ya trae las colas de un compás igual al último
    const bucle = compases === hasta ? fundirBucle(buffer, desde * c, hasta * c) : null;
    return { buffer, ganancia: dB(REF_MUSICA - sonoridad(buffer)), bucle };
  });
}

// Prepara un bucle sin costura: los últimos 30 ms antes del final se funden con lo que suena justo antes del inicio
// (al saltar del final al inicio la onda sigue continua; las notas siguen siendo las mismas)
function fundirBucle(b, inicio, fin) {
  const sr = b.sampleRate, i0 = Math.round(inicio * sr), i1 = Math.min(b.length, Math.round(fin * sr)), x = Math.min(Math.round(0.03 * sr), i0, i1 - i0);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < x; i++) { const w = (i + 1) / x; d[i1 - x + i] = d[i1 - x + i] * (1 - w) + d[i0 - x + i] * w; }
  }
  return { inicio: i0 / sr, fin: i1 / sr };
}

// Una canción subida se mide una sola vez y se nivela igual que la música de aquí (sin subirla más de 6 dB)
const medidas = new WeakMap();
function gananciaArchivo(buffer) {
  if (!medidas.has(buffer)) medidas.set(buffer, limitar(dB(REF_MUSICA - sonoridad(buffer)), dB(-14), dB(6)));
  return medidas.get(buffer);
}

// ---------- Normalización de los datos del proyecto ----------
const tieneBuffer = a => !!(a?.buffer && typeof a.buffer.getChannelData === 'function');
function normalizarMusica(m) {
  if (!esObj(m)) return null;
  const archivo = tieneBuffer(m.archivo) ? m.archivo : null, E = ESTILOS_MUSICA[m.estilo] && Object.hasOwn(ESTILOS_MUSICA, m.estilo) ? ESTILOS_MUSICA[m.estilo] : null;
  if (!archivo && !E) return null;
  const bpm = esNum(+m.bpm) && +m.bpm > 0 ? +m.bpm : E?.bpm ?? 120;
  return {
    estilo: E ? m.estilo : null, archivo,
    bpm: archivo || !E ? limitar(bpm, 40, 220) : limitar(Math.round(bpm), E.min, E.max),
    volumen: limitar(esNum(+m.volumen) ? +m.volumen : 0.55, 0, 1.5),
    inicio: Math.max(0, esNum(+m.inicio) ? +m.inicio : 0),
    fundidoSalida: limitar(esNum(+m.fundidoSalida) ? +m.fundidoSalida : 1.5, 0, 10),
    fase: esNum(+m.fase) ? +m.fase : 0,
  };
}
function normalizarClips(clips) {
  return (Array.isArray(clips) ? clips : []).filter(c => esObj(c) && Object.hasOwn(EFECTOS, c.efecto) && esNum(+c.t)).map(c => ({
    id: c.id, efecto: c.efecto, t: +c.t,
    volumen: limitar(esNum(+c.volumen) ? +c.volumen : 0.8, 0, 2),
    tono: Math.round(limitar(esNum(+c.tono) ? +c.tono : 0, -12, 12)),
  }));
}
export const hayAudio = audio => !!(normalizarMusica(audio?.musica) || normalizarClips(audio?.clips).length);

// Música por defecto para un estilo (la usan el panel y el asistente)
export function musicaNueva(estilo = 'lujo', anterior = null) {
  const E = ESTILOS_MUSICA[estilo] || ESTILOS_MUSICA.lujo;
  return { estilo: ESTILOS_MUSICA[estilo] ? estilo : 'lujo', bpm: E.bpm, volumen: esNum(anterior?.volumen) ? anterior.volumen : 0.55, inicio: 0, fundidoSalida: esNum(anterior?.fundidoSalida) ? anterior.fundidoSalida : 1.5, archivo: null };
}

// ---------- Mezcla ----------
// Cuánto se baja la música en cada momento para que los efectos se oigan (como el "auto-ducking" de los editores):
// sin esto el limitador tiene que bajar todo y el golpe no sobresale. Curva de ganancia, 200 puntos por segundo
function curvaAgachar(clips, D, ritmo = 200) {
  const n = Math.max(2, Math.ceil(D * ritmo) + 1), prof = new Float32Array(n), suave = u => u * u * (3 - 2 * u);
  for (const c of clips) {
    const e = EFECTOS[c.efecto], [db, sube, sostiene, suelta] = e.agachar || [3, 0.01, 0.2, 0.3];
    const k = db * Math.min(1.5, c.volumen / 0.8), ta = c.t + (e.ancla || 0) * e.duracion;
    const i0 = Math.max(0, Math.floor((ta - sube) * ritmo)), i1 = Math.min(n - 1, Math.ceil((ta + sostiene + suelta) * ritmo));
    for (let i = i0; i <= i1; i++) {
      const t = i / ritmo, v = t < ta ? suave(Math.max(0, 1 - (ta - t) / sube)) : t <= ta + sostiene ? 1 : suave(Math.max(0, 1 - (t - ta - sostiene) / suelta));
      if (k * v > prof[i]) prof[i] = k * v;
    }
  }
  return Float32Array.from(prof, p => dB(-p));
}

export async function mezclar(audio, duracion, { sampleRate = FRECUENCIA } = {}) {
  const sr = sampleRate, D = limitar(esNum(+duracion) ? +duracion : 8, 0.05, 600), n = Math.max(1, Math.round(D * sr));
  const musica = normalizarMusica(audio?.musica), clips = normalizarClips(audio?.clips).filter(c => c.t < D && c.t > -EFECTOS[c.efecto].duracion);
  // primero se preparan (en paralelo y con caché) la base de música y cada efecto con su tono
  const [base, ...efectos] = await Promise.all([
    !musica ? null : musica.archivo ? { buffer: musica.archivo.buffer, ganancia: gananciaArchivo(musica.archivo.buffer), bucle: { inicio: 0, fin: musica.archivo.buffer.duration } }
      : renderEstilo(musica.estilo, musica.bpm, musica.inicio + D, sr),
    ...clips.map(c => renderEfecto(c.efecto, c.tono, sr)),
  ]);
  const ctx = new OfflineAudioContext(2, n, sr);
  const bus = filtro(ctx, 'highpass', 20, 0.707);   // fuera el DC y los subgraves que nadie oye
  bus.connect(ctx.destination);
  if (base && musica.volumen > 0) {
    const f = ctx.createBufferSource(), g = gan(ctx, 0), v = base.ganancia * musica.volumen;
    f.buffer = base.buffer;
    const largo = base.buffer.duration, B = base.bucle;
    if (B) { f.loop = true; f.loopStart = B.inicio; f.loopEnd = B.fin; }
    // entra en 50 ms y se desvanece al final con curva de igual potencia
    const fo = Math.min(musica.fundidoSalida, D * 0.6), ini = Math.min(0.05, D / 4);
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v, ini);
    if (fo > 0.01) g.gain.setValueCurveAtTime(curva(u => v * Math.cos(u * Math.PI / 2)), D - fo, fo);
    const ag = gan(ctx, 1);
    if (clips.length) ag.gain.setValueCurveAtTime(curvaAgachar(clips.filter(c => c.volumen > 0), D), 0, D);
    conectar(f, g, ag, bus);
    // si se pide empezar más allá del bucle, se cae en el punto equivalente dentro de él
    const desde = !B ? Math.min(musica.inicio, largo) : musica.inicio < B.fin ? musica.inicio : B.inicio + (musica.inicio - B.inicio) % (B.fin - B.inicio);
    f.start(0, desde);
  }
  clips.forEach((c, i) => {
    if (c.volumen <= 0) return;
    const f = ctx.createBufferSource(); f.buffer = efectos[i];
    conectar(f, gan(ctx, c.volumen), bus);
    if (c.t >= 0) f.start(c.t); else f.start(0, -c.t);   // un efecto que empieza antes del video suena desde la mitad
  });
  return fundirBordes(masterizar(await ctx.startRendering()));
}

// Bordes suaves: un efecto cortado por el final del video (o que empieza a medias) no truena al repetir el reel
function fundirBordes(b, entrada = 0.004, salida = 0.025) {
  const sr = b.sampleRate, ne = Math.min(b.length, Math.round(entrada * sr)), ns = Math.min(b.length, Math.round(salida * sr));
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < ne; i++) d[i] *= i / ne;
    for (let i = 0; i < ns; i++) d[b.length - 1 - i] *= Math.sin(i / ns * Math.PI / 2);
  }
  return b;
}

// Lee la canción que sube la usuaria (mp3, wav, m4a…) y la deja a 48 kHz
export async function decodificarArchivo(file) {
  if (!file) throw new Error('No se recibió ningún archivo de audio.');
  if (file.size > 120 * 1048576) throw new Error('La canción pesa demasiado (máximo 120 MB). Prueba con un MP3.');
  const datos = await file.arrayBuffer(), ctx = new OfflineAudioContext(2, 1, FRECUENCIA);
  try {
    const b = await new Promise((ok, mal) => { const p = ctx.decodeAudioData(datos, ok, mal); p?.then?.(ok, mal); });
    if (!b || !b.length) throw new Error('vacío');
    return b;
  } catch (e) { throw new Error('No se pudo leer esa canción. Prueba con un archivo MP3, WAV o M4A.'); }
}

// FFT compleja en el mismo arreglo (radix 2); `tabla` = cosenos y senos ya calculados para este tamaño
function fft(re, im, cos, sen) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let largo = 2; largo <= n; largo <<= 1) {
    const mitad = largo >> 1, paso = n / largo;
    for (let i = 0; i < n; i += largo) {
      for (let k = 0; k < mitad; k++) {
        const a = i + k, b = a + mitad, c = cos[k * paso], s = sen[k * paso];
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

// Estima el tempo (y dónde cae el primer pulso) de una canción subida, para "Ajustar al ritmo".
// Flujo espectral: cuánto "aparece" de nuevo en 24 bandas (bombo, caja, platillos, acordes...) cada 10 ms;
// luego se busca el período que mejor se repite también al doble, a la mitad y por compases
export function estimarTempo(buffer, { desde = 0, segs = 40 } = {}) {
  if (!tieneBuffer({ buffer })) return null;
  const sr = buffer.sampleRate, hop = Math.round(sr / 100), fps = sr / hop;
  const ven = 2 ** Math.round(Math.log2(sr * 0.043)), i0 = Math.max(0, Math.floor(desde * sr)), i1 = Math.min(buffer.length, i0 + Math.floor(segs * sr));
  const N = Math.floor((i1 - i0 - ven) / hop);
  if (N < fps * 4) return null;
  const mono = new Float32Array(i1 - i0), nc = buffer.numberOfChannels;
  for (let c = 0; c < nc; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < mono.length; i++) mono[i] += d[i0 + i] / nc; }
  const hann = Float32Array.from({ length: ven }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / ven));
  const cos = Float64Array.from({ length: ven / 2 }, (_, k) => Math.cos(-2 * Math.PI * k / ven)), sen = cos.map((_, k) => Math.sin(-2 * Math.PI * k / ven));
  // bandas logarítmicas de 40 Hz a 12 kHz (en índices de la FFT)
  const NB = 24, bordes = Array.from({ length: NB + 1 }, (_, b) => Math.max(1, Math.round(40 * (12000 / 40) ** (b / NB) * ven / sr)));
  const re = new Float64Array(ven), im = new Float64Array(ven), on = new Float32Array(N), bombo = new Float32Array(N);
  const NG = bordes.findIndex(f => f * sr / ven > 90);   // bandas de debajo de 90 Hz: bombo y 808 (el bajo ya va más arriba)
  let previo = null;
  const cuadro = (k, d) => { const o = k * hop; for (let i = 0; i < ven; i++) d[i] = mono[o + i] * hann[i]; };
  const bandas = (k, B) => {   // potencia por banda del cuadro k (separado de la FFT doble)
    for (let b = 0; b < NB; b++) {
      let p = 0;
      for (let f = bordes[b]; f < bordes[b + 1]; f++) {
        const g = ven - f, ar = re[f] + re[g], ai = im[f] - im[g], br = im[f] + im[g], bi = re[f] - re[g];
        p += k ? br * br + bi * bi : ar * ar + ai * ai;
      }
      B[b] = Math.log1p(1e4 * p / 4);
    }
  };
  // dos cuadros por FFT: uno en la parte real y otro en la imaginaria
  const BA = new Float64Array(NB), BB = new Float64Array(NB);
  for (let k = 0; k < N; k += 2) {
    cuadro(k, re); if (k + 1 < N) cuadro(k + 1, im); else im.fill(0);
    fft(re, im, cos, sen);
    bandas(0, BA); bandas(1, BB);
    for (const [j, B] of [[k, BA], [k + 1, BB]]) {
      if (j >= N) break;
      if (previo) {
        let f = 0, g = 0;
        for (let b = 0; b < NB; b++) { const d = Math.max(0, B[b] - previo[b]); f += d; if (b < NG) g += d; }
        on[j] = f; bombo[j] = g;
      }
      previo = Float64Array.from(B);
    }
  }
  // sin la tendencia lenta (promedio de 1 s) y solo lo que sube
  const ancho = Math.round(fps), acum = new Float64Array(N + 1);
  for (let j = 0; j < N; j++) acum[j + 1] = acum[j] + on[j];
  const o = Float32Array.from(on, (v, j) => { const a = Math.max(0, j - (ancho >> 1)), b = Math.min(N, j + (ancho >> 1) + 1); return Math.max(0, v - (acum[b] - acum[a]) / (b - a)); });
  const cacheAc = new Map(), acEnt = lag => {
    if (!cacheAc.has(lag)) { let s = 0; for (let j = lag; j < N; j++) s += o[j] * o[j - lag]; cacheAc.set(lag, lag < N ? s / (N - lag) : 0); }
    return cacheAc.get(lag);
  };
  const ac = lag => { const a = Math.floor(lag), u = lag - a; return acEnt(a) * (1 - u) + acEnt(a + 1) * u; };
  // puntaje: el pulso, su doble y su compás, con preferencia por tempos cercanos a 120 (como hace el oído)
  const puntaje = bpm => { const L = fps * 60 / bpm; return (ac(L) + 0.5 * ac(2 * L) + 0.25 * ac(4 * L) + 0.5 * ac(L / 2)) * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2); };
  let mejor = null;
  for (let bpm = 60; bpm <= 200; bpm += 0.25) { const v = puntaje(bpm); if (!mejor || v > mejor.v) mejor = { bpm, v }; }
  if (!mejor || mejor.v <= 0) return null;
  for (let bpm = mejor.bpm - 0.25; bpm <= mejor.bpm + 0.25; bpm += 0.05) { const v = puntaje(bpm); if (v > mejor.v) mejor = { bpm, v }; }
  // peine: suma de ataques cada P cuadros desde f (con un cuadro de holgura para el swing y los humanos)
  const peine = (x, P, f, holgura = 1) => {
    let s = 0;
    for (let p = f; p < N; p += P) { const j = Math.round(p); s += holgura ? Math.max(x[j - 1] || 0, x[j] || 0, x[j + 1] || 0) : x[j] || 0; }
    return s;
  };
  const mejorFase = (x, P, holgura) => { let f0 = 0, m = -1; for (let f = 0; f < P; f += 0.5) { const s = peine(x, P, f, holgura); if (s > m) { m = s; f0 = f; } } return { f: f0, m }; };
  // afina el tempo: el peine de pulsos más nítido cerca del encontrado (un error de 0,3 % ya corre el pulso 0,1 s en 40 s)
  let bpm = mejor.bpm, nitidez = -1;
  for (let b = mejor.bpm - 0.4; b <= mejor.bpm + 0.4 + 1e-9; b += 0.05) { const { m } = mejorFase(o, fps * 60 / b, 0); if (m > nitidez) { nitidez = m; bpm = b; } }
  // fase en dos pasos: 1) la rejilla de corcheas (casi toda la música las marca: platillos, teclado, guitarra);
  // 2) ¿el pulso o el contratiempo? Si el bombo lo dice claro (4 veces más fuerte en uno de los dos) manda el
  //    bombo; si no (trap, phonk: el 808 va sincopado) manda el conjunto, donde pesan la caja y las palmas
  const L = fps * 60 / bpm, f8 = mejorFase(on, L / 2).f;
  const r = Math.log2((peine(bombo, L, f8) + 1e-6) / (peine(bombo, L, f8 + L / 2) + 1e-6));
  const fase = (Math.abs(r) >= 2 ? r > 0 : peine(on, L, f8) >= peine(on, L, f8 + L / 2)) ? f8 : f8 + L / 2;
  return { bpm: Math.round(bpm * 10) / 10, fase: r4(desde + (fase * hop + ven / 2) / sr) };
}

// ---------- Rejilla de pulsos ----------
function rejilla(musica) {
  const m = normalizarMusica(musica) || (esObj(musica) && esNum(+musica.bpm) && +musica.bpm > 0 ? { bpm: +musica.bpm, inicio: +musica.inicio || 0, fase: +musica.fase || 0, archivo: musica.archivo } : null);
  if (!m) return null;
  const periodo = 60 / m.bpm, origen = (m.archivo || !m.estilo ? m.fase || 0 : 0) - m.inicio;   // pulso k en el video: origen + k·periodo
  return { bpm: m.bpm, periodo, origen: ((origen % periodo) + periodo) % periodo };
}
const alPulso = (t, R) => R.origen + Math.round((t - R.origen) / R.periodo) * R.periodo;

// Corre los keyframes y los sonidos al pulso más cercano de la música (los sonidos que suben, por su final)
export function ajustarAlRitmo(proyecto, { textos = false } = {}) {
  const R = rejilla(proyecto?.audio?.musica), resultado = { claves: 0, clips: 0, textos: 0, bpm: R?.bpm ?? null };
  if (!R) return resultado;
  const D = proyecto.duracion || 8, tol = 1 / 60;
  for (const claves of Object.values(proyecto.pistas || {})) {
    if (!Array.isArray(claves)) continue;
    let anterior = -Infinity;
    for (const c of [...claves].sort((a, b) => a.t - b.t)) {
      // el primero y el último cuadro no se mueven: de eso depende que el bucle cierre
      if (c.t < tol || c.t > D - tol) { anterior = c.t; continue; }
      let nt = alPulso(c.t, R);
      if (nt <= tol || nt >= D - tol || nt - anterior < tol) { anterior = c.t; continue; }
      nt = r4(nt);
      if (Math.abs(nt - c.t) > 1e-4) { c.t = nt; resultado.claves++; }
      anterior = c.t;
    }
    claves.sort((a, b) => a.t - b.t);
  }
  for (const c of proyecto.audio?.clips || []) {
    const e = EFECTOS[c?.efecto]; if (!e || !esNum(+c.t)) continue;
    const ancla = (e.ancla || 0) * e.duracion;
    let nt = alPulso(+c.t + ancla, R) - ancla;
    if (nt < 0) nt += R.periodo * Math.ceil(-nt / R.periodo);
    // si cabía entero en el video, que siga cabiendo (una foto al final no puede quedar cortada)
    if (+c.t + e.duracion <= D + 1e-6 && nt + e.duracion > D + 1e-6 && nt - R.periodo >= 0) nt -= R.periodo;
    if (nt >= D) continue;
    nt = r4(nt);
    if (Math.abs(nt - c.t) > 1e-4) { c.t = nt; resultado.clips++; }
  }
  if (textos) for (const capa of proyecto.textos || []) {
    if (!esNum(capa?.entra) || capa.entra < tol) continue;
    const nt = r4(alPulso(capa.entra, R));
    if (nt > 0 && nt < D && Math.abs(nt - capa.entra) > 1e-4 && (!esNum(capa.sale) || nt < capa.sale)) { capa.entra = nt; resultado.textos++; }
  }
  return resultado;
}

// ---------- Sugerencias automáticas ----------
export function nuevoIdClip(proyecto, extra = []) {
  let n = 0;
  for (const c of [...(proyecto?.audio?.clips || []), ...extra]) { const m = /^au(\d+)$/.exec(c?.id || ''); if (m) n = Math.max(n, +m[1]); }
  return 'au' + (n + 1);
}

// Lee los movimientos de la cámara y los textos y propone dónde van los efectos (siempre lo mismo para el mismo proyecto)
export function sugerirSonidos(proyecto) {
  const D = proyecto?.duracion || 8, dt = 1 / 30, N = Math.round(D / dt), m = [];
  for (let i = 0; i <= N; i++) { const t = Math.min(D, i * dt); m.push({ t, ...evaluar(proyecto, t) }); }
  // velocidad de cámara normalizada: 1 = movimiento rápido (≈ 240°/s de giro, zoom ×2,5 por segundo…)
  const vel = m.map((_, i) => {
    const a = m[Math.max(0, i - 1)], b = m[Math.min(N, i + 1)], h = b.t - a.t || dt;
    const g = Math.abs(b.giro - a.giro) / h / 240, z = Math.abs(Math.log(b.zoom / a.zoom)) / h / 0.9, inc = Math.abs(b.inclinacion - a.inclinacion) / h / 70;
    const lat = (Math.abs(b.lateral - a.lateral) + Math.abs(b.altura - a.altura)) / h / 0.5, rod = Math.abs(b.rodar - a.rodar) / h / 60;
    return { v: g + z + inc + lat + rod, lado: lat + rod > g + z + inc };
  });
  const clips = [], poner = (efecto, t, volumen) => {
    const e = EFECTOS[efecto], tt = r4(limitar(t, 0, Math.max(0, D - Math.min(0.3, e.duracion))));
    clips.push({ efecto, t: tt, volumen, tono: 0 });
  };
  const cerca = (t, lista, sep) => clips.some(c => lista.includes(c.efecto) && Math.abs(c.t + EFECTOS[c.efecto].ancla * EFECTOS[c.efecto].duracion - t) < sep);
  // tramos entre keyframes de las pistas de movimiento: un whoosh en el punto más rápido de cada tramo veloz
  const cortes = new Set([0, D]);
  for (const p of ['giro', 'zoom', 'inclinacion', 'lateral', 'altura', 'rodar']) for (const c of proyecto?.pistas?.[p] || []) if (c.t > 0 && c.t < D) cortes.add(r4(c.t));
  const lim = [...cortes].sort((a, b) => a - b), tramos = [];
  for (let j = 0; j < lim.length - 1; j++) {
    const i0 = Math.round(lim[j] / dt), i1 = Math.round(lim[j + 1] / dt);
    let imax = i0; for (let i = i0; i <= i1; i++) if (vel[i].v > vel[imax].v) imax = i;
    tramos.push({ a: lim[j], b: lim[j + 1], t: m[imax].t, v: vel[imax].v, lado: vel[imax].lado });
  }
  for (const tr of tramos) {
    if (tr.v < 0.85 || cerca(tr.t, ['whoosh', 'whooshCorto', 'swipe'], 0.6)) continue;
    const ef = tr.lado ? 'swipe' : tr.b - tr.a < 0.8 ? 'whooshCorto' : 'whoosh', e = EFECTOS[ef];
    poner(ef, tr.t - e.ancla * e.duracion, 0.7);
  }
  // subida que termina en el movimiento más grande
  const mayor = tramos.reduce((x, y) => (!x || y.v > x.v ? y : x), null);
  if (mayor && mayor.v >= 0.6) {
    if (mayor.t >= EFECTOS.riser.duracion + 0.2) poner('riser', mayor.t - EFECTOS.riser.duracion, 0.55);
    else if (mayor.t >= EFECTOS.whooshInverso.duracion * 0.97 + 0.1) poner('whooshInverso', mayor.t - EFECTOS.whooshInverso.duracion * 0.97, 0.6);
  }
  // brillo cuando la cámara llega a la piedra (el foco sube) o cuando empieza enfocándola, y en los destellos de luz
  const brillo = t => { if (!cerca(t, ['brillo'], 0.9)) poner('brillo', t, 0.75); };
  if (m[0].foco >= 0.6) brillo(0.15);
  for (let i = 1, ini = null; i <= N; i++) {
    const sube = m[i].foco > m[i - 1].foco + 1e-4;
    if (sube && ini === null) ini = i - 1;
    if ((!sube || i === N) && ini !== null) { if (m[i - 1].foco - m[ini].foco >= 0.3) brillo(m[i - 1].t - 0.1); ini = null; }
  }
  for (let i = 1; i <= N; i++) if (m[i].exposicion - m[Math.max(0, i - 9)].exposicion > 0.18 && (i === N || m[i + 1].exposicion <= m[i].exposicion)) brillo(m[i].t - 0.05);
  // textos: brillo con el título, "ding" con el precio, "pop" con el gancho
  for (const c of proyecto?.textos || []) {
    if (!esObj(c) || c.oculta || !esNum(c.entra) || c.entra >= D) continue;
    if (c.estilo === 'titulo') brillo(c.entra + 0.1);
    else if (c.estilo === 'precio' && !cerca(c.entra, ['campana'], 0.5)) poner('campana', c.entra + 0.05, 0.7);
    else if (c.estilo === 'gancho' && !cerca(c.entra, ['pop'], 0.4)) poner('pop', c.entra, 0.6);
  }
  // golpe en el primer pulso fuerte: el drop de la música si cae en los primeros 2,5 s (el gancho), si no el primer pulso después de 0,5 s
  const mu = normalizarMusica(proyecto?.audio?.musica), R = rejilla(proyecto?.audio?.musica) || { periodo: 0.5, origen: 0 };
  const E = mu?.estilo && !mu.archivo ? ESTILOS_MUSICA[mu.estilo] : null;
  let tg = E?.entrada ? E.entrada * 240 / mu.bpm - mu.inicio : -1;
  if (!(tg >= 0.5 && tg <= 2.5)) { tg = R.origen; while (tg < 0.5 - 1e-6) tg += R.periodo; }
  if (tg < D - 0.5) poner(['trap', 'phonk', 'house', 'popViral'].includes(mu?.estilo) && !mu?.archivo ? 'drop808' : 'impacto', tg, mu?.estilo === 'lujo' ? 0.5 : 0.75);
  // final con foto si el video no se repite
  if (proyecto && proyecto.bucle === false && D > 2) poner('obturador', D - 0.45, 0.6);
  const lista = clips.sort((a, b) => a.t - b.t).slice(0, 12), ids = [];
  for (const c of lista) { c.id = nuevoIdClip(proyecto, ids); ids.push(c); }
  return lista;
}

// ---------- Reproducción en la vista previa ----------
const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class Reproductor {
  constructor() {
    this.ctx = null; this.buffer = null; this.duracion = 0;
    this.fuente = null; this.quiere = false; this.ancla = { t: 0, reloj: ahora() };
    this.espera = null; this.pendiente = null; this.version = 0;
    this.tokPrueba = 0; this.prueba = null; this.alCambiarPrueba = null;
    // el navegador solo deja sonar audio después de un toque de la persona: con el primero se desbloquea
    if (typeof document !== 'undefined') {
      const desbloquear = () => { if (this.ctx || this.quiere) this.contexto(); };
      for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, desbloquear, { capture: true, passive: true });
    }
  }

  contexto() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }
      this.bus = this.ctx.createGain(); this.busPrueba = this.ctx.createGain();
      this.bus.connect(this.ctx.destination); this.busPrueba.connect(this.ctx.destination);
      this.ctx.onstatechange = () => { if (this.ctx.state === 'running' && this.quiere && !this.fuente) this.arrancar(); };
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  get sonando() { return !!(this.quiere && this.fuente && this.ctx?.state === 'running'); }
  // segundo del video que está sonando
  get posicion() {
    if (this.sonando && this.duracion > 0) return (this.desdeFuente + this.ctx.currentTime - this.inicioFuente) % this.duracion;
    return this.posicionDeseada();
  }
  posicionDeseada() {
    const d = this.duracion || 1, t = this.quiere ? this.ancla.t + ahora() - this.ancla.reloj : this.ancla.t;
    return ((t % d) + d) % d;
  }

  // Mezcla el audio del proyecto (espera 250 ms: si llegan varios cambios seguidos se mezcla una sola vez)
  preparar(audio, duracion) {
    clearTimeout(this.espera);
    this.pendiente?.(false);
    const v = ++this.version, copia = { clips: (audio?.clips || []).map(c => ({ ...c })), musica: audio?.musica ? { ...audio.musica } : null };
    return new Promise(ok => {
      this.pendiente = ok;
      this.espera = setTimeout(async () => {
        this.pendiente = null;
        try {
          const b = hayAudio(copia) ? await mezclar(copia, duracion) : null;
          if (v !== this.version) return ok(false);
          const pos = this.sonando ? this.posicion : null;
          this.buffer = b; this.duracion = +duracion || 8;
          if (pos !== null) this.ancla = { t: pos, reloj: ahora() };
          if (this.quiere) this.arrancar(); else this.quitarFuente();
          ok(true);
        } catch (e) { console.error(e); ok(false); }
      }, 250);
    });
  }

  reproducir(desdeSeg = 0) {
    this.quiere = true;
    this.ancla = { t: esNum(+desdeSeg) ? +desdeSeg : 0, reloj: ahora() };
    if (this.contexto()) this.arrancar();
  }
  buscar(seg) { if (this.quiere) this.reproducir(seg); else this.ancla = { t: +seg || 0, reloj: ahora() }; }
  detener() { this.quiere = false; this.ancla = { t: this.posicion, reloj: ahora() }; this.quitarFuente(); }

  arrancar() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.buffer) { this.quitarFuente(); return; }
    const d = Math.min(this.duracion, this.buffer.duration), pos = this.posicionDeseada() % d;
    const f = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime + 0.015;
    f.buffer = this.buffer; f.loop = true; f.loopStart = 0; f.loopEnd = d;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.02);   // cruce corto: sin clics al cambiar la mezcla
    f.connect(g); g.connect(this.bus); f.start(t, pos);
    this.quitarFuente(t);
    this.fuente = f; this.gFuente = g; this.inicioFuente = t; this.desdeFuente = pos;
  }
  quitarFuente(t = this.ctx?.currentTime ?? 0) {
    const f = this.fuente, g = this.gFuente; this.fuente = this.gFuente = null;
    if (!f) return;
    try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.03); f.stop(t + 0.04); } catch (e) { /* ya parada */ }
  }

  // Escuchar un efecto o un estilo sin tocar la mezcla del video (la mezcla se baja mientras tanto)
  async probarEfecto(id, { tono = 0, volumen = 0.9 } = {}) {
    if (!EFECTOS[id]) return;
    const tok = ++this.tokPrueba, ctx = this.contexto(); if (!ctx) return;
    this.marcarPrueba(id);
    const b = await renderEfecto(id, tono, FRECUENCIA);
    if (tok === this.tokPrueba) this.sonarPrueba(b, volumen, id);
  }
  async probarMusica(musica, segs = 4) {
    const m = normalizarMusica(musica); if (!m) return;
    const tok = ++this.tokPrueba, ctx = this.contexto(); if (!ctx) return;
    const id = 'musica:' + (m.archivo ? 'archivo' : m.estilo);
    this.marcarPrueba(id);
    // los estilos se escuchan desde un segundo antes de que entre el ritmo
    const E = !m.archivo && ESTILOS_MUSICA[m.estilo], desde = E ? Math.max(0, E.entrada * 240 / m.bpm - 1) : m.inicio;
    const b = await mezclar({ clips: [], musica: { ...musica, ...m, inicio: desde, fundidoSalida: 0.8, volumen: 0.6 } }, segs);
    if (tok === this.tokPrueba) this.sonarPrueba(b, 1, id);
  }
  sonarPrueba(b, volumen, id) {
    const ctx = this.ctx; this.pararFuentePrueba();
    const f = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = volumen;
    f.buffer = b; f.connect(g); g.connect(this.busPrueba); f.start();
    this.bus.gain.setTargetAtTime(0.2, ctx.currentTime, 0.05);
    f.onended = () => { if (this.fPrueba === f) { this.fPrueba = null; this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.1); this.marcarPrueba(null); } };
    this.fPrueba = f;
  }
  pararFuentePrueba() { const f = this.fPrueba; this.fPrueba = null; try { f?.stop(); } catch (e) { /* nada */ } }
  pararPrueba() {
    this.tokPrueba++; this.pararFuentePrueba();
    if (this.ctx) this.bus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
    this.marcarPrueba(null);
  }
  marcarPrueba(id) { this.prueba = id; this.alCambiarPrueba?.(id); }
}

// ---------- Codificación para el video ----------
export async function codificarAudio(buffer, { contenedor = 'mp4' } = {}) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') throw new Error('Este navegador no puede codificar el audio del video. Usa Chrome, Edge o Safari actualizados.');
  const canales = Math.min(2, buffer.numberOfChannels);
  const opciones = contenedor === 'mp4'
    ? [{ codec: 'mp4a.40.2', nombre: 'aac', bitrate: 192000 }, { codec: 'opus', nombre: 'opus', bitrate: 160000 }]
    : [{ codec: 'opus', nombre: 'opus', bitrate: 160000 }];
  let elegido = null;
  for (const o of opciones) {
    // Opus trabaja por dentro a 48 kHz (se pide así aunque acepte otras); AAC, a la frecuencia de la mezcla
    for (const sr of [...new Set(o.nombre === 'opus' ? [48000, buffer.sampleRate] : [buffer.sampleRate, 48000, 44100])]) {
      const cfg = { codec: o.codec, sampleRate: sr, numberOfChannels: canales, bitrate: o.bitrate };
      try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) { elegido = { ...o, cfg }; break; } } catch (e) { /* siguiente */ }
    }
    if (elegido) break;
  }
  if (!elegido) throw new Error('Este navegador no tiene un codificador de audio compatible: el video saldría sin sonido.');
  const sr = elegido.cfg.sampleRate, datos = sr === buffer.sampleRate ? buffer : await remuestrear(buffer, sr, canales);
  const chunks = []; let error = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => chunks.push({ chunk, meta }), error: e => { error = e; } });
  enc.configure(elegido.cfg);
  const N = 1024, total = datos.length, planos = [...Array(canales)].map((_, c) => datos.getChannelData(c));
  for (let i = 0; i < total; i += N) {
    if (error) break;
    const k = Math.min(N, total - i), plano = new Float32Array(k * canales);
    for (let c = 0; c < canales; c++) plano.set(planos[c].subarray(i, i + k), c * k);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: k, numberOfChannels: canales, timestamp: Math.round(i / sr * 1e6), data: plano });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 64) await new Promise(r => setTimeout(r, 0));
  }
  await enc.flush(); enc.close();
  if (error) throw new Error('No se pudo codificar el audio: ' + (error.message || error));
  return { codec: elegido.nombre, chunks, sampleRate: sr, numberOfChannels: canales };
}
async function remuestrear(b, sr, canales) {
  const ctx = new OfflineAudioContext(canales, Math.ceil(b.duration * sr), sr), f = ctx.createBufferSource();
  f.buffer = b; f.connect(ctx.destination); f.start();
  return ctx.startRendering();
}

// ---------- Panel ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, d = 1) => (+x).toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const reloj = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ICONOS = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  subir: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  borrar: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  cabezal: '<path d="M12 3v18"/><path d="M8 3h8l-4 4z"/>',
  ritmo: '<path d="M4 18V9M9 18V5M14 18v-7M19 18V8"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  silencio: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>',
  nota: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
};
const icono = n => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[n]}</svg>`;
const AYUDA_TENDENCIA = 'Para usar una canción en tendencia, exporta el video sin música y agrégala desde la biblioteca de Instagram: así el algoritmo lo reconoce como audio en tendencia.';

export class PanelSonido {
  // opción extra (no obligatoria): alSeleccionar({ tipo: 'sonido', id }) cuando se elige un sonido de la lista
  constructor(contenedor, { obtenerProyecto, alCambiar, obtenerTiempo, reproductor, alSeleccionar } = {}) {
    this.cont = contenedor;
    Object.assign(this, { obtenerProyecto, alCambiarExt: alCambiar, obtenerTiempo, alSeleccionarExt: alSeleccionar });
    this.rep = reproductor || new Reproductor();
    this.sel = null; this.cancion = null; this.ultimaMusica = null; this.deshacer = null; this.ocupado = false;
    contenedor.classList.add('pso');
    contenedor.innerHTML = `
      <section class="pso-bloque">
        <div class="pso-cab"><h3>Música de fondo</h3><span class="pso-ayuda">Creada aquí mismo, sin derechos de autor</span></div>
        <div class="pso-estilos" role="radiogroup" aria-label="Estilo de música"></div>
        <div class="pso-ajustes"></div>
        <div class="pso-cancion">
          <label class="btn sec chico pso-subir">${icono('subir')}<span>Subir mi canción</span><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden></label>
          <p class="pso-nota">${esc(AYUDA_TENDENCIA)}</p>
        </div>
      </section>
      <section class="pso-bloque">
        <div class="pso-cab"><h3>Efectos virales</h3><span class="pso-ayuda">Toca para escuchar · <b>+</b> lo pone en el cabezal</span></div>
        <div class="pso-efectos">${Object.entries(EFECTOS).map(([id, e]) => `
          <div class="pso-efecto" data-efecto="${id}">
            <button type="button" class="pso-oir" data-accion="oir" aria-label="Escuchar ${esc(e.nombre)}"><span class="pso-emoji" aria-hidden="true">${e.emoji}</span><span class="pso-nombre">${esc(e.nombre)}</span><i class="pso-ondas" aria-hidden="true"><b></b><b></b><b></b></i></button>
            <button type="button" class="pso-poner" data-accion="poner" aria-label="Poner ${esc(e.nombre)} en el cabezal" title="Poner en el cabezal">${icono('mas')}</button>
          </div>`).join('')}
        </div>
      </section>
      <section class="pso-bloque">
        <div class="pso-cab"><h3>Sonidos del video</h3>
          <div class="pso-mas">
            <button type="button" class="btn chico" data-accion="sugerir">✨ Sugerir sonidos</button>
            <button type="button" class="btn sec chico" data-accion="ritmo">${icono('ritmo')}Ajustar al ritmo</button>
          </div>
        </div>
        <div class="pso-aviso" role="status" hidden><span></span><button type="button" class="pso-enlace" data-accion="deshacer" hidden>Deshacer</button></div>
        <ol class="pso-lista" aria-label="Efectos de sonido del video"></ol>
      </section>`;
    this.$estilos = contenedor.querySelector('.pso-estilos');
    this.$ajustes = contenedor.querySelector('.pso-ajustes');
    this.$lista = contenedor.querySelector('.pso-lista');
    this.$aviso = contenedor.querySelector('.pso-aviso');
    this.$archivo = contenedor.querySelector('.pso-subir input');
    contenedor.addEventListener('click', e => this.alClic(e));
    contenedor.addEventListener('input', e => this.alMover(e));
    contenedor.addEventListener('change', e => this.alSoltar(e));
    // los estilos son un grupo de opciones: con las flechas se pasa de uno a otro
    this.$estilos.addEventListener('keydown', e => {
      const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!paso) return;
      const bs = [...this.$estilos.querySelectorAll('.pso-elegir')], i = bs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); bs[(i + paso + bs.length) % bs.length].focus();
    });
    this.$archivo.addEventListener('change', () => { const f = this.$archivo.files?.[0]; this.$archivo.value = ''; if (f) this.subir(f); });
    const previo = this.rep.alCambiarPrueba;
    this.rep.alCambiarPrueba = id => { previo?.(id); this.marcarPrueba(id); };
    this.render();
  }

  proyecto() { const p = this.obtenerProyecto?.() || {}; if (!esObj(p.audio)) p.audio = { clips: [], musica: null }; if (!Array.isArray(p.audio.clips)) p.audio.clips = []; return p; }
  duracion() { return +this.proyecto().duracion || 8; }
  cabezal() { return limitar(+this.obtenerTiempo?.() || 0, 0, this.duracion()); }
  musica() { return this.proyecto().audio.musica || null; }
  cambio() { const p = this.proyecto(); this.alCambiarExt?.('audio'); this.rep.preparar(p.audio, p.duracion); }

  seleccionar(id) {
    this.sel = id;
    this.pintarClips();
    this.$lista.querySelector(`[data-id="${CSS.escape(String(id))}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  render() {
    const m = this.musica();
    if (tieneBuffer(m?.archivo)) this.cancion ||= { nombre: m.archivo.nombre, buffer: m.archivo.buffer, bpm: m.bpm, fase: m.fase || 0 };
    this.pintarEstilos(); this.pintarAjustes(); this.pintarClips(); this.marcarPrueba(this.rep.prueba);
  }

  // ----- Música -----
  pintarEstilos() {
    const m = this.musica(), conArchivo = !!m?.archivo, actual = conArchivo ? 'archivo' : m && ESTILOS_MUSICA[m.estilo] ? m.estilo : 'ninguna';
    const tarjeta = (id, emoji, nombre, detalle, probar = true) => `
      <div class="pso-estilo${id === actual ? ' activo' : ''}" data-estilo="${id}">
        <button type="button" class="pso-elegir" role="radio" aria-checked="${id === actual}" data-accion="estilo"><span class="pso-emoji" aria-hidden="true">${emoji}</span><b>${esc(nombre)}</b><small>${esc(detalle)}</small></button>
        ${probar ? `<button type="button" class="pso-play" data-accion="probarMusica" aria-label="Escuchar 4 segundos de ${esc(nombre)}">${icono('play')}</button>` : ''}
        <i class="pso-ondas" aria-hidden="true"><b></b><b></b><b></b></i>
      </div>`;
    // el ritmo de cada estilo se ve (y se cambia) en el control de abajo, al elegirlo
    let html = Object.entries(ESTILOS_MUSICA).map(([id, E]) => tarjeta(id, E.emoji, E.nombre, E.descripcion)).join('');
    const c = this.cancion || (m?.archivo ? { nombre: m.archivo.nombre } : null);
    if (c) html += tarjeta('archivo', '🎵', 'Mi canción', c.buffer ? `${c.nombre} · ${reloj(c.buffer.duration)}` : `${c.nombre} · vuelve a subirla`, !!c.buffer);
    html += tarjeta('ninguna', '🔇', 'Sin música', 'Solo los efectos', false);
    this.$estilos.innerHTML = html;
    this.$archivo.previousElementSibling.textContent = c?.buffer ? 'Cambiar canción' : 'Subir mi canción';
  }

  pintarAjustes() {
    const m = this.musica();
    if (!m) { this.$ajustes.innerHTML = ''; this.$ajustes.hidden = true; return; }
    this.$ajustes.hidden = false;
    const E = !m.archivo && ESTILOS_MUSICA[m.estilo], c = this.cancion;
    const rango = (campo, nombre, min, max, pasoR, valor, salida) => `
      <label class="rango pso-rango"><span>${nombre}</span><input type="range" data-campo="${campo}" min="${min}" max="${max}" step="${pasoR}" value="${valor}"><output>${salida}</output></label>`;
    this.$ajustes.innerHTML =
      rango('bpm', E ? 'Ritmo (pulsos por minuto)' : 'Pulsos por minuto de tu canción', E ? E.min : 60, E ? E.max : 200, E ? 1 : 0.5, m.bpm || E?.bpm || 120, `${num(m.bpm || E?.bpm || 120)} bpm`) +
      rango('volumen', 'Volumen de la música', 0, 1, 0.01, m.volumen ?? 0.55, `${Math.round((m.volumen ?? 0.55) * 100)} %`) +
      rango('fundidoSalida', 'Desvanecer al final', 0, 4, 0.1, m.fundidoSalida ?? 1.5, +m.fundidoSalida === 0 ? 'no' : `${num(m.fundidoSalida ?? 1.5)} s`) +
      (m.archivo && c?.buffer ? rango('inicio', 'La canción empieza en', 0, Math.max(0, Math.floor(c.buffer.duration - 1)), 0.5, m.inicio || 0, reloj(m.inicio || 0)) : '');
  }

  elegirEstilo(id) {
    const p = this.proyecto(), m = p.audio.musica;
    if (m) this.ultimaMusica = { volumen: m.volumen, fundidoSalida: m.fundidoSalida };
    if (id === 'ninguna') p.audio.musica = null;
    else if (id === 'archivo') {
      if (!this.cancion?.buffer) { this.$archivo.click(); return; }
      const c = this.cancion;
      p.audio.musica = { ...musicaNueva(m?.estilo || 'lujo', m || this.ultimaMusica), estilo: m?.estilo || null, archivo: { nombre: c.nombre, buffer: c.buffer }, bpm: c.bpm || 120, fase: c.fase || 0, inicio: m?.archivo ? m.inicio || 0 : 0 };
    } else if (m && m.estilo === id && !m.archivo) return;
    else p.audio.musica = musicaNueva(id, m || this.ultimaMusica);
    this.pintarEstilos(); this.pintarAjustes();
    this.cambio();
  }

  async subir(file) {
    this.mostrarAviso('Leyendo la canción…');
    try {
      const buffer = await decodificarArchivo(file), tempo = estimarTempo(buffer);
      this.cancion = { nombre: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Mi canción', buffer, bpm: tempo?.bpm || 120, fase: tempo?.fase || 0 };
      const p = this.proyecto(), m = p.audio.musica;
      if (m) this.ultimaMusica = { volumen: m.volumen, fundidoSalida: m.fundidoSalida };
      p.audio.musica = { ...musicaNueva(m?.estilo || 'lujo', m || this.ultimaMusica), estilo: m?.estilo || null, archivo: { nombre: this.cancion.nombre, buffer }, bpm: this.cancion.bpm, fase: this.cancion.fase };
      this.pintarEstilos(); this.pintarAjustes(); this.cambio();
      this.mostrarAviso(tempo ? `Canción lista. Su ritmo parece de ${num(tempo.bpm)} bpm: corrígelo si no coincide.` : 'Canción lista.');
    } catch (e) { this.mostrarAviso(e.message || 'No se pudo leer esa canción.', true); }
  }

  // ----- Sonidos del video -----
  pintarClips() {
    const p = this.proyecto(), D = this.duracion(), clips = [...p.audio.clips].filter(esObj).sort((a, b) => (+a.t || 0) - (+b.t || 0));
    // conserva el foco si estaba en la lista (se reconstruye entera)
    const act = document.activeElement, foco = this.$lista.contains(act) && act.closest('li')?.dataset.id
      ? { id: act.closest('li').dataset.id, sel: act.dataset.campo ? `[data-campo="${act.dataset.campo}"]` : `[data-accion="${act.dataset.accion}"]` } : null;
    if (!clips.some(c => c.id === this.sel)) this.sel = null;
    this.$lista.innerHTML = clips.length ? clips.map(c => {
      const e = EFECTOS[c.efecto] || { nombre: c.efecto, emoji: '🔊' }, vol = esNum(+c.volumen) ? +c.volumen : 0.8, tono = Math.round(+c.tono || 0), t = +c.t || 0;
      // debajo del nombre: dónde está el golpe (whoosh, subidas) o cuánto dura; el segundo exacto va en la casilla
      const detalle = e.ancla ? (e.ancla >= 0.95 ? `llega al tope a los ${num(t + e.ancla * e.duracion, 2)} s` : `golpe a los ${num(t + e.ancla * e.duracion, 2)} s`) : e.duracion ? `dura ${num(e.duracion, 1)} s` : '';
      return `<li class="pso-clip" data-id="${esc(c.id)}" aria-current="${c.id === this.sel}">
        <button type="button" class="pso-clip-oir" data-accion="oirClip" aria-label="Escuchar ${esc(e.nombre)}"><span aria-hidden="true">${e.emoji}</span></button>
        <button type="button" class="pso-clip-nom" data-accion="elegirClip"><b>${esc(e.nombre)}</b><small>${detalle}</small></button>
        <span class="pso-tiempo"><span class="pso-num"><input type="number" data-campo="t" min="0" max="${D}" step="0.01" value="${Math.round(t * 100) / 100}" aria-label="Segundo en que empieza ${esc(e.nombre)}"><i>s</i></span>
          <button type="button" class="pso-ib" data-accion="aCabezal" title="Llevarlo al cabezal" aria-label="Llevar ${esc(e.nombre)} al cabezal">${icono('cabezal')}</button></span>
        <button type="button" class="pso-ib peligro" data-accion="quitar" title="Quitar" aria-label="Quitar ${esc(e.nombre)}">${icono('borrar')}</button>
        <div class="pso-mezcla">
          <label class="pso-mini"><span>Volumen</span><input type="range" data-campo="volumen" min="0" max="1" step="0.05" value="${vol}"><output>${Math.round(vol * 100)} %</output></label>
          <label class="pso-mini"><span>Tono</span><input type="range" data-campo="tono" min="-12" max="12" step="1" value="${tono}"><output>${tono ? (tono > 0 ? '+' : '−') + Math.abs(tono) : 'normal'}</output></label>
        </div>
      </li>`;
    }).join('') : '<li class="pso-vacia">Aún no hay efectos. Toca <b>+</b> en uno para ponerlo en el cabezal, o usa <b>Sugerir sonidos</b> para que se acomoden solos a los movimientos de la cámara.</li>';
    if (foco) this.$lista.querySelector(`li[data-id="${CSS.escape(foco.id)}"] ${foco.sel}`)?.focus();
  }

  ponerEfecto(id) {
    const p = this.proyecto(), e = EFECTOS[id], D = this.duracion();
    // los sonidos que suben terminan justo en el cabezal; los whoosh tienen su punto fuerte ahí
    const t = r4(limitar(this.cabezal() - (e.ancla || 0) * e.duracion, 0, Math.max(0, D - 0.05)));
    const clip = { id: nuevoIdClip(p), efecto: id, t, volumen: 0.8, tono: 0 };
    p.audio.clips.push(clip);
    this.sel = clip.id; this.pintarClips(); this.cambio();
    this.mostrarAviso(`${e.emoji} ${e.nombre} quedó a los ${num(t, 2)} s.`);
    this.alSeleccionarExt?.({ tipo: 'sonido', id: clip.id });
  }

  sugerir() {
    const p = this.proyecto(), antes = p.audio.clips.map(c => ({ ...c })), nuevos = sugerirSonidos(p);
    if (!nuevos.length) { this.mostrarAviso('No encontré movimientos para acompañar. Agrega keyframes o textos y vuelve a intentarlo.'); return; }
    p.audio.clips.splice(0, p.audio.clips.length, ...nuevos);
    this.sel = null; this.pintarClips(); this.cambio();
    this.deshacer = () => { p.audio.clips.splice(0, p.audio.clips.length, ...antes); };
    this.mostrarAviso(`Se pusieron ${nuevos.length} sonido${nuevos.length === 1 ? '' : 's'} en los momentos clave.`, false, true);
  }

  ajustarRitmo() {
    const p = this.proyecto();
    if (!normalizarMusica(p.audio.musica) && !(p.audio.musica?.bpm > 0)) { this.mostrarAviso('Primero elige una música: los movimientos se ajustan a su ritmo.', true); return; }
    const antes = JSON.stringify({ pistas: p.pistas, clips: p.audio.clips });
    const r = ajustarAlRitmo(p);
    if (!r.claves && !r.clips) { this.mostrarAviso(`Todo ya estaba al ritmo de ${num(r.bpm)} bpm.`); return; }
    this.pintarClips(); this.cambio();
    this.deshacer = () => { const v = JSON.parse(antes); p.pistas = v.pistas; p.audio.clips.splice(0, p.audio.clips.length, ...v.clips); };
    const partes = [r.claves && `${r.claves} keyframe${r.claves === 1 ? '' : 's'}`, r.clips && `${r.clips} sonido${r.clips === 1 ? '' : 's'}`].filter(Boolean).join(' y ');
    this.mostrarAviso(`Se ajustaron ${partes} al ritmo (${num(r.bpm)} bpm).`, false, true);
  }

  mostrarAviso(texto, mal = false, conDeshacer = false) {
    const a = this.$aviso;
    a.hidden = false; a.classList.toggle('mal', mal);
    a.querySelector('span').textContent = texto;
    a.querySelector('[data-accion="deshacer"]').hidden = !conDeshacer;
    if (!conDeshacer) this.deshacer = null;
    clearTimeout(this.tAviso); this.tAviso = setTimeout(() => { a.hidden = true; this.deshacer = null; }, conDeshacer ? 9000 : 5000);
  }

  marcarPrueba(id) {
    this.cont.querySelectorAll('.sonando').forEach(el => el.classList.remove('sonando'));
    this.cont.querySelectorAll('.pso-play').forEach(b => { b.innerHTML = icono('play'); });
    if (!id) return;
    const el = id.startsWith('musica:') ? this.$estilos.querySelector(`[data-estilo="${CSS.escape(id.slice(7))}"]`) : this.cont.querySelector(`.pso-efecto[data-efecto="${CSS.escape(id)}"]`);
    el?.classList.add('sonando');
    const b = el?.querySelector('.pso-play'); if (b) b.innerHTML = icono('stop');
  }

  // ----- Eventos -----
  alClic(e) {
    const b = e.target.closest('[data-accion]'); if (!b || !this.cont.contains(b)) return;
    const accion = b.dataset.accion, li = b.closest('li[data-id]'), p = this.proyecto();
    const clip = li ? p.audio.clips.find(c => c.id === li.dataset.id) : null;
    switch (accion) {
      case 'oir': { const id = b.closest('[data-efecto]').dataset.efecto; if (this.rep.prueba === id) this.rep.pararPrueba(); else this.rep.probarEfecto(id); break; }
      case 'poner': this.ponerEfecto(b.closest('[data-efecto]').dataset.efecto); break;
      case 'estilo': this.elegirEstilo(b.closest('[data-estilo]').dataset.estilo); break;
      case 'probarMusica': {
        const id = b.closest('[data-estilo]').dataset.estilo, m = this.musica();
        if (this.rep.prueba === 'musica:' + id) { this.rep.pararPrueba(); break; }
        if (id === 'archivo') { if (this.cancion?.buffer) this.rep.probarMusica({ archivo: this.cancion, bpm: this.cancion.bpm, inicio: m?.archivo ? m.inicio || 0 : 0 }); }
        else this.rep.probarMusica({ estilo: id, bpm: m?.estilo === id && !m.archivo ? m.bpm : ESTILOS_MUSICA[id].bpm });
        break;
      }
      case 'sugerir': this.sugerir(); break;
      case 'ritmo': this.ajustarRitmo(); break;
      case 'deshacer': if (this.deshacer) { this.deshacer(); this.deshacer = null; this.$aviso.hidden = true; this.pintarClips(); this.cambio(); } break;
      case 'oirClip': if (clip) this.rep.probarEfecto(clip.efecto, { tono: +clip.tono || 0, volumen: limitar(+clip.volumen || 0.8, 0, 1) }); break;
      case 'elegirClip': if (clip) { this.sel = clip.id; this.pintarClips(); this.alSeleccionarExt?.({ tipo: 'sonido', id: clip.id }); } break;
      case 'aCabezal': if (clip) { const e = EFECTOS[clip.efecto]; clip.t = r4(limitar(this.cabezal() - (e?.ancla || 0) * (e?.duracion || 0), 0, this.duracion())); this.pintarClips(); this.cambio(); } break;
      case 'quitar': if (clip) {
        const i = p.audio.clips.indexOf(clip); p.audio.clips.splice(i, 1);
        this.pintarClips(); this.cambio();
        this.deshacer = () => p.audio.clips.splice(Math.min(i, p.audio.clips.length), 0, clip);
        this.mostrarAviso(`Se quitó ${EFECTOS[clip.efecto]?.nombre || 'el sonido'}.`, false, true);
      } break;
    }
  }

  // mientras se arrastra solo cambia el número de al lado; al soltar se guarda (y se vuelve a mezclar)
  alMover(e) {
    const inp = e.target, campo = inp.dataset?.campo; if (!campo || inp.type !== 'range') return;
    const out = inp.parentElement.querySelector('output'), v = +inp.value; if (!out) return;
    out.textContent = campo === 'bpm' ? `${num(v)} bpm` : campo === 'volumen' ? `${Math.round(v * 100)} %` : campo === 'fundidoSalida' ? (v === 0 ? 'no' : `${num(v)} s`)
      : campo === 'inicio' ? reloj(v) : campo === 'tono' ? (v ? (v > 0 ? '+' : '−') + Math.abs(v) : 'normal') : String(v);
  }
  alSoltar(e) {
    const inp = e.target, campo = inp.dataset?.campo; if (!campo) return;
    const p = this.proyecto(), li = inp.closest('li[data-id]'), v = +inp.value;
    if (!esNum(v)) return;
    if (li) {
      const clip = p.audio.clips.find(c => c.id === li.dataset.id); if (!clip) return;
      clip[campo] = campo === 't' ? r4(limitar(v, 0, this.duracion())) : campo === 'tono' ? Math.round(limitar(v, -12, 12)) : limitar(v, 0, 1);
      if (campo === 't') this.pintarClips();
      this.cambio();
    } else if (p.audio.musica) {
      const m = p.audio.musica;
      m[campo] = campo === 'bpm' ? v : campo === 'volumen' ? limitar(v, 0, 1) : Math.max(0, v);
      if (campo === 'bpm' && m.archivo && this.cancion) this.cancion.bpm = v;
      if (campo === 'bpm') this.pintarEstilos();
      this.cambio();
    }
  }
}
