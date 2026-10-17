// Chat del asistente: la joyera escribe cómo quiere que se mueva la joya («gira 2 vueltas y termina en la piedra») y el
// asistente lo convierte en keyframes, cortes, escena, textos, sonidos y música. Con IA (api/chat.js en Vercel) o, si no hay IA
// (sitio local, sin clave o sin conexión), con el intérprete por reglas de interprete.js.
import { escarabajo } from './marca.js';
import { interpretar, normalizarAcciones, resumenAcciones, resumenProyecto, hayCambios, fotoProyecto } from './interprete.js';

// main.js puede importar la función pura desde aquí o desde interprete.js. Los cortes entran al proyecto; la escena va por la
// opción alEscena(cfg) de aplicarAccionesAProyecto (con escenaActual), porque vive en el estudio y no en el proyecto.
export { aplicarAccionesAProyecto, escenaDesdeAccion } from './interprete.js';

export const SUGERENCIAS = [
  'Gira 2 vueltas y termina enfocando la piedra',
  'Empieza con un zoom rápido al diamante y aléjate despacio',
  'Hazlo estilo viral con whoosh y brillo',
  'Vista desde arriba que baja hasta quedar de frente',
  'Pon la joya en un pedestal de mármol',
  'Haz 3 cortes con flash',
];
const MAX_HISTORIAL = 12;        // mensajes que se mandan a la IA
const MAX_GUARDADOS = 40;        // burbujas que se recuerdan en la sesión
const CLAVE = 'atelier-chat-v2';
const ESPERA_ESTADO = 5000, ESPERA_RESPUESTA = 75000;   // ms

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONOS = {
  enviar: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  nueva: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
  aviso: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
};
const icono = n => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[n]}</svg>`;
const ESTADOS = {
  comprobando: { texto: 'Conectando…', ayuda: 'Revisando si el asistente con IA está disponible.' },
  ia: { texto: 'Asistente con IA', ayuda: 'Entiende pedidos libres y piensa el video completo: gancho, revelación de la piedra y final.' },
  basico: { texto: 'Modo básico (sin IA)', ayuda: 'Entiende frases sencillas de cámara, cortes, escena, textos, sonidos y música. La IA funciona cuando el sitio está publicado en Vercel con la clave ANTHROPIC_API_KEY.' },
};

// Lee la respuesta como JSON sin lanzar (un servidor estático devuelve HTML en los errores)
const jsonSeguro = async res => { try { return await res.json(); } catch { return null; } };

// fetch con tiempo límite
async function pedir(url, opciones = {}, ms = ESPERA_RESPUESTA) {
  const corte = new AbortController(), t = setTimeout(() => corte.abort(), ms);
  try { return await fetch(url, { ...opciones, signal: corte.signal }); } finally { clearTimeout(t); }
}

export class Chat {
  // obtenerInfo() → { cargado, nombre, medidas: [x, y, z] mm, tienePiedras, metal, piedra, formato, escena } (escena: la configuración
  // de la escena de ahora; con ella el asistente sabe sobre qué cambia la luz o el pedestal)
  // aplicarAcciones(acciones) la pone main.js: mezcla en el proyecto, guarda para deshacer y vuelve a dibujar (puede ser async)
  constructor(contenedor, { obtenerProyecto, obtenerInfo, aplicarAcciones, url } = {}) {
    this.cont = contenedor;
    Object.assign(this, { obtenerProyecto, obtenerInfo, aplicarAcciones });
    this.url = url || (typeof document !== 'undefined' ? new URL('api/chat', document.baseURI).href : '/api/chat');
    this.estado = 'comprobando';
    this.sinRed = false;              // el último «¿hay IA?» falló por la red (no porque el sitio no tenga IA): se vuelve a preguntar
    this.ocupado = false;
    this.mensajes = this.leer();      // { rol: 'user' | 'assistant' | 'error', texto, etiquetas?, basico?, reintento?, fallido? }
    this.vistos = this.mensajes.length;   // las que ya estaban (de la sesión) no se animan al entrar
    contenedor.classList.add('cht');
    contenedor.innerHTML = `
      <div class="cht-cab">
        <div class="cht-titulo"><h3>Asistente de cámara</h3>
          <span class="cht-estado" data-estado="comprobando" role="status"><i class="cht-punto" aria-hidden="true"></i><span></span></span>
        </div>
        <button type="button" class="btn sec chico cht-nueva" data-accion="nueva" title="Empezar una conversación nueva" aria-label="Nueva conversación">${icono('nueva')}<span>Nueva</span></button>
      </div>
      <div class="cht-lista" role="log" aria-live="polite" aria-label="Conversación con el asistente"></div>
      <div class="cht-ideas" role="group" aria-label="Ideas para pedir">${SUGERENCIAS.map(s => `<button type="button" data-idea="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form class="cht-form" autocomplete="off">
        <textarea class="cht-texto" rows="1" maxlength="1500" placeholder="Describe el movimiento…" aria-label="Escribe cómo quieres el video"></textarea>
        <button type="submit" class="cht-enviar" aria-label="Enviar" title="Enviar (Enter)" disabled>${icono('enviar')}</button>
      </form>
      <p class="cht-pista">Enter envía · Shift + Enter, otra línea</p>`;
    this.$lista = contenedor.querySelector('.cht-lista');
    this.$estado = contenedor.querySelector('.cht-estado');
    this.$ideas = contenedor.querySelector('.cht-ideas');
    this.$form = contenedor.querySelector('.cht-form');
    this.$texto = contenedor.querySelector('.cht-texto');
    this.$enviar = contenedor.querySelector('.cht-enviar');

    this.$form.addEventListener('submit', e => { e.preventDefault(); this.enviar(this.$texto.value); });
    this.$texto.addEventListener('keydown', e => {
      // Enter envía; Shift+Enter, nueva línea (y no se envía a mitad de una composición con tildes del teclado)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.enviar(this.$texto.value); }
    });
    this.$texto.addEventListener('input', () => this.ajustarTexto());
    contenedor.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !contenedor.contains(b)) return;
      if (b.dataset.idea) this.enviar(b.dataset.idea);
      else if (b.dataset.accion === 'nueva') this.limpiar();
      else if (b.dataset.accion === 'reintentar') this.reintentar(+b.dataset.i);
    });
    this.pintarEstado();
    this.render();
    this.comprobar();
    // volvió la conexión: si el modo básico era por falta de red, se revisa otra vez si hay IA
    if (typeof addEventListener === 'function') addEventListener('online', () => { if (this.sinRed && !this.ocupado) this.comprobar(); });
  }

  // ---------- ¿Hay IA? ----------
  async comprobar() {
    this.ponerEstado('comprobando');
    try {
      const res = await pedir(this.url, { headers: { Accept: 'application/json' }, cache: 'no-store' }, ESPERA_ESTADO);
      const d = res.ok ? await jsonSeguro(res) : null;   // 404/501 de un servidor local, o 200 sin clave → modo básico
      this.sinRed = false;
      this.ponerEstado(d?.disponible === true ? 'ia' : 'basico');
    } catch {
      this.sinRed = true;   // sin conexión: modo básico por ahora (con el siguiente pedido o al volver la red se pregunta otra vez)
      this.ponerEstado('basico');
    }
    return this.estado;
  }

  ponerEstado(estado) { this.estado = estado; this.pintarEstado(); }
  pintarEstado() {
    const E = ESTADOS[this.estado];
    this.$estado.dataset.estado = this.estado;
    this.$estado.querySelector('span').textContent = E.texto;
    this.$estado.title = E.ayuda;
  }

  // ---------- Conversación ----------
  async enviar(texto) {
    texto = String(texto ?? '').trim().slice(0, 1500);
    if (!texto || this.ocupado) return;
    const pedido = { rol: 'user', texto };
    this.agregar(pedido);
    this.$texto.value = ''; this.ajustarTexto();
    await this.responder(texto, pedido);
  }

  // Vuelve a intentar un pedido que falló: su burbuja pasa al final de la conversación (la IA lo recibe como el último turno)
  async reintentar(i) {
    const m = this.mensajes[i];
    if (this.ocupado || !m || m.rol !== 'error' || !m.reintento) return;
    // la burbuja de la usuaria que originó el error (la última antes de él con ese texto)
    let j = i - 1;
    while (j >= 0 && !(this.mensajes[j].rol === 'user' && this.mensajes[j].texto === m.reintento)) j--;
    this.mensajes.splice(i, 1);
    const pedido = j >= 0 ? this.mensajes.splice(j, 1)[0] : { rol: 'user', texto: m.reintento };
    delete pedido.fallido;
    this.vistos = this.mensajes.length;   // solo la burbuja que vuelve al final entra animada
    this.agregar(pedido);
    await this.responder(m.reintento, pedido);
  }

  // pedido: la burbuja de la usuaria; si termina en error se marca «fallido» y no se le manda a la IA en los siguientes pedidos
  // (si no, se juntaría con el siguiente y la IA haría los dos)
  async responder(texto, pedido = null) {
    this.ocupar(true);
    let acciones = null, basico = false, aviso = false, error = '';
    const fallo = mensaje => { if (pedido) pedido.fallido = true; this.agregar({ rol: 'error', texto: mensaje, reintento: texto }); };
    try {
      if (this.estado === 'comprobando' || this.sinRed) await this.comprobar();
      // el proyecto como está al mandar el pedido: lo que ella cambie mientras la IA piensa no se pierde (ver fotoProyecto)
      const proyecto = this.obtenerProyecto?.() || {}, info = this.obtenerInfo?.() || {}, foto = fotoProyecto(proyecto);
      if (this.estado === 'ia') {
        const r = await this.preguntarIA(proyecto, info, foto.duracion);
        if (r.acciones) acciones = r.acciones;
        else {
          if (r.sinIA) this.ponerEstado('basico');
          else { error = r.error; aviso = true; }
        }
      }
      if (!acciones) {
        // modo básico: el intérprete por reglas (si la IA falló y el intérprete tampoco entiende, se muestra el error)
        const local = interpretar(texto, proyecto, info);
        if (error && !hayCambios(local)) { fallo(error); return; }
        acciones = local; basico = true;
      }
      if (hayCambios(acciones)) {
        try { await this.aplicarAcciones?.(acciones, { foto }); }
        catch (e) {
          console.error(e);
          fallo('Entendí el pedido, pero no pude aplicar los cambios al video' + (e?.message ? `: ${e.message}` : '.'));
          return;
        }
      }
      if (pedido) delete pedido.fallido;
      // si había IA y respondió el intérprete, se avisa en la burbuja (en modo básico ya lo dice la línea de estado)
      this.agregar({ rol: 'assistant', texto: acciones.respuesta || 'Listo.', etiquetas: resumenAcciones(acciones), basico: basico && aviso ? 'Modo básico · la IA no respondió' : '' });
    } finally {
      this.ocupar(false);
    }
  }

  // POST a api/chat → { acciones } o { error, sinIA }. duracion: la del proyecto al mandar el pedido (la de la foto)
  async preguntarIA(proyecto, info, duracion = proyecto.duracion) {
    // los pedidos que terminaron en error no se mandan (el que se está reintentando ya no está marcado)
    const historial = this.mensajes.filter(m => (m.rol === 'user' && !m.fallido) || m.rol === 'assistant').slice(-MAX_HISTORIAL).map(m => ({ role: m.rol, content: m.texto }));
    let res;
    try {
      res = await pedir(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mensajes: historial, contexto: resumenProyecto(proyecto, info) }),
      });
    } catch (e) {
      // se acabó el tiempo, o se cortó la conexión (pasa en el celular): es pasajero, así que se sigue con IA y se ofrece
      // reintentar. Solo un sitio sin IA (404/405/501 o sin clave, abajo) deja el chat en modo básico.
      return e?.name === 'AbortError' ? { error: 'La IA tardó demasiado en responder. Inténtalo de nuevo.' } : { error: 'Se perdió la conexión con el asistente. Revisa tu internet e inténtalo de nuevo.' };
    }
    const d = await jsonSeguro(res);
    if (res.ok && d && typeof d === 'object' && typeof d.respuesta === 'string') {
      return { acciones: { ...normalizarAcciones(d, { duracion }), respuesta: d.respuesta || 'Listo.' } };
    }
    // un sitio estático (404/405/501) o la función sin clave (503 sinIA) → no hay IA en este sitio
    if ([404, 405, 501].includes(res.status) || d?.sinIA) return { sinIA: true };
    return { error: d?.error || `El asistente con IA falló (error ${res.status}). Inténtalo de nuevo.` };
  }

  ocupar(si) {
    this.ocupado = si;
    this.cont.classList.toggle('ocupado', si);
    this.$texto.setAttribute('aria-busy', String(si));
    for (const b of this.$ideas.querySelectorAll('button')) b.disabled = si;
    this.$lista.querySelector('.cht-escribiendo')?.remove();
    if (si) {
      this.$lista.insertAdjacentHTML('beforeend', `<div class="cht-msg assistant cht-escribiendo nuevo"><span class="cht-avatar">${escarabajo('currentColor')}</span><div class="cht-burbuja" role="status" aria-label="El asistente está pensando"><i></i><i></i><i></i></div></div>`);
      this.bajar();
    }
    this.ajustarTexto();
  }

  agregar(m) {
    this.mensajes.push(m);
    if (this.mensajes.length > MAX_GUARDADOS) this.mensajes = this.mensajes.slice(-MAX_GUARDADOS);
    this.guardar();
    this.render();
  }

  limpiar() {
    if (this.ocupado) return;
    this.mensajes = []; this.vistos = 0; this.guardar(); this.render();
    this.$texto.focus();
  }

  // ---------- Dibujo ----------
  render() {
    const avatar = `<span class="cht-avatar">${escarabajo('currentColor')}</span>`;
    const bienvenida = `<div class="cht-msg assistant cht-bienvenida">${avatar}<div class="cht-burbuja"><p><b>Hola, soy tu asistente de cámara.</b> Cuéntame con tus palabras cómo quieres que se mueva la joya y lo convierto en keyframes. También pongo cortes, cambio la escena (pedestal, fondo y luz) y agrego textos, efectos de sonido y música. Si algo no te gusta, usa <b>Deshacer</b> en la línea de tiempo.</p></div></div>`;
    // «Reintentar» solo en el último error (los de antes ya quedaron atrás en la conversación)
    const ultimoError = this.mensajes.map(m => m.rol).lastIndexOf('error');
    const html = this.mensajes.map((m, i) => {
      const nuevo = i >= this.vistos ? ' nuevo' : '';
      if (m.rol === 'user') return `<div class="cht-msg user${nuevo}"><div class="cht-burbuja">${esc(m.texto)}</div></div>`;
      if (m.rol === 'error') return `<div class="cht-msg error${nuevo}">${avatar}<div class="cht-burbuja">${icono('aviso')}<div><p>${esc(m.texto)}</p>${m.reintento && i === ultimoError ? `<button type="button" class="cht-reintentar" data-accion="reintentar" data-i="${i}">Reintentar</button>` : ''}</div></div></div>`;
      const etiquetas = (m.etiquetas || []).map(e => `<li>${esc(e)}</li>`).join('');
      return `<div class="cht-msg assistant${nuevo}">${avatar}<div class="cht-cuerpo"><div class="cht-burbuja">${esc(m.texto)}</div>${etiquetas || m.basico ? `<div class="cht-meta">${etiquetas ? `<ul class="cht-cambios" aria-label="Cambios">${etiquetas}</ul>` : ''}${m.basico ? `<span class="cht-modo">${esc(m.basico)}</span>` : ''}</div>` : ''}</div></div>`;
    }).join('');
    const primera = !this.$lista.childElementCount;
    this.$lista.innerHTML = bienvenida + html;
    this.vistos = this.mensajes.length;
    this.cont.classList.toggle('con-mensajes', this.mensajes.some(m => m.rol === 'user'));
    if (this.ocupado) this.ocupar(true); else this.bajar(primera);
  }

  // al abrir (o con «menos movimiento») salta al final; con un mensaje nuevo, se desliza
  bajar(deGolpe = false) {
    const quieto = deGolpe || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.$lista.scrollTo({ top: this.$lista.scrollHeight, behavior: quieto ? 'auto' : 'smooth' });
  }

  // el cuadro de texto crece con lo escrito (hasta 5 líneas)
  ajustarTexto() {
    const t = this.$texto;
    t.style.height = 'auto';
    if (t.value) t.style.height = Math.min(t.scrollHeight, 132) + 'px';   // vacío: una línea (el texto de ejemplo no cuenta)
    this.$enviar.disabled = this.ocupado || !t.value.trim();
  }

  // ---------- Memoria de la sesión ----------
  leer() {
    try {
      const d = JSON.parse(sessionStorage.getItem(CLAVE) || '[]');
      return Array.isArray(d) ? d.filter(m => m && ['user', 'assistant', 'error'].includes(m.rol) && typeof m.texto === 'string').slice(-MAX_GUARDADOS) : [];
    } catch { return []; }
  }
  guardar() {
    try { sessionStorage.setItem(CLAVE, JSON.stringify(this.mensajes)); } catch { /* modo privado o almacenamiento lleno: el chat sigue sin memoria */ }
  }
}
