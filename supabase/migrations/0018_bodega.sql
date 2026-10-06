-- Agrega "Bodega" como modalidad válida: un único proyecto especial, sin
-- etapas ni cronograma (igual que Postventa), que sirve como depósito común.
-- Las compras hacia Bodega son gastos normales (mismo asistente de siempre,
-- sin etapa, igual que ya permite Postventa). Los despachos hacia un proyecto
-- real quedan registrados en bodega_despachos, y cada despacho genera un
-- gasto normal en el proyecto destino (con su etapa correspondiente).

alter table proyectos drop constraint proyectos_modalidad_check;
alter table proyectos add constraint proyectos_modalidad_check
  check (modalidad in ('Obra Gruesa Habitable', 'Llave en Mano', 'Postventa', 'Bodega'));

insert into proyectos (nombre, modalidad, m2, fecha_inicio, presupuesto_total, estado)
values ('Bodega', 'Bodega', 0, current_date, 0, 'En curso');

create table bodega_despachos (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  cantidad numeric not null,
  unidad text,
  costo_unitario numeric not null,
  proyecto_destino_id uuid not null references proyectos(id),
  gasto_generado_id uuid not null references gastos(id),
  fecha date not null,
  registrado_por text,
  notas text,
  created_at timestamptz not null default now()
);

create index idx_bodega_despachos_proyecto on bodega_despachos(proyecto_destino_id);

alter table bodega_despachos enable row level security;

create policy "authenticated_full_access" on bodega_despachos
  for all to authenticated using (true) with check (true);
