// Piezas comunes de las funciones de Vercel (api/reel.js, api/analizar.js): quién las puede usar, topes de pedidos por IP,
// leer el cuerpo con un tamaño máximo y responder en JSON. Vive fuera de api/ para que Vercel no la publique como una ruta.
// Las reglas son las mismas de api/chat.js (que todavía tiene su propia copia).

// Un error del pedido con su código HTTP (y datos extra para la respuesta, p. ej. { sinVideo: true })
export class ErrorPedido extends Error {
  constructor(estado, mensaje, extra = {}) { super(mensaje); this.name = 'ErrorPedido'; this.estado = estado; this.extra = extra; }
}

// ---------- Quién la puede usar ----------
// Un navegador en OTRO sitio siempre manda su Origin: esos pedidos se rechazan (así ninguna página ajena gasta la clave de
// la IA ni el ancho de banda con las visitas de sus usuarios). Sin Origin ni Referer no es un navegador (curl, un script):
// lo frena el tope por IP. Otros dominios propios se agregan en ORIGENES_PERMITIDOS (separados por comas).
export const soloHost = x => String(x || '').split(',')[0].trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
export function origenPermitido(headers = {}) {
  const origen = headers.origin || headers.referer;
  if (!origen) return true;
  let host;
  try { host = new URL(origen).host.toLowerCase(); } catch { return false; }
  const propios = [headers['x-forwarded-host'], headers.host, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, ...String(process.env.ORIGENES_PERMITIDOS || '').split(',')].map(soloHost).filter(Boolean);
  return propios.includes(host);
}

// ---------- Topes por IP ----------
// El tope vive en la memoria de cada instancia (Vercel puede tener varias): no es exacto, pero corta a quien mande pedidos
// en bucle sin necesitar una base de datos. Devuelve una función (ip, ahora) → 0 si puede seguir, o los segundos que debe esperar.
export function crearTope({ minuto = 8, hora = 60 } = {}) {
  const pedidosPorIP = new Map();   // ip → instantes (ms) de sus pedidos de la última hora
  const espera = (ip, ahora = Date.now()) => {
    const lista = (pedidosPorIP.get(ip) || []).filter(t => ahora - t < 3_600_000), enMinuto = lista.filter(t => ahora - t < 60_000);
    if (enMinuto.length >= minuto) { pedidosPorIP.set(ip, lista); return Math.max(1, Math.ceil(((enMinuto[0] ?? ahora) + 60_000 - ahora) / 1000)); }
    if (lista.length >= hora) { pedidosPorIP.set(ip, lista); return Math.max(1, Math.ceil(((lista[0] ?? ahora) + 3_600_000 - ahora) / 1000)); }
    lista.push(ahora); pedidosPorIP.set(ip, lista);
    // limpieza ocasional para que el mapa no crezca sin fin con IPs que ya no vuelven
    if (pedidosPorIP.size > 5000) for (const [k, v] of pedidosPorIP) if (!v.length || ahora - v[v.length - 1] > 3_600_000) pedidosPorIP.delete(k);
    return 0;
  };
  espera.minuto = minuto; espera.hora = hora;
  espera.limpiar = () => pedidosPorIP.clear();   // para las pruebas
  return espera;
}
// «12 s» o «3 min», para los mensajes de espera
export const textoEspera = s => (s < 90 ? `${s} s` : `${Math.ceil(s / 60)} min`);

// La IP del que pide (Vercel la pone en x-forwarded-for; la primera es la del cliente)
export const ipDe = req => soloHost(req?.headers?.['x-forwarded-for']) || String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'desconocida');

// ---------- Cuerpo y respuesta ----------
// Vercel ya entrega req.body leído (objeto, texto o Buffer); en Node puro hay que leer el flujo. Con tope de bytes en los tres casos.
export async function leerCuerpo(req, maxBytes, { mensaje = 'El pedido es demasiado grande.' } = {}) {
  const largo = Number(req.headers?.['content-length']);
  if (largo > maxBytes) throw new ErrorPedido(413, mensaje);
  let crudo = req.body;
  if (crudo === undefined) {
    const partes = []; let total = 0;
    for await (const parte of req) {
      total += parte.length;
      if (total > maxBytes) throw new ErrorPedido(413, mensaje);
      partes.push(parte);
    }
    crudo = Buffer.concat(partes).toString('utf8');
  }
  if (Buffer.isBuffer(crudo)) crudo = crudo.toString('utf8');
  if (typeof crudo === 'string') {
    if (Buffer.byteLength(crudo) > maxBytes) throw new ErrorPedido(413, mensaje);
    try { return JSON.parse(crudo); } catch { throw new ErrorPedido(400, 'El pedido no es JSON válido.'); }
  }
  if (crudo && typeof crudo === 'object') {
    let largoJSON = Infinity;
    try { largoJSON = Buffer.byteLength(JSON.stringify(crudo)); } catch { throw new ErrorPedido(400, 'El pedido no es válido.'); }
    if (largoJSON > maxBytes) throw new ErrorPedido(413, mensaje);
  }
  return crudo;
}

export function enviar(res, estado, datos, encabezados = {}) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(encabezados)) res.setHeader(k, v);
  res.end(JSON.stringify(datos));
}

// Los parámetros de la URL (Vercel también los da en req.query; así sirve igual en Node puro)
export function parametros(req) {
  try { return new URL(req.url || '/', 'http://local').searchParams; } catch { return new URLSearchParams(); }
}
