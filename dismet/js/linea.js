/* Página de una línea de productos: portada, subdivisiones, buscador, referencias y otras líneas. */
(function(){
  "use strict";
  var D = window.DISMET, el = D.el, $ = D.$;
  var linea = D.lineas.filter(function(l){ return l.id === document.body.getAttribute("data-linea"); })[0];
  var productos = D.productos.filter(function(p){ return p.linea === linea; });

  $("linea-n").textContent = linea.n;
  $("linea-nombre").textContent = linea.nombre;
  $("migas-nombre").textContent = linea.nombre;
  $("linea-texto").textContent = linea.texto;
  $("linea-foto").src = "img/fotos/" + linea.foto + ".webp";
  $("linea-ref").textContent = linea.total;
  $("linea-tipos").textContent = linea.grupos.length;

  function quitarTildes(s){ return s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase(); }

  /* Subdivisiones como filtros */
  var activo = "todas";
  [{id:"todas", nombre:"Todas"}].concat(linea.grupos.map(function(g){ return {id:g[0], nombre:g[0].split(" · ")[0]}; })).forEach(function(o){
    var c = el("button",{type:"button","class":"chip","aria-pressed":"false","data-grupo":o.id, text:o.nombre});
    c.addEventListener("click", function(){ activo = o.id; pintar(); });
    $("chips").appendChild(c);
  });
  $("buscar").addEventListener("input", pintar);

  var visibles = [];
  function pintar(){
    Array.prototype.forEach.call($("chips").children, function(c){ c.setAttribute("aria-pressed", String(c.getAttribute("data-grupo") === activo)); });
    var q = quitarTildes($("buscar").value.trim()).replace(/\s+/g," ");
    var qSinEsp = q.replace(/\s/g,"");
    visibles = productos.filter(function(p){
      if (activo !== "todas" && p.grupo !== activo) return false;
      if (!q) return true;
      var texto = quitarTildes(p.grupo);
      return p.codigo.toLowerCase().replace(/\s/g,"").indexOf(qSinEsp) > -1 ||
        q.split(" ").every(function(w){ return texto.indexOf(w) > -1; });
    });
    var cont = $("productos"); cont.textContent = "";
    if (!visibles.length){
      cont.appendChild(el("p",{"class":"vacio",text:"No hay productos de " + linea.nombre.toLowerCase() + " que coincidan con «" + $("buscar").value + "». Prueba con otra palabra o un código."}));
    }
    var grupoActual = null, rejilla;
    visibles.forEach(function(p, i){
      if (p.grupo !== grupoActual){
        grupoActual = p.grupo;
        var cuenta = visibles.filter(function(x){ return x.grupo === p.grupo; }).length;
        var g = el("div",{"class":"grupo"},[
          el("div",{"class":"franja"},[el("h2",{"class":"franja-titulo",text:p.grupo}), el("span",{text:cuenta + (cuenta === 1 ? " referencia" : " referencias")})])
        ]);
        var cols = (cuenta % 4 === 0 || cuenta <= 2) ? 4 : (cuenta % 3 === 0 ? 3 : 4);
        rejilla = el("div",{"class":"rejilla",style:"--cols:" + cols});
        if (cuenta % 2 === 1 && cuenta % 3 === 0) rejilla.setAttribute("data-tres","");
        g.appendChild(rejilla); cont.appendChild(g);
      }
      var foto = el("button",{type:"button","class":"producto-foto","aria-label":"Ver " + p.grupo + " " + p.codigo},[
        el("img",{src:p.archivo, alt:p.grupo + ", referencia " + p.codigo, loading:"lazy"})
      ]);
      foto.addEventListener("click", function(){ D.abrirVisor(i, visibles); });
      var boton = el("button",{type:"button","class":"agregar","data-codigo":p.codigo});
      D.marcarBoton(boton, p.codigo);
      boton.addEventListener("click", function(){ D.alternar(p.codigo); });
      rejilla.appendChild(el("article",{"class":"producto"},[foto, el("div",{"class":"producto-pie"},[el("span",{"class":"codigo",text:p.codigo}), boton])]));
    });
    $("resultado").textContent = visibles.length + (visibles.length === 1 ? " referencia" : " referencias") + (activo === "todas" ? " en " + linea.nombre.toLowerCase() : " · " + activo.split(" · ")[0]);
  }

  /* Otras líneas */
  D.lineas.filter(function(l){ return l !== linea; }).forEach(function(l){
    $("otras").appendChild(el("a",{href:l.pagina,"class":"otra"},[
      el("img",{src:"img/fotos/" + l.foto + ".webp", alt:"", loading:"lazy"}),
      el("div",{},[el("span",{text:l.n}), el("h3",{text:l.nombre}), el("small",{text:l.total + " referencias"})])
    ]));
  });

  pintar();
  D.iniciar();
})();
