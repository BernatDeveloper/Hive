# Hive

Organización colaborativa en tiempo real para grupos: pareja, familia, piso, amigos o equipo. Cada grupo
tiene una **sala** protegida con contraseña y comparte en ella:

- **Calendario** — vistas mes/día, eventos recurrentes, arrastrar para mover, recordatorios push.
- **Listas** — tareas o compra, con progreso y "quién la modificó por última vez".
- **Notas** — con checklists, fijadas y edición concurrente segura.
- **Marcadores** — guarda enlaces (también desde "Compartir" del móvil) con vista previa, etiquetas y filtros.
- **Gastos** — próximamente.

Sin cuentas: se entra con el nombre de la sala y su contraseña. Cada dispositivo elige un nombre y un color
para que el resto vea quién está conectado y quién hizo cada cambio. Es una PWA instalable.

## Stack

- **client/** — React 19 + Vite + TypeScript + FullCalendar v6 + Socket.io-client
- **server/** — Node.js 22 + Express 5 + Socket.io 4 + better-sqlite3 (SQLite)
- **pnpm** en ambos (nunca npm ni yarn)

## Arrancar en local

```bash
# Servidor (puerto 3001) — necesita server/.env, ver server/.env.example
cd server && pnpm install && node index.js

# Cliente (puerto 5173), en otra terminal
cd client && pnpm install && pnpm dev
```

En Windows, **para el servidor antes de `pnpm install`/`pnpm update`**: mientras está en marcha bloquea el
binario de `better-sqlite3` y la instalación queda a medias (ver CLAUDE.md, "Nota Windows").

## Tests

```bash
cd server && pnpm test   # node:test — integración de sockets, seguridad y lógica pura
cd client && pnpm test   # vitest — lógica pura (fechas, iCal, marcadores, rutas…)
```

## Despliegue

El servidor necesita un proceso siempre activo (WebSockets) y un disco persistente para SQLite; el cliente
es estático (Vercel u otro). Variables, cabeceras de seguridad y protección frente a abuso: ver
[CLAUDE.md](CLAUDE.md) ("Protección frente a abuso" y "Para deploy").

## Documentación

- [CLAUDE.md](CLAUDE.md) — arquitectura, modelo de datos, eventos de Socket.io y convenciones.
- [docs/NOTIFICACIONES.md](docs/NOTIFICACIONES.md) — notificaciones push.
- [docs/historial/](docs/historial/) — documentos de planificación de fases anteriores (con el nombre antiguo
  del proyecto, "Calendario Compartido").
