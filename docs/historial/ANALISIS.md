# Análisis general — Calendario Compartido

> Estudio completo de la app tras las Tareas A–D y las Fases 0–6 de mejoras.
> Estado del código a `8d73079`. Cada punto lleva etiqueta de prioridad:
> **🔴 importante** · **🟡 recomendable** · **⚪ nice-to-have**.

---

## 0. Veredicto rápido

La app está **sólida por dentro**: backend modular y bien testeado (45 tests), sincronización en tiempo real robusta (reconexión, cola offline, concurrencia optimista en notas, undo), seguridad proporcionada al caso de uso (auth por sala, rate limiting, validación de payloads). El trabajo de las fases dejó los cimientos en muy buen sitio.

Lo que **frena el producto** no es la ingeniería, son **decisiones de alcance de UX y de modelo**:

1. **Onboarding**: para invitar a alguien hay que dictarle nombre + contraseña. No hay enlace, ni QR, ni "mis salas". Es la fricción nº 1.
2. **El calendario es solo vista de mes.** Sin semana/día/agenda, sin arrastrar eventos. Para una app de calendario es una carencia grande.
3. **Se entra a una parrilla de "Módulos"**, no al calendario. Un tap de más cada sesión.
4. **Sin identidad**: todos en la sala son anónimos e iguales. No se sabe quién hizo qué.
5. **La recurrencia materializa todas las instancias** en la DB (365 filas para "diario"). No escala y complica "editar solo esta ocurrencia".

Las **3 mejoras que más recomiendo** (detalle abajo): enlace de invitación + "mis salas", vistas de semana/día + drag&drop, y etiquetas con nombre (en vez de paleta de hex anónima).

---

## 1. Arquitectura y estructura

### 1.1 Servidor — bien

`config/ db/ services/ sockets/ http/ lib/ auth/` con responsabilidades separadas (Tarea A + Fases 0–6). `safeOn`/`safeAuthedOn` uniforman errores y auth. Tests de contrato fijan las formas que emite.

| # | Observación | Prioridad |
|---|---|---|
| 1 | **Todo es Socket.io; solo existe `GET /health`.** No hay superficie REST para: feed iCal suscribible, integraciones, webhooks, métricas, o una futura app móvil. El `.ics` que hicimos es descarga puntual en cliente — no puede ser una URL que Google/Apple Calendar consuman. | 🟡 |
| 2 | **Sin apagado ordenado.** No hay handler de `SIGTERM` → `io.close()` + `db.pragma('wal_checkpoint(TRUNCATE)')` + `db.close()`. En un deploy con reinicios, el WAL depende del siguiente arranque. | 🟡 |
| 3 | **Rate limiter en memoria por proceso.** Se reinicia al reiniciar el server y no funciona con múltiples instancias. Aceptable en single-instance pequeño; anotarlo. | ⚪ |
| 4 | **Sin `helmet` / cabeceras de seguridad** en Express (CSP, HSTS, `X-Content-Type-Options`). Solo hay CORS + `express.json()`. | 🟡 |
| 5 | **`express.json()` con límite por defecto (~100 KB)** y `MAX.noteBody` es 100.000 — un guardado de nota grande roza el límite. Subir a `express.json({ limit: '256kb' })`. (El payload va por socket, `maxHttpBufferSize` 1 MB por defecto, así que en la práctica pasa — pero conviene alinear.) | ⚪ |
| 6 | **`cleanInactiveRooms` borra salas >1 año en silencio.** Sin aviso, sin export previo. Un año de calendario familiar desaparece. Al no haber identidad no hay a quién avisar → ver §6 y §9. | 🟡 |
| 7 | **Sin logging de conexiones/acceso, sin métricas, sin error tracking** (Sentry). No se sabe cuántas salas hay, cuántos push fallan, etc. | 🟡 |
| 8 | Envío push: errores que no son 404/410 solo se loguean, sin reintento ni dead-letter. Aceptable. | ⚪ |
| 9 | `deleteSeriesFuture` usa comparación de strings `start >= fromStart`. Correcto porque las instancias comparten formato, pero frágil si algún día se mezclan all-day y con-hora en la misma serie. | ⚪ |

### 1.2 Cliente — bien tras Tarea B, con deuda acumulada

Feature folders + hooks de dominio + capa `socket/`. Limpio.

| # | Observación | Prioridad |
|---|---|---|
| 10 | **`EventModal` = 388 líneas.** Mezcla aritmética de fechas + 3 modos de render (crear único / crear recurrente / editar serie) + selector de hora. El historial de git tiene varios "Fix … date" — es zona de bugs. Extraer `useEventForm` (todo el estado + `save()` + helpers) y dejar el componente solo con JSX. | 🟡 |
| 11 | **Iconos SVG inline duplicados** en ~6 archivos (`IconTrash`, `IconChevronLeft`, `IconPlus`, `IconArrowLeft`, …). Un `shared/icons.tsx`. | 🟡 |
| 12 | **`useIsMobile` se instancia en 4 componentes**, cada uno añade un listener `resize`. Pasar a `matchMedia` con un solo listener, o un contexto. | ⚪ |
| 13 | `UpdateNoteResult` vive en `useNotes.ts`, no en `types.ts` (inconsistente con el resto). | ⚪ |
| 14 | **Números mágicos repartidos**: debounce 600 ms, toast undo 10 s, ventana undo 12 s (server), gracia banner 3 s, rate limit 10/min, ack timeout 5 s. Un `constants.ts` por lado. | ⚪ |
| 15 | **Sin `useMemo`** en datos derivados: `fcEvents` (Calendar), `upcoming`/`grouped` (EventsPanel) se recalculan en cada render. Con cientos de eventos, irrelevante; con miles (recurrencia diaria), se nota. | 🟡 |
| 16 | **Sin code-splitting**: bundle único de 505 KB (152 KB gzip), FullCalendar es ~la mitad. `React.lazy` para el módulo calendario → auth/listas/notas cargan rápido. | 🟡 |
| 17 | **12 archivos CSS**, varios diminutos (`app.css` 28 líneas, `connection-banner.css` 32). Tokens en `index.css :root` pero el Dashboard los pisa con estilos inline (`cssVars`). Un sistema de temas con `data-theme` en `<html>` sería más limpio que estilos inline en `.dashboard`. | ⚪ |
| 18 | Sin alias de imports (`@/`), todo `../../`. | ⚪ |
| 19 | `vite.config.ts` está pelado: sin `manualChunks`, sin `vite-plugin-pwa` (el SW es manual), sin alias. | 🟡 |
| 20 | **Cliente con CERO tests** pese a tener lógica pura muy testeable (ver §8). | 🔴 |

### 1.3 Assets y metadatos

| # | Observación | Prioridad |
|---|---|---|
| 21 | **`favicon.svg` referenciado en `index.html` pero NO existe en `public/`** → 404 en cada carga. Añadir uno (o apuntar a `icon-192.png`). | 🟡 |
| 22 | `<title>client</title>` en `index.html` → "Calendario Compartido". | 🟡 |
| 23 | `README.md` es literalmente `# Sared-Calendar` (además con typo, es "Shared"). Escribir un README de verdad. | 🟡 |
| 24 | `src/assets/hero.png`, `react.svg`, `vite.svg` — no se importan en ningún sitio. Borrar. | ⚪ |
| 25 | **`@fullcalendar/timegrid` es dependencia pero el plugin nunca se carga** (Calendar solo usa `dayGrid` + `interaction`). Hay CSS de timegrid pero sin plugin. → Usarlo (vista semana, §7) o quitar dep + CSS. | 🟡 |
| 26 | Sin `engines` en los `package.json` (Node 22 es obligatorio: `process.loadEnvFile`, `node:test`, `--experimental` no). | ⚪ |
| 27 | Sin CI. Los tests existen pero nada los ejecuta al hacer PR/merge. | 🔴 |
| 28 | Sin manifests de deploy (Dockerfile, `.github/`, `vercel.json`, `railway.toml`). La app está *preparada* (CORS y URL de socket por env) pero no *empaquetada*. | 🟡 |

---

## 2. Modelo de datos

| # | Observación | Prioridad |
|---|---|---|
| 29 | **Recurrencia materializada.** `generateRecurrenceInstances` inserta 365 filas (diario), 104 (semanal), 36 (mensual), etc. por serie. Una sala con 5 hábitos diarios + 3 reuniones semanales ≈ 2.100 filas, **todas cargadas en cada `join-room`** y mantenidas en el array `events` del cliente. Funciona hoy; no escala y hace incómodo "editar solo esta ocurrencia" (hay que desenganchar). **Solución real: RRULE** (guardar la regla, expandir en cliente por rango visible). Es el refactor de fondo de la Fase 6 — merece re-plantearse con peso (§5.5). | 🔴 |
| 30 | La columna `event.category` es **peso muerto** (se mantiene a propósito tras Tarea D). Migración futura para dropearla. | ⚪ |
| 31 | `event` no tiene `created_at` (solo `updated_at`). Sin `location`, `url`, adjuntos, asistentes/RSVP. | 🟡 |
| 32 | `note.body` es **texto plano** (máx 100 KB). Sin markdown/rich-text, sin adjuntos. Para un "bloc compartido" es fino. | 🟡 |
| 33 | `list_item` sin `position` → no hay orden manual (solo `created_at`). Sin fecha límite, sin responsable. | 🟡 |
| 34 | **Sin identidad**: los miembros de una sala son anónimos. No se puede atribuir cambios. La presencia es un contador pelado. | 🔴 |
| 35 | `room` sin `owner`, sin forma de **cambiar la contraseña**, sin tokens de invitación. | 🔴 |
| 36 | `updated_at` de notas se fuerza monotónico (`nextTimestamp`) — bien resuelto. Los eventos usan `datetime('now')` de SQLite (segundos, no ms) — ok porque no hay control de versión en eventos. | ✅ |

---

## 3. UI / UX — pantalla por pantalla

### 3.1 Home (`HomeScreen`)

- Limpio, estética tipo Apple. Título + 3 badges + 2 botones.
- **Falta explicar el modelo.** Un usuario nuevo no sabe qué es una "sala", ni que no hay registro, ni que la contraseña se comparte con el grupo. Un párrafo de "Crea una sala, comparte el nombre y la contraseña con tu grupo. Sin cuentas." — 🟡
- **Sin "salas recientes".** Si ya usaste la app, vuelves a teclear nombre + contraseña cada vez. Guardar en `localStorage` la(s) última(s) sala(s) y ofrecer re-entrada en 1 tap. — 🔴

### 3.2 Crear / Unirse

- **Sin enlace de invitación.** Es la mayor carencia de onboarding. Para invitar hay que decir "la sala se llama `familia-perez` y la contraseña es `xxx`" por WhatsApp. Opciones: (a) deep link `?room=familia-perez` que pre-rellena el formulario de unirse; (b) enlace de invitación con token de un solo uso; (c) QR para invitar en persona. — 🔴
- **Sin recuperación de contraseña.** Si el grupo la olvida, la sala (y un año de datos) queda inaccesible. Mínimo: el dispositivo del creador podría guardar la contraseña y ofrecer "restaurar acceso". — 🔴
- `CreateRoomForm` `maxLength={30}` vs servidor `MAX.roomName = 60` — desalineado. — ⚪
- Nombre de sala: no se comprueba si está cogido hasta el submit. Un check con debounce mejoraría el feedback. — ⚪
- Indicador de fortaleza de contraseña (Fase 6) — bien. ✅

### 3.3 Dashboard

- **Aterriza en una parrilla de "Módulos"** (3 cards + un slot "Próximamente" que **nunca se renderiza** porque `UPCOMING = []`). Es un tap de más cada sesión y da poca información. **Recomendación: aterrizar en el calendario**, con control segmentado / tabs (desktop) o bottom-nav (móvil) para Calendario / Listas / Notas. La parrilla puede quedar como panel de resumen ("hoy: 3 eventos", "2 listas con pendientes"), no como entrada. — 🔴
- Header escueto: nombre de sala + punto de presencia + engranaje. En móvil **no hay "salir" visible** (está enterrado en Ajustes). — 🟡
- Sin **búsqueda global**. — 🟡
- Sin "qué viene ahora". La home de un calendario familiar debería mostrar "Hoy: 3 eventos · Próximo: Cena, mañana 20:00". — 🟡
- El array `UPCOMING` y la card "Próximamente" son código muerto — dan sensación de inacabado. Quitar o rellenar. — 🟡

### 3.4 Módulo Calendario

| # | Observación | Prioridad |
|---|---|---|
| 37 | **Solo vista de mes.** Sin semana / día / agenda. `timeGridPlugin` y `listPlugin` no cargados (aunque `@fullcalendar/timegrid` ya está en deps). Para una app de calendario esto es crítico — la vista semana es lo mínimo esperable, y en móvil ayuda más que el mes. | 🔴 |
| 38 | **Sin arrastrar para mover ni redimensionar** eventos (`interactionPlugin` cargado pero sin `editable`/`eventDrop`/`eventResize`). Los usuarios esperan arrastrar un evento a otro día. | 🔴 |
| 39 | Seleccionar un día → modal de evento **de día completo**. No se puede arrastrar un rango de horas → siempre hay que activar "Añadir hora" y elegir en dropdowns. | 🟡 |
| 40 | El `TimeSelect` propio (2 dropdowns, 24 + 60 opciones) es incómodo. El comentario justifica evitar `<input type="time">` por el AM/PM según locale — pero la mayoría de usuarios lo prefiere igual, y los dropdowns son peor ergonomía. Reconsiderar. | 🟡 |
| 41 | **`EventsPanel` ("Próximos")**: buen concepto (agrupa por día + filtro por color + export). Pero los chips de filtro son **swatches de color pelados sin etiqueta** — problema de daltonismo y de "¿cuál es cuál?". | 🟡 |
| 42 | **La paleta de colores hex es un concepto abstracto para el usuario.** "Colores de eventos" con pickers de hex es de power-user. **Etiquetas con nombre** ("Trabajo" = azul, "Cumpleaños" = rosa) — básicamente recuperar categorías pero definidas por el usuario — sería mucho más usable Y arregla el filtrado accesible (filtras por "Trabajo", no por "el azul"). Ver §5.3. | 🟡 |
| 43 | Sin jump-to-date, sin mini-navegador de mes, sin número de semana. | ⚪ |
| 44 | Sin importar `.ics`. Sin URL de suscripción del calendario. | 🟡 |

### 3.5 `EventModal`

| # | Observación | Prioridad |
|---|---|---|
| 45 | Selector de alcance (Solo este / Este y siguientes / Toda la serie) solo al editar serie — bien. Pero **"Solo este" no permite cambiar fecha/hora** (solo metadatos). Para mover una ocurrencia hay que borrarla y recrearla. | 🟡 |
| 46 | **La recurrencia solo se define al crear, nunca se edita.** Si pones "semanal" y querías "quincenal", borras la serie entera y empiezas de cero. | 🟡 |
| 47 | **Sin condiciones de fin de recurrencia** ("hasta el DD/MM", "N repeticiones"). El horizonte es fijo (365 días / 104 semanas / …). "Todos los martes durante 6 semanas" te genera 104 semanas. | 🟡 |
| 48 | Borrar serie = botón rojo. Ahora con undo (bien), pero sin confirmación ("Eliminar serie" borra 104 eventos). | ⚪ |
| 49 | Sin atajos de teclado: no cierra con Esc (solo click en overlay), no guarda con Enter. Sin focus-trap ni restauración de foco. | 🟡 |

### 3.6 Módulo Listas

- Sólido: sidebar de listas + detalle con secciones pendientes/completados, contador "3/10".
- **Falta**: reordenar ítems (drag), **"vaciar completados"** (borrar de uno en uno es tedioso), fechas límite, sub-ítems, responsable ("Beto trae el pan"), **plantillas** (lista de compra recurrente que se resetea), "mover ítem a otra lista", descripción/nota de lista. — 🟡

### 3.7 Módulo Notas

- **Ingeniería notable**: auto-save 600 ms + concurrencia optimista + banner de conflicto + lector adopta cambios en vivo. Bien hecho.
- Pero es **un `<textarea>` pelado.** Sin markdown, sin formato, sin checkboxes-en-nota, sin encabezados. Para "notas compartidas" es fino. **Markdown con toggle editar/vista previa** sería un salto grande. — 🟡
- Sin **búsqueda** entre notas. Sin fijar (pin) ni ordenar (solo `updated_at DESC`). Sin carpetas/etiquetas. — 🟡
- El UX de conflicto ("Cargar la versión actual") **descarta tus ediciones sin guardar** al pulsar. Un "ver diferencias" sería mejor, pero eso es territorio CRDT (deferido). — ⚪
- Sin "editado por" (no hay identidad). — 🟡

### 3.8 Ajustes de sala (`RoomSettings`)

| # | Observación | Prioridad |
|---|---|---|
| 50 | **Mezcla tres cosas distintas**: tema de la sala (**compartido**, afecta a todos), paleta de colores de evento (**compartido**), avisos push (**por dispositivo**), salir de la sala (**personal**). Separar "Ajustes de sala" (tema + paleta/etiquetas, compartido) de "Preferencias" (este dispositivo: notificaciones, override claro/oscuro, nombre para mostrar). | 🟡 |
| 51 | **El tema es por sala.** Si Ana prefiere oscuro y Beto claro, no pueden elegir cada uno. El **modo oscuro debería ser preferencia del dispositivo**; los colores de la sala son un eje de marca/acento distinto. Hoy pulsar "Oscuro" en una sala compartida lo cambia para todos. | 🟡 |
| 52 | "Restablecer" solo aplica el preset claro — está mal etiquetado (no restablece al estado guardado de la sala). | ⚪ |
| 53 | **No se puede cambiar la contraseña de la sala.** Debería estar aquí (con aviso "todos necesitarán la nueva contraseña"). | 🔴 |
| 54 | Sin "exportar datos de la sala" / backup. | 🟡 |
| 55 | Pickers `<input type="color">` con hex a la vista — de power-user. La preview en vivo ayuda. | ⚪ |

### 3.9 Conexión / offline

- `ConnectionBanner` (tras 3 s de gracia) + "N cambios sin sincronizar" — bien (Fase 5). ✅
- Banner de actualización del SW — bien (Fase 5). ✅
- **La app no funciona offline en la primera carga** — no hay caché del app-shell. El handler `fetch` del SW es un passthrough vacío. `vite-plugin-pwa` / Workbox lo arreglaría. — 🟡
- Sin snapshot en IndexedDB de la sala → abrir offline no muestra nada. — ⚪

### 3.10 Móvil

- Responsive con `useIsMobile` (640 px). Los módulos muestran un panel a la vez.
- **Sin bottom-navigation** (el patrón estándar). Cambiar de módulo es: botón atrás → parrilla → tap módulo. — 🟡
- El mes de FullCalendar en un móvil va apretado; la vista semana/día ayudaría más aquí. — 🟡
- `.dashboard { height: 100vh }` → problemas con la barra de direcciones en móvil. Usar `100dvh` (auth.css ya lo usa en un sitio). — 🟡
- Sin pull-to-refresh, sin gestos de swipe. — ⚪

---

## 4. Accesibilidad

| # | Observación | Prioridad |
|---|---|---|
| 56 | **Distinción de eventos solo por color** → daltonismo. `readableTextColor` cuida el contraste del título sobre el color, pero no la discriminación de tono. Añadir: icono/emoji opcional por etiqueta, o el nombre de la etiqueta en el evento. (Se conecta con §5.3, etiquetas con nombre.) | 🟡 |
| 57 | Chips de filtro = swatches sin texto. Tienen `aria-label` (bien) pero visualmente nada. | 🟡 |
| 58 | Modales sin **focus-trap**, sin cierre con **Esc**, sin restaurar el foco al cerrar. | 🟡 |
| 59 | Sin skip-link, sin `<nav>` landmark (hay `<main>` en Dashboard — bien). | ⚪ |
| 60 | Cambios en tiempo real (un evento que añade otra persona) **no se anuncian** a lectores de pantalla. Un `aria-live` educado para "Ana añadió un evento". | ⚪ |
| 61 | `prefers-reduced-motion` respetado en `index.css`. `role="switch"`, `aria-live` en banners — bien. | ✅ |

---

## 5. Cambios conceptuales / de producto

### 5.1 Identidad ligera (sin cuentas) — 🔴 la de más leverage

Al entrar a una sala, elegir **nombre para mostrar + color de avatar** (guardado en `localStorage`, enviado con cada escritura). Con eso:

- Presencia muestra **nombres**, no un número.
- "Editado por Ana hace 5 min" en notas y eventos.
- Feed de actividad posible.
- Cursores/selección de otros en las notas.

**Mantiene el modelo sin registro** — cero fricción — pero desbloquea toda la capa colaborativa. Es el cambio conceptual con mejor relación valor/coste.

### 5.2 Calendario primero, no parrilla de módulos — 🔴

La parrilla es andamiaje. Los usuarios quieren el calendario. Control segmentado / tabs (desktop) o bottom-nav (móvil) para las 3 áreas. Renombrar "Módulos" y quitar "Próximamente".

### 5.3 Etiquetas (nombre + color) en vez de paleta de hex anónima — 🟡

Recuperar parte de la Tarea D: **etiquetas definidas por el usuario** (nombre + color), no swatches de hex sin nombre. Mejor modelo mental, filtrado accesible ("Trabajo" vs "el azul"), familiar. Lo mejor de ambos mundos: el color sigue ahí, pero con nombre.

### 5.4 Separar "ajustes de sala compartidos" de "preferencias del dispositivo" — 🟡

Tema, paleta/etiquetas = compartido (idealmente editable solo por un admin de sala). Modo oscuro, notificaciones, nombre para mostrar = por dispositivo.

### 5.5 Recurrencia basada en RRULE — 🔴 (refactor de fondo)

En vez de materializar instancias: guardar la regla RRULE, expandir en cliente por el rango visible. Arregla escalabilidad (§29), permite "editar la hora de esta ocurrencia", condiciones de fin, y round-trip limpio con iCal. Es grande pero es la base de varias cosas.

### 5.6 Una API REST mínima junto a los sockets — 🟡

Para: el feed iCal (`GET /rooms/:token/calendar.ics`), health/métricas, futuras integraciones y una eventual app móvil. La pureza "todo sockets" limita.

### 5.7 Ciclo de vida de la sala — 🟡

El creador es un "admin" blando (rota contraseña, borra la sala, gestiona etiquetas/tema); el resto son miembros. Sin cuentas — el estado de admin se guarda en la sala y se prueba conociendo la contraseña original o un token.

### 5.8 Revisar el borrado silencioso a 1 año — 🟡

O avisar (necesita contacto → identidad), o ampliar la ventana, o hacerlo opt-out con export previo.

---

## 6. Seguridad y operaciones

| # | Observación | Prioridad |
|---|---|---|
| 62 | Modelo de amenaza = "familia/amigos comparten una sala". Sala + contraseña es proporcionado. Pero: **la contraseña no se puede rotar** → no puedes "echar" a alguien sin crear otra sala. | 🔴 |
| 63 | Sin **share de solo lectura** (invitado que ve pero no edita). | 🟡 |
| 64 | Sin `helmet` / CSP / HSTS. | 🟡 |
| 65 | **`better-sqlite3` = un archivo, sin estrategia de backup.** Un año de calendario familiar es un `.db`. Recomendado: [Litestream](https://litestream.io) (replica SQLite a S3 en continuo) o `VACUUM INTO` nocturno, documentado. | 🔴 |
| 66 | Sin apagado ordenado (§2). | 🟡 |
| 67 | Sin métricas, sin Sentry, sin logging de conexiones. | 🟡 |
| 68 | `.env` con claves VAPID reales, gitignored — bien. `.env.example` documentado — bien. | ✅ |
| 69 | Rate limiter reinicia con el proceso (§3). | ⚪ |
| 70 | `TRUST_PROXY` + `X-Forwarded-For` documentado — bien. | ✅ |

---

## 7. Testing y CI/CD

| # | Observación | Prioridad |
|---|---|---|
| 71 | **Servidor: 45 tests**, buena cobertura de contratos/integración con `node:test` sin framework. | ✅ |
| 72 | **Cliente: 0 tests.** Lógica pura que debería estar cubierta: `ics.ts` (`eventsToICS`), `password-strength.ts`, `shared/color.ts`, `socket/queue.ts` (con socket mock), y **los helpers de fecha de `EventModal`** (`isoToLocalDate`, `addDaysToDateStr`, la lógica `finalStart`/`finalEnd` — que ha tenido bugs). Añadir **Vitest** (integra con Vite, jsdom, rápido). | 🔴 |
| 73 | **Sin e2e en el repo.** Durante las fases se usaron scripts CDP de usar y tirar. Una **suite Playwright** commiteada (crear sala, añadir evento, scopes de serie, undo, cola offline, presencia/conflicto en 2 pestañas) sería muy valiosa y ejecutable en CI. | 🔴 |
| 74 | **Sin CI** (GitHub Actions). En cada PR: `pnpm -C server test`, `pnpm -C client build`, `pnpm -C client lint`, Playwright. | 🔴 |
| 75 | **2 errores de lint pre-existentes** (`react-hooks/set-state-in-effect` en `Lists.tsx:57`, `Notes.tsx:76`) — son el patrón "sincronizar sistema externo → estado local". Resolver (refactor a `useSyncExternalStore` o `eslint-disable` con justificación) para tener **baseline limpio** y que CI falle solo con errores nuevos. | 🟡 |
| 76 | `pnpm-workspace.yaml` con `verifyDepsBeforeRun: false` es un workaround del `ERR_PNPM_IGNORED_BUILDS` de better-sqlite3 en Windows — está comentado, ok. | ⚪ |

---

## 8. Rendimiento

| # | Observación | Prioridad |
|---|---|---|
| 77 | **Bundle 505 KB / 152 KB gzip, un solo chunk.** FullCalendar ≈ 250 KB. `manualChunks` para separarlo + `React.lazy` para el módulo calendario. | 🟡 |
| 78 | **Recurrencia materializada** → `events` sin límite en el cliente (§29). RRULE lo arregla. | 🔴 |
| 79 | Sin `useMemo` en `fcEvents` / `upcoming` / `grouped`. | 🟡 |
| 80 | Cada broadcast → setState → re-render del subárbol. Componentes sin memoizar. Fino a escala pequeña. | ⚪ |
| 81 | `useIsMobile` × N listeners de resize. | ⚪ |
| 82 | Servidor: consultas de carga de sala y del scheduler usan índice (Fase 2). WAL activo. | ✅ |
| 83 | Socket.io `perMessageDeflate` on por defecto. Sin CDN/caché de assets (concierne al deploy). | ⚪ |

---

## 9. Nuevas funcionalidades (priorizadas)

### Alto valor, esfuerzo moderado

| # | Feature | Notas |
|---|---|---|
| A1 | **Enlace de invitación + QR** | `?room=X` pre-rellena unirse; o token de invitación. Transforma el onboarding. La versión deep-link es barata. |
| A2 | **Vistas semana / día / agenda** | Cargar `timeGridPlugin` + `listPlugin` (dep ya presente) + un selector de vista. Table stakes. |
| A3 | **Arrastrar para mover / redimensionar eventos** | `editable` + `eventDrop`/`eventResize` → `update-event`. Salto de calidad percibida enorme. |
| A4 | **Etiquetas con nombre (nombre + color)** | Reemplaza la paleta abstracta, arregla el filtrado accesible. |
| A5 | **"Mis salas" + cambio de sala sin logout** | Recordar salas en `localStorage`, switcher. Desbloqueo de producto (multi-sala). |
| A6 | **Aterrizar en el calendario + bottom-nav móvil** | Quita la parrilla como entrada. |
| A7 | **URL de feed del calendario (iCal suscribible)** | `GET /rooms/:feedToken/calendar.ics` — primera ruta REST no-`/health` + token de feed por sala. "Añadir a Google Calendar". |
| A8 | **Búsqueda global** (eventos + notas + ítems) | Una caja de búsqueda en el header. |
| A9 | **Notas en markdown** (editar/vista previa) | Hace las notas realmente útiles. |
| A10 | **Listas: fechas límite, reordenar (drag), "vaciar completados", plantillas** | |

### Valor medio

| # | Feature |
|---|---|
| B1 | **Identidad ligera** (nombre + color local, enviado con las escrituras) → presencia con nombres, "editado por" |
| B2 | **Feed de actividad** ("Ana creó 'Cena', Beto marcó 'leche'") — necesita B1 |
| B3 | Recurrencia: condiciones de fin ("hasta", "N veces") + regla editable |
| B4 | **Importar `.ics`** |
| B5 | Evento: ubicación (con link a mapa), URL, adjuntos |
| B6 | **Digest de notificaciones** — "Buenos días: hoy tienes 3 eventos" a una hora elegida |
| B7 | Widget de cuenta atrás / próximo evento en la home |
| B8 | **Undo para ediciones** (no solo borrados) — historial / "deshacer último cambio" |
| B9 | Comentarios / RSVP en eventos |
| B10 | **Rotación de contraseña de sala + enlace de solo lectura** |

### Nice-to-have

Clima en el calendario · reset de lista de compra recurrente · responsable por ítem · **offline completo** (app-shell cache + snapshot IndexedDB) · export de sala (JSON) · galería de temas / más presets · vista de impresión · atajos de teclado (`n` = nuevo evento, `/` = buscar) · shortcuts de PWA en el manifest · **i18n** (hoy español hardcodeado).

---

## 10. Deuda técnica — quick wins (una tarde)

- [ ] Añadir `favicon.svg` a `public/` (o apuntar a `icon-192.png`). *(§21)*
- [ ] `<title>` → "Calendario Compartido". *(§22)*
- [ ] README real. *(§23)*
- [ ] Borrar `src/assets/hero.png|react.svg|vite.svg`. *(§24)*
- [ ] Decidir sobre `@fullcalendar/timegrid`: usarlo (A2) o quitar dep + CSS. *(§25)*
- [ ] `shared/icons.tsx` — deduplicar los `Icon*`. *(§11)*
- [ ] `shared/constants.ts` (cliente) + `lib/constants.js` (server) — números mágicos. *(§14)*
- [ ] `useMemo` en `fcEvents`, `upcoming`, `grouped`. *(§15, §79)*
- [ ] `useIsMobile` → `matchMedia` único / contexto. *(§12, §81)*
- [ ] Mover `UpdateNoteResult` a `types.ts`. *(§13)*
- [ ] `vite.config`: `manualChunks` (separar FullCalendar) + alias `@/`. *(§16, §19)*
- [ ] Resolver los 2 errores de lint → baseline limpio. *(§75)*
- [ ] Server: handler `SIGTERM` (io.close + wal_checkpoint + db.close). *(§2, §66)*
- [ ] Server: `helmet` + `express.json({ limit: '256kb' })`. *(§4, §5)*
- [ ] `engines: { node: ">=22" }` en ambos `package.json`. *(§26)*
- [ ] Alinear `CreateRoomForm` `maxLength` con `MAX.roomName`. *(§3.2)*
- [ ] CI mínima (GitHub Actions: test + build + lint). *(§27, §74)*

---

## 11. Roadmap sugerido (por fases, como MEJORAS.md)

| Fase | Tema | Contenido |
|------|------|-----------|
| **7** | Pulido y quick wins | Todo el §10. Vitest para la lógica pura. `useEventForm` extraído de `EventModal`. Graceful shutdown + helmet. |
| **8** | Calendario de verdad | Vistas semana/día/agenda (A2), drag & drop + resize (A3), jump-to-date, selector de hora mejor. |
| **9** | Onboarding y multi-sala | Enlace de invitación + QR (A1), "mis salas" + switcher (A5), calendario-first + bottom-nav (A6), recordar salas. |
| **10** | Identidad ligera + colaboración | Nombre para mostrar local (B1), atribución "editado por", presencia con nombres, feed de actividad (B2), comentarios en eventos (B9). |
| **11** | Etiquetas y búsqueda | Etiquetas (nombre + color) sobre la paleta (A4), filtro por etiqueta, búsqueda global (A8). |
| **12** | Notas y listas nivel 2 | Markdown en notas (A9), fechas límite + reordenar + "vaciar completados" + plantillas en listas (A10). |
| **13** | Recurrencia RRULE (refactor de fondo) | Modelo RRULE (§5.5), editar hora de una ocurrencia, condiciones de fin (B3), round-trip iCal, feed URL suscribible (A7), importar `.ics` (B4). |
| **14** | Robustez de producción | Backup (Litestream, §65), métricas + Sentry (§67), offline app-shell con `vite-plugin-pwa`, digest de notificaciones (B6), política de retención revisada (§5.8), rotación de contraseña + share de solo lectura (B10). |

---

## 12. Lo que ya está muy bien (no tocar)

- Capa de socket: reconexión con re-join automático, `awaitAuthResponse` con timeout, `ConnectionBanner`, cola offline. Robusta.
- Concurrencia optimista en notas + `nextTimestamp` monotónico + banner de conflicto + lector adopta en vivo.
- Undo de borrados con ventana de 12 s y ack.
- `safeOn`/`safeAuthedOn`: manejo de errores y autorización uniformes, imposibles de olvidar.
- Rate limiting + validación de payloads en el borde de cada handler.
- Hash de contraseña async, WAL + índices, limpieza de push muertas.
- Suite de 45 tests con `node:test`, incluido el test de contrato que detecta deriva de tipos.
- Estructura del servidor por capas (Tarea A).
- Hooks de dominio en el cliente (Tarea B) con cleanup correcto.
