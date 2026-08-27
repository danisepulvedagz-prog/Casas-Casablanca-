-- Esquema inicial: seguimiento de construcción de casas (paneles SIP).
-- Nota de seguridad: RLS queda deshabilitado en esta migración porque la v1
-- no tiene Supabase Auth todavía (paso 9 del plan, opcional). Cuando se agregue
-- login, habilitar RLS en las 5 tablas y agregar políticas para el rol
-- `authenticated` antes de exponer la app fuera del equipo interno.

create extension if not exists "pgcrypto";

-- Catálogo de etapas (semilla fija, no se edita desde la UI en la v1)
create table catalogo_etapas (
  id serial primary key,
  modalidad text not null check (modalidad in ('Obra Gruesa Habitable', 'Llave en Mano')),
  orden int not null,
  nombre text not null,
  duracion_semanas_est numeric not null,
  lead_time_dias_compra int not null,
  unique (modalidad, orden)
);

-- Catálogo de materiales típicos por etapa (referencia para sugerencias de la IA
-- y para los desplegables del formulario de gasto)
create table catalogo_materiales (
  id serial primary key,
  etapa_id int references catalogo_etapas(id) on delete cascade,
  material text not null,
  unidad_default text not null,
  -- false para ítems que no escalan linealmente con m2 (ej. artefactos sanitarios,
  -- kit de entrega): la calculadora de m2 los trata como valor fijo.
  escalable_por_m2 boolean not null default true
);

create index idx_catalogo_materiales_etapa on catalogo_materiales(etapa_id);

-- Proyectos (una fila por casa)
create table proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  modalidad text not null check (modalidad in ('Obra Gruesa Habitable', 'Llave en Mano')),
  m2 numeric not null,
  n_dormitorios int,
  n_banos int,
  tiene_logia boolean default false,
  tiene_deck boolean default false,
  fecha_inicio date not null,
  fecha_termino_estimada date,
  presupuesto_total numeric not null,
  cliente text,
  estado text not null default 'En curso' check (estado in ('En curso', 'Terminado', 'Pausado')),
  es_proyecto_referencia_m2 boolean default false,
  created_at timestamptz default now()
);

-- Avance real de cada etapa por proyecto
create table proyecto_etapas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  etapa_id int references catalogo_etapas(id),
  fecha_inicio_plan date,
  fecha_fin_plan date,
  fecha_inicio_real date,
  fecha_fin_real date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'terminada')),
  unique (proyecto_id, etapa_id)
);

create index idx_proyecto_etapas_proyecto on proyecto_etapas(proyecto_id);

-- Gastos (una fila por ítem de boleta/factura)
create table gastos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  etapa_id int references catalogo_etapas(id),
  categoria text not null check (categoria in ('Material', 'Mano de Obra', 'Subcontrato', 'Herramienta-EPP', 'Otro')),
  material text,
  cantidad numeric,
  unidad text,
  costo_unitario numeric, -- calculado = monto_total / cantidad cuando corresponde
  monto_total numeric not null,
  proveedor text,
  n_documento text,
  foto_boleta_url text, -- ruta en Supabase Storage
  registrado_por text,
  reembolso boolean default false,
  fecha date not null,
  created_at timestamptz default now()
);

create index idx_gastos_proyecto on gastos(proyecto_id);
create index idx_gastos_etapa on gastos(etapa_id);
create index idx_gastos_categoria on gastos(categoria);

-- Bucket de Storage para fotos de boletas/facturas.
insert into storage.buckets (id, name, public)
values ('boletas', 'boletas', false)
on conflict (id) do nothing;
