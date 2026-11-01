/* Código compartido por todas las páginas: menú, cotización por WhatsApp, visor de fotos y botones de copiar. */
(function(){
  "use strict";
  var D = window.DISMET;
  var $ = function(id){ return document.getElementById(id); };
  function el(tag, attrs, hijos){
    var e = document.createElement(tag);
    for (var k in attrs){ if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (hijos || []).forEach(function(h){ e.appendChild(h); });
    return e;
  }
  D.el = el;
  D.$ = $;

  /* Submenú de productos */
  var sub = $("submenu");
  if (sub){
    var actual = document.body.getAttribute("data-linea");
    D.lineas.forEach(function(l){
      var a = el("a",{href:l.pagina},[el("b",{text:l.n}), el("span",{text:l.nombre})]);
      if (l.id === actual) a.setAttribute("aria-current","page");
      sub.appendChild(a);
    });
    var det = sub.parentNode;
    document.addEventListener("click", function(e){ if (det.open && !det.contains(e.target)) det.open = false; });
  }

  /* Menú en celular */
  $("menu-boton").addEventListener("click", function(){
    var abierto = $("menu").classList.toggle("abierto");
    this.setAttribute("aria-expanded", String(abierto));
  });
  $("menu").addEventListener("click", function(e){
    if (e.target.closest("a")){ $("menu").classList.remove("abierto"); $("menu-boton").setAttribute("aria-expanded","false"); }
  });
  function medirEncabezado(){ document.documentElement.style.setProperty("--alto-encabezado", document.querySelector(".encabezado").offsetHeight + "px"); }
  window.addEventListener("resize", medirEncabezado); medirEncabezado();

  /* Copiar */
  function copiar(texto, boton){
    var original = boton.textContent;
    function listo(){ boton.textContent = "Copiado"; setTimeout(function(){ boton.textContent = original; }, 1600); }
    try { navigator.clipboard.writeText(texto).then(listo, function(){ boton.textContent = "No se pudo copiar"; }); }
    catch(e){ boton.textContent = "No se pudo copiar"; }
  }
  document.querySelectorAll("[data-copiar]").forEach(function(b){ b.addEventListener("click", function(){ copiar(b.getAttribute("data-copiar"), b); }); });

  /* Cotización: se guarda en este navegador para que siga al cambiar de página. */
  var cotizacion = {};
  try { cotizacion = JSON.parse(localStorage.getItem("dismet-cotizacion") || "{}") || {}; } catch(e){ cotizacion = {}; }
  function guardar(){ try { localStorage.setItem("dismet-cotizacion", JSON.stringify(cotizacion)); } catch(e){} }
  function buscar(codigo){ return D.productos.filter(function(x){ return x.codigo === codigo; })[0]; }

  D.estaEnCotizacion = function(c){ return !!cotizacion[c]; };
  D.marcarBoton = function(b, codigo){
    var esta = !!cotizacion[codigo];
    b.setAttribute("aria-pressed", String(esta));
    b.textContent = esta ? "✓ Agregado" : "+ Cotizar";
  };
  D.alternar = function(codigo){
    if (cotizacion[codigo]) delete cotizacion[codigo]; else cotizacion[codigo] = 1;
    guardar(); actualizar();
  };
  function textoCotizacion(){
    var nombre = $("nombre").value.trim();
    var lineas = Object.keys(cotizacion).map(function(c){
      var p = buscar(c);
      return "• " + c + " (" + (p ? p.grupo : "") + ") x " + cotizacion[c];
    });
    return "Hola DISMET, quiero cotizar" + (nombre ? " para " + nombre : "") + ":\n" + lineas.join("\n");
  }
  function enlace(){
    var vacio = !Object.keys(cotizacion).length;
    $("enviar").href = vacio ? "#" : "https://wa.me/" + D.whatsapp + "?text=" + encodeURIComponent(textoCotizacion());
    $("enviar").setAttribute("aria-disabled", String(vacio));
    $("enviar").style.opacity = vacio ? ".5" : "1";
  }
  function actualizar(){
    var codigos = Object.keys(cotizacion);
    $("contador").textContent = codigos.length;
    if (document.body.getAttribute("data-pagina") === "inicio") $("abrir-cotizacion").hidden = !codigos.length;
    document.querySelectorAll(".agregar[data-codigo]").forEach(function(b){ D.marcarBoton(b, b.getAttribute("data-codigo")); });
    var lista = $("panel-lista"); lista.textContent = "";
    if (!codigos.length){
      lista.appendChild(el("p",{"class":"vacio",text:"Aún no has agregado productos. Entra a una línea de productos y usa «+ Cotizar» en la referencia que te interese."}));
    }
    codigos.forEach(function(c){
      var p = buscar(c); if (!p) return;
      var input = el("input",{type:"number",min:"1",value:String(cotizacion[c]),id:"cant-"+c.replace(" ","-"),"aria-label":"Cantidad de "+c});
      input.addEventListener("change", function(){ var v = Math.max(1, parseInt(input.value,10) || 1); input.value = v; cotizacion[c] = v; guardar(); enlace(); });
      var quitar = el("button",{type:"button","class":"quitar",text:"Quitar"});
      quitar.addEventListener("click", function(){ D.alternar(c); });
      lista.appendChild(el("div",{"class":"item"},[
        el("img",{src:p.archivo, alt:""}),
        el("div",{},[el("span",{"class":"codigo",text:c}), el("small",{text:p.grupo + " · " + p.linea.nombre}), quitar]),
        el("div",{"class":"cantidad"},[input])
      ]));
    });
    if (visorIndice > -1) marcarVisor();
    enlace();
  }
  D.actualizar = actualizar;
  $("enviar").addEventListener("click", function(e){ if (!Object.keys(cotizacion).length) e.preventDefault(); });
  $("nombre").addEventListener("input", enlace);
  $("abrir-cotizacion").addEventListener("click", function(){ $("panel").hidden = false; $("cerrar-panel").focus(); });
  $("cerrar-panel").addEventListener("click", function(){ $("panel").hidden = true; });
  $("panel").addEventListener("click", function(e){ if (e.target === $("panel")) $("panel").hidden = true; });
  $("copiar-lista").addEventListener("click", function(){ copiar(textoCotizacion(), this); });

  /* Visor de fotos (productos y proyectos) */
  var visorIndice = -1, visorLista = [];
  D.abrirVisor = function(i, lista){ visorLista = lista; visorIndice = i; mostrar(); $("visor").hidden = false; $("cerrar-visor").focus(); };
  function mostrar(){
    var p = visorLista[visorIndice];
    $("visor-img").src = p.archivo; $("visor-img").alt = p.alt || (p.grupo + ", referencia " + p.codigo);
    $("visor-titulo").textContent = p.codigo || "Proyecto realizado";
    $("visor-sub").textContent = p.grupo ? p.grupo + " · " + p.linea.nombre : (visorIndice + 1) + " de " + visorLista.length;
    $("visor-agregar").hidden = !p.codigo;
    marcarVisor();
  }
  function marcarVisor(){
    var p = visorLista[visorIndice]; if (!p || !p.codigo) return;
    var esta = !!cotizacion[p.codigo];
    $("visor-agregar").setAttribute("aria-pressed", String(esta));
    $("visor-agregar").textContent = esta ? "✓ En la cotización" : "Agregar a cotización";
  }
  function mover(d){ visorIndice = (visorIndice + d + visorLista.length) % visorLista.length; mostrar(); }
  function cerrarVisor(){ $("visor").hidden = true; visorIndice = -1; }
  $("anterior").addEventListener("click", function(){ mover(-1); });
  $("siguiente").addEventListener("click", function(){ mover(1); });
  $("visor-agregar").addEventListener("click", function(){ D.alternar(visorLista[visorIndice].codigo); });
  $("cerrar-visor").addEventListener("click", cerrarVisor);
  $("visor").addEventListener("click", function(e){ if (e.target === $("visor")) cerrarVisor(); });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ cerrarVisor(); $("panel").hidden = true; }
    if (!$("visor").hidden && e.key === "ArrowRight") mover(1);
    if (!$("visor").hidden && e.key === "ArrowLeft") mover(-1);
  });

  D.iniciar = function(){ actualizar(); };
})();
