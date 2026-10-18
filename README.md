# Generador de videos · Atelier & Co

Estudio de video en el navegador para crear videos de joyería a partir de archivos **STL**, con render
**hiperrealista** (trazado de rayos), listos para un reel de Instagram o para el catálogo. La joya se apoya en una
**escena 3D** (pedestal, fondo y luz de ventana, como en una foto de estudio) o flota sobre el fondo liso de la marca.
Usa el mismo estilo, los mismos colores y las mismas tipografías que la página de Atelier & Co.

Funciona como un editor de video (al estilo de CapCut): arriba la **vista previa** y, a su lado, el **inspector**
con pestañas (Modelo, Materiales, Escena, Textos, Sonido, Asistente, Replicar y Exportar); abajo, a todo el ancho, la
**línea de tiempo** con keyframes, cortes, textos y sonidos. Cuando bajas a la línea de tiempo, la joya se sigue viendo
en miniatura en el menú lateral (tócala para volver arriba). En el celular todo queda en una sola columna: vista previa,
pestañas (en dos filas de cuatro) y línea de tiempo.

## Cómo se usa

1. **Modelo 3D**: arrastra el STL de la joya o prueba con el anillo de ejemplo. Si las piedras vienen en
   otro STL, súbelos juntos; si vienen en el mismo archivo, la aplicación las reconoce sola.
   Con los botones *Girar* corriges la orientación si el modelo quedó acostado.
2. **Materiales**: metal (oro amarillo, rosa o blanco 18k o 14k, plata 925, platino), acabado (pulido espejo,
   pulido, satinado, arenado) y piedra (diamante, esmeralda, rubí, zafiro, perla…). Aquí también van los
   **bitmaps** de las piedras y del metal y la **iluminación HDRI** (ver más abajo).
3. **Escena**: dónde se apoya la joya (pedestal de yeso, mármol, travertino, terciopelo, arena…), el fondo y la luz
   con sombras de ventana, persiana u hojas de palmera. *Fondo liso de marca* es el degradado de siempre, con su fondo y su
   sombra (ver «Escenas» más abajo).
4. **Línea de tiempo**: escoge un *Movimiento base* y ajústalo con **keyframes** y **cortes**, o pídeselo al **Asistente**.
5. **Textos** y **Sonido**: plantillas con gancho, efectos virales y música.
6. **Replicar**: pega el enlace de un reel de Instagram que te guste (o sube el video) y el estudio copia sus
   movimientos de cámara, sus cortes y su fondo con tu joya (ver «Replicar un reel» más abajo).
7. **Exportar**: formato, calidad y cuadros por segundo. *Crear video* hace el MP4 (con sonido);
   *Foto para catálogo* descarga un PNG hiperrealista del cuadro donde está el cabezal.

Con **Ver este cuadro hiperrealista** (debajo de la vista previa) revisas cómo quedará el render final antes de
crear todo el video. La barra espaciadora reproduce o pausa, y el botón del parlante activa el sonido de la vista previa.

## Escenas (pestaña Escena)

Una escena es el lugar donde está la joya: una **superficie** (pedestal redondo, bloque, losa baja, escalones, cojín o
directo en el piso), un **fondo** (curvo sin esquinas, pared y piso, o un nicho con arco) y una **luz** que puede dibujar
sombras de **ventana**, **persiana**, **hojas de palmera**, una ventana con arco o un **foco** de luz. El estudio arranca con
*Pedestal arena*: el pedestal de yeso, el fondo taupe y la luz de ventana de las fotos de catálogo.

- Toca una tarjeta para cambiar de escena: hay 11 listas (Pedestal arena, Travertino, Mármol blanco, Mármol negro, Podio de
  escalones, Nicho con arco, Sombras de palmera, Terciopelo esmeralda, Acrílico espejo, Arena y sol, Rosa empolvado).
- **Personalizar**: cambia la forma, el material (yeso, travertino, mármol, concreto, terciopelo, lino, arena, madera,
  acrílico) y el color de la superficie y del fondo; de dónde viene la luz, qué tan alta está, qué tan suaves son las
  sombras, su intensidad y su calidez, y el relleno de la sala. La tarjeta queda marcada como *Ajustada*; *Volver a la escena
  lista* la deja como era.
- **Fondo liso de marca**: la joya flota sobre el degradado de la marca, como antes. Ahí están el **Fondo** (Perla, Oro
  suave, Rosa empolvado, Bosque, Esmeralda, Granate, Negro estudio) y la **Sombra bajo la pieza**.
- La escena gira con la cámara, como una tornamesa: el fondo siempre queda detrás de la joya y la pieza parece girar sobre el
  pedestal. La cámara no baja de la superficie (no se mete dentro del pedestal). En una escena oscura los textos del video se
  pintan claros solos.
- La escena se ve en la vista previa y, con la luz y las sombras calculadas de verdad, en el render hiperrealista
  (el *Desenfoque macro* también desenfoca el fondo, como en una foto con poca profundidad de campo). Con escena, el
  trazado de rayos tarda unas **6 veces más** por cuadro que con el fondo liso.
- La escena se guarda con el proyecto. Los proyectos de antes (sin escena) se abren con el fondo liso de marca, como se hicieron.

## Keyframes (como en CapCut)

Cada ajuste de cámara es una **pista** en la línea de tiempo: Giro, Altura de cámara, Zoom, Posición vertical,
Posición lateral, Foco en la piedra, Inclinación (roll), Exposición y Desenfoque macro.

- **Mueve el cabezal** tocando la regla o arrastrando la línea granate. La vista previa muestra ese instante.
- **Toca el rombo ◆** de un ajuste (arriba de las pistas) para poner un keyframe con el valor actual en el cabezal;
  si ya hay uno, lo quita.
- **Mueve un deslizador**: si la pista ya tiene keyframes, se crea o se actualiza uno en el cabezal (automático,
  como en CapCut). Si no tiene, el valor cambia para todo el video.
- **Arrastra un rombo** para cambiarlo de momento (se pega al cabezal y a los cuadros). Doble clic en una pista
  vacía crea un keyframe; *Supr* borra el que esté elegido.
- Al elegir un rombo puedes cambiar su **curva**: Suave, Lineal, Acelerar, Frenar, Rebote, Elástico o Corte.
- *Añadir keyframe en todas* fija toda la cámara en el cabezal. *Deshacer* / *Rehacer* (Ctrl+Z / Ctrl+Shift+Z)
  sirven para todo: keyframes, textos, sonidos, lo que hizo el asistente y abrir un proyecto.
- *Duración* estira o encoge todo (keyframes, textos y sonidos). *Bucle* hace que el final empalme con el
  principio, ideal para reels que se repiten sin salto.
- Los textos se ven como barras (arrástralas o estira sus bordes) y los sonidos como bloques que se pueden correr.

### Cortes

Un **corte** parte el video en planos: en el corte la cámara salta de un keyframe al siguiente sin pasar por el medio,
como en los reels con varias tomas.

- **✂ Corte en el cabezal** pone un corte donde está el cabezal (o haz doble clic en el carril *Cortes*). Se ve como una
  marca ✂ arriba de las pistas y una línea que atraviesa todas.
- Toca la marca para elegir la **transición**: *Corte seco*, *Flash blanco*, *Fundido a negro* o *Barrido*; *Supr* (o
  *Eliminar*) lo quita. Arrastra la marca para moverlo (los keyframes del corte se mueven con él).
- Si el corte cae en medio de un giro, la cámara sigue girando a los dos lados del corte (no se congela).
- Las transiciones se ven en la vista previa y salen en el video. Todo se puede deshacer.

## Asistente (chat)

En la pestaña **Asistente** describes con tus palabras lo que quieres y el asistente lo convierte en keyframes,
textos, efectos y música. Por ejemplo:

- «Gira 2 vueltas y termina enfocando la piedra»
- «Empieza con un zoom rápido al diamante y aléjate despacio»
- «Hazlo estilo viral con whoosh y brillo»
- «Vista desde arriba que baja hasta quedar de frente», «dura 10 segundos», «música phonk»,
  «agrega el texto 'Nueva colección' arriba», «precio $ 4.800.000»
- Cortes: «pon un corte a los 3 segundos», «corte con flash en 2,5», «haz 3 cortes», «cortes al ritmo de la música»,
  «quita los cortes»
- Escena: «pon la joya en un pedestal de mármol», «fondo con sombras de palmera», «escena oscura», «luz desde la
  derecha», «más suave la luz», «sin fondo» (vuelve al fondo liso de marca)

Todo lo que hace se puede deshacer con *Deshacer* en la línea de tiempo (también un cambio de escena).

**Con IA (recomendado)**: el asistente usa Claude a través de la función `api/chat.js`. Para activarlo en Vercel:

1. Crea una clave en [console.anthropic.com](https://console.anthropic.com) (*API Keys*).
2. En Vercel abre el proyecto → **Settings → Environment Variables**.
3. Agrega la variable `ANTHROPIC_API_KEY` con la clave (en *Production*, y en *Preview* si la usas) y guarda.
4. Vuelve a desplegar el proyecto (*Deployments → Redeploy*) para que tome la clave.

Cuando funciona, el chat dice **«Asistente con IA»**. **Sin la clave** (o abriendo la página en el computador
sin Vercel) el chat igual funciona en **«Modo básico (sin IA)»**: entiende las frases más comunes de cámara,
tiempos, textos, sonidos y música, aunque con menos libertad.

La clave es tuya y cada pedido a la IA cuesta, así que la función solo responde a la página del estudio (otro sitio
no puede usarla desde el navegador de sus visitas) y acepta hasta 8 pedidos por minuto y 60 por hora desde una misma
conexión. Si publicas el estudio también en un dominio propio, agrégalo en la variable `ORIGENES_PERMITIDOS`
(por ejemplo `https://www.tudominio.com`; varios, separados por comas). En Anthropic Console también puedes ponerle
un tope de gasto mensual a la clave.

## Replicar un reel (pestaña Replicar)

¿Viste un reel de joyería que te encantó? El estudio lo mira y arma lo mismo con tu joya:

1. Pega el **enlace del reel** (en Instagram: *Compartir → Copiar enlace*) y toca **Analizar**, o **sube el video**
   (MP4, MOV o WebM; si dura más de 60 s se usa el primer minuto).
2. El estudio lo analiza en tu navegador: lee los cuadros, busca los **cortes** (secos, con flash, fundidos a negro o
   barridos), mide el **movimiento de la cámara** en cada plano (giro, acercamiento, altura, inclinación, posición) y los
   **colores del fondo y de la superficie**. Con IA, además, Claude mira unos fotogramas y reconoce la joya, el metal, la
   piedra, la escena, el encuadre de cada plano y los textos que aparecen.
3. Revisa el resultado: la tira de planos con lo que hace la cámara en cada uno, la escena parecida y la joya. Marca qué
   quieres usar (*Movimientos y cortes*, *Escena*, *Metal y piedra*, *Textos*, *Sonidos en los cortes*, *Música parecida*,
   *Duración igual al video*) y toca **Aplicar al proyecto**. Si no te gusta, *Deshacer* lo devuelve todo (también la
   escena y los materiales).

Lo que hay que saber del enlace, para no llevarse sorpresas:

- Solo funciona con reels **públicos** y cuando Instagram deja que otra página los muestre: no sirve con reels privados, con
  carruseles de fotos ni con los que tienen música con derechos que Instagram no comparte. Tampoco funciona abriendo el
  estudio en el computador sin Vercel (dice «El enlace solo funciona en la página publicada; sube el archivo»).
- Si el enlace no funciona, **descarga el reel** (o graba la pantalla mientras se reproduce) y súbelo: el análisis es el mismo.
- El video se usa solo como referencia: se analiza en tu navegador y **no se guarda**. Los textos que copie la IA son los de
  otra marca: por eso vienen sin marcar.
- **Sin IA** (sin la clave o en el computador) igual se replican los movimientos, los cortes y los colores con el análisis de
  tu equipo; la joya y los textos se reconocen solo con IA. El análisis con IA usa la misma `ANTHROPIC_API_KEY` del chat
  (función `api/analizar.js`).

## Bitmaps y luz (pestaña Materiales)

- **Bitmaps de las piedras**: le dan realismo a la gema con inclusiones y textura. Escoge *Seda e inclusiones*,
  *Jardín de esmeralda*, *Escarcha* o *Facetas con brillo*, o sube tu propia foto (JPG, PNG o WebP).
  El modo *Color* tiñe la piedra con la imagen, *Relieve* la usa como textura de la superficie y *Ambos* combina
  los dos. Con *Intensidad* y *Escala* ajustas cuánto se nota y qué tan grande se ve.
- **Textura del metal**: martillado, cepillado, arenado o grabado floral, o tu propia imagen.
- **Iluminación (HDRI)**: sube un panorama `.hdr`, `.exr` o una foto 360° en JPG para que los reflejos del metal
  y las piedras sean los de ese lugar; ajusta su intensidad y rotación. *Volver al estudio Atelier* recupera la
  luz de estudio de joyería.

Los bitmaps se ven en la vista previa y, con más detalle, en el render hiperrealista.

## Textos

En la pestaña **Textos** están las **plantillas** de un clic (Lanzamiento, Gancho viral, Precio especial,
Hecho a mano, Detalle de la piedra, Minimal, Para regalar) y la lista de **capas**: agrega textos o la marca,
ocúltalos con el ojo, duplícalos, bórralos o cámbialos de orden. Para cada texto puedes cambiar letra, tamaño,
peso, color, posición, alineación, espaciado, cuándo entra y sale, la animación (aparecer, subir, máquina de
escribir, zoom, brillo dorado, deslizar) y el fondo (pastilla o línea dorada).
**Arrastra los textos directamente sobre la vista previa** para moverlos. Al cambiar de formato se reacomodan solos.

Consejo de retención: un gancho grande en los primeros 2 segundos («¿Te lo pondrías? 💍») y el nombre de la pieza
cuando la cámara llega a la piedra.

## Sonido

- **Efectos virales**: whoosh, subida (riser), impacto, drop 808, brillo, ding, pop, foto, clic, glitch,
  cha-ching, latido, swipe y platillo al revés. Toca uno para escucharlo y **+** para ponerlo en el cabezal.
- **Música de fondo**: lujo, lo-fi, trap, house, phonk, pop viral o cinemático, con ritmo, volumen y
  desvanecido al final. Todo se crea aquí mismo: **no tiene derechos de autor**.
- **✨ Sugerir sonidos** pone efectos donde la cámara se mueve rápido, cuando aparece la piedra y cuando entran
  los textos. **Ajustar al ritmo** pega los keyframes y los sonidos a los golpes de la música.
- **Subir mi canción**: puedes usar un MP3, WAV o M4A propio.

> **Audio en tendencia de Instagram**: para usar una canción que esté en tendencia, exporta el video **sin música**
> (deja solo los efectos o apaga *Incluir el sonido*) y agrega la canción desde la **biblioteca de música de
> Instagram** al publicar el reel. Así el algoritmo lo reconoce como audio en tendencia y lo muestra a más personas.

## Guardar y abrir proyectos

El proyecto se **guarda solo** en este navegador y se recupera al volver a abrir la página. Con
**Guardar proyecto** descargas un archivo `.atelier.json` (keyframes, cortes, textos, sonidos, escena, formato, fondo,
materiales y los bitmaps escogidos) para seguir en otro momento o en otro equipo con **Abrir**. *Nuevo* empieza de cero (se puede
deshacer). El STL, una canción subida, una imagen propia de bitmap y el HDRI no van dentro del archivo: al abrir el
proyecto (o al recuperarlo) el estudio te avisa cuáles tienes que volver a subir, y antes de crear el video te avisa si
falta tu canción.

### Calidades

| Calidad | Qué hace | Tiempo aproximado* |
|---|---|---|
| Rápida | Render en tiempo real, para revisar el movimiento y el sonido | segundos |
| Realista (48 muestras) | Trazado de rayos: luz, reflejos y refracción reales | 5–20 min |
| Hiperrealista (128 muestras) | Menos grano, piedras más limpias | 15–50 min |
| Máxima (320 muestras) | Para fotos o videos cortos muy cuidados | más de 1 h |

\* Video de 8 s en 1080×1920 con el fondo liso, con una tarjeta de video de computador de escritorio. **Con una escena 3D
cada cuadro tarda unas 6 veces más** (el pedestal, el fondo y la luz de la ventana también se calculan con luz real). En un portátil
sencillo o en el celular tarda bastante más. Deja la pestaña abierta y visible mientras trabaja
(la pantalla no se apaga mientras crea el video). Puedes cancelar en cualquier momento.

## Formato del video

- **MP4 (H.264 + sonido AAC)** a 1080×1920, 30 cuadros por segundo y ~20 Mbps: lo que recomienda Instagram.
  También: publicación 4:5, cuadrado 1:1 y catálogo 16:9.
- Funciona en **Chrome, Edge y Safari** actualizados. Si el navegador no puede crear H.264
  (por ejemplo Chromium sin códecs propietarios), crea un **WebM** (VP9 + Opus), que sirve para la web pero no para Instagram.
- Con *Bucle* activado el reel se repite sin salto. Si el celular lo permite, aparece el botón *Compartir…*.

## Privacidad

El modelo 3D, el render y el video se procesan en tu navegador: **tus diseños no se suben a ningún servidor**.
Solo el asistente con IA envía lo que escribes en el chat y un resumen del proyecto (duración, keyframes, cortes, escena,
textos, sonidos, medidas y materiales de la pieza) a la función `api/chat.js` para responder; nunca el STL.
Al replicar un reel, el video se analiza en tu navegador; con IA solo viajan unos fotogramas pequeños (hasta 16 JPEG) y
las medidas del análisis a `api/analizar.js`. Con un enlace, `api/reel.js` busca el video público del reel y lo pasa a tu
navegador por partes (no lo guarda).

## Cómo publicarla

Es una página estática más tres funciones: `api/chat.js` (asistente), `api/analizar.js` (la IA que mira un reel) y
`api/reel.js` (el enlace de Instagram). En **Vercel** se sube tal cual (la carpeta raíz es el sitio y las funciones de
`api/` se detectan solas; las dependencias salen de `package.json`). Configura `ANTHROPIC_API_KEY` como se explica arriba:
la usan el chat y el análisis de reels. Como el chat, las otras dos solo responden a la página del estudio y tienen su propio
tope por conexión: 4 análisis por minuto y 30 por hora; 6 enlaces por minuto y 40 por hora. Para probarla en el computador:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000  (el chat funciona en modo básico; Replicar, solo subiendo el video y sin IA)
```

## Cómo está hecha

- `index.html` y `estilos.css`: la interfaz del editor, con el sistema visual de la página de la joyería
  (Bodoni Moda + Instrument Sans, perla, tinta, oro y bosque; modo oscuro automático).
- `js/main.js`: une todo. El **proyecto** (`js/proyecto.js`: keyframes, curvas, movimientos, textos y audio) es
  la única fuente de verdad: la vista previa y el video final salen de él cuadro por cuadro.
- `js/linea-tiempo.js`: la línea de tiempo con keyframes, deshacer y rehacer.
- `js/estudio.js`: escena 3D con [three.js](https://threejs.org). Luz de estudio de joyería en HDR, materiales
  físicos de metal y piedras con su índice de refracción real, y el trazado de rayos con
  [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer). La luz gira con la cámara,
  así que el resultado es el de una tornamesa con la pieza girando bajo luces fijas.
- `js/escenas.js` (las escenas listas y su validación), `js/escenario3d.js` (pedestal, fondo, materiales procedurales y
  la luz con su ventana, en el motor rápido y en el trazador) y `js/panel-escena.js` (la pestaña Escena).
- `js/transiciones.js`: el flash, el fundido a negro y el barrido de los cortes.
- `js/analizador.js` (cortes, movimiento y colores de un video, en el navegador), `js/replica.js` (del análisis a un plan
  para el proyecto), `js/replicar.js` (la pestaña Replicar), `js/reel.js` y `api/reel.js` (el enlace de Instagram),
  `js/analisis-ia.js` y `api/analizar.js` (la IA que mira el reel). `lib/servidor.js`: lo común de las funciones.
- `js/texturas.js`: bitmaps de piedras y metal (proyección de UV para el STL) y HDRI.
- `js/textos.js`: capas de texto, plantillas y animaciones. `js/composicion.js`: fondo de marca, sombra de
  contacto, la joya y los textos de cada cuadro.
- `js/sonido.js`: efectos y música sintetizados con Web Audio, mezcla, reproducción y codificación del audio.
- `js/chat.js`, `js/interprete.js` y `api/chat.js`: el asistente (con Claude, o el modo básico sin conexión).
- `js/codificador.js`: codifica cuadro por cuadro con WebCodecs y arma el MP4 con
  [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (o WebM con webm-muxer), con el sonido incluido.
- `js/piedras.js`: reconoce las piedras dentro de un STL de una sola pieza. `js/demo.js`: anillo de ejemplo.
