-- Igual patrón que facturas (0009), pero para gastos cuyo único respaldo es
-- el comprobante de una transferencia bancaria (no hay factura/boleta). A
-- diferencia de facturas, siempre tiene un solo gasto hijo.
create table transferencias (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  destinatario text,
  n_operacion text,
  fecha date not null,
  foto_url text,
  monto_total numeric,
  created_at timestamptz default now()
);

create index idx_transferencias_proyecto on transferencias(proyecto_id);

alter table gastos add column if not exists transferencia_id uuid references transferencias(id) on delete cascade;

create index idx_gastos_transferencia on gastos(transferencia_id);

-- Un gasto cuelga de una factura o de una transferencia, nunca de las dos.
alter table gastos add constraint gastos_un_solo_padre
  check (factura_id is null or transferencia_id is null);
