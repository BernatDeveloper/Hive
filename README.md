# Calendario Compartido

App de organización colaborativa en tiempo real. Los usuarios crean salas
protegidas con contraseña y comparten calendario, listas de tareas y notas —
sin cuentas: el acceso es el nombre de sala + la contraseña.

## Stack

- **client/**: React 19 + Vite + TypeScript + FullCalendar v6 + Socket.io-client
- **server/**: Node.js v22 + Express v5 + Socket.io v4 + better-sqlite3
- **pnpm** en ambos (nunca npm ni yarn)

## Arrancar en local

```bash
# Servidor (puerto 3001) — necesita server/.env, ver server/.env.example
cd server && pnpm install && node index.js

# Cliente (puerto 5173), en otra terminal
cd client && pnpm install && pnpm dev
```

## Tests

```bash
cd server && pnpm test   # node:test — integración de sockets + lógica pura
cd client && pnpm test   # vitest — lógica pura (fechas, iCal, colores, contraseña)
```

Ver [CLAUDE.md](CLAUDE.md) para la arquitectura, el modelo de datos, la
tabla de eventos de Socket.io y las convenciones del proyecto.
