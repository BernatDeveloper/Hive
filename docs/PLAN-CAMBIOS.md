# Plan de cambios de frontend y estilos

Lista viva: se va ampliando con cada petición. Cada cambio es un commit
propio (fácil de revertir). Los tests del cliente solo cubren lógica pura, así
que **los cambios de interfaz se prueban a mano en el navegador** (móvil real o
DevTools en modo móvil, ≤ 640 px).

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecho

---

## 1. [x] Móvil: zona de arrastre de los paneles (hoja inferior) más grande y a todo el ancho

**Qué se pide.** En móvil, el área para arrastrar hacia abajo y cerrar el panel
de editar/crear evento (y similares) debe ser más grande y ocupar el 100 % del
ancho del panel. Hoy es solo una barrita de 36 × 4 px centrada.

**Estado actual.**
- `.modal-drag-handle` (`client/src/shared/modal.css`, bloque `@media (max-width: 640px)`):
  `width: 36px; height: 4px; margin: -1.1rem auto 0.6rem; touch-action: none`.
  Esa barrita es a la vez lo que se ve y la única zona que recibe el gesto.
- El gesto lo gestiona `useSwipeToDismiss` (`client/src/shared/useSwipeToDismiss.ts`):
  umbral de 80 px hacia abajo; los handlers van solo en el handle para no robarle
  el scroll al contenido ni a los inputs.
- Lo usan 5 paneles: `EventModal`, `RoomSettings`, `BookmarkModal`, `TagsModal`
  y `ShareLinkDialog`. Es CSS compartido, así que el cambio afecta a los cinco
  (coherente; si solo se quiere en el de eventos, habría que acotarlo).

**Propuesta.**
1. Separar **zona táctil** y **marca visible**: el `div.modal-drag-handle` pasa a
   ser la zona (ancho completo, alto ~ 28–32 px) y la barrita se dibuja con un
   pseudo-elemento `::before` centrado (misma apariencia que ahora).
2. Ancho completo del panel: `.modal` tiene `padding: 2rem`, así que la zona usa
   márgenes negativos laterales de `2rem` (`margin: -2rem -2rem 0`) para llegar a
   los bordes, y se compensa el espacio vertical para que el título no se mueva
   de forma notable.
3. Mantener `touch-action: none` y `display: flex; justify-content: center`.
4. Que el botón "×" (`.modal-close`, arriba a la derecha) **siga siendo
   pulsable**: darle `z-index` por encima de la zona de arrastre.
5. Opcional: umbral de cierre — comprobar si 80 px sigue siendo cómodo con la
   zona más grande (probablemente sí; no tocarlo salvo que se note).

**Archivos.** `client/src/shared/modal.css` (único cambio previsto).

**Riesgos / a vigilar.**
- Con márgenes negativos, la zona podría solaparse con el título o con el "×":
  revisar en `EventModal` (título + "Editado por…") y en `RoomSettings`.
- Que la zona ampliada no capture toques que antes iban al contenido (el scroll
  del panel debe seguir funcionando fuera de la zona).
- Si el panel tiene scroll interno y está desplazado, la zona (dentro del
  contenido) se va con él; comprobar que arrastrar para cerrar sigue funcionando
  cuando el panel está arriba del todo.

**Cómo probarlo.**
1. DevTools → modo móvil (o el móvil real), abrir "Nuevo evento" y "Editar evento".
2. Arrastrar hacia abajo desde cualquier punto de la franja superior (no solo
   desde la barrita): debe seguir al dedo y cerrar al pasar ~80 px.
3. Soltar antes del umbral: vuelve a su sitio.
4. Tocar el "×": cierra normalmente.
5. Repetir en Ajustes de sala, editar marcador, gestionar etiquetas y compartir
   enlace.

---

## 2. [~] Móvil, vista día: tocar un hueco crea un bloque de hora ajustable (estilo Google Calendar)

**Qué se pide.** En móvil, en la vista de un día concreto, hoy solo se puede
crear un evento con el botón "+". Se quiere tocar un hueco de la rejilla y que
aparezca un bloque seleccionable y ajustable (con tiradores arriba y abajo,
como en la captura de referencia de Google Calendar) para elegir la hora, y
después crear el evento. Abajo, una barra "(Sin título)" que lleva al formulario.

**Estado actual.**
- `Calendar.tsx`: `selectable` solo en `timeGridDay` (`views={{ timeGridDay: { selectable: true } }}`),
  con `selectMirror` y `select={handleSelect}` → abre `EventModal` con `start`/`end`.
- En táctil FullCalendar exige **mantener pulsado** (`selectLongPressDelay`, por
  defecto ~1 s) antes de poder arrastrar un hueco: no es descubrible, y por eso
  hoy en móvil solo parece existir el "+".
- `handleDateClick` solo actúa en vista mes (`goToDay`); en vista día un toque
  suelto en un hueco no hace nada.
- `goToDay`: al entrar a un día **sin eventos** desde el mes abre ya el modal.

**Propuesta (comportamiento).** Solo en móvil (`useIsMobile`) y solo en `timeGridDay`:
1. Un toque en un hueco vacío crea un **borrador**: bloque de 1 h que empieza en
   el tramo tocado (redondeado a 15/30 min), pintado con el color primario.
2. El borrador se **mueve** arrastrándolo y se **redimensiona** con tiradores
   (puntos arriba-izquierda y abajo-derecha, como la referencia).
3. Tocar otro hueco mueve el borrador ahí; tocar el bloque o la barra inferior
   "(Sin título) · 4:00–7:00" abre `EventModal` con esas horas ya puestas.
4. Se descarta al cambiar de día/vista, al cerrar el modal sin guardar o al
   pulsar "+" (que sigue funcionando como ahora).
5. Escritorio no cambia (el arrastre con ratón de hoy se queda).

**Propuesta (técnica).**
- Estado `draft: { start, end } | null` en `Calendar.tsx`. Se inyecta como un
  evento más en `fcEvents` (con `id` reservado, `editable`, `classNames: ['fc-draft']`,
  título "(Sin título)"), así que reutiliza el arrastre/redimensionado que ya
  hay (`eventDrop`/`eventResize`) con una rama que, si es el borrador, solo
  actualiza `draft` en vez de mandar nada al servidor.
- `dateClick` en vista día (móvil) → crea/mueve el borrador. `eventClick` sobre
  el borrador → abre el modal.
- `eventResizableFromStart` para el tirador superior; estilos de `.fc-event-resizer`
  visibles de forma permanente en `.fc-draft` (hoy FullCalendar solo los enseña
  al seleccionar un evento en táctil).
- Bajar `eventLongPressDelay`/`longPressDelay` (~250–300 ms) para que arrastrar
  el borrador no exija 1 s. **Ojo:** es una opción global, afecta también a
  arrastrar eventos existentes en móvil (ahí también sería más ágil).
- Barra inferior propia (`.calendar-draft-bar`) con las horas y un botón que
  abre el modal; sin tocar `EventModal`, que ya recibe `start`/`end`.
- Helper puro (redondeo del hueco tocado a un tramo + duración por defecto) en
  `dateUtils.ts` con test en `dateUtils.test.ts`.
- El swipe horizontal de día/mes (`onTouchStart/End`) no debe dispararse al
  arrastrar el borrador: marcar `draggingEventRef` igual que con eventos.

**Archivos.** `client/src/features/calendar/Calendar.tsx`, `calendar.css`,
`dateUtils.ts` + `dateUtils.test.ts`.

**Decisiones tomadas (confirmadas por el usuario).**
- **Confirmar:** barra inferior "(Sin título) · hh:mm–hh:mm" que abre el
  formulario (como la referencia de Google Calendar); tocar el bloque no abre nada.
- **Día vacío desde la vista mes (móvil):** se muestra la rejilla limpia, sin
  abrir el formulario (`goToDay` deja de abrir el modal en móvil). En escritorio
  se queda como ahora.
- **Duración y redondeo:** bloque de 1 h; el inicio se redondea hacia abajo al
  tramo de 30 min más cercano.
- **Retardo de pulsación:** se baja a ~300 ms para todos los arrastres en móvil
  (bloque nuevo y eventos ya existentes). Vigilar arrastres accidentales al hacer scroll.

**Riesgos.** Es el cambio más delicado de la lista: toca el calendario, que ya
tiene lógica frágil de arrastre (ver CLAUDE.md, "Flujo de usuario" punto 11:
`draggingEventRef`, `eventDrop`, transiciones). Ir en un commit propio y no
mezclar con otros cambios.

**Cómo probarlo (móvil real o DevTools modo móvil).**
1. Vista día de un día con y sin eventos: tocar un hueco → aparece el bloque.
2. Arrastrarlo y redimensionarlo con los tiradores; las horas de la barra se actualizan.
3. Tocar otro hueco → el bloque se mueve; tocar la barra → `EventModal` con esas horas.
4. Cerrar el modal sin guardar → desaparece el borrador. Guardar → el evento queda.
5. Deslizar horizontalmente para cambiar de día sigue funcionando y no mueve el borrador.
6. Arrastrar/redimensionar eventos ya existentes sigue funcionando.
7. Escritorio: sin cambios.

---

## 3. [x] Botones del calendario: el botón activo se "apaga" al pasar el ratón

**Qué se ve.** El botón activo (Mes/Día, y "Hoy" cuando hoy está a la vista) va
con el color primario (naranja en la captura). Al ponerle el ratón encima
(hover) pasa al gris de los botones inactivos y parece desactivado.

**Causa (confirmada en el CSS).** En `client/src/features/calendar/calendar.css`:
- `.fc .fc-button:hover:not(:disabled)` fija `background: var(--surface-2)` y
  `box-shadow: var(--shadow-md)`, todo con `!important`.
- `.fc .fc-button-active` (fondo primario) tiene menos especificidad que esa
  regla de hover (la pseudo-clase `:hover` y `:not(:disabled)` suman), así que
  en hover gana el gris y pisa al activo.
- En el botón "Hoy" activo, FullCalendar además lo marca `:disabled`, por eso
  ahí el hover no aplica (ya se corrigió su opacidad); el fallo se ve sobre todo
  en Mes/Día.
- En móvil el hover se queda "pegado" tras un toque, así que el activo se ve
  apagado hasta tocar otra cosa.

**Propuesta.**
1. Añadir una regla `.fc .fc-button-active:hover:not(:disabled)` que conserve
   `background: var(--primary)`, `color: var(--primary-text)` y la sombra del
   activo (puede aclararse un pelín con `filter: brightness(1.05)` para que el
   hover siga dando feedback sin cambiar de color).
2. Opcional: envolver el hover de los botones en `@media (hover: hover)` para
   que en táctil no quede pegado.

**Archivos.** `client/src/features/calendar/calendar.css` (solo CSS).

**Cómo probarlo.**
1. Pasar el ratón sobre el botón activo (Mes o Día): debe seguir con el color
   primario, sin pasar a gris.
2. Pasarlo sobre un botón inactivo: sigue cambiando a `--surface-2` como ahora.
3. Probar con un color primario claro y otro oscuro (Ajustes de sala), para
   comprobar el contraste del texto/icono en hover.
4. En móvil: tocar un botón y comprobar que no queda "apagado".

---

## 4. [x] Vista día: sustituir el texto "Todo el día" de la rejilla por un icono

**Qué se ve.** En la vista día, a la izquierda de la franja de eventos de día
completo, FullCalendar escribe "Todo el día". En el eje estrecho (sobre todo en
móvil) se parte en dos líneas, con fuente grande, y descuadra el aspecto.

**Estado actual.** `Calendar.tsx` no personaliza ese texto: sale del locale
`es` de FullCalendar (`locale="es"`, `locales={[esLocale]}`). No se puede quitar
la franja entera (`allDaySlot={false}`) porque los eventos sin hora se pintan
ahí.

**Opciones.**
- **A. Icono (recomendada).** Mismo criterio que los botones Hoy/Mes/Día, que ya
  usan iconos: un pequeño icono (sol / "día completo") en `var(--muted)`, con
  `aria-label` y `title` "Todo el día" para lectores de pantalla y para el
  tooltip al pasar el ratón. Limpio y no se parte en dos líneas.
- B. Nada (texto vacío con `allDayText=""`). Lo más limpio, pero pierde la
  pista de qué es esa franja cuando hay eventos de día completo.
- C. Texto corto ("Día", "24 h"). Cabe en una línea pero sigue siendo texto.

**Propuesta (opción A).**
1. `allDayContent` en `Calendar.tsx` devolviendo un `<span>` con un SVG inline
   (convención del proyecto: iconos SVG inline, sin librería) y el texto
   accesible oculto visualmente.
2. Estilos en `calendar.css` para `.fc-timegrid-axis-cushion` /
   `.fc-timegrid-axis-frame`: centrado, tamaño ~14 px, color `var(--muted)`,
   sin el `font-size` heredado que provoca el salto de línea.
3. Comprobar que la celda mantiene un alto razonable cuando no hay eventos de
   día completo.

**Archivos.** `client/src/features/calendar/Calendar.tsx`, `calendar.css`.

**Cómo probarlo.**
1. Vista día en móvil y escritorio: la franja izquierda muestra el icono, en una
   sola línea, sin agrandar la fila.
2. Un evento de día completo sigue apareciendo en esa franja.
3. Tema claro y oscuro (Ajustes de sala): el icono se ve en ambos.
4. Pasar el ratón por el icono muestra "Todo el día".

---

## 5. [x] Vista mes: el marcador de "hoy" pasa de círculo a píldora

**Qué se pide.** El círculo relleno que marca el día de hoy debe ser una
**píldora horizontal** (óvalo alargado de extremos totalmente redondeados),
como en el dibujo de referencia, en lugar de un círculo.

**Estado actual.** `calendar.css`, regla `.fc .fc-day-today .fc-daygrid-day-number`
(≈ línea 453): `border-radius: 50%` con `width`/`height` fijos de 21 px
(17 px en móvil, ≈ línea 564), fondo `var(--primary)`, texto `var(--primary-text)`.
Hay un comentario que explica que el tamaño se ajusta para que la fila que
contiene "hoy" no salga más alta que el resto.

**Propuesta.**
1. `border-radius: 999px` en vez de `50%`.
2. Quitar el `width` fijo y usar un `min-width` mayor que el alto (≈ 1.9–2× el
   alto: unos 34–40 px en escritorio, 28–32 px en móvil) más `padding: 0 0.5rem`,
   de forma que sea claramente una píldora y no un círculo. Número centrado.
3. **Mantener el alto actual** (21 px / 17 px) para no volver a descuadrar la
   altura de la fila de "hoy".
4. Comprobar que la píldora no se sale de la celda en móvil (celdas estrechas,
   7 columnas): si no cabe, reducir el `min-width` móvil. Revisar también la
   alineación respecto al número de los demás días (los números van pegados a
   un lado de la celda; la píldora debe crecer hacia el interior).

**Decisión abierta.** ¿Solo en vista mes (donde está el círculo hoy), o también
dar a "hoy" un tratamiento equivalente en la cabecera de la vista día? Hoy la
vista día no lleva círculo; se asume **solo mes** salvo que se diga lo contrario.

**Archivos.** `client/src/features/calendar/calendar.css` (solo CSS).

**Cómo probarlo.**
1. Vista mes con "hoy" en distintas columnas (lunes, domingo) y en la primera y
   última fila: la píldora no se corta ni desborda.
2. La fila de "hoy" mide lo mismo que las demás (sin saltos de altura).
3. Móvil (≤ 640 px) y escritorio.
4. Números de uno y dos dígitos (1 y 28): ambos centrados.
5. Primario claro y oscuro (Ajustes de sala): el texto se lee.

---

## 6. [~] EventModal: botones de acción mejor repartidos cuando no caben en una fila

**Qué se pide.** En el panel de evento (al editar), Guardar / Eliminar / Cancelar
no caben los tres en una fila y se parten feo: Guardar y Eliminar arriba y
Cancelar suelto, pequeño y desalineado debajo.

**Estado actual.** `EventModal.tsx` (≈ línea 371): `.modal-actions` es un flex con
`flex-wrap`; en móvil (`modal.css`, ≈ línea 161) solo `.btn-primary` lleva `flex: 1`.
Al envolver, Cancelar queda a la derecha en su propia línea.

**Propuesta.**
1. Rejilla de 2 columnas **solo en el EventModal** (clase modificadora, p. ej.
   `.modal-actions--stacked`, para no tocar RoomSettings/TagsModal/etc.).
2. Fila 1: **Guardar** a todo el ancho (acción principal).
3. Fila 2: **Eliminar** (rojo, versión suave/contorno para que no compita con
   Guardar) y **Cancelar** (neutro) al 50 % cada uno, misma altura.
4. Al crear (sin Eliminar): Guardar y Cancelar en una sola fila 50/50, o Guardar
   ancho y Cancelar debajo — a decidir al verlo.
5. Etiquetas largas de series ("Eliminar serie", "Eliminar estos") deben caber
   en media columna; si no, permitir 2 líneas o abreviar.

**Archivos.** `client/src/features/calendar/EventModal.tsx`, `client/src/shared/modal.css`.

**Cómo probarlo.** Evento nuevo, evento existente y evento de serie (cada alcance);
escritorio (modal 420 px) y móvil; los tres botones alineados y de la misma altura.

---

<!-- Añadir aquí los siguientes cambios con el mismo formato (## N. [ ] título) -->
