# Generador de videos · Atelier & Co

Aplicación web para crear videos de joyería a partir de archivos **STL**, con render
**hiperrealista** (trazado de rayos), listos para un reel de Instagram o para el catálogo.
Usa el mismo estilo, los mismos colores y las mismas tipografías que la página de Atelier & Co.

## Cómo se usa

1. **Modelo 3D**: arrastra el STL de la joya. Si las piedras vienen en otro STL, súbelos juntos.
   Si vienen en el mismo archivo, la aplicación las reconoce sola (igual que el visor de la página).
   Con los botones *Girar* corriges la orientación si el modelo quedó acostado.
2. **Metal y piedras**: oro amarillo, rosa o blanco (18k o 14k), plata 925 o platino; acabado
   pulido espejo, pulido, satinado o arenado; y la piedra (diamante, esmeralda, rubí, zafiro, perla…).
3. **Cámara**: giro 360°, giro con acercamiento, revelación (del detalle a la pieza), vaivén
   frontal u órbita. Ajusta altura, encuadre, posición, ángulo y desenfoque macro.
4. **Fondo y textos**: fondos de la marca (perla, oro suave, rosa, bosque, esmeralda, granate,
   negro estudio), sombra de contacto, y los textos: logo, nombre de la pieza, detalle, precio y pie.
5. **Crear video**: escoge el formato (Reel 9:16, publicación 4:5, cuadrado 1:1 o catálogo 16:9)
   y la calidad. El botón *Foto para catálogo* descarga un PNG hiperrealista del cuadro actual.

Con el botón **Ver este cuadro hiperrealista** de la vista previa puedes revisar cómo quedará el
render final antes de crear todo el video.

### Calidades

| Calidad | Qué hace | Tiempo aproximado* |
|---|---|---|
| Rápida | Render en tiempo real, para revisar el movimiento | segundos |
| Realista (48 muestras) | Trazado de rayos: luz, reflejos y refracción reales | 5–20 min |
| Hiperrealista (128 muestras) | Menos grano, piedras más limpias | 15–50 min |
| Máxima (320 muestras) | Para fotos o videos cortos muy cuidados | más de 1 h |

\* Video de 8 s en 1080×1920 con una tarjeta de video de computador de escritorio. En un portátil
sencillo o en el celular tarda bastante más. Deja la pestaña abierta y visible mientras trabaja.

## Formato del video

- **MP4 (H.264)** a 1080×1920, 30 cuadros por segundo y ~20 Mbps: lo que recomienda Instagram.
- Funciona en **Chrome, Edge y Safari** actualizados. Si el navegador no puede crear H.264
  (por ejemplo Chromium sin códecs propietarios), crea un **WebM**, que sirve para la web pero no para Instagram.
- Los movimientos *Giro 360°*, *Vaivén* y *Órbita* hacen un bucle perfecto: el reel se repite sin salto.

## Privacidad

Todo se procesa en el navegador. Los diseños **no se suben a ningún servidor**.

## Cómo publicarla

Es una página estática (sin compilación). Se puede subir tal cual a **Vercel**, Netlify o GitHub Pages
(la carpeta raíz es el sitio). Para probarla en el computador:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## Cómo está hecha

- `index.html` y `estilos.css`: la interfaz, con el sistema visual de la página de la joyería
  (Bodoni Moda + Instrument Sans, perla, tinta, oro y bosque; modo oscuro automático).
- `js/estudio.js`: escena 3D con [three.js](https://threejs.org). Luz de estudio de joyería en HDR
  (las mismas cajas de luz del visor de la página), materiales físicos de metal y piedras con su índice
  de refracción real, y el trazado de rayos con
  [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer). La luz gira con la cámara,
  así que el resultado es el de una tornamesa con la pieza girando bajo luces fijas.
- `js/composicion.js`: fondo de marca, sombra de contacto y textos animados de cada cuadro.
- `js/codificador.js`: codifica cuadro por cuadro con WebCodecs y arma el MP4 con
  [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (o WebM con webm-muxer).
- `js/piedras.js`: reconoce las piedras dentro de un STL de una sola pieza.
- `js/demo.js`: anillo solitario de ejemplo para probar sin tener un STL.
