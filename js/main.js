// Editor de video de Atelier & Co: une el estudio 3D, la escena (pedestal, fondo y luz), la línea de tiempo con keyframes
// y cortes, los textos, el sonido, los bitmaps, el asistente y el replicador de reels. El proyecto (proyecto.js) es la única
// fuente de verdad: la cámara, los cortes, los textos y el audio de cada cuadro salen de él, tanto en la vista previa como en
// el video final. La escena y los materiales viven en el estudio y viajan con el proyecto en sus «ajustes».
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
import { efectoTransicion, dibujarTransicion } from './transiciones.js';
import { ESCENAS, ESCENA_INICIAL, normalizarEscena, joyaFlota, utileriaQueAbre } from './escenas.js';
import { PanelEscena } from './panel-escena.js';
import { PanelUtileria } from './panel-utileria.js';
import { PanelElementos } from './panel-elementos.js';
import { descargarSTL as bajarSTLUtileria } from './utileria.js';
import { exportarSTLElementos, registrarSTL, datosSTL, infoSTL } from './elementos.js';
import { PanelReplicar } from './replicar.js';
import { aplicarReplica } from './replica.js';

const $ = id => document.getElementById(id);
const PREVIA = 960;   // lado mayor de la vista previa, en píxeles
const CLAVE_PROYECTO = 'atelier-proyecto-v2', CLAVE_PESTANA = 'atelier-pestana';
const PESTANAS = ['modelo', 'materiales', 'escena', 'textos', 'sonido', 'asistente', 'replicar', 'exportar'];

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
// exportando: se está creando el video o la foto (la escena queda congelada hasta que termine)
// escena: la escena 3D del proyecto (normalizada); el estudio la muestra (durante un video, la nueva espera a que termine)
const estado = { escena: { id: 'ninguna' }, fondo: 'perla', formato: 'reel', t: 0, reproduciendo: true, sucio: true, ocupado: false, exportando: false, cancelar: false, realista: false, pestana: 'modelo', sonido: false, silencioManual: false, medidas: null };
// medición del trazado de rayos en este equipo (ver sondearPT): medidas por escena, joya y formato, y la que está en curso
const medidasPT = new Map();
let sondeo = null, esperaSondeo = 0;
// miniatura de la vista previa en el menú lateral (ver «Vista previa en miniatura» más abajo)
const mini = { ver: false, fuera: false, sucio: true, alto: 0, ctx: $('miniLienzo').getContext('2d') };

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
  const b = e.target.closest('button[data-k]'); if (!b || estado.exportando) return;
  estado.fondo = b.dataset.k; marcar($('fondos'), estado.fondo); verEscenaExportar(); cambio(); programarAutoguardado();
});
const verSombra = () => { $('sombra').parentElement.querySelector('output').textContent = `${Math.round($('sombra').value * 100)} %`; };
$('sombra').addEventListener('input', () => { verSombra(); cambio(); programarAutoguardado(); });
for (const id of ['metal', 'acabado', 'piedra']) $(id).addEventListener('change', () => {
  if (estado.exportando) { $(id).value = estudio.ajustes[id]; return; }
  estudio.ajustes[id] = $(id).value; estudio.pintar();
  if (refrescarAutos()) { asentar(); panelTextos.render(); linea.render(); }
  panelTexturas.render(); cambio(); programarAutoguardado();
});
for (const id of ['calidad', 'fps']) $(id).addEventListener('change', () => { avisoCalidad(); programarAutoguardado(); });

// los bitmaps y la escena se guardan con el proyecto (en sus ajustes): sus paneles se crean antes de leer el autoguardado
const panelTexturas = new PanelTexturas($('panelTexturas'), { estudio, alCambiar: () => { cambio(); programarAutoguardado(); } });
const panelEscena = new PanelEscena($('panelEscena'), { estudio, alCambiar: cfg => cambioEscena(cfg, 'escena') });
// «Fondo» y «Sombra bajo la pieza» son los ajustes del fondo liso de marca: van dentro de esa tarjeta del panel
panelEscena.ranuraLiso.append($('ajustesLiso'));
// El estuche o la caja y los elementos: secciones de la misma pestaña; su configuración viaja dentro de la escena
const panelUtileria = new PanelUtileria($('panelUtileria'), {
  alCambiar: u => cambioEscena({ ...estado.escena, utileria: u }, 'utileria'),
  // el STL se arma con la joya de ahora (y su par): así la caja que se imprime es la que se ve
  descargarSTL: ({ cfg, parte }) => { const o = estudio.opcionesUtileria(); return bajarSTLUtileria(cfg, { joya: o.joya, suelo: o.suelo, partes: parte, apertura: 0 }); },
});
const panelElementos = new PanelElementos($('panelElementos'), {
  alCambiar: lista => cambioEscena({ ...estado.escena, elementos: lista }, 'elementos'),
  descargarSTL: lista => exportarSTLElementos(lista, { ...estudio.opcionesElementos(), t: estado.t }),
  subirSTL: async archivo => registrarSTL(await archivo.arrayBuffer(), archivo.name),
  opcionesSTL: () => ({ ...estudio.opcionesElementos(), t: estado.t }),
});

// Un cambio en los paneles de la pestaña Escena (la escena, el estuche o los elementos): es un paso de Deshacer (una ráfaga
// de cambios seguidos, como arrastrar un deslizador, es un solo paso). Al pasar al fondo liso se recuerda lo que había en la
// escena (par, estuche, elementos): si se vuelve a una escena 3D, regresa
let rafagaEscena = 0, contenidoGuardado = null, lineaLista = false;   // lineaLista: la línea de tiempo ya existe (se crea después)
const tieneContenido = e => e && e.id !== 'ninguna' && (e.par?.activo || (e.utileria && e.utileria.tipo !== 'ninguna') || e.elementos?.length);
function cambioEscena(cfg, desde) {
  if (estado.exportando) { ponerEscena(estado.escena); return; }   // (los paneles están bloqueados: no debería pasar)
  let n = normalizarEscena(cfg);
  const antes = estado.escena;
  if (n.id === 'ninguna' && tieneContenido(antes)) contenidoGuardado = { par: antes.par, utileria: antes.utileria, elementos: antes.elementos };
  else if (antes.id === 'ninguna' && n.id !== 'ninguna' && contenidoGuardado && !tieneContenido(n)) { n = normalizarEscena({ ...n, ...contenidoGuardado }); desde = null; }
  historialEscena();
  ponerEscena(n, { desde });
  programarAutoguardado();
}
function historialEscena() {
  if (!rafagaEscena) {
    cerrarRafaga();
    const d = JSON.parse(serializar(proyecto)); d.ajustes = { escena: estado.escena, soloEscena: true };
    linea.guardarHistorial(JSON.stringify(d)); linea.render();
  }
  clearTimeout(rafagaEscena); rafagaEscena = setTimeout(() => { rafagaEscena = 0; }, 800);
}

// Pone la escena 3D (id de una escena lista o su configuración). Mientras se crea un video el estudio sigue con la de antes
// (los cuadros que faltan no cambian) y la nueva se arma al terminar. desde: el panel de donde vino el cambio (ese no se
// vuelve a dibujar: se le estaría moviendo el deslizador bajo el dedo); panel: false = desde el panel de la escena
function ponerEscena(cfg, { panel = true, desde = panel ? null : 'escena' } = {}) {
  const n = normalizarEscena(cfg), antes = estado.escena;
  estado.escena = n;
  if (desde !== 'escena') panelEscena.poner(n);
  if (desde !== 'utileria') panelUtileria.poner(n.id === 'ninguna' ? 'ninguna' : n.utileria);
  if (desde !== 'elementos') panelElementos.poner(n.id === 'ninguna' ? [] : n.elementos);
  verSeccionesEscena(n);
  if (!estado.exportando) estudio.ponerEscena(n);
  if (proyecto) avisoCalidad();   // (al arrancar, antes de leer el proyecto, todavía no hay aviso que actualizar)
  verEscenaExportar(); cambio();
  // las pistas de la escena (apertura, elevar, luz) aparecen en la línea de tiempo solo cuando sirven
  if (lineaLista && clavePistas(antes) !== clavePistas(n)) programarLinea();
  return n;
}
const clavePistas = e => ['apertura', 'elevar', 'luz'].map(k => pistaVisible(k, e)).join();
// ¿Se ve el carril de una pista de la escena? (una pista con keyframes se ve siempre: lo decide la línea de tiempo)
function pistaVisible(k, e = estado.escena) {
  if (k === 'apertura') return utileriaQueAbre(e);
  if (k === 'elevar') return !!e && e.id !== 'ninguna' && (joyaFlota(e) || (!!e.utileria && e.utileria.tipo !== 'ninguna'));
  if (k === 'luz') return !!e && e.id !== 'ninguna';
  return true;
}
// sin escena 3D no hay estuche ni elementos: en su lugar, una nota
function verSeccionesEscena(n) {
  const sin = n.id === 'ninguna';
  $('panelUtileria').hidden = $('panelElementos').hidden = sin; $('sinEscena3D').hidden = !sin;
}
// En Exportar se recuerda con qué escena (o fondo liso) sale el video
function verEscenaExportar() {
  const e = estado.escena, base = ESCENAS[e.base || e.id];
  $('escenaExportar').innerHTML = e.id === 'ninguna'
    ? `Fondo liso de marca: <b>${FONDOS[estado.fondo]?.nombre || ''}</b>`
    : `Escena: <b>${base?.nombre || 'Personalizada'}</b>${e.id === 'personalizada' ? ' (ajustada)' : ''}`;
}
$('irEscena').addEventListener('click', () => abrirPestana('escena', { desplazar: true }));
const mismaEscena = (a, b) => JSON.stringify(normalizarEscena(a)) === JSON.stringify(normalizarEscena(b));
// metal y piedra que vio la IA en un reel (solo los del catálogo)
function ponerMateriales({ metal, piedra } = {}) {
  if (METALES.includes(metal)) { estudio.ajustes.metal = metal; $('metal').value = metal; }
  if (PIEDRAS.includes(piedra)) { estudio.ajustes.piedra = piedra; $('piedra').value = piedra; }
  estudio.pintar(); panelTexturas.render();
}

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
// stl: los STL que subió la joyera para los elementos viajan en el archivo ('todo'), en el autoguardado solo si son chicos
// ('chico': el almacenamiento del navegador tiene unos pocos MB) y nunca en las fotos de Deshacer (siguen en la memoria)
const ajustesEscena = ({ stl = 'no' } = {}) => ({
  escena: estado.escena, formato: estado.formato, fondo: estado.fondo, sombra: +$('sombra').value, fps: +$('fps').value, calidad: +$('calidad').value,
  metal: estudio.ajustes.metal, acabado: estudio.ajustes.acabado, piedra: estudio.ajustes.piedra,
  autos: { titulo: [...autos.titulo].slice(-20), detalle: [...autos.detalle].slice(-20), nombre: nombreActual },
  texturas: panelTexturas.guardable(),
  ...(stl !== 'no' ? { stls: stlsDeEscena(estado.escena, stl === 'chico' ? 1.5e6 : Infinity) } : {}),
});
const archivoProyecto = (op = {}) => { const d = JSON.parse(serializar(proyecto)); d.ajustes = ajustesEscena(op); return JSON.stringify(d); };
// Los STL propios de los elementos de la escena: { id: { nombre, datos (base64) } }
function stlsDeEscena(e, tope) {
  const sal = {}; let total = 0;
  for (const g of e?.elementos || []) {
    const id = g?.forma === 'stl' && g.stl?.id; if (!id || sal[id]) continue;
    const bytes = datosSTL(id); if (!bytes) continue;
    if (total + bytes.length * 4 / 3 > tope) continue;
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    sal[id] = { nombre: g.stl.nombre || infoSTL(id)?.nombre || 'mi-stl.stl', datos: btoa(bin) }; total += sal[id].datos.length;
  }
  return sal;
}
// Vuelve a registrar los STL que vienen en un archivo; devuelve los que faltan (los elementos que no tienen su STL)
function restaurarSTLs(aj) {
  const lista = aj.stls && typeof aj.stls === 'object' && !Array.isArray(aj.stls) ? aj.stls : {};
  for (const v of Object.values(lista)) {
    if (!v || typeof v.datos !== 'string') continue;
    try { const bin = atob(v.datos), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); registrarSTL(u8, typeof v.nombre === 'string' ? v.nombre : 'mi-stl.stl'); }
    catch (e) { console.warn('No se pudo leer un STL guardado:', e); }
  }
  const faltan = [];
  for (const g of Array.isArray(aj.escena?.elementos) ? aj.escena.elementos : []) {
    const id = g?.forma === 'stl' && g.stl?.id;
    if (id && !infoSTL(id)) faltan.push(`tu STL «${String(g.stl.nombre || 'mi STL').slice(0, 40)}» (pestaña Escena)`);
  }
  return [...new Set(faltan)];
}

function leerProyecto(texto) {
  let d;
  try { d = typeof texto === 'string' ? JSON.parse(texto) : texto; } catch (e) { throw new Error('El archivo no es un proyecto válido: no se pudo leer.'); }
  if (!d || typeof d !== 'object' || Array.isArray(d) || !('pistas' in d || 'textos' in d || 'audio' in d)) throw new Error('Ese archivo no es un proyecto del estudio de Atelier & Co.');
  const p = deserializar(d), aj = p.ajustes && typeof p.ajustes === 'object' ? p.ajustes : null;
  delete p.ajustes;
  p.textos = normalizarCapas(p.textos);
  return { p, aj };
}

// soloEscena: los ajustes de una foto de Deshacer que solo guarda la escena (lo que cambió el asistente)
function aplicarAjustes(aj) {
  // un proyecto de antes de las escenas 3D (sin «escena» en sus ajustes) se ve como se hizo: con el fondo liso de marca
  if (!aj || typeof aj !== 'object') { ponerEscena('ninguna'); return; }
  const sinSTL = restaurarSTLs(aj);   // (antes de la escena: sus elementos usan esos STL)
  ponerEscena('escena' in aj ? aj.escena : 'ninguna');
  if (aj.soloEscena) return sinSTL;
  // (un archivo editado a mano o de otra versión no puede dejar la app a medias: solo se toma lo que es válido)
  const clave = (lista, v) => (typeof v === 'string' && Object.hasOwn(lista, v) ? v : null);
  if (clave(FORMATOS, aj.formato)) estado.formato = aj.formato;
  if (clave(FONDOS, aj.fondo)) estado.fondo = aj.fondo;
  if (Number.isFinite(aj.sombra)) $('sombra').value = aj.sombra;
  for (const k of ['fps', 'calidad']) if ([...$(k).options].some(o => +o.value === aj[k])) $(k).value = String(aj[k]);
  for (const [k, lista] of [['metal', METALES], ['acabado', Object.keys(ACABADOS)], ['piedra', PIEDRAS]]) if (lista.includes(aj[k])) { estudio.ajustes[k] = aj[k]; $(k).value = aj[k]; }
  if (aj.autos && typeof aj.autos === 'object') {
    for (const k of ['titulo', 'detalle']) for (const v of Array.isArray(aj.autos[k]) ? aj.autos[k] : []) if (typeof v === 'string') autos[k].add(v);
    if (typeof aj.autos.nombre === 'string' && aj.autos.nombre) nombreActual = aj.autos.nombre;
  }
  // bitmaps de las piedras y del metal (lo que no se puede recuperar, como una imagen subida, vuelve en la lista)
  const faltan = aj.texturas && typeof aj.texturas === 'object' ? panelTexturas.restaurar(aj.texturas) : [];
  estudio.pintar();
  pintarControles();
  return [...faltan, ...sinSTL];
}
// Aviso al recuperar o abrir un proyecto: lo que no viaja en el archivo (la canción, las imágenes subidas) se pide de nuevo
const cancionPerdida = () => { const a = proyecto?.audio?.musica?.archivo; return !!a && typeof a === 'object' && !a.buffer; };
function avisoAbierto(inicio, faltan = []) {
  const lista = [...(cancionPerdida() ? ['tu canción (pestaña Sonido)'] : []), ...faltan.map(f => (/\(pestaña /.test(f) ? f : f + ' (pestaña Materiales)'))];
  const y = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' y ' + lista.at(-1) : lista[0];
  aviso(lista.length ? `${inicio} Vuelve a subir ${y}.` : inicio, false);
}
function pintarControles() {
  marcar($('formatos'), estado.formato); marcar($('fondos'), estado.fondo); verSombra(); verEscenaExportar();
  ajustarPrevia();
}

// El proyecto: el último autoguardado (si lo hay) o uno nuevo
let proyecto = null;
{
  const guardado = leerLocal(CLAVE_PROYECTO);
  let faltan = [], fallo = false;
  if (guardado) {
    try { const { p, aj } = leerProyecto(guardado); faltan = aplicarAjustes(aj); proyecto = p; adaptarAFormato(proyecto.textos, estado.formato); }
    catch (e) {
      // no se pudo leer: se guarda aparte (no se pierde al autoguardar el proyecto nuevo) y se avisa
      console.warn(e); proyecto = null; fallo = true; guardarLocal(CLAVE_PROYECTO + '-respaldo', guardado);
    }
  }
  if (!proyecto) {
    // la primera visita (o si no se pudo leer el anterior) empieza con la escena de la foto de referencia: pedestal y luz de ventana
    ponerEscena(ESCENA_INICIAL);
    proyecto = proyectoInicial();
    if (fallo) setTimeout(() => aviso('No se pudo recuperar tu último proyecto: empezamos uno nuevo (quedó una copia de respaldo en este equipo).', true), 600);
  } else setTimeout(() => avisoAbierto('Se recuperó tu último proyecto.', faltan), 600);
}
pintarControles();

// ---------- Deshacer: la pila vive en la línea de tiempo ----------
// Los cambios de los paneles (textos, sonido, arrastrar en la vista previa) se agrupan: un paso por ráfaga de cambios
let fotoEstable = '', tRafaga = 0, tGuardar = 0;
function asentar() { fotoEstable = serializar(proyecto); programarAutoguardado(); }
// arrastrandoTexto: mientras el dedo o el mouse sigue sobre un texto, una pausa no cierra el paso (Deshacer vuelve a donde estaba)
let arrastrandoTexto = false;
function anotarCambio() {
  if (!tRafaga && fotoEstable) linea.guardarHistorial(fotoEstable);
  clearTimeout(tRafaga); tRafaga = setTimeout(cerrarPorPausa, 800);
}
function cerrarPorPausa() { if (arrastrandoTexto) tRafaga = setTimeout(cerrarPorPausa, 800); else cerrarRafaga(); }
function cerrarRafaga() { clearTimeout(tRafaga); tRafaga = 0; asentar(); linea.render(); }
function programarAutoguardado() { clearTimeout(tGuardar); tGuardar = setTimeout(autoguardar, 900); }
function autoguardar() { if (guardarLocal(CLAVE_PROYECTO, archivoProyecto({ stl: 'chico' })) || guardarLocal(CLAVE_PROYECTO, archivoProyecto())) $('guardado').textContent = 'Guardado en este equipo'; }
// al cerrar o recargar la pestaña (o cambiar de app en el celular) no se espera el autoguardado: lo pendiente se guarda ya
function guardarYa() { if (tRafaga) cerrarRafaga(); clearTimeout(tGuardar); autoguardar(); }
addEventListener('pagehide', guardarYa);
document.addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });

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

// Deshacer o rehacer un «Abrir proyecto»: la foto trae los ajustes de la escena (formato, fondo, metal…) y también se devuelven
function recuperarAjustes(motivo) {
  if (!('ajustes' in proyecto)) return;
  const aj = proyecto.ajustes; delete proyecto.ajustes;
  if (!aj || typeof aj !== 'object') return;
  // la foto del otro lado (para rehacer o volver a deshacer) se lleva los ajustes que hay ahora (durante un video, los que
  // quedaron pendientes de un deshacer anterior: son los que tiene el proyecto aunque la escena todavía no los muestre)
  const pila = motivo === 'deshacer' ? linea.rehechos : linea.historial, i = pila.length - 1;
  if (i >= 0) try { const d = JSON.parse(pila[i]); d.ajustes = ajustesPendientes || ajustesEscena(); pila[i] = JSON.stringify(d); } catch (e) { /* foto ilegible: se deja como está */ }
  if (estado.exportando) ajustesPendientes = aj; else aplicarAjustes(aj);
}

let lineaPendiente = 0;
function programarLinea() { if (!lineaPendiente) lineaPendiente = requestAnimationFrame(() => { lineaPendiente = 0; linea.render(); }); }

// ---------- Línea de tiempo ----------
const linea = new LineaTiempo($('lineaTiempo'), {
  obtenerProyecto: () => proyecto,
  efectos: EFECTOS, estilosMusica: ESTILOS_MUSICA,
  // las pistas de la escena se ven solo cuando sirven; la apertura sin keyframes es la del panel del estuche
  pistaVisible: k => pistaVisible(k),
  valorSinClaves: k => (k === 'apertura' && estado.escena.utileria ? estado.escena.utileria.apertura : null),
  // los paneles de arriba cambian de alto al volver a dibujarse: la línea de tiempo se queda quieta bajo el puntero
  alCambiar: motivo => sinSaltar(() => {
    clearTimeout(tRafaga); tRafaga = 0;
    if (motivo === 'deshacer' || motivo === 'rehacer') { recuperarAjustes(motivo); todoCambio({ linea: false }); return; }
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
lineaLista = true;

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

// Replicar un reel: el panel se arma la primera vez que se abre la pestaña (al armarse pregunta si hay IA en el sitio:
// así abrir la página no le cuesta una llamada a la función del servidor)
let replicar = null;
function panelReplicar() {
  if (!replicar) {
    replicar = new PanelReplicar($('panelReplicar'), { duracionProyecto: () => proyecto.duracion, alAplicar: aplicarReplicaAlProyecto });
    if (estado.exportando) replicar.bloquear(true);
  }
  return replicar;
}
// Lo que se eligió del reel: se guarda para deshacer (con la escena, el metal y la piedra de ahora), se pone la escena y los
// materiales y se aplica el resto al proyecto (movimientos, cortes, textos, sonidos, música y duración)
function aplicarReplicaAlProyecto(plan, op) {
  if (estado.exportando) throw new Error('Espera a que termine el video para aplicar la réplica.');
  cerrarRafaga();
  linea.guardarHistorial(archivoProyecto());
  if (op.escena && plan.escena) ponerEscena(plan.escena);
  if (op.materiales && plan.materiales) ponerMateriales(plan.materiales);
  const hecho = aplicarReplica(proyecto, plan, { ...op, formato: estado.formato });
  todoCambio(); programarAutoguardado();
  if (estudio.tieneModelo) { estado.t = 0; reproducir(true); }
  aviso(plan.resumen || 'Se aplicó la réplica al proyecto.');
  return hecho;
}

function obtenerInfo() {
  const m = estado.medidas;
  return {
    cargado: estudio.tieneModelo, nombre: nombreDelProyecto(),
    medidas: m ? [m.x, m.y, m.z].map(v => Math.round(v * 10) / 10) : null,
    tienePiedras: !!estudio.geoP, metal: estudio.ajustes.metal, piedra: estudio.geoP ? estudio.ajustes.piedra : null, formato: estado.formato,
    escena: estado.escena,
  };
}

// Lo que pidió el asistente: se guarda para deshacer, se mezcla en el proyecto y se ve desde el principio.
// foto: el proyecto como estaba al mandar el pedido (lo que se editó mientras la IA pensaba se conserva)
function aplicarAcciones(acciones, { foto } = {}) {
  cerrarRafaga();
  const antes = serializar(proyecto), escenaAntes = estado.escena;
  const hecho = aplicarAccionesAProyecto(proyecto, acciones, {
    textosDesdeAcciones, formato: estado.formato, musicaNueva, foto,
    // la escena vive en el estudio, no en el proyecto: el asistente la cambia por aquí
    alEscena: cfg => ponerEscena(cfg), escenaActual: () => estado.escena,
  });
  if (!hecho.algo) return hecho;
  // si cambió la escena, Deshacer también la devuelve: la foto lleva la escena de antes (solo eso: el metal, el fondo
  // o el formato que se hayan tocado sin pasar por el historial no se tocan)
  if (hecho.escena) {
    const d = JSON.parse(antes); d.ajustes = { escena: escenaAntes, soloEscena: true };
    linea.guardarHistorial(JSON.stringify(d));
    if (estado.exportando) aviso('La escena nueva se verá en la vista previa cuando termine el video.');
  } else linea.guardarHistorial(antes);
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
    // agarrar un texto es un gesto nuevo: lo que se venía escribiendo queda como su propio paso de Deshacer
    if (tRafaga) cerrarRafaga();
    // el foco sale del campo que se estaba editando: Ctrl+Z deshace el arrastre, no lo último que se escribió
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    sinSaltar(() => { abrirPestana('textos'); panelTextos.seleccionar(id); }, document.querySelector('.vista')); linea.seleccionar({ tipo: 'texto', id });
    estado.sucio = true;
  },
  alMover: () => {
    arrastrandoTexto = true; anotarCambio(); estado.sucio = true;
    if (!textoPendiente) textoPendiente = requestAnimationFrame(() => { textoPendiente = 0; panelTextos.render(); });
  },
  alSoltar: () => { arrastrandoTexto = false; cerrarRafaga(); },
});

// ---------- Pestañas del inspector (y el menú lateral) ----------
const tabs = [...document.querySelectorAll('#pestanas [role=tab]')];
// en el celular las pestañas llevan el mismo ícono que el menú lateral
for (const b of tabs) { const ico = document.querySelector(`#nav a[data-pestana="${b.dataset.pestana}"] svg`)?.cloneNode(true); if (ico) { ico.setAttribute('aria-hidden', 'true'); b.prepend(ico); } }
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
    else if (id === 'escena') panelEscena.render();
    else if (id === 'replicar') panelReplicar();
    else if (id === 'exportar') avisoCalidad();   // (ahí se mide cuánto tarda el trazado de rayos en este equipo)
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
  if (estado.exportando) { aviso('Espera a que termine el video para abrir otro archivo.'); return; }
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
  estado.t = 0; reproducir(true); cambio(); verMini();
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
  if (estado.exportando) return;
  const { metal, piedra } = anilloEjemplo();
  const info = estudio.montar(metal, piedra);
  nuevoNombre('Solitario Aurora');
  listo(info);
}
$('ejemplo').addEventListener('click', cargarEjemplo);
$('ejemploVista').addEventListener('click', cargarEjemplo);
document.querySelectorAll('[data-girar]').forEach(b => b.addEventListener('click', () => { if (estado.exportando) return; estudio.girar(b.dataset.girar, Math.PI / 2); cambio(); }));
$('restablecer').addEventListener('click', () => { if (estado.exportando) return; estudio.orientar(estudio.orientacionInicial, 0, 0); cambio(); });

// ---------- Vista previa ----------
function ajustarPrevia() {
  const f = FORMATOS[estado.formato], k = PREVIA / Math.max(f.w, f.h);
  const w = Math.round(f.w * k / 2) * 2, h = Math.round(f.h * k / 2) * 2;
  // mientras se crea el video el estudio renderiza al tamaño de la salida: no se le cambia a mitad (trabajo() lo devuelve al terminar)
  previa.tamano(w, h); if (!estado.exportando) estudio.tamano(w, h);
  $('editor').style.setProperty('--aspecto', (f.w / f.h).toFixed(4));
  $('marco').dataset.formato = estado.formato;   // (la etiqueta «Vista rápida» no tapa la marca en 16:9)
  const m = $('miniLienzo'); m.width = w / 2; m.height = h / 2; verMini(true);
  estado.sucio = true;
}

// Vista previa en miniatura en el menú lateral: la línea de tiempo va debajo de la vista previa y, al bajar a editar
// los keyframes, la joya se sigue viendo ahí (solo en pantallas con menú lateral y si cabe con un tamaño útil)
function verMini(medir = false) {
  const caja = $('miniVista'), c = $('miniLienzo');
  const conMenu = getComputedStyle(caja.parentElement).display !== 'none';
  if (conMenu && (medir || !mini.ver)) {
    // la miniatura llena el espacio libre del menú (entre las secciones y la nota de abajo) sin pasarse
    const W = caja.clientWidth - 26, H = caja.clientHeight - caja.querySelector('.mini-pie').offsetHeight - 17;
    const k = Math.max(0, Math.min(W / c.width, H / c.height));
    c.style.width = Math.floor(c.width * k) + 'px'; c.style.height = Math.floor(c.height * k) + 'px';
    mini.alto = c.height * k;
  }
  const ver = mini.fuera && estudio.tieneModelo && conMenu && mini.alto >= 96;   // muy pequeña no sirve
  if (ver !== mini.ver) { mini.ver = ver; caja.classList.toggle('ver', ver); mini.sucio = true; }
}
// t: el instante del cuadro que quedó en la vista previa (el reloj de la miniatura dice el de la imagen)
const previaPintada = (t = estado.t) => { mini.sucio = true; mini.t = t; };
function pintarMini() {
  if (!mini.ver || !mini.sucio) return;
  mini.sucio = false;
  const c = $('miniLienzo');
  mini.ctx.drawImage($('lienzo'), 0, 0, c.width, c.height);
  $('miniReloj').textContent = relojVideo(mini.t ?? estado.t);
}
$('miniVista').hidden = false;
$('miniVista').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(([e]) => { mini.fuera = e.intersectionRatio < 0.4; verMini(); }, { threshold: [0, 0.4, 1] }).observe($('marco'));
addEventListener('resize', () => verMini(true));

// cualquier cambio vuelve a dibujar la vista previa y detiene el cuadro hiperrealista (pero no anula un «Cancelar» en curso)
function cambio() { estado.sucio = true; if (estado.realista) estado.cancelar = true; if (sondeo) sondeo.cancelado = true; }

// Franja libre de textos para encuadrar la joya (no depende del tiempo: la cámara no salta cuando entra un texto)
let zonaGuardada = { k: '', z: null };
function franja(capas, W, H) {
  const k = W + 'x' + H + JSON.stringify(capas);
  if (zonaGuardada.k !== k) zonaGuardada = { k, z: zonaLibre(capas, { W, H }) };
  return zonaGuardada.z;
}
// coloca la cámara del instante t (segundos) según los keyframes del proyecto
// (la apertura del estuche sin keyframes es la del panel: el estudio la toma de la escena)
const poner = (pr, t) => {
  estudio.ponerTiempo(t);
  const pose = evaluar(pr, t);
  if (!pr.pistas?.apertura?.length) pose.apertura = null;
  estudio.aplicarPose(pose, franja(pr.textos, estudio.ancho, estudio.alto));
};
const intensidadSombra = () => +$('sombra').value;
// lo que se ve de la escena (fondo, sombra y formato); trabajo() lo copia al empezar para que el video no cambie a mitad.
// opaco: hay una escena 3D (pedestal y fondo de verdad): el render cubre todo el cuadro, sin el fondo de marca ni la sombra 2D;
// oscuro: con escena, si los textos van claros (sin escena lo decide el fondo de marca)
const escenaActual = () => ({ fondo: estado.fondo, sombra: intensidadSombra(), formato: estado.formato, opaco: estudio.escenaActiva, oscuro: estudio.oscuro });
// Flash, fundido a negro o barrido de los cortes, encima del cuadro ya compuesto. fps: el ritmo de los cuadros (así el flash
// revienta justo en el primer cuadro del plano nuevo)
function transicion(comp, pr, t, fps) {
  const e = efectoTransicion(pr.cortes, t, fps);
  if (e) dibujarTransicion(comp.ctx, comp.lienzo.width, comp.lienzo.height, e, comp.lienzo);
}
// el marco punteado de la capa elegida solo se ve mientras se editan los textos
const capaElegida = () => estado.pestana === 'textos' && panelTextos.seleccion ? (proyecto.textos || []).find(c => c.id === panelTextos.seleccion) || null : null;

// escena: la de la vista previa o la congelada del video; fps: el de los cuadros (en la vista previa, el elegido para el video)
function dibujarRapido(comp, pr, t, { seleccion = null, escena = escenaActual(), fps = +$('fps').value } = {}) {
  poner(pr, t);
  estudio.renderRapido();
  comp.cuadro({ fondo: escena.fondo, render3D: lienzoGL, sombra: escena.opaco ? null : estudio.sombra(), intensidadSombra: escena.sombra, capas: pr.textos, t, duracion: pr.duracion, seleccion, opaco: escena.opaco, oscuro: escena.oscuro });
  transicion(comp, pr, t, fps);
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
      if (estudio.tieneModelo) { $('etiquetaVista').textContent = 'Vista rápida'; dibujarRapido(previa, proyecto, estado.t, { seleccion: capaElegida() }); previaPintada(); }
    }
  }
  pintarMini();
  requestAnimationFrame(bucle);
}

const icoPlay = '<path d="M7 4v16l13-8z"/>', icoPausa = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
const icoSonido = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.6a7.6 7.6 0 010 10.8"/>';
const icoMudo = '<path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>';
function reproducir(si) {
  estado.reproduciendo = si;
  // sin joya no hay nada que reproducir: el botón muestra ▶ (al cargarla empieza sola)
  const pausa = si && estudio.tieneModelo;
  $('icoPlay').innerHTML = pausa ? icoPausa : icoPlay; $('reproducir').setAttribute('aria-label', pausa ? 'Pausar' : 'Reproducir');
  $('miniVista').classList.toggle('reproduciendo', si);
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
  await pararSondeo();
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
// escena: { fondo, sombra, opaco, oscuro } congelados al empezar un video (por defecto, los que se ven ahora).
// Con escena 3D no hay sombra 2D (la sombra la calcula el trazador sobre el pedestal) y no hace falta la silueta.
// fps: el ritmo de los cuadros para la transición de los cortes (null = sin transición, como en la foto para catálogo)
async function componerRealista(comp, pr, muestras, { sombra, t, img, masc, alAvanzar, cancelado, escena = escenaActual(), fps = +$('fps').value }) {
  const W = lienzoGL.width, H = lienzoGL.height, opaco = escena.opaco;
  img.width = W; img.height = H;
  if (!opaco) {
    masc.width = W; masc.height = H;
    estudio.renderMascara();
    const cm = masc.getContext('2d'); cm.clearRect(0, 0, W, H); cm.drawImage(lienzoGL, 0, 0);
  }
  const ci = img.getContext('2d');
  const pintar = () => {
    ci.clearRect(0, 0, W, H); ci.drawImage(lienzoGL, 0, 0);
    comp.cuadro({ fondo: escena.fondo, render3D: img, sombra: opaco ? null : sombra, intensidadSombra: escena.sombra, mascara: opaco ? null : masc, capas: pr.textos, t, duracion: pr.duracion, opaco, oscuro: escena.oscuro });
    if (fps) transicion(comp, pr, t, fps);
    if (comp === previa) previaPintada(t);
  };
  let ultimoPintado = 0;
  await estudio.renderRealista(muestras, {
    cancelado: cancelado || (() => estado.cancelar),
    alAvanzar: p => { alAvanzar?.(p); if (comp === previa && performance.now() - ultimoPintado > 250) { pintar(); ultimoPintado = performance.now(); } },
  });
  pintar();
}

// ---------- Exportar ----------
// Cuántas veces más tarda el trazado de rayos con cada escena que con el fondo liso (costo.mjs: anillo de ejemplo, 270×480,
// 8 muestras; con escena cada píxel del cuadro rebota en el yeso, sin escena casi todos salen al fondo). Es solo para el
// aviso; el tiempo de verdad sale de medir este equipo (sondearPT)
const COSTO_ESCENA = { 'pedestal-arena': 6, travertino: 5, 'marmol-blanco': 5, 'marmol-negro': 4, escalones: 6, arco: 8, terciopelo: 4, espejo: 5, playa: 5, rosa: 6, 'saten-noche': 4, 'saten-esmeralda': 4, 'saten-granate': 4, 'saten-perla': 5 };
// Tiempo del video con trazado de rayos medido en este equipo: un cuadro chico (1/16 del video) con la escena, la joya y el
// formato de ahora; cada combinación se mide una vez, al abrir Exportar con una calidad de trazado de rayos. La vista previa
// se detiene mientras tanto (unos segundos; la primera vez, lo que tarde en compilar el sombreador) y cualquier cambio,
// «Crear video», la foto o la vista hiperrealista la sueltan enseguida
const claveSondeo = () => JSON.stringify([estado.escena, estudio.versionModelo, estado.formato]);
// (se espera un poco: si solo se pasa por Exportar, o se cambia la calidad enseguida, no se mide)
function programarSondeo() { clearTimeout(esperaSondeo); esperaSondeo = setTimeout(sondearPT, 2500); }
function sondearPT() {
  const k = claveSondeo();
  if (medidasPT.has(k) || sondeo || estado.ocupado || estado.exportando || !estudio.tieneModelo || +$('calidad').value === 0 || estado.pestana !== 'exportar' || document.hidden) return;
  const f = FORMATOS[estado.formato], w = Math.round(f.w / 8) * 2, h = Math.round(f.h / 8) * 2;   // un cuarto de cada lado
  const yo = sondeo = { cancelado: false }, sonaba = estado.reproduciendo;
  if (sonaba) reproducir(false);
  estado.ocupado = true;
  yo.promesa = (async () => {
    try {
      estudio.tamano(w, h); poner(proyecto, estado.t);
      medidasPT.set(k, await estudio.medirPT({ cancelado: () => yo.cancelado }));
    } catch (err) {
      if (err.name !== 'AbortError') { console.warn(err); medidasPT.set(k, null); }   // (sin medida: el aviso de siempre)
    } finally {
      sondeo = null; estado.ocupado = false; ajustarPrevia();
      if (sonaba) reproducir(true);   // (si fue para crear el video o la foto, trabajo() la vuelve a pausar)
      avisoCalidad();
    }
  })();
}
async function pararSondeo() { clearTimeout(esperaSondeo); if (sondeo) { sondeo.cancelado = true; await sondeo.promesa; } }
const aprox = s => (s < 50 ? 'menos de 1 min' : s < 3600 ? `≈ ${Math.round(s / 60)} min` : `≈ ${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min`);

function avisoCalidad() {
  const m = +$('calidad').value, f = FORMATOS[estado.formato], fps = +$('fps').value, n = Math.round((proyecto.duracion || 8) * fps);
  if (m === 0) {
    clearTimeout(esperaSondeo); if (sondeo) sondeo.cancelado = true;   // (el render rápido no necesita la medición)
    $('avisoCal').textContent = `Render rápido: ${n} cuadros en pocos segundos. Ideal para revisar el movimiento y el sonido antes del video final.`; return;
  }
  const k = claveSondeo(), med = medidasPT.get(k), base = estado.escena.base || estado.escena.id, veces = COSTO_ESCENA[base];
  let cuanto;
  if (med) {
    const seg = n * f.w * f.h / 1e6 * (m * med.muestra + med.fijo) / 1000;
    cuanto = `Son ${n} cuadros de ${f.w}×${f.h}: en este equipo, <strong>${aprox(seg)}</strong> (${seg / n < 3600 ? 'unos ' : ''}${reloj(seg / n)} por cuadro).`;
  } else {
    if (!medidasPT.has(k) && estudio.tieneModelo) programarSondeo();
    cuanto = `Son ${n} cuadros de ${f.w}×${f.h}; ${!medidasPT.has(k) && estudio.tieneModelo && estado.pestana === 'exportar' ? 'midiendo cuánto tarda en este equipo…' : 'según la tarjeta de video puede tardar de varios minutos a más de una hora.'}`;
  }
  $('avisoCal').innerHTML = `Trazado de rayos: luz, reflejos y refracción de las piedras calculados como en una fotografía real. ${cuanto}${base !== 'ninguna' ? ` Con esta escena 3D cada cuadro cuesta ${veces ? `unas ${veces} veces` : 'varias veces'} lo que con el fondo liso: el pedestal, el fondo y la luz de la ventana también se calculan con luz real.` : ''} Deja esta pestaña abierta y visible.`;
}
const slug = s => (s || 'joya').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'joya';
const reloj = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h} h ${m} min` : m ? `${m} min ${String(x).padStart(2, '0')} s` : `${x} s`; };

// Mientras se crea el video, lo que cambia la escena (abrir otro proyecto o joya, la escena 3D, el fondo, la sombra, el metal,
// la orientación, los bitmaps, aplicar un reel) queda bloqueado: el render no lee el proyecto vivo sino copias congeladas, pero
// la escena 3D es una sola. (Si el asistente cambia la escena mientras tanto, se arma al terminar.)
// (los keyframes, los textos y el sonido sí se pueden seguir editando: el video usa su propia copia del proyecto)
const BLOQUEADOS = ['nuevo', 'abrir', 'archivo', 'separar', 'ejemplo', 'ejemploVista', 'restablecer', 'metal', 'acabado', 'piedra', 'sombra', 'calidad', 'fps', 'conSonido'];
function bloquearEscena(si) {
  const controles = [...BLOQUEADOS.map($), ...document.querySelectorAll('#fondos button, #formatos button, [data-girar]')];
  for (const el of controles) {
    if (!el) continue;
    if (si) { el.dataset.antes = el.disabled ? '1' : ''; el.disabled = true; }
    else if ('antes' in el.dataset) { el.disabled = el.dataset.antes === '1'; delete el.dataset.antes; }
  }
  $('abrir').closest('label')?.classList.toggle('bloqueado', si);
  $('soltar').classList.toggle('bloqueado', si);
  const tx = $('panelTexturas'); tx.inert = si; tx.classList.toggle('bloqueado', si);
  panelEscena.bloquear(si); panelUtileria.bloquear(si); panelElementos.bloquear(si); replicar?.bloquear(si);
}

let bloqueo = null, ajustesPendientes = null;
async function trabajo(fn) {
  await pararSondeo();   // (la medición del tiempo, si estaba en curso, se suelta enseguida)
  if (estado.exportando) return;
  estado.ocupado = true; estado.exportando = true; estado.cancelar = false; reproducir(false);
  for (const id of ['crear', 'foto', 'realista']) $(id).disabled = true;
  bloquearEscena(true);
  $('progreso').hidden = false; $('barra').style.width = '0'; $('cancelar').disabled = false;
  $('progTexto').textContent = 'Preparando…'; $('progTiempo').textContent = '';
  try { bloqueo = await navigator.wakeLock?.request('screen'); } catch (e) { bloqueo = null; }
  const salida = document.createElement('canvas'), comp = new Compositor(salida);
  // fondo, sombra, formato y nombre congelados: tocar la pestaña mientras se espera no cambia los cuadros que faltan
  const escena = { ...escenaActual(), nombre: nombreDelProyecto() }, f = FORMATOS[escena.formato];
  comp.tamano(f.w, f.h); estudio.tamano(f.w, f.h);
  try { await fn(comp, salida, f, escena); }
  catch (e) {
    if (e.name === 'AbortError') { aviso('Se canceló.'); nota(NOTA_BASE); }
    else { console.error(e); aviso(e.message || 'Algo salió mal al crear el video.', true); nota('Hubo un error al crear el video.', 'error'); }
  } finally {
    try { await bloqueo?.release(); } catch (e) { /* nada */ }
    estado.exportando = false; bloquearEscena(false);
    // la escena que pidió el asistente mientras tanto
    if (!mismaEscena(estudio.escena3D, estado.escena)) estudio.ponerEscena(estado.escena);
    ajustarPrevia(); estado.ocupado = false; estado.sucio = true;
    $('progreso').hidden = true;
    for (const id of ['crear', 'foto', 'realista']) $(id).disabled = !estudio.tieneModelo;
    // ajustes que llegaron mientras tanto (deshacer o rehacer un «Abrir proyecto»): se aplican ahora
    if (ajustesPendientes) { const aj = ajustesPendientes; ajustesPendientes = null; aplicarAjustes(aj); todoCambio(); }
  }
}
const progreso = (p, texto, resta) => {
  if (estado.cancelar) return;   // ya dice «Cancelando…»
  $('barra').style.width = `${(p * 100).toFixed(1)}%`; $('progTexto').textContent = texto; $('progTiempo').textContent = resta != null ? `faltan ~${reloj(resta)}` : '';
};
// la tarjeta de video termina lo que tenga entre manos (puede tardar unos segundos): se avisa de inmediato
$('cancelar').addEventListener('click', () => { estado.cancelar = true; $('cancelar').disabled = true; $('progTexto').textContent = 'Cancelando…'; $('progTiempo').textContent = ''; });
const abortar = () => { if (estado.cancelar) throw new DOMException('Cancelado', 'AbortError'); };

// la canción subida no se guarda con el proyecto: si falta, se avisa antes de crear el video (no sale con otra música)
$('crear').addEventListener('click', () => {
  if (estado.exportando) return;
  if (cancionPerdida() && $('conSonido').checked && !confirm(`Tu canción «${proyecto.audio.musica.archivo.nombre || 'mi canción'}» no está cargada en este equipo: el video saldría sin música.\n¿Crearlo así? (Cancelar para volver a subirla en la pestaña Sonido)`)) { abrirPestana('sonido', { desplazar: true }); return; }
  crearVideo();
});
const crearVideo = () => trabajo(async (comp, salida, f, escena) => {
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
  // los cuadros caen en i · D / (n − 1) (o i · D / n en bucle): ese es su ritmo para las transiciones de los cortes
  const ritmo = pr.bucle ? n / D : (n - 1) / D;
  nota('Creando el video… deja esta pestaña abierta.', 'trabajando');
  const inicio = performance.now();
  try {
    for (let i = 0; i < n; i++) {
      abortar();
      // en bucle el último cuadro no repite el primero (el reel empalma sin salto)
      const t = (pr.bucle ? i / n : i / (n - 1)) * D;
      if (muestras > 0) {
        poner(pr, t);
        const sombra = estudio.sombra();
        await componerRealista(comp, pr, muestras, { sombra, t, img, masc, escena, fps: ritmo, cancelado: () => estado.cancelar, alAvanzar: p => { const hechos = i + p, seg = (performance.now() - inicio) / 1000; progreso(hechos / n, `Cuadro ${i + 1} de ${n} · ${Math.round(p * 100)} %`, hechos > 0.3 ? seg / hechos * (n - hechos) : null); } });
      } else {
        dibujarRapido(comp, pr, t, { escena, fps: ritmo });
        if (i % 6 === 0) { const seg = (performance.now() - inicio) / 1000; progreso((i + 1) / n, `Cuadro ${i + 1} de ${n}`, i > 5 ? seg / (i + 1) * (n - i - 1) : null); await new Promise(r => setTimeout(r)); }
      }
      // muestra en la vista previa (y en la línea de tiempo) el cuadro que se acaba de terminar
      if (muestras > 0 || i % 6 === 0) { previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height); previaPintada(t); linea.ponerCabezal(Math.min(t, proyecto.duracion)); }
      await cod.agregar(salida);
    }
    progreso(1, 'Guardando el archivo…');
    const blob = await cod.terminar();
    mostrarVideo(blob, `${slug(escena.nombre)}-${escena.formato}.${cod.extension}`);
    const seg = (performance.now() - inicio) / 1000;
    if (cod.extension === 'webm') aviso(`Este navegador solo pudo crear WebM (sirve para la web y el catálogo)${sinSonido ? ' y sin sonido' : ''}. Para Instagram crea el video en Chrome, Edge o Safari.`, true);
    else if (sinSonido) aviso('Video listo, pero este navegador no pudo agregarle el sonido.', true);
    else aviso(`Video listo en ${reloj(seg)}.`);
    nota(`Video listo (${(blob.size / 1048576).toFixed(1)} MB${cod.conSonido ? ', con sonido' : ''}).`);
  } catch (e) { cod.cancelar(); throw e; }
});

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

$('foto').addEventListener('click', () => trabajo(async (comp, salida, f, escena) => {
  await cargarFuentes();
  const muestras = window.MUESTRAS_FOTO || Math.max(+$('calidad').value, 64) * 2, t = estado.t, pr = copiaProyecto();   // (MUESTRAS_FOTO: para probar rápido desde la consola)
  nota('Calculando la foto hiperrealista…', 'trabajando');
  poner(pr, t);
  const sombra = estudio.sombra(), inicio = performance.now();
  await componerRealista(comp, pr, muestras, { sombra, t, escena, fps: null, img: document.createElement('canvas'), masc: document.createElement('canvas'), cancelado: () => estado.cancelar, alAvanzar: p => { const seg = (performance.now() - inicio) / 1000; progreso(p, `Foto · ${Math.round(p * 100)} %`, p > 0.05 ? seg / p * (1 - p) : null); } });
  previa.ctx.drawImage(salida, 0, 0, previa.lienzo.width, previa.lienzo.height); previaPintada(t);
  const blob = await new Promise(r => salida.toBlob(r, 'image/png'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(escena.nombre)}-${escena.formato}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  aviso('Foto descargada.'); nota('Foto lista.');
}));

// ---------- Guardar y abrir proyectos ----------
function guardarProyecto() {
  const blob = new Blob([archivoProyecto({ stl: 'todo' })], { type: 'application/json' });
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
  if (estado.exportando) { aviso('Espera a que termine el video para abrir otro proyecto.'); return; }
  try {
    const { p, aj } = leerProyecto(await archivo.text());
    // Deshacer devuelve también el formato, el fondo y el metal de antes (los cambia el archivo): la foto lleva los ajustes
    cerrarRafaga(); linea.guardarHistorial(archivoProyecto());
    const faltan = aplicarAjustes(aj);
    reemplazarProyecto(p);
    estado.t = 0; buscar(0);
    avisoAbierto('Proyecto abierto.', faltan);
  } catch (e) {
    // los errores propios ya vienen en español (el archivo no es un proyecto: no es un fallo de la app, no va a la consola);
    // uno inesperado del navegador (en inglés) se anota en la consola y se cambia por un mensaje claro
    const propio = e?.constructor === Error && !!e.message;
    if (!propio) console.warn(e);
    aviso(propio ? e.message : 'No se pudo abrir el proyecto: el archivo está dañado o es de otra versión.', true);
  }
}
$('guardar').addEventListener('click', guardarProyecto);
$('abrir').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirProyecto(f); });
$('nuevo').addEventListener('click', () => {
  if (estado.exportando) return;
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
window.atelier = { get proyecto() { return proyecto; }, estado, linea, panelTextos, panelSonido, panelTexturas, panelEscena, panelUtileria, panelElementos, get replicar() { return panelReplicar(); }, chat, rep, ponerEscena, archivoProyecto };
