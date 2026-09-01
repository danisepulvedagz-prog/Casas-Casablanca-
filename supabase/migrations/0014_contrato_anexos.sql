-- El presupuesto de la casa ya no es un número libre: se calcula como el 80%
-- de la suma de lo que firma el cliente (Contrato + Anexo 1 + Anexo 2). Los
-- anexos pueden quedar en $0 al principio, se van sumando en el camino.
-- presupuesto_total se sigue guardando (lo sigue leyendo el resto de la app
-- tal cual), pero ahora lo calcula el servidor a partir de estas 3 columnas
-- en vez de venir de un campo libre del formulario.
alter table proyectos
  add column contrato numeric not null default 0,
  add column anexo_1 numeric not null default 0,
  add column anexo_2 numeric not null default 0;

-- Backfill de proyectos existentes: el presupuesto_total que ya tenían pasa
-- a ser el Contrato (despejando la formula: contrato = presupuesto / 0.8),
-- para que el presupuesto calculado les quede igual a como estaba. Los
-- anexos quedan en $0 (default de la columna), editables despues a mano.
update proyectos set contrato = round(presupuesto_total / 0.8);
