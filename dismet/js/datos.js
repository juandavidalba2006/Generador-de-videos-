/* Líneas, subdivisiones y referencias tal como aparecen en el catálogo DISMET (páginas 5 a 50). */
window.DISMET = {
  whatsapp: "573016349734",
  lineas: [
    {id:"escritorios", pagina:"escritorios-y-mesas.html", n:".01", nombre:"Escritorios y mesas", foto:"p05_0",
     texto:"Puestos de trabajo para oficinas, gerencias, salas de reuniones y aulas: escritorios lineales, credenza y en L, islas de trabajo, divisiones de oficina y mesas para juntas, docentes y estudiantes.",
     grupos:[
      ["Escritorio lineal","DEL",[1,2,3,4,5,6]],
      ["Escritorio credenza","DEC",[1,2]],
      ["Escritorios ejecutivos en L","DEE",[1,2,3,4,5,6]],
      ["Islas de trabajo","DIT",[1,2,3,4]],
      ["Divisiones de oficina","DDO",[1,2,3]],
      ["Mesas de juntas","DMJ",[1,2,3,4]],
      ["Mesas para docentes","DMD",[1,2,3,4]],
      ["Mesas escolares","DME",[1,2,3,4]]]},
    {id:"especiales", pagina:"muebles-especiales.html", n:".02", nombre:"Muebles especiales", foto:"p16_0",
     texto:"Muebles hechos para un espacio concreto: modulares, recepciones, escritorios para consultorio y las bases, pantallas y canaletas para armar o completar puestos de trabajo.",
     grupos:[
      ["Modulares","DM",[1,2,3]],
      ["Accesorios y partes · bases, pantallas, canaletas","DAP",[1,2,3]],
      ["Recepciones","DR",[1,2,3,4]],
      ["Escritorios para consultorio","DC",[1,2,3,4]]]},
    {id:"almacenamiento", pagina:"almacenamiento.html", n:".03", nombre:"Almacenamiento", foto:"p21_0",
     texto:"Soluciones para guardar y archivar en oficinas, colegios, droguerías y bodegas: lockers, archivadores, cajoneras, folderamas, muebles de farmacia, archivo rodante y estanterías.",
     grupos:[
      ["Lockers","DL",[1,2,3,4,5,6,7,8,9]],
      ["Archivadores","DA",[1,2,3]],
      ["Cajoneras","DAC",[1,2,3]],
      ["Folderama","DF",[1,2,3]],
      ["Farmacia","DFAR",[1,2,3]],
      ["Archivo rodante","DAR",[1,2]],
      ["Escalerillas y estantes","DE",[1,2,3]],
      ["Estantería pesada","DEP",[4,5,6]]]},
    {id:"otros", pagina:"otros-muebles.html", n:".04", nombre:"Otros muebles", foto:"p32_0",
     texto:"Complementos para oficinas, colegios y zonas comunes: biombos y cabinas insonorizadas, puntos ecológicos, tableros, elementos deportivos, accesorios de escritorio, bibliotecas y camarotes.",
     grupos:[
      ["Biombos y cabinas insonorizadas","DBC",[1,2]],
      ["Puntos ecológicos","DPE",[1,2]],
      ["Tableros","DT",[1,2]],
      ["Deportivos","DD",[1,2]],
      ["Porta CPU, reposapiés y ruedas para silla","DP",[1,2,3,4]],
      ["Biblioteca de oficina","DBO",[1,2,3]],
      ["Camarotes","DCM",[1,2]]]},
    {id:"sillas", pagina:"sillas.html", n:".05", nombre:"Sillas", foto:"p40_0",
     texto:"Sillas para cada uso: ejecutivas, gerenciales, sin brazos, fijas e interlocutoras, universitarias, butacos, de diseño, para sala de espera y para teatro.",
     grupos:[
      ["Sillas ejecutivas","DSE",[1,2,3]],
      ["Sillas gerenciales","DSG",[1,2,3]],
      ["Sillas sin brazos","DS",[1,2,3]],
      ["Sillas fijas e interlocutoras","DSF",[1,2,3,4,5,6]],
      ["Sillas universitarias","DSU",[1,2,3,4,5,6]],
      ["Butacos","DB",[1,2,3]],
      ["Sillas de diseño","DSD",[1,2,3]],
      ["Sillas para sala de espera","DSSE",[1,2,3]],
      ["Sillas para teatro","DST",[1,2,3]]]}
  ],
  proyectos: ["p51_0","p51_1","p51_2","p52_0","p52_1","p52_2","p52_3","p53_0","p53_1","p53_2","p53_3","p54_0","p54_1","p54_2","p54_3"]
};

/* Lista plana de productos con su línea y subdivisión. */
window.DISMET.productos = [];
window.DISMET.lineas.forEach(function(l){
  l.total = 0;
  l.grupos.forEach(function(g){
    g[2].forEach(function(num){
      var nn = (num < 10 ? "0" : "") + num;
      window.DISMET.productos.push({codigo:g[1]+" "+nn, archivo:"img/productos/"+(g[1]+nn).toLowerCase()+".webp", grupo:g[0], linea:l});
      l.total++;
    });
  });
});
