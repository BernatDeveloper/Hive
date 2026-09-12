// Reservado para futuras migraciones (ALTER TABLE) sobre una DB con datos
// reales. Hoy el proyecto no está desplegado y no tiene datos, así que el
// esquema completo vive en createSchema() (schema.js) — ver MEJORAS-2.md,
// Fase 7.1. Cuando haga falta migrar de verdad: comprobar con
// `PRAGMA table_info(<tabla>)` antes de cada `ALTER TABLE ADD COLUMN`.
export function runMigrations() {}
