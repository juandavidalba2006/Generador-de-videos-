/* Página principal: tarjetas de lo que se fabrica y galería de proyectos. */
(function(){
  "use strict";
  var D = window.DISMET, el = D.el, $ = D.$;

  $("total-ref").textContent = D.productos.length;

  D.lineas.forEach(function(l){
    var subs = l.grupos.slice(0, 4).map(function(g){ return el("li",{text:g[0].split(" · ")[0]}); });
    if (l.grupos.length > 4) subs.push(el("li",{text:"y " + (l.grupos.length - 4) + " más"}));
    $("lista-lineas").appendChild(el("a",{href:l.pagina,"class":"linea"},[
      el("img",{src:"img/fotos/" + l.foto + ".webp", alt:"", loading:"lazy"}),
      el("div",{},[
        el("span",{"class":"num",text:l.n}),
        el("h3",{text:l.nombre}),
        el("small",{text:l.total + " referencias · " + l.grupos.length + " tipos"}),
        el("ul",{},subs),
        el("span",{"class":"ver",text:"Ver productos →"})
      ])
    ]));
  });

  var lista = D.proyectos.map(function(f){ return {archivo:"img/fotos/" + f + ".webp", alt:"Proyecto realizado por DISMET"}; });
  lista.forEach(function(p, i){
    var b = el("button",{type:"button","aria-label":"Ver foto de proyecto " + (i + 1)},[el("img",{src:p.archivo, alt:p.alt, loading:"lazy"})]);
    b.addEventListener("click", function(){ D.abrirVisor(i, lista); });
    $("galeria").appendChild(b);
  });

  D.iniciar();
})();
