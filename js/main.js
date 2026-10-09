import { Estudio, METALES, PIEDRAS, ACABADOS, MOVIMIENTOS, gema } from './estudio.js';
import { Compositor, FONDOS, FORMATOS, cargarFuentes } from './composicion.js';
import { crearCodificador, puedeCodificar } from './codificador.js';
import { escarabajo } from './marca.js';
import { anilloEjemplo } from './demo.js';

const $ = id => document.getElementById(id);
const PREVIA = 960;   // lado mayor de la vista previa, en píxeles

// ---------- Marca ----------
document.querySelectorAll('.marca').forEach(m => m.insertAdjacentHTML('afterbegin', escarabajo('#C49022')));
$('marcaMovil').insertAdjacentHTML('afterbegin', escarabajo('#C49022'));
$('logoVacio').innerHTML = escarabajo('#C49022');
$('sello').insertAdjacentHTML('afterbegin', escarabajo('currentColor'));

const aviso = (txt, mal = false) => { const a = $('aviso'); a.textContent = txt; a.classList.toggle('mal', mal); a.classList.add('ver'); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('ver'), mal ? 5200 : 3000); };
const nota = (txt, estado = '') => { const n = $('nota'); n.className = 'nota ' + estado; n.querySelector('span').textContent = txt; };

// ---------- Estado ----------
const lienzoGL = document.createElement('canvas');
const estudio = new Estudio(lienzoGL);
const previa = new Compositor($('lienzo'));
const estado = { fondo: 'perla', formato: 'reel', t: 0, reproduciendo: true, sucio: true, ocupado: false, cancelar: false, realista: false };

// ---------- Opciones ----------
const opciones = (sel, lista, valor) => { sel.innerHTML = lista.map(v => `<option${v === valor ? ' selected' : ''}>${v}</option>`).join(''); };
opciones($('metal'), METALES, estudio.ajustes.metal);
opciones($('acabado'), Object.keys(ACABADOS), estudio.ajustes.acabado);
opciones($('piedra'), PIEDRAS, estudio.ajustes.piedra);

function pastillas(cont, entradas, actual, alElegir) {
  cont.innerHTML = entradas.map(([k, txt]) => `<button type="button" data-k="${k}" aria-pressed="${k === actual}">${txt}</button>`).join('');
  cont.addEventListener('click', e => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    cont.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    alElegir(b.dataset.k);
  });
}
pastillas($('movimientos'), Object.entries(MOVIMIENTOS).map(([k, m]) => [k, m.nombre]), estudio.ajustes.movimiento, k => { estudio.ajustes.movimiento = k; cambio(); });
pastillas($('formatos'), Object.entries(FORMATOS).map(([k, f]) => [k, f.nombre]), estado.formato, k => { estado.formato = k; ajustarPrevia(); cambio(); avisoCalidad(); });
$('fondos').innerHTML = Object.entries(FONDOS).map(([k, f]) => `<button type="button" data-k="${k}" aria-pressed="${k === estado.fondo}"><i style="background:radial-gradient(circle at 50% 42%, ${f.centro}, ${f.borde} 78%)"></i>${f.nombre}</button>`).join('');
$('fondos').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  $('fondos').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  estado.fondo = b.dataset.k; cambio();
});

// deslizadores con su valor al lado
const formato = { elevacion: v => `${v}°`, giroInicial: v => `${v}°`, zoom: v => `${(+v).toFixed(2)}×`, altura: v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`, exposicion: v => (+v).toFixed(2), enfoque: v => +v === 0 ? 'nítido' : `${Math.round(v * 100)} %`, sombra: v => `${Math.round(v * 100)} %` };
for (const id of Object.keys(formato)) {
  const inp = $(id), out = inp.parentElement.querySelector('output');
  const mostrar = () => { out.textContent = formato[id](inp.value); };
  mostrar();
  inp.addEventListener('input', () => {
    mostrar();
    if (id in estudio.ajustes) { estudio.ajustes[id] = +inp.value; if (id === 'exposicion') estudio.pintar(); }
    cambio();
  });
}
for (const id of ['metal', 'acabado', 'piedra']) $(id).addEventListener('change', () => { estudio.ajustes[id] = $(id).value; estudio.pintar(); detalleAuto(); cambio(); });
for (const id of ['tNombre', 'tDetalle', 'tPrecio', 'tPie']) $(id).addEventListener('input', () => { if (id === 'tDetalle') $('tDetalle').dataset.manual = '1'; cambio(); });
for (const id of ['mostrarTextos', 'animarTextos', 'duracion']) $(id).addEventListener('change', () => { $('camposTexto').style.opacity = $('mostrarTextos').checked ? 1 : 0.5; cambio(); });
$('calidad').addEventListener('change', avisoCalidad);
$('fps').addEventListener('change', avisoCalidad);

function detalleAuto() {
  const d = $('tDetalle'); if (d.dataset.manual) return;
  const p = estudio.geoP ? ' · ' + (gema(estudio.ajustes.piedra).perla ? 'Perla' : estudio.ajustes.piedra.replace(/^Diamante$/, 'Diamantes')) : '';
  d.value = estudio.ajustes.metal + p;
}
const textos = () => ({ mostrar: $('mostrarTextos').checked, animar: $('animarTextos').checked, nombre: $('tNombre').value.trim(), detalle: $('tDetalle').value.trim(), precio: $('tPrecio').value.trim(), pie: $('tPie').value.trim() });

// ---------- Carga del modelo ----------
async function cargarArchivos(archivos) {
  const stl = [...archivos].filter(f => /\.stl$/i.test(f.name) || /stl|sla/.test(f.type));
  if (!stl.length) { aviso('Ese archivo no es un STL.', true); return; }
  nota('Leyendo el modelo…', 'trabajando');
  try {
    const info = await estudio.cargar(stl, { separar: $('separar').checked });
    if (!$('tNombre').value) $('tNombre').value = nombreBonito(stl[0].name);
    listo(info);
  } catch (e) { console.error(e); aviso(e.message || 'No se pudo abrir el modelo 3D.', true); nota('No se pudo abrir el modelo.', 'error'); }
}
function listo(info) {
  const s = info.medidas, mm = v => v.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  $('ficha').innerHTML = `<div><dt>Triángulos</dt><dd>${Math.round(info.triangulos).toLocaleString('es-CO')}</dd></div><div><dt>Medidas (mm)</dt><dd>${mm(s.x)} × ${mm(s.y)} × ${mm(s.z)}</dd></div><div><dt>Piedras</dt><dd>${info.piedras ? 'Sí' : 'No'}</dd></div>`;
  $('infoModelo').hidden = false; $('vacio').hidden = true;
  $('piedra').disabled = !info.piedras; $('sinPiedras').hidden = info.piedras;
  for (const id of ['crear', 'foto', 'realista']) $(id).disabled = false;
  detalleAuto(); cambio();
  nota('Modelo listo. Todo se procesa en tu equipo.');
}
const nombreBonito = n => n.replace(/\.stl$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\p{L}/gu, c => c.toUpperCase()).slice(0, 40);

$('archivo').addEventListener('change', e => { if (e.target.files.length) cargarArchivos(e.target.files); e.target.value = ''; });
const zona = $('soltar');
['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('encima'); }));
['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove('encima'); }));
zona.addEventListener('drop', e => { if (e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files); });
$('ejemplo').addEventListener('click', () => {
  const { metal, piedra } = anilloEjemplo();
  const info = estudio.montar(metal, piedra);
  if (!$('tNombre').value) $('tNombre').value = 'Solitario Aurora';
  listo(info);
});
document.querySelectorAll('[data-girar]').forEach(b => b.addEventListener('click', () => { estudio.girar(b.dataset.girar, Math.PI / 2); cambio(); }));
$('restablecer').addEventListener('click', () => { estudio.orientar(estudio.orientacionInicial, 0, 0); cambio(); });

// ---------- Vista previa ----------
function ajustarPrevia() {
  const f = FORMATOS[estado.formato], k = PREVIA / Math.max(f.w, f.h);
  const w = Math.round(f.w * k / 2) * 2, h = Math.round(f.h * k / 2) * 2;
  previa.tamano(w, h); estudio.tamano(w, h);
}
function cambio() { estado.sucio = true; estado.cancelar = estado.realista; }
const duracion = () => +$('duracion').value;

// coloca la cámara dejando libre la franja de los textos
const poner = t => estudio.pose(t, Compositor.disposicion(estudio.ancho, estudio.alto, textos()));

function dibujarRapido(comp, t) {
  poner(t);
  estudio.renderRapido();
  comp.cuadro({ fondo: estado.fondo, render3D: lienzoGL, sombra: estudio.sombra(), intensidadSombra: +$('sombra').value, textos: textos(), t: t * duracion() });
}

let ultimo = performance.now();
function bucle(ahora) {
  const dt = (ahora - ultimo) / 1000; ultimo = ahora;
  if (estudio.tieneModelo && !estado.ocupado) {
    if (estado.reproduciendo) { estado.t = (estado.t + dt / duracion()) % 1; $('tiempo').value = estado.t; estado.sucio = true; }
    if (estado.sucio) { estado.sucio = false; $('etiquetaVista').textContent = 'Vista rápida'; dibujarRapido(previa, estado.t); }
  }
  requestAnimationFrame(bucle);
}

const icoPlay = '<path d="M7 4v16l13-8z"/>', icoPausa = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
function reproducir(si) { estado.reproduciendo = si; $('icoPlay').innerHTML = si ? icoPausa : icoPlay; $('reproducir').setAttribute('aria-label', si ? 'Pausar' : 'Reproducir'); }
$('reproducir').addEventListener('click', () => { if (estado.realista) estado.cancelar = true; reproducir(!estado.reproduciendo); });
$('tiempo').addEventListener('input', () => { reproducir(false); estado.t = +$('tiempo').value; cambio(); });

// Cuadro hiperrealista en la vista previa (se va aclarando a medida que suma muestras)
$('realista').addEventListener('click', async () => {
  if (estado.ocupado || !estudio.tieneModelo) return;
  reproducir(false); estado.ocupado = true; estado.realista = true; estado.cancelar = false;
  $('realista').disabled = true; nota('Calculando la luz real del cuadro…', 'trabajando');
  const tx = textos(), t = estado.t, img = document.createElement('canvas'), masc = document.createElement('canvas');
  try {
    poner(t);
    const sombra = estudio.sombra();
    await componerRealista(previa, window.MUESTRAS_PREVIA || 160, { sombra, tx, t, img, masc, alAvanzar: p => { $('etiquetaVista').textContent = `Hiperrealista · ${Math.round(p * 100)} %`; } });
    $('etiquetaVista').textContent = 'Hiperrealista';
    nota('Listo. Mueve cualquier control para volver a la vista rápida.');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); aviso('No se pudo calcular el render realista en este equipo.', true); }
    estado.sucio = true; nota('Todo se procesa en tu equipo: tus diseños no se suben a ningún servidor.');
  } finally { estado.ocupado = false; estado.realista = false; $('realista').disabled = false; }
});

// Render con trazado de rayos + máscara para la sombra + composición de marca
async function componerRealista(comp, muestras, { sombra, tx, t, img, masc, alAvanzar, cancelado }) {
  const W = lienzoGL.width, H = lienzoGL.height;
  img.width = masc.width = W; img.height = masc.height = H;
  estudio.renderMascara();
  const cm = masc.getContext('2d'); cm.clearRect(0, 0, W, H); cm.drawImage(lienzoGL, 0, 0);
  const ci = img.getContext('2d');
  const pintar = () => {
    ci.clearRect(0, 0, W, H); ci.drawImage(lienzoGL, 0, 0);
    comp.cuadro({ fondo: estado.fondo, render3D: img, sombra, intensidadSombra: +$('sombra').value, mascara: masc, textos: tx, t: t * duracion() });
  };
  let ultimoPintado = 0;
  await estudio.renderRealista(muestras, {
    cancelado: cancelado || (() => estado.cancelar),
    alAvanzar: p => { alAvanzar?.(p); if (comp === previa && performance.now() - ultimoPintado > 250) { pintar(); ultimoPintado = performance.now(); } },
  });
  pintar();
}

// ---------- Exportar ----------
function avisoCalidad() {
  const m = +$('calidad').value, f = FORMATOS[estado.formato], fps = +$('fps').value, n = duracion() * fps;
  $('avisoCal').textContent = m === 0
    ? `Render rápido: ${n} cuadros en pocos segundos. Ideal para revisar el movimiento antes del video final.`
    : `Trazado de rayos: luz, reflejos y refracción de las piedras calculados como en una fotografía real. Son ${n} cuadros de ${f.w}×${f.h}; según la tarjeta de video puede tardar de varios minutos a más de una hora. Deja esta pestaña abierta y visible.`;
}
const slug = s => (s || 'joya').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'joya';
const reloj = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h} h ${m} min` : m ? `${m} min ${String(x).padStart(2, '0')} s` : `${x} s`; };

let bloqueo = null;
async function trabajo(fn) {
  estado.ocupado = true; estado.cancelar = false; reproducir(false);
  for (const id of ['crear', 'foto', 'realista']) $(id).disabled = true;
  $('progreso').hidden = false; $('barra').style.width = '0';
  try { bloqueo = await navigator.wakeLock?.request('screen'); } catch (e) { bloqueo = null; }
  const salida = document.createElement('canvas'), comp = new Compositor(salida);
  const f = FORMATOS[estado.formato];
  comp.tamano(f.w, f.h); estudio.tamano(f.w, f.h);
  try { await fn(comp, salida, f); }
  catch (e) {
    if (e.name === 'AbortError') aviso('Se canceló.');
    else { console.error(e); aviso(e.message || 'Algo salió mal al crear el video.', true); nota('Hubo un error al crear el video.', 'error'); }
  } finally {
    try { await bloqueo?.release(); } catch (e) { /* nada */ }
    ajustarPrevia(); estado.ocupado = false; estado.sucio = true;
    $('progreso').hidden = true;
    for (const id of ['crear', 'foto', 'realista']) $(id).disabled = !estudio.tieneModelo;
  }
}
const progreso = (p, texto, resta) => { $('barra').style.width = `${(p * 100).toFixed(1)}%`; $('progTexto').textContent = texto; $('progTiempo').textContent = resta != null ? `faltan ~${reloj(resta)}` : ''; };
$('cancelar').addEventListener('click', () => { estado.cancelar = true; });

$('crear').addEventListener('click', () => trabajo(async (comp, salida, f) => {
  if (!puedeCodificar()) throw new Error('Este navegador no puede crear video. Usa Chrome, Edge o Safari actualizados.');
  await cargarFuentes();
  const fps = +$('fps').value, muestras = +$('calidad').value, n = duracion() * fps, tx = textos();
  const ciclico = MOVIMIENTOS[estudio.ajustes.movimiento]?.ciclico;
  const cod = await crearCodificador({ ancho: f.w, alto: f.h, fps });
  const img = document.createElement('canvas'), masc = document.createElement('canvas');
  nota('Creando el video… deja esta pestaña abierta.', 'trabajando');
  const inicio = performance.now();
  try {
    for (let i = 0; i < n; i++) {
      if (estado.cancelar) throw new DOMException('Cancelado', 'AbortError');
      const t = ciclico ? i / n : i / (n - 1);
      poner(t);
      if (muestras > 0) {
        const sombra = estudio.sombra();
        await componerRealista(comp, muestras, { sombra, tx, t, img, masc, cancelado: () => estado.cancelar, alAvanzar: p => { const hechos = i + p, seg = (performance.now() - inicio) / 1000; progreso(hechos / n, `Cuadro ${i + 1} de ${n} · ${Math.round(p * 100)} %`, hechos > 0.3 ? seg / hechos * (n - hechos) : null); } });
      } else {
        estudio.renderRapido();
        comp.cuadro({ fondo: estado.fondo, render3D: lienzoGL, sombra: estudio.sombra(), intensidadSombra: +$('sombra').value, textos: tx, t: t * duracion() });
        if (i % 6 === 0) { const seg = (performance.now() - inicio) / 1000; progreso((i + 1) / n, `Cuadro ${i + 1} de ${n}`, i > 5 ? seg / (i + 1) * (n - i - 1) : null); await new Promise(r => setTimeout(r)); }
      }
      // muestra en la vista previa el cuadro que se acaba de terminar
      if (muestras > 0 || i % 6 === 0) previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height);
      await cod.agregar(salida);
    }
    progreso(1, 'Guardando el archivo…');
    const blob = await cod.terminar();
    mostrarVideo(blob, `${slug(tx.nombre)}-${estado.formato}.${cod.extension}`);
    const seg = (performance.now() - inicio) / 1000;
    if (cod.extension === 'webm') aviso('Este navegador solo pudo crear WebM (sirve para la web y el catálogo). Para Instagram crea el video en Chrome, Edge o Safari.', true);
    else aviso(`Video listo en ${reloj(seg)}.`);
    nota(`Video listo (${(blob.size / 1048576).toFixed(1)} MB).`);
  } catch (e) { cod.cancelar(); throw e; }
}));

function mostrarVideo(blob, nombre) {
  const url = URL.createObjectURL(blob), v = $('video');
  if (v.src) URL.revokeObjectURL(v.src);
  v.src = url; $('descargar').href = url; $('descargar').download = nombre;
  $('resultado').hidden = false;
  const archivo = new File([blob], nombre, { type: blob.type });
  const c = $('compartir');
  c.hidden = !(navigator.canShare && navigator.canShare({ files: [archivo] }));
  c.onclick = () => navigator.share({ files: [archivo], title: $('tNombre').value || 'Atelier & Co' }).catch(() => {});
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('foto').addEventListener('click', () => trabajo(async (comp, salida, f) => {
  await cargarFuentes();
  const muestras = Math.max(+$('calidad').value, 64) * 2, tx = { ...textos(), animar: false }, t = estado.t;
  nota('Calculando la foto hiperrealista…', 'trabajando');
  poner(t);
  const sombra = estudio.sombra(), inicio = performance.now();
  await componerRealista(comp, muestras, { sombra, tx, t, img: document.createElement('canvas'), masc: document.createElement('canvas'), cancelado: () => estado.cancelar, alAvanzar: p => { const seg = (performance.now() - inicio) / 1000; progreso(p, `Foto · ${Math.round(p * 100)} %`, p > 0.05 ? seg / p * (1 - p) : null); } });
  previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height);
  const blob = await new Promise(r => salida.toBlob(r, 'image/png'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(tx.nombre)}-${estado.formato}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  aviso('Foto descargada.'); nota('Foto lista.');
}));

// ---------- Navegación lateral: resalta la sección visible ----------
const enlaces = [...document.querySelectorAll('#nav a')];
const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) enlaces.forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-30% 0px -60% 0px' });
enlaces.forEach(a => obs.observe(document.querySelector(a.getAttribute('href'))));

// ---------- Inicio ----------
ajustarPrevia(); avisoCalidad(); reproducir(true);
cargarFuentes().then(() => { estado.sucio = true; });
requestAnimationFrame(bucle);
if (!puedeCodificar()) nota('Este navegador no puede crear video: usa Chrome, Edge o Safari actualizados.', 'error');
window.estudio = estudio;   // útil para depurar desde la consola
