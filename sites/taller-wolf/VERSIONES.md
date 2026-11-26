# Taller Wolf · Versiones

Cada carpeta es una versión completa e independiente. Nunca se edita una versión anterior: cada cambio nuevo es una carpeta nueva (v3, v4, …).
Nada de esto está conectado con GitHub ni con el repo original (`ReymenSolutions/ReymenApp`).

| Versión | Qué es | Ver en local |
|---|---|---|
| **v0** | Copia exacta del original (`sites/taller-wolf` del repo, 24 nov 2026) | `npx http-server@14.1.1 v0 -p 8080 -c-1` → http://localhost:8080 |
| **v1** | v0 sin las rayitas rojas a los lados de los títulos ("guiones largos") | `npx http-server@14.1.1 v1 -p 8081 -c-1` → http://localhost:8081 |
| **v2** | Rediseño inspirado en GameSir (ver abajo) | `npx http-server@14.1.1 v2 -p 8082 -c-1` → http://localhost:8082 |
| **v3** | Una página por sección, EN/ES, servicios en 3×3 con imágenes, lobo afinado (ver abajo) | `npx http-server@14.1.1 v3 -p 8083 -c-1` → http://localhost:8083 |
| **v4** | Ojos realistas al pasar el mouse, 4 imágenes más realistas, detalles de interacción (ver abajo) | `npx http-server@14.1.1 v4 -p 8084 -c-1` → http://localhost:8084 |
| **v5** | Imágenes de ChatGPT integradas (servicios, iris y humo) | `npx http-server@14.1.1 v5 -p 8085 -c-1` → http://localhost:8085 |
| **v6** | Mapa con pin exacto, ojos encendidos estilo "ojos en la oscuridad", humo horizontal, portada con lobo a la izquierda y auto 3D a la derecha (ver abajo) | `npx http-server@14.1.1 v6 -p 8086 -c-1` → http://localhost:8086 |
| **v7** | Auto 3D real (Airtsel Valor Proiettile), portada en tres columnas, ojos y humo como la foto de referencia (ver abajo) | `npx http-server@14.1.1 v7 -p 8087 -c-1` → http://localhost:8087 |
| **v8** | Dos servicios nuevos (motor y transmisión) y chatbot abajo a la derecha (solo interfaz, ver abajo) | `npx http-server@14.1.1 v8 -p 8088 -c-1` → http://localhost:8088 |

## v8: qué cambió
- **Servicios nuevos**: "Reparación de motor" y "Reparación de transmisión" (español e inglés). Ahora son 11 servicios. Las fotos son de ChatGPT, sin fondo y con sombra suave, igual que las demás (`v8/assets/servicios/motor.webp`, `transmision.webp`; originales en `fuentes-chatgpt/`).
- **Chatbot (solo interfaz)**: botón rojo abajo a la derecha en todas las páginas. Abre una ventana con saludo, respuestas rápidas y campo para escribir. Por ahora responde con un aviso que invita a escribir por WhatsApp. Para conectarlo, la respuesta está en `v8/assets/app.js` (sección "Chatbot", función `send`).
- El botón de WhatsApp subió un lugar (queda encima del chat) y se oculta mientras el chat está abierto.
- Herramientas: `herramientas/paginas-v8.js`.

## v7: qué cambió
- **Auto 3D real**: "Airtsel Valor Proiettile" de Yudha Mfr (licencia CC BY 4.0, uso comercial permitido con crédito). Se usa la animación que trae el modelo, separada por pieza: cada punto blanco abre solo su puerta, el cofre (con el motor a la vista) o la cajuela, y se pone rojo mientras está abierta. Sigue girando solo a los lados.
  - Archivo optimizado para web: de 22.7 MB a 4.1 MB (`v7/assets/auto/airtsel.glb`, geometría comprimida con meshopt). El original está en `modelos-3d/airtsel_valor_proiettile.glb`.
  - Piezas dentro del archivo: `box204` puerta del conductor, `box192` puerta del copiloto, `box28` cofre, `box19` cajuela.
  - Crédito discreto debajo del auto, con enlaces al modelo y a la licencia.
- **Portada en tres columnas**: lobo grande a la izquierda, texto al centro y auto a la derecha. En celular: lobo, texto y auto, uno debajo del otro.
- **Ojos y humo como la foto de referencia**: centro blanco rosado con resplandor rojo intenso; humo rojo oscuro y tenue alrededor de los ojos, detrás del brillo.
- **"Cerrado"**: al pasar el mouse, el punto se pone rojo con un halo fino y suave (antes era un brillo grande).
- Seguridad (CSP): se permite `blob:` (texturas del modelo) y `'wasm-unsafe-eval'` (solo WebAssembly, para descomprimir el modelo). Sigue sin cargarse nada de otros sitios.
- Ajustes posteriores: la cajuela ya abre completa; cada tarjeta de servicio tiene un solo color de fondo igual al de su foto; el lobo ya no muestra un recuadro al cambiar de tema; el auto quedó apoyado en su sombra (sin manchas bajo las llantas).
- Herramientas: `herramientas/paginas-v7.js`; visor 3D en `v7/assets/car3d.js`.

## v6: qué cambió
- **Mapa**: ahora marca el lugar exacto con el pin rojo de Google. Faltaba el código postal: con "Burocratas 515, Burócratas del Estado, **64380** Monterrey" Google encuentra la dirección (antes mostraba toda la ciudad). Se acerca a nivel calle. La dirección con código postal también quedó en la página, en "Cómo llegar" y en los datos para buscadores (con coordenadas 25.7094361, -100.3697586).
- **Ojos**: ya no hay iris de foto. La silueta es la del ojo del logo, rellena de rojo claro con el centro casi blanco y un resplandor rojo que respira despacio (como la foto de referencia).
- **Humo**: sale de los ojos hacia los lados en una banda horizontal (piezas anchas y bajitas, acostadas), en vez de subir.
- **Portada**: el lobo pasó arriba a la izquierda, sobre el texto. A la derecha va un auto en 3D con fondo transparente:
  - se gira **solo a los lados** (mouse, dedo o flechas del teclado); lo vertical queda libre para hacer scroll en el celular;
  - tiene **puntos blancos** en las puertas, el cofre y la cajuela. Al tocarlos, la pieza se abre o se cierra y el punto se pone rojo. Los puntos solo aparecen cuando su lado mira hacia ti.
- ⚠️ **El auto de la v6 es provisional**: está hecho con código para probar la interacción. **No es igual al Audi R8.** Para que sea idéntico hace falta un **modelo 3D real del Audi R8 2015** (archivo .glb, .gltf o .fbx) con las puertas, el cofre y la cajuela como piezas separadas. Con ese archivo se cambia el modelo y se conserva todo lo demás (giro, puntos, aperturas).
- Herramientas: `herramientas/paginas-v6.js` (páginas) y `v6/assets/car3d.js` (visor 3D). three.js 0.170.0 va incluido en `v6/assets/vendor/` (licencia MIT), sin cargar nada de otros sitios.

## v5: qué cambió
- **Imágenes de ChatGPT integradas** (originales en `imagenes-chatgpt/`):
  - Las 9 fotos de servicios (fondo transparente) reemplazan a las ilustraciones. Se redujeron a 720 px en WebP: 600 KB en total (eran 1.9 MB).
  - El **iris real** se ve dentro de cada ojo al pasar el mouse, recortado a la forma exacta del ojo (`assets/ojos/iris.webp`, 20 KB).
  - El **humo real** forma una nube roja que envuelve los ojos y se mueve lento, como la referencia de ojos en la oscuridad (`assets/humo/humo-1.webp`, 10 KB, blanco sobre negro usado como molde).
  - Los ojos ya no muestran el borde blanco del logo: debajo del ojo hay una orilla del color del pelaje (negra en modo oscuro, blanca en modo claro).
- Herramienta: `herramientas/procesar-imagenes.js` (servidor local para optimizar imágenes con el navegador).

- **Portada sin brillos rojos**. Se quedan la trama de puntos que se ilumina con el mouse y el grano fino.
- **Lobo, ojos y humo crecen como una sola pieza** (un solo contenedor), así que ya no se desfasan en el primer hover. Verificado: el ojo queda en la misma posición relativa al lobo durante todo el crecimiento.
- **Más humo, en rojo**: una ráfaga al empezar y humo continuo mientras el mouse siga encima (hasta 12 s). Los humos son más grandes y viajan más lejos. Son rojos (rojo oscuro en modo claro), con pocas brasas al inicio. La regla anti-abuso sigue igual.
- **Humo con imagen**: la foto de humo (blanco sobre negro) se usa como molde: lo blanco se pinta del rojo que se elija en `styles.css` (`--smoke`) y lo negro se vuelve transparente. Probado con una imagen de prueba.
- **Listo para las imágenes de ChatGPT**: el iris irá en `v5/assets/ojos/iris.png` y el humo en `v5/assets/humo/humo-1.png` (2, 3…). Se activan en `assets/app.js` (línea `PHOTOS`). Mientras no estén, se usa el iris dibujado de la v4.
- Herramienta: `herramientas/paginas-v5.js`.
- v5 en local: `npx http-server@14.1.1 v5 -p 8085 -c-1` → http://localhost:8085

## v4: qué cambió
- **Ojos del lobo**: en reposo se ve el logo tal cual. Al pasar el mouse, cada ojo se vuelve un iris rojo realista que llena **toda** la forma del ojo: fibras, pupila que se dilata lento, sombra del párpado, orilla húmeda y reflejos de luz. No hay halo ni brillo encima o alrededor del lobo.
- **Humo**: sale de todo el contorno de cada ojo, no solo de la esquina, y sigue yéndose en diagonal hacia arriba y hacia afuera. Se mantiene la regla anti-abuso: no vuelve a empezar mientras quede humo.
- **Crecimiento del lobo**: más lento (1.5 s) y a la misma velocidad al crecer y al encogerse. Crece desde la base, hacia arriba. El recorte ahora es más grande, así que las orejas y los lados ya no se cortan.
- **Imágenes más realistas**: aceite y filtros, diagnóstico electrónico, cambio de batería y rotación y balanceo (textura, reflejos, sombras de contacto y más detalle). Las otras 5 siguen igual.
- **"Cerrado"**: al pasar el mouse, el punto se enciende como foco rojo (verde si está abierto).
- **Header** con línea divisoria gris siempre visible.
- **Pie de página**: los enlaces se subrayan en rojo igual que el menú de arriba.
- **WOLF** (arriba a la izquierda): al pasar el mouse crece un poco y se dibujan dos esquinas simétricas (arriba-izquierda y abajo-derecha).
- **Portada**: los puntos del pizarrón se iluminan alrededor del mouse, también en las zonas apagadas. Además tiene un grano fino de película. Los brillos de fondo de la v3 se conservan.
- Herramientas: `herramientas/paginas-v4.js` (páginas) e `herramientas/imagenes-servicios-v4.js` (las 4 imágenes nuevas).

## v3: qué cambió
- **Lobo**: el brillo rojo tiene la forma y el tamaño exactos de los ojos del logo (contorno sacado de los píxeles del PNG). Al pasar el mouse el lobo solo crece un poco, sin sacudidas. El humo sale en diagonal hacia arriba y hacia afuera, alineado con la inclinación de los ojos.
- **Anti-abuso sin espera fija**: la animación no puede volver a empezar mientras quede brillo o un solo rastro de humo. En cuanto termina todo, el siguiente hover funciona de inmediato.
- **Marca**: "WOLF / SERVICIO AUTOMOTRIZ" (en celulares de menos de 400 px se oculta la segunda línea para que quepan los botones).
- **Una página por sección**: `index` (portada), `servicios`, `garantia`, `proceso`, `cotizar`, `ubicacion`, más las 3 legales. El menú de arriba marca en qué página estás y el cambio entre páginas es con un desvanecido suave.
- **EN / ES** junto al interruptor de tema, en todas las páginas (incluidas las legales). Se recuerda la elección. Los mensajes de WhatsApp siguen en español porque los lee el taller.
- **Servicios**: matriz 3×3 que cabe completa en pantalla, sin flechas ni números, cada uno con su ilustración. Al pasar el mouse el nombre brilla en rojo y la imagen se acerca. Al tocar se abre la ventana con la imagen grande.
- **Garantía**: las cuatro cifras tienen el mismo tamaño y "5,000 km" ya no se sale.
- **Proceso**: la línea avanza paso por paso a su propio ritmo (unos 4 s en total) cuando la sección aparece, aunque se haga scroll rápido.
- **Botones de WhatsApp en verde WhatsApp**. Horario escrito completo ("Lunes a viernes", "Sábado").
- **Brillo del mouse en tarjetas** con una caída mucho más larga y suave: el borde ya no se nota.
- **Decoración de la portada**: cuatro brillos rojos repartidos que se mueven muy lento, más una trama de puntos que se desvanece. Solo en la portada.
- Se quitó la cinta en movimiento y el interruptor de tema del pie de página.

### Herramientas (carpeta `herramientas/`)
- `paginas-v3.js` genera todas las páginas de la v3 y el archivo de textos en inglés. Los textos se escriben ahí, una vez en español y en inglés.
- `imagenes-servicios.js` genera las 9 ilustraciones de servicios (SVG).
- Para regenerar: `node herramientas/paginas-v3.js v3` y `node herramientas/imagenes-servicios.js v3/assets/servicios`.

### Notas de la v3
- Las ilustraciones son dibujos vectoriales hechos para el sitio (no fotos ni imágenes de terceros).
- El verde de WhatsApp con texto blanco tiene poco contraste para lectura (≈2:1). Se reforzó con letra gruesa y una sombra sutil. Si se quiere máxima accesibilidad, se puede usar un verde más oscuro.

## v2: qué cambió
- **Modo claro/oscuro** con interruptor de sol y luna como el de GameSir (perilla deslizante y destello al pasar el mouse). Fondos absolutos: blanco `#fff` y negro `#000`. Recuerda tu elección y, la primera vez, usa la del sistema.
- **Lobo animado**: es el lobo real del logo. Al pasar el mouse (o tocarlo en el celular), los ojos se encienden en rojo y sale humo sutil. Tiene enfriamiento: dura 2.6 s y no se puede repetir hasta 4 s después. Aparece en el encabezado, en la portada (se anima solo una vez al cargar) y en el pie.
- **Portada** con un solo botón principal ("Cotizar por WhatsApp") y aviso de abierto/cerrado en vivo con la hora de Monterrey.
- **Servicios** en carrusel con paginación (flechas y puntos). Al tocar un servicio se abre una ventana con su descripción y su botón de cotizar.
- **Garantía** con cifras grandes que cuentan hacia arriba, **proceso** con una línea que se llena al hacer scroll, **formulario** y **ubicación** con el mapa bloqueado hasta que el visitante lo permite.
- **Páginas nuevas**: `privacidad.html`, `terminos.html` y `cookies.html`, más un aviso de cookies.
- Sin etiquetas de relleno sobre los títulos, sin íconos decorativos en las tarjetas y con el rojo reservado para lo importante.

## Lista de requisitos (estado en v2)
| Requisito | Estado |
|---|---|
| Paginación | ✅ Carrusel de servicios con páginas + páginas legales separadas |
| Coherencia visual / dirección de arte | ✅ Una sola tipografía (Archivo), blanco/negro absolutos, rojo de acento |
| Logo de la marca, no genérico | ✅ Se usa el lobo real del logo |
| Labels sin propósito | ✅ Quitadas |
| Evitar doble CTA | ✅ Un botón principal por sección |
| Exceso de íconos | ✅ Solo íconos funcionales (teléfono, tema, WhatsApp, flechas) |
| Formularios | ✅ Con validación, aceptación del aviso de privacidad y campo trampa para bots |
| Políticas de privacidad, cookies, términos | ✅ Borradores: **falta que el taller confirme el nombre legal y un correo, y que lo revise un abogado** |
| Jerarquía del color | ✅ |
| Rate limiter | ⚠️ En el navegador: 1 envío cada 30 s y bloqueo de envíos en menos de 3 s. Un límite real necesita un servidor (hoy no hay) |
| JWT | ➖ No aplica: no hay servidor, cuentas ni inicio de sesión. Se necesitaría si después se agrega un backend |
| Datos de usuarios no expuestos | ✅ No se guardan ni se envían a ningún servidor; política de seguridad (CSP) que bloquea conexiones externas; el mapa de Google solo carga con permiso |

## Pendiente de confirmar con el taller
- Las descripciones cortas de cada servicio son genéricas: hay que validarlas.
- La tarjeta "100 % piezas reemplazadas, tuyas" resume "te entregamos lo reemplazado". Confirmar que les parezca bien.
