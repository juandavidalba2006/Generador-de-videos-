// Editor de video de Atelier & Co: une el estudio 3D, la línea de tiempo con keyframes, los textos, el sonido,
// los bitmaps y el asistente. El proyecto (proyecto.js) es la única fuente de verdad: la cámara, los textos y el
// audio de cada cuadro salen de él, tanto en la vista previa como en el video final.
import { Estudio, METALES, PIEDRAS, ACABADOS, gema } from './estudio.js';
import { Compositor, FONDOS, FORMATOS, cargarFuentes } from './composicion.js';
import { crearCodificador, elegirVideo, puedeCodificar } from './codificador.js';
import { escarabajo } from './marca.js';
import { anilloEjemplo } from './demo.js';
import { proyectoNuevo, evaluar, serializar, deserializar } from './proyecto.js';
import { LineaTiempo, reloj as relojVideo } from './linea-tiempo.js';
import { PanelTextos, textosPorDefecto, adaptarAFormato, normalizarCapas, zonaLibre, arrastrarEnLienzo, textosDesdeAcciones } from './textos.js';
import { PanelSonido, Reproductor, EFECTOS, ESTILOS_MUSICA, mezclar, codificarAudio, hayAudio, musicaNueva } from './sonido.js';
import { PanelTexturas } from './texturas.js';
import { Chat, aplicarAccionesAProyecto } from './chat.js';

const $ = id => document.getElementById(id);
const PREVIA = 960;   // lado mayor de la vista previa, en píxeles
const CLAVE_PROYECTO = 'atelier-proyecto-v2', CLAVE_PESTANA = 'atelier-pestana';
const PESTANAS = ['modelo', 'materiales', 'textos', 'sonido', 'asistente', 'exportar'];

// ---------- Marca ----------
document.querySelectorAll('.marca').forEach(m => m.insertAdjacentHTML('afterbegin', escarabajo('#C49022')));
$('marcaMovil').insertAdjacentHTML('afterbegin', escarabajo('#C49022'));
$('logoVacio').innerHTML = escarabajo('#C49022');
$('sello').insertAdjacentHTML('afterbegin', escarabajo('currentColor'));

const aviso = (txt, mal = false) => { const a = $('aviso'); a.textContent = txt; a.classList.toggle('mal', mal); a.classList.add('ver'); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('ver'), mal ? 5200 : 3200); };
const NOTA_BASE = 'Todo se procesa en tu equipo: tus diseños no se suben a ningún servidor.';
const nota = (txt, estado = '') => { const n = $('nota'); n.className = 'nota ' + estado; n.querySelector('span').textContent = txt; };
const leerLocal = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

// ---------- Estado ----------
const lienzoGL = document.createElement('canvas');
const estudio = new Estudio(lienzoGL);
const previa = new Compositor($('lienzo'));
const rep = new Reproductor();
// t en segundos; sonido: la vista previa suena (empieza muda, como los videos que se reproducen solos)
const estado = { fondo: 'perla', formato: 'reel', t: 0, reproduciendo: true, sucio: true, ocupado: false, cancelar: false, realista: false, pestana: 'modelo', sonido: false, silencioManual: false, medidas: null };

// ---------- Opciones ----------
const opciones = (sel, lista, valor) => { sel.innerHTML = lista.map(v => `<option${v === valor ? ' selected' : ''}>${v}</option>`).join(''); };
opciones($('metal'), METALES, estudio.ajustes.metal);
opciones($('acabado'), Object.keys(ACABADOS), estudio.ajustes.acabado);
opciones($('piedra'), PIEDRAS, estudio.ajustes.piedra);
$('piedra').disabled = true;

function pastillas(cont, entradas, alElegir) {
  cont.innerHTML = entradas.map(([k, txt]) => `<button type="button" data-k="${k}" aria-pressed="false">${txt}</button>`).join('');
  cont.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) alElegir(b.dataset.k); });
}
const marcar = (cont, k) => cont.querySelectorAll('button[data-k]').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === k));
pastillas($('formatos'), Object.entries(FORMATOS).map(([k, f]) => [k, f.nombre]), k => cambiarFormato(k));
$('fondos').innerHTML = Object.entries(FONDOS).map(([k, f]) => `<button type="button" data-k="${k}" aria-pressed="false"><i style="background:radial-gradient(circle at 50% 42%, ${f.centro}, ${f.borde} 78%)"></i>${f.nombre}</button>`).join('');
$('fondos').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  estado.fondo = b.dataset.k; marcar($('fondos'), estado.fondo); cambio(); programarAutoguardado();
});
const verSombra = () => { $('sombra').parentElement.querySelector('output').textContent = `${Math.round($('sombra').value * 100)} %`; };
$('sombra').addEventListener('input', () => { verSombra(); cambio(); programarAutoguardado(); });
for (const id of ['metal', 'acabado', 'piedra']) $(id).addEventListener('change', () => {
  estudio.ajustes[id] = $(id).value; estudio.pintar();
  if (refrescarAutos()) { asentar(); panelTextos.render(); linea.render(); }
  panelTexturas.render(); cambio(); programarAutoguardado();
});
for (const id of ['calidad', 'fps']) $(id).addEventListener('change', () => { avisoCalidad(); programarAutoguardado(); });

function cambiarFormato(k) {
  if (!FORMATOS[k] || estado.ocupado) return;
  estado.formato = k; marcar($('formatos'), k);
  ajustarPrevia();
  adaptarAFormato(proyecto.textos, k);   // los textos se reacomodan solos (se puede ir y volver sin perder nada)
  asentar(); panelTextos.render(); cambio(); avisoCalidad();
}

// ---------- Proyecto ----------
// Los textos que pone la app (nombre del archivo, metal y piedra) se actualizan solos mientras nadie los edite
const autos = { titulo: new Set(['Solitario Aurora']), detalle: new Set() };
let nombreActual = 'Solitario Aurora';
const nombrePiedra = () => gema(estudio.ajustes.piedra).perla ? 'Perla' : estudio.ajustes.piedra.replace(/^Diamante$/, 'Diamantes');
const detalleAuto = () => estudio.ajustes.metal + (estudio.geoP ? ' · ' + nombrePiedra() : '');

function proyectoInicial() {
  const p = proyectoNuevo();
  p.textos = adaptarAFormato(textosPorDefecto(nombreActual, detalleAuto()), estado.formato);
  autos.detalle.add(detalleAuto());
  p.audio.musica = musicaNueva('lujo');
  return p;
}

function refrescarAutos() {
  const d = detalleAuto(); autos.detalle.add(d);
  let cambiado = false;
  for (const c of proyecto.textos || []) {
    if (!c || c.tipo === 'marca' || typeof c.texto !== 'string') continue;
    const nuevo = c.estilo === 'detalle' && autos.detalle.has(c.texto) ? d : c.estilo === 'titulo' && autos.titulo.has(c.texto) ? nombreActual : c.texto;
    if (nuevo !== c.texto) { c.texto = nuevo; cambiado = true; }
  }
  return cambiado;
}
function nuevoNombre(n) { if (!n) return; autos.titulo.add(n); nombreActual = n; }
const nombreDelProyecto = () => (proyecto.textos || []).find(c => c?.tipo !== 'marca' && c?.estilo === 'titulo' && c.texto?.trim())?.texto.trim() || nombreActual;

// Lo que no es del proyecto pero conviene guardar con él (formato, fondo, metal…)
const ajustesEscena = () => ({
  formato: estado.formato, fondo: estado.fondo, sombra: +$('sombra').value, fps: +$('fps').value, calidad: +$('calidad').value,
  metal: estudio.ajustes.metal, acabado: estudio.ajustes.acabado, piedra: estudio.ajustes.piedra,
  autos: { titulo: [...autos.titulo].slice(-20), detalle: [...autos.detalle].slice(-20), nombre: nombreActual },
});
const archivoProyecto = () => { const d = JSON.parse(serializar(proyecto)); d.ajustes = ajustesEscena(); return JSON.stringify(d); };

function leerProyecto(texto) {
  let d;
  try { d = typeof texto === 'string' ? JSON.parse(texto) : texto; } catch (e) { throw new Error('El archivo no es un proyecto válido: no se pudo leer.'); }
  if (!d || typeof d !== 'object' || Array.isArray(d) || !('pistas' in d || 'textos' in d || 'audio' in d)) throw new Error('Ese archivo no es un proyecto del estudio de Atelier & Co.');
  const p = deserializar(d), aj = p.ajustes && typeof p.ajustes === 'object' ? p.ajustes : null;
  delete p.ajustes;
  p.textos = normalizarCapas(p.textos);
  return { p, aj };
}

function aplicarAjustes(aj) {
  if (!aj) return;
  if (FORMATOS[aj.formato]) estado.formato = aj.formato;
  if (FONDOS[aj.fondo]) estado.fondo = aj.fondo;
  if (Number.isFinite(aj.sombra)) $('sombra').value = aj.sombra;
  for (const k of ['fps', 'calidad']) if ([...$(k).options].some(o => +o.value === aj[k])) $(k).value = String(aj[k]);
  for (const [k, lista] of [['metal', METALES], ['acabado', Object.keys(ACABADOS)], ['piedra', PIEDRAS]]) if (lista.includes(aj[k])) { estudio.ajustes[k] = aj[k]; $(k).value = aj[k]; }
  if (aj.autos) {
    for (const k of ['titulo', 'detalle']) for (const v of aj.autos[k] || []) if (typeof v === 'string') autos[k].add(v);
    if (typeof aj.autos.nombre === 'string' && aj.autos.nombre) nombreActual = aj.autos.nombre;
  }
  estudio.pintar();
  pintarControles();
}
function pintarControles() {
  marcar($('formatos'), estado.formato); marcar($('fondos'), estado.fondo); verSombra();
  ajustarPrevia();
}

// El proyecto: el último autoguardado (si lo hay) o uno nuevo
let proyecto = null;
{
  const guardado = leerLocal(CLAVE_PROYECTO);
  if (guardado) {
    try { const { p, aj } = leerProyecto(guardado); aplicarAjustes(aj); proyecto = p; adaptarAFormato(proyecto.textos, estado.formato); }
    catch (e) { proyecto = null; }
  }
  if (!proyecto) proyecto = proyectoInicial();
  else setTimeout(() => aviso('Se recuperó tu último proyecto.'), 600);
}
pintarControles();

// ---------- Deshacer: la pila vive en la línea de tiempo ----------
// Los cambios de los paneles (textos, sonido, arrastrar en la vista previa) se agrupan: un paso por ráfaga de cambios
let fotoEstable = '', tRafaga = 0, tGuardar = 0;
function asentar() { fotoEstable = serializar(proyecto); programarAutoguardado(); }
function anotarCambio() {
  if (!tRafaga && fotoEstable) linea.guardarHistorial(fotoEstable);
  clearTimeout(tRafaga); tRafaga = setTimeout(cerrarRafaga, 800);
}
function cerrarRafaga() { clearTimeout(tRafaga); tRafaga = 0; asentar(); linea.render(); }
function programarAutoguardado() { clearTimeout(tGuardar); tGuardar = setTimeout(autoguardar, 900); }
function autoguardar() { if (guardarLocal(CLAVE_PROYECTO, archivoProyecto())) $('guardado').textContent = 'Guardado en este equipo'; }

// después de cambiar el proyecto entero (abrir, nuevo, asistente, deshacer): todo se vuelve a dibujar
function todoCambio({ linea: conLinea = true } = {}) {
  adaptarAFormato(proyecto.textos, estado.formato);
  refrescarAutos();
  estado.t = Math.min(estado.t, proyecto.duracion);
  if (conLinea) linea.render();
  panelTextos.render(); panelSonido.render();
  rep.preparar(proyecto.audio, proyecto.duracion);
  avisoCalidad(); asentar(); cambio();
}

let lineaPendiente = 0;
const programarLinea = () => { if (!lineaPendiente) lineaPendiente = requestAnimationFrame(() => { lineaPendiente = 0; linea.render(); }); };

// ---------- Línea de tiempo ----------
const linea = new LineaTiempo($('lineaTiempo'), {
  obtenerProyecto: () => proyecto,
  efectos: EFECTOS, estilosMusica: ESTILOS_MUSICA,
  // los paneles de arriba cambian de alto al volver a dibujarse: la línea de tiempo se queda quieta bajo el puntero
  alCambiar: motivo => sinSaltar(() => {
    clearTimeout(tRafaga); tRafaga = 0;
    if (motivo === 'deshacer' || motivo === 'rehacer') { todoCambio({ linea: false }); return; }
    if (motivo === 'textos' || motivo === 'duracion') panelTextos.render();
    if (motivo === 'audio' || motivo === 'duracion') { panelSonido.render(); rep.preparar(proyecto.audio, proyecto.duracion); }
    if (motivo === 'duracion') avisoCalidad();
    asentar(); cambio();
  }),
  // tocar la regla, arrastrar el cabezal o editar un valor pausa la reproducción (como en CapCut)
  alMoverCabezal: t => { buscar(t); },
  alSeleccionar: s => sinSaltar(() => {
    if (s.tipo === 'texto') { abrirPestana('textos'); panelTextos.seleccionar(s.id); estado.sucio = true; }
    else if (s.tipo === 'sonido') { abrirPestana('sonido'); panelSonido.seleccionar(s.id); }
  }),
});

// Al elegir algo en la línea de tiempo se abre su pestaña y el panel muestra la fila elegida; la línea de tiempo no debe
// moverse bajo el dedo mientras se arrastra (en una columna el inspector cambia de alto, y los paneles hacen scrollIntoView)
// (el anclaje automático del navegador se apaga un momento: si no, corrige otra vez lo que ya se corrigió aquí)
let anclaje = 0, sinAnclaje = false, fijo = null;   // fijo: arrastre en curso en las pistas (ver abajo)
const anclajeNativo = () => { document.documentElement.style.overflowAnchor = sinAnclaje || fijo ? 'none' : ''; };
function sinSaltar(fn, ancla = $('lineaTiempo')) {
  const antes = ancla.getBoundingClientRect().top;
  sinAnclaje = true; anclajeNativo();
  try { fn(); } finally {
    const corrido = ancla.getBoundingClientRect().top - antes;
    if (Math.abs(corrido) > 0.5) scrollBy({ top: corrido, behavior: 'instant' });
    sostenerAlto();
    cancelAnimationFrame(anclaje);
    anclaje = requestAnimationFrame(() => requestAnimationFrame(() => { sinAnclaje = false; anclajeNativo(); }));
  }
}

// Mientras se arrastra en las pistas, lo que está bajo el dedo no se mueve aunque cambie el alto de lo de arriba
// (el inspector al cambiar de pestaña, o el recuadro de lo elegido en la línea de tiempo). Se corrige antes de pintar.
$('lineaTiempo').addEventListener('pointerdown', e => {
  const el = e.target.closest?.('.lt-pistas');
  if (!el) return;
  fijo = { el, top: el.getBoundingClientRect().top };
  anclajeNativo(); sostenerAlto();
}, true);
// si la página está al final y la línea de tiempo se encoge, el navegador recortaría el scroll y todo saltaría:
// mientras se arrastra, la página no baja de lo que se está viendo
function sostenerAlto() { if (fijo) document.body.style.minHeight = Math.ceil(scrollY + innerHeight) + 'px'; }
// después del arrastre el alto extra se quita apenas deje de hacer falta (al subir), así nada salta al soltar
function soltarAlto() {
  const b = document.body, y = scrollY;   // se lee antes: al quitar el alto, el navegador ya recorta el scroll
  if (fijo || !b.style.minHeight) return;
  b.style.minHeight = '';
  if (document.documentElement.scrollHeight < y + innerHeight - 0.5) { b.style.minHeight = Math.ceil(y + innerHeight) + 'px'; if (scrollY !== y) scrollTo({ top: y, behavior: 'instant' }); }
}
addEventListener('scroll', soltarAlto, { passive: true });
// al soltar, la línea de tiempo se vuelve a dibujar: se sigue corrigiendo un par de cuadros más
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => {
  const f = fijo; if (!f) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { if (fijo === f) { mantenerFijo(); fijo = null; anclajeNativo(); soltarAlto(); } }));
});
function mantenerFijo() {
  if (!fijo) return;
  const d = fijo.el.getBoundingClientRect().top - fijo.top;
  if (Math.abs(d) > 0.5) scrollBy({ top: d, behavior: 'instant' });
  sostenerAlto();
}
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(mantenerFijo);
  for (const el of [document.querySelector('.cab'), document.querySelector('.vista'), document.querySelector('.inspector'), $('lineaTiempo').querySelector('.lt-cabecera'), $('lineaTiempo').querySelector('.lt-inspector')]) if (el) ro.observe(el);
}

// ---------- Paneles del inspector ----------
const panelTexturas = new PanelTexturas($('panelTexturas'), { estudio, alCambiar: () => cambio() });

const panelTextos = new PanelTextos($('panelTextos'), {
  obtenerProyecto: () => proyecto,
  alCambiar: () => { anotarCambio(); programarLinea(); cambio(); },
  obtenerTiempo: () => estado.t,
  alSeleccionar: id => { linea.seleccionar(id ? { tipo: 'texto', id } : null); estado.sucio = true; },
  obtenerFormato: () => estado.formato,
  // datos para las plantillas cuando todavía no hay textos con el nombre o el detalle
  obtenerDatos: () => {
    const d = {}, hay = e => (proyecto.textos || []).some(c => c?.tipo !== 'marca' && c?.estilo === e && c.texto?.trim());
    if (!hay('titulo')) d.nombre = nombreActual;
    if (!hay('detalle')) d.detalle = detalleAuto();
    if (estudio.geoP) d.piedra = gema(estudio.ajustes.piedra).perla ? 'Perla' : estudio.ajustes.piedra;
    return d;
  },
});

const panelSonido = new PanelSonido($('panelSonido'), {
  obtenerProyecto: () => proyecto,
  reproductor: rep,
  obtenerTiempo: () => estado.t,
  alCambiar: () => {
    anotarCambio(); programarLinea(); cambio();
    if (!estado.sonido && !estado.silencioManual) ponerSonido(true);   // si está armando el sonido, que lo oiga en el video
  },
  alSeleccionar: s => linea.seleccionar(s),
});

const chat = new Chat($('chat'), { obtenerProyecto: () => proyecto, obtenerInfo, aplicarAcciones });

function obtenerInfo() {
  const m = estado.medidas;
  return {
    cargado: estudio.tieneModelo, nombre: nombreDelProyecto(),
    medidas: m ? [m.x, m.y, m.z].map(v => Math.round(v * 10) / 10) : null,
    tienePiedras: !!estudio.geoP, metal: estudio.ajustes.metal, piedra: estudio.geoP ? estudio.ajustes.piedra : null, formato: estado.formato,
  };
}

// Lo que pidió el asistente: se guarda para deshacer, se mezcla en el proyecto y se ve desde el principio
function aplicarAcciones(acciones) {
  cerrarRafaga();
  const antes = serializar(proyecto);
  const hecho = aplicarAccionesAProyecto(proyecto, acciones, { textosDesdeAcciones, formato: estado.formato, musicaNueva });
  if (!hecho.algo) return hecho;
  linea.guardarHistorial(antes);
  todoCambio();
  if (estudio.tieneModelo) { estado.t = 0; reproducir(true); }
  return hecho;
}

// Arrastrar los textos directamente sobre la vista previa
let textoPendiente = 0;
arrastrarEnLienzo($('lienzo'), {
  obtenerCapas: () => proyecto.textos,
  obtenerTiempo: () => estado.t,
  alSeleccionar: id => {
    reproducir(false);
    // el foco sale del campo que se estaba editando: Ctrl+Z deshace el arrastre, no lo último que se escribió
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    sinSaltar(() => { abrirPestana('textos'); panelTextos.seleccionar(id); }, document.querySelector('.vista')); linea.seleccionar({ tipo: 'texto', id });
    estado.sucio = true;
  },
  alMover: () => {
    anotarCambio(); estado.sucio = true;
    if (!textoPendiente) textoPendiente = requestAnimationFrame(() => { textoPendiente = 0; panelTextos.render(); });
  },
  alSoltar: () => cerrarRafaga(),
});

// ---------- Pestañas del inspector (y el menú lateral) ----------
const tabs = [...document.querySelectorAll('#pestanas [role=tab]')];
const scrollHojas = {};
function abrirPestana(id, { desplazar = false, enfocar = false } = {}) {
  if (!PESTANAS.includes(id)) return;
  const hojas = $('hojas');
  if (id !== estado.pestana) {
    scrollHojas[estado.pestana] = hojas.scrollTop;
    estado.pestana = id;
    for (const h of document.querySelectorAll('.hoja')) h.hidden = h.dataset.pestana !== id;
    hojas.scrollTop = scrollHojas[id] || 0;
    if (id === 'textos') panelTextos.render();
    else if (id === 'sonido') panelSonido.render();
    else if (id === 'materiales') panelTexturas.render();
    guardarLocal(CLAVE_PESTANA, id);
    estado.sucio = true;   // el marco de la capa elegida solo se ve en la pestaña de textos
  }
  const tira = $('pestanas');
  for (const b of tabs) {
    const si = b.dataset.pestana === id;
    b.setAttribute('aria-selected', String(si)); b.tabIndex = si ? 0 : -1;
    if (si && tira.scrollWidth > tira.clientWidth) tira.scrollLeft = b.offsetLeft - (tira.clientWidth - b.offsetWidth) / 2;
  }
  document.querySelectorAll('#nav a[data-pestana]').forEach(a => a.setAttribute('aria-current', String(a.dataset.pestana === id)));
  if (enfocar) tabs.find(b => b.dataset.pestana === id)?.focus();
  if (desplazar) {
    const r = document.querySelector('.inspector').getBoundingClientRect(), barra = innerWidth <= 900 ? 56 : 0;   // en el celular hay una barra fija arriba
    if (r.top < barra - 1 || r.top > innerHeight * 0.7) document.querySelector(innerWidth > 1180 ? '.editor' : '.inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
// en una columna, si la tira de pestañas está muy abajo, se sube para que se vea lo que se abrió
$('pestanas').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) abrirPestana(b.dataset.pestana, { desplazar: true }); });
$('pestanas').addEventListener('keydown', e => {
  const i = PESTANAS.indexOf(estado.pestana), paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (paso) { e.preventDefault(); abrirPestana(PESTANAS[(i + paso + PESTANAS.length) % PESTANAS.length], { enfocar: true }); }
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); abrirPestana(PESTANAS[e.key === 'Home' ? 0 : PESTANAS.length - 1], { enfocar: true }); }
});
$('nav').addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a) return;
  e.preventDefault();
  if (a.dataset.ir) { $(a.dataset.ir).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  abrirPestana(a.dataset.pestana, { desplazar: true });
  history.replaceState(null, '', '#' + a.dataset.pestana);
});

// ---------- Carga del modelo ----------
async function cargarArchivos(archivos) {
  const lista = [...archivos];
  const json = lista.find(f => /\.json$/i.test(f.name) || f.type === 'application/json');
  if (json && lista.length === 1) { abrirProyecto(json); return; }
  const stl = lista.filter(f => /\.stl$/i.test(f.name) || /stl|sla/.test(f.type));
  if (!stl.length) { aviso('Ese archivo no es un STL.', true); return; }
  nota('Leyendo el modelo…', 'trabajando');
  try {
    const info = await estudio.cargar(stl, { separar: $('separar').checked });
    nuevoNombre(nombreBonito(stl[0].name));
    listo(info);
  } catch (e) { console.error(e); aviso(e.message || 'No se pudo abrir el modelo 3D.', true); nota('No se pudo abrir el modelo.', 'error'); }
}
function listo(info) {
  const s = info.medidas, mm = v => v.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  estado.medidas = { x: s.x, y: s.y, z: s.z };
  $('ficha').innerHTML = `<div><dt>Triángulos</dt><dd>${Math.round(info.triangulos).toLocaleString('es-CO')}</dd></div><div><dt>Medidas (mm)</dt><dd>${mm(s.x)} × ${mm(s.y)} × ${mm(s.z)}</dd></div><div><dt>Piedras</dt><dd>${info.piedras ? 'Sí' : 'No'}</dd></div>`;
  $('infoModelo').hidden = false; $('vacio').hidden = true;
  $('piedra').disabled = !info.piedras; $('sinPiedras').hidden = info.piedras;
  for (const id of ['crear', 'foto', 'realista']) $(id).disabled = false;
  if (refrescarAutos()) { asentar(); panelTextos.render(); linea.render(); }
  panelTexturas.reaplicar();
  estado.t = 0; reproducir(true); cambio();
  nota('Modelo listo. Todo se procesa en tu equipo.');
}
const nombreBonito = n => n.replace(/\.stl$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\p{L}/gu, c => c.toUpperCase()).slice(0, 40);

$('archivo').addEventListener('change', e => { if (e.target.files.length) cargarArchivos(e.target.files); e.target.value = ''; });
const zona = $('soltar');
['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('encima'); }));
['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove('encima'); }));
zona.addEventListener('drop', e => { e.stopPropagation(); if (e.dataTransfer.files.length) cargarArchivos(e.dataTransfer.files); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files.length) cargarArchivos(e.dataTransfer.files); });
function cargarEjemplo() {
  const { metal, piedra } = anilloEjemplo();
  const info = estudio.montar(metal, piedra);
  nuevoNombre('Solitario Aurora');
  listo(info);
}
$('ejemplo').addEventListener('click', cargarEjemplo);
$('ejemploVista').addEventListener('click', cargarEjemplo);
document.querySelectorAll('[data-girar]').forEach(b => b.addEventListener('click', () => { estudio.girar(b.dataset.girar, Math.PI / 2); cambio(); }));
$('restablecer').addEventListener('click', () => { estudio.orientar(estudio.orientacionInicial, 0, 0); cambio(); });

// ---------- Vista previa ----------
function ajustarPrevia() {
  const f = FORMATOS[estado.formato], k = PREVIA / Math.max(f.w, f.h);
  const w = Math.round(f.w * k / 2) * 2, h = Math.round(f.h * k / 2) * 2;
  previa.tamano(w, h); estudio.tamano(w, h);
  $('editor').style.setProperty('--aspecto', (f.w / f.h).toFixed(4));
  estado.sucio = true;
}
function cambio() { estado.sucio = true; estado.cancelar = estado.realista; }

// Franja libre de textos para encuadrar la joya (no depende del tiempo: la cámara no salta cuando entra un texto)
let zonaGuardada = { k: '', z: null };
function franja(capas, W, H) {
  const k = W + 'x' + H + JSON.stringify(capas);
  if (zonaGuardada.k !== k) zonaGuardada = { k, z: zonaLibre(capas, { W, H }) };
  return zonaGuardada.z;
}
// coloca la cámara del instante t (segundos) según los keyframes del proyecto
const poner = (pr, t) => estudio.aplicarPose(evaluar(pr, t), franja(pr.textos, estudio.ancho, estudio.alto));
const intensidadSombra = () => +$('sombra').value;
// el marco punteado de la capa elegida solo se ve mientras se editan los textos
const capaElegida = () => estado.pestana === 'textos' && panelTextos.seleccion ? (proyecto.textos || []).find(c => c.id === panelTextos.seleccion) || null : null;

function dibujarRapido(comp, pr, t, seleccion = null) {
  poner(pr, t);
  estudio.renderRapido();
  comp.cuadro({ fondo: estado.fondo, render3D: lienzoGL, sombra: estudio.sombra(), intensidadSombra: intensidadSombra(), capas: pr.textos, t, duracion: pr.duracion, seleccion });
}

function relojes() {
  const D = proyecto.duracion || 8;
  $('relojVista').textContent = relojVideo(estado.t);
  const total = '/ ' + relojVideo(D); if ($('totalVista').textContent !== total) $('totalVista').textContent = total;
  if (+$('tiempo').max !== D) $('tiempo').max = D;
  if (!estado.deslizando) $('tiempo').value = estado.t;
}

let ultimo = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - ultimo) / 1000); ultimo = ahora;
  const D = proyecto.duracion || 8;
  if (!estado.ocupado) {
    if (estado.reproduciendo && estudio.tieneModelo) {
      // con sonido manda el reloj del audio (así la imagen no se adelanta ni se atrasa a la música)
      estado.t = rep.sonando ? rep.posicion : (estado.t + dt) % D;
      estado.sucio = true;
    }
    if (estado.t > D) { estado.t %= D; estado.sucio = true; }
    if (estado.sucio) {
      estado.sucio = false;
      relojes(); linea.ponerCabezal(estado.t);
      if (estudio.tieneModelo) { $('etiquetaVista').textContent = 'Vista rápida'; dibujarRapido(previa, proyecto, estado.t, capaElegida()); }
    }
  }
  requestAnimationFrame(bucle);
}

const icoPlay = '<path d="M7 4v16l13-8z"/>', icoPausa = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
const icoSonido = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.6a7.6 7.6 0 010 10.8"/>';
const icoMudo = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>';
function reproducir(si) {
  estado.reproduciendo = si;
  $('icoPlay').innerHTML = si ? icoPausa : icoPlay; $('reproducir').setAttribute('aria-label', si ? 'Pausar' : 'Reproducir');
  if (si && estado.sonido && estudio.tieneModelo) rep.reproducir(estado.t); else rep.detener();
}
function ponerSonido(si, manual = false) {
  estado.sonido = si; if (manual) estado.silencioManual = !si;
  const b = $('silencio');
  b.setAttribute('aria-pressed', String(si)); $('icoSonido').innerHTML = si ? icoSonido : icoMudo;
  b.setAttribute('aria-label', si ? 'Silenciar la vista previa' : 'Activar el sonido de la vista previa'); b.title = si ? 'Silenciar' : 'Activar el sonido';
  if (si && estado.reproduciendo && estudio.tieneModelo) rep.reproducir(estado.t); else if (!si) rep.detener();
}
// mover el cabezal (regla, deslizador, keyframes): pausa y deja el audio listo en ese punto
function buscar(t) { reproducir(false); estado.t = Math.max(0, Math.min(proyecto.duracion || 8, +t || 0)); rep.buscar(estado.t); cambio(); }
function alternar() {
  if (estado.realista) estado.cancelar = true;
  const si = !estado.reproduciendo;
  if (si && !estado.sonido && !estado.silencioManual) ponerSonido(true);   // dar play a mano = quiere oírlo
  reproducir(si);
}
$('reproducir').addEventListener('click', alternar);
$('silencio').addEventListener('click', () => ponerSonido(!estado.sonido, true));
$('tiempo').addEventListener('input', () => buscar(+$('tiempo').value));
$('tiempo').addEventListener('pointerdown', () => { estado.deslizando = true; });
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { estado.deslizando = false; });
document.addEventListener('keydown', e => {
  const t = e.target, escribiendo = t.closest?.('input, textarea, select, button, a, [contenteditable=true], [role=tab]');
  if (e.code === 'Space' && !escribiendo && !e.ctrlKey && !e.metaKey && !estado.ocupado) { e.preventDefault(); alternar(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardarProyecto(); }
});

// Cuadro hiperrealista en la vista previa (se va aclarando a medida que suma muestras)
$('realista').addEventListener('click', async () => {
  if (estado.ocupado || !estudio.tieneModelo) return;
  reproducir(false); estado.ocupado = true; estado.realista = true; estado.cancelar = false;
  $('realista').disabled = true; nota('Calculando la luz real del cuadro…', 'trabajando');
  const t = estado.t, pr = copiaProyecto(), img = document.createElement('canvas'), masc = document.createElement('canvas');
  try {
    poner(pr, t);
    const sombra = estudio.sombra();
    await componerRealista(previa, pr, window.MUESTRAS_PREVIA || 160, { sombra, t, img, masc, alAvanzar: p => { $('etiquetaVista').textContent = `Hiperrealista · ${Math.round(p * 100)} %`; } });
    $('etiquetaVista').textContent = 'Hiperrealista';
    nota('Listo. Mueve cualquier control para volver a la vista rápida.');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); aviso('No se pudo calcular el render realista en este equipo.', true); }
    estado.sucio = true; nota(NOTA_BASE);
  } finally { estado.ocupado = false; estado.realista = false; $('realista').disabled = false; }
});

// Copia quieta del proyecto para renderizar (si se edita mientras se crea el video, el video no cambia a mitad)
function copiaProyecto() { const c = deserializar(serializar(proyecto)); c.textos = normalizarCapas(c.textos); return c; }

// Render con trazado de rayos + máscara para la sombra + composición de marca
async function componerRealista(comp, pr, muestras, { sombra, t, img, masc, alAvanzar, cancelado }) {
  const W = lienzoGL.width, H = lienzoGL.height;
  img.width = masc.width = W; img.height = masc.height = H;
  estudio.renderMascara();
  const cm = masc.getContext('2d'); cm.clearRect(0, 0, W, H); cm.drawImage(lienzoGL, 0, 0);
  const ci = img.getContext('2d');
  const pintar = () => {
    ci.clearRect(0, 0, W, H); ci.drawImage(lienzoGL, 0, 0);
    comp.cuadro({ fondo: estado.fondo, render3D: img, sombra, intensidadSombra: intensidadSombra(), mascara: masc, capas: pr.textos, t, duracion: pr.duracion });
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
  const m = +$('calidad').value, f = FORMATOS[estado.formato], fps = +$('fps').value, n = Math.round((proyecto.duracion || 8) * fps);
  $('avisoCal').textContent = m === 0
    ? `Render rápido: ${n} cuadros en pocos segundos. Ideal para revisar el movimiento y el sonido antes del video final.`
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
    if (e.name === 'AbortError') { aviso('Se canceló.'); nota(NOTA_BASE); }
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
const abortar = () => { if (estado.cancelar) throw new DOMException('Cancelado', 'AbortError'); };

$('crear').addEventListener('click', () => trabajo(async (comp, salida, f) => {
  if (!puedeCodificar()) throw new Error('Este navegador no puede crear video. Usa Chrome, Edge o Safari actualizados.');
  await cargarFuentes();
  const pr = copiaProyecto(), D = pr.duracion;
  const fps = +$('fps').value, muestras = +$('calidad').value, n = Math.max(2, Math.round(D * fps));
  const video = await elegirVideo({ ancho: f.w, alto: f.h, fps });
  // el sonido se mezcla y se codifica antes de los cuadros, para el contenedor que se va a usar (AAC en MP4, Opus en WebM)
  let audio = null, sinSonido = false;
  if ($('conSonido').checked && hayAudio(proyecto.audio)) {
    progreso(0, 'Preparando el sonido…'); nota('Mezclando la música y los efectos…', 'trabajando');
    try { audio = await codificarAudio(await mezclar(proyecto.audio, D), { contenedor: video.contenedor }); }
    catch (e) { console.error(e); sinSonido = true; }
  }
  abortar();
  const cod = await crearCodificador({ ancho: f.w, alto: f.h, fps, audio, video });
  const img = document.createElement('canvas'), masc = document.createElement('canvas');
  nota('Creando el video… deja esta pestaña abierta.', 'trabajando');
  const inicio = performance.now();
  try {
    for (let i = 0; i < n; i++) {
      abortar();
      // en bucle el último cuadro no repite el primero (el reel empalma sin salto)
      const t = (pr.bucle ? i / n : i / (n - 1)) * D;
      poner(pr, t);
      if (muestras > 0) {
        const sombra = estudio.sombra();
        await componerRealista(comp, pr, muestras, { sombra, t, img, masc, cancelado: () => estado.cancelar, alAvanzar: p => { const hechos = i + p, seg = (performance.now() - inicio) / 1000; progreso(hechos / n, `Cuadro ${i + 1} de ${n} · ${Math.round(p * 100)} %`, hechos > 0.3 ? seg / hechos * (n - hechos) : null); } });
      } else {
        estudio.renderRapido();
        comp.cuadro({ fondo: estado.fondo, render3D: lienzoGL, sombra: estudio.sombra(), intensidadSombra: intensidadSombra(), capas: pr.textos, t, duracion: D });
        if (i % 6 === 0) { const seg = (performance.now() - inicio) / 1000; progreso((i + 1) / n, `Cuadro ${i + 1} de ${n}`, i > 5 ? seg / (i + 1) * (n - i - 1) : null); await new Promise(r => setTimeout(r)); }
      }
      // muestra en la vista previa (y en la línea de tiempo) el cuadro que se acaba de terminar
      if (muestras > 0 || i % 6 === 0) { previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height); linea.ponerCabezal(Math.min(t, proyecto.duracion)); }
      await cod.agregar(salida);
    }
    progreso(1, 'Guardando el archivo…');
    const blob = await cod.terminar();
    mostrarVideo(blob, `${slug(nombreDelProyecto())}-${estado.formato}.${cod.extension}`);
    const seg = (performance.now() - inicio) / 1000;
    if (cod.extension === 'webm') aviso('Este navegador solo pudo crear WebM (sirve para la web y el catálogo). Para Instagram crea el video en Chrome, Edge o Safari.', true);
    else if (sinSonido) aviso('Video listo, pero este navegador no pudo agregarle el sonido.', true);
    else aviso(`Video listo en ${reloj(seg)}.`);
    nota(`Video listo (${(blob.size / 1048576).toFixed(1)} MB${cod.conSonido ? ', con sonido' : ''}).`);
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
  c.onclick = () => navigator.share({ files: [archivo], title: nombreDelProyecto() || 'Atelier & Co' }).catch(() => {});
  abrirPestana('exportar');
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('foto').addEventListener('click', () => trabajo(async (comp, salida, f) => {
  await cargarFuentes();
  const muestras = Math.max(+$('calidad').value, 64) * 2, t = estado.t, pr = copiaProyecto();
  nota('Calculando la foto hiperrealista…', 'trabajando');
  poner(pr, t);
  const sombra = estudio.sombra(), inicio = performance.now();
  await componerRealista(comp, pr, muestras, { sombra, t, img: document.createElement('canvas'), masc: document.createElement('canvas'), cancelado: () => estado.cancelar, alAvanzar: p => { const seg = (performance.now() - inicio) / 1000; progreso(p, `Foto · ${Math.round(p * 100)} %`, p > 0.05 ? seg / p * (1 - p) : null); } });
  previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height);
  const blob = await new Promise(r => salida.toBlob(r, 'image/png'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(nombreDelProyecto())}-${estado.formato}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  aviso('Foto descargada.'); nota('Foto lista.');
}));

// ---------- Guardar y abrir proyectos ----------
function guardarProyecto() {
  const blob = new Blob([archivoProyecto()], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(nombreDelProyecto())}.atelier.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  aviso('Proyecto guardado. Ábrelo después con «Abrir».');
}
// cambia el contenido del mismo objeto: la línea de tiempo y los paneles siguen apuntando a él
function reemplazarProyecto(p) {
  for (const k of Object.keys(proyecto)) if (!(k in p)) delete proyecto[k];
  Object.assign(proyecto, p);
  todoCambio();
}
async function abrirProyecto(archivo) {
  try {
    const { p, aj } = leerProyecto(await archivo.text());
    cerrarRafaga(); linea.guardarHistorial();
    aplicarAjustes(aj);
    reemplazarProyecto(p);
    estado.t = 0; buscar(0);
    aviso(p.audio?.musica?.archivo ? 'Proyecto abierto. Vuelve a subir tu canción en la pestaña Sonido.' : 'Proyecto abierto.');
  } catch (e) { aviso(e.message || 'No se pudo abrir el proyecto.', true); }
}
$('guardar').addEventListener('click', guardarProyecto);
$('abrir').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirProyecto(f); });
$('nuevo').addEventListener('click', () => {
  if (!confirm('¿Empezar un proyecto nuevo?\nSe cambian los keyframes, los textos y los sonidos por los de un proyecto en blanco (puedes deshacerlo).')) return;
  cerrarRafaga(); linea.guardarHistorial();
  reemplazarProyecto(proyectoInicial());
  buscar(0);
  aviso('Proyecto nuevo.');
});

// ---------- Inicio ----------
{
  const pedida = location.hash.slice(1), guardada = leerLocal(CLAVE_PESTANA);
  estado.pestana = '';
  abrirPestana(PESTANAS.includes(pedida) ? pedida : PESTANAS.includes(guardada) ? guardada : 'modelo');
}
ajustarPrevia(); avisoCalidad(); reproducir(true); ponerSonido(false);
asentar();
rep.preparar(proyecto.audio, proyecto.duracion);
cargarFuentes().then(() => { estado.sucio = true; });
requestAnimationFrame(bucle);
if (!puedeCodificar()) nota('Este navegador no puede crear video: usa Chrome, Edge o Safari actualizados.', 'error');
// útil para depurar desde la consola
window.estudio = estudio;
window.atelier = { get proyecto() { return proyecto; }, estado, linea, panelTextos, panelSonido, panelTexturas, chat, rep };
