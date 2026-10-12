# Generador de videos · Atelier & Co

Estudio de video en el navegador para crear videos de joyería a partir de archivos **STL**, con render
**hiperrealista** (trazado de rayos), listos para un reel de Instagram o para el catálogo.
Usa el mismo estilo, los mismos colores y las mismas tipografías que la página de Atelier & Co.

Funciona como un editor de video (al estilo de CapCut): arriba la **vista previa** y, a su lado, el **inspector**
con pestañas (Modelo, Materiales, Textos, Sonido, Asistente y Exportar); abajo, a todo el ancho, la **línea de
tiempo** con keyframes, textos y sonidos. Cuando bajas a la línea de tiempo, la joya se sigue viendo en miniatura en
el menú lateral (tócala para volver arriba). En el celular todo queda en una sola columna: vista previa, pestañas y
línea de tiempo.

## Cómo se usa

1. **Modelo 3D**: arrastra el STL de la joya o prueba con el anillo de ejemplo. Si las piedras vienen en
   otro STL, súbelos juntos; si vienen en el mismo archivo, la aplicación las reconoce sola.
   Con los botones *Girar* corriges la orientación si el modelo quedó acostado.
2. **Materiales**: metal (oro amarillo, rosa o blanco 18k o 14k, plata 925, platino), acabado (pulido espejo,
   pulido, satinado, arenado) y piedra (diamante, esmeralda, rubí, zafiro, perla…). Aquí también van los
   **bitmaps** de las piedras y del metal y la **iluminación HDRI** (ver más abajo).
3. **Línea de tiempo**: escoge un *Movimiento base* y ajústalo con **keyframes**, o pídeselo al **Asistente**.
4. **Textos** y **Sonido**: plantillas con gancho, efectos virales y música.
5. **Exportar**: formato, fondo, sombra, calidad y cuadros por segundo. *Crear video* hace el MP4 (con sonido);
   *Foto para catálogo* descarga un PNG hiperrealista del cuadro donde está el cabezal.

Con **Ver este cuadro hiperrealista** (debajo de la vista previa) revisas cómo quedará el render final antes de
crear todo el video. La barra espaciadora reproduce o pausa, y el botón del parlante activa el sonido de la vista previa.

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

## Asistente (chat)

En la pestaña **Asistente** describes con tus palabras lo que quieres y el asistente lo convierte en keyframes,
textos, efectos y música. Por ejemplo:

- «Gira 2 vueltas y termina enfocando la piedra»
- «Empieza con un zoom rápido al diamante y aléjate despacio»
- «Hazlo estilo viral con whoosh y brillo»
- «Vista desde arriba que baja hasta quedar de frente», «dura 10 segundos», «música phonk»,
  «agrega el texto 'Nueva colección' arriba», «precio $ 4.800.000»

Todo lo que hace se puede deshacer con *Deshacer* en la línea de tiempo.

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
**Guardar proyecto** descargas un archivo `.atelier.json` (keyframes, textos, sonidos, formato, fondo y materiales)
para seguir en otro momento o en otro equipo con **Abrir**. *Nuevo* empieza de cero (se puede deshacer).
El STL, una canción subida, los bitmaps y el HDRI no van dentro del archivo: vuelve a subirlos o escogerlos.

### Calidades

| Calidad | Qué hace | Tiempo aproximado* |
|---|---|---|
| Rápida | Render en tiempo real, para revisar el movimiento y el sonido | segundos |
| Realista (48 muestras) | Trazado de rayos: luz, reflejos y refracción reales | 5–20 min |
| Hiperrealista (128 muestras) | Menos grano, piedras más limpias | 15–50 min |
| Máxima (320 muestras) | Para fotos o videos cortos muy cuidados | más de 1 h |

\* Video de 8 s en 1080×1920 con una tarjeta de video de computador de escritorio. En un portátil
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
Solo el asistente con IA envía lo que escribes en el chat y un resumen del proyecto (duración, keyframes,
textos, sonidos, medidas y materiales de la pieza) a la función `api/chat.js` para responder; nunca el STL.

## Cómo publicarla

Es una página estática más una función para el asistente. En **Vercel** se sube tal cual (la carpeta raíz es el
sitio y `api/chat.js` se detecta sola; las dependencias salen de `package.json`). Configura `ANTHROPIC_API_KEY`
como se explica arriba. Para probarla en el computador:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000  (el chat funciona en modo básico)
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
- `js/texturas.js`: bitmaps de piedras y metal (proyección de UV para el STL) y HDRI.
- `js/textos.js`: capas de texto, plantillas y animaciones. `js/composicion.js`: fondo de marca, sombra de
  contacto, la joya y los textos de cada cuadro.
- `js/sonido.js`: efectos y música sintetizados con Web Audio, mezcla, reproducción y codificación del audio.
- `js/chat.js`, `js/interprete.js` y `api/chat.js`: el asistente (con Claude, o el modo básico sin conexión).
- `js/codificador.js`: codifica cuadro por cuadro con WebCodecs y arma el MP4 con
  [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (o WebM con webm-muxer), con el sonido incluido.
- `js/piedras.js`: reconoce las piedras dentro de un STL de una sola pieza. `js/demo.js`: anillo de ejemplo.
