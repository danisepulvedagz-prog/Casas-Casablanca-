-- Una factura/boleta puede traer materiales para varias etapas distintas a
-- la vez (ej. cemento para Radier + cable para Electricidad en la misma
-- boleta de ferretería). Por eso la factura es solo la "cabecera" del
-- documento (proveedor, fecha, foto, total) — no tiene una etapa propia — y
-- cada gasto de material que sale de ella (factura_id) sí tiene la suya,
-- pudiendo ser todas distintas entre sí.
create table facturas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  proveedor text,
  n_documento text,
  fecha date not null,
  foto_url text,
  monto_total numeric,
  created_at timestamptz default now()
);

create index idx_facturas_proyecto on facturas(proyecto_id);

-- Nullable a propósito: los gastos cargados a mano (uno por uno, como ya
-- funciona hoy) no tienen factura asociada.
alter table gastos add column if not exists factura_id uuid references facturas(id) on delete cascade;

create index idx_gastos_factura on gastos(factura_id);
