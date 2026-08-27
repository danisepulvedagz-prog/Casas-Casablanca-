-- Habilita Row Level Security en todas las tablas y exige sesión autenticada
-- (Supabase Auth) para leer o escribir. Es un equipo chico donde todos ven
-- todo, así que no hay restricción por fila — solo se corta el acceso de la
-- clave "anon" sin sesión, que hoy podía leer y escribir todo sin login.

alter table public.proyectos enable row level security;
alter table public.catalogo_etapas enable row level security;
alter table public.catalogo_materiales enable row level security;
alter table public.proyecto_etapas enable row level security;
alter table public.gastos enable row level security;
alter table public.facturas enable row level security;
alter table public.transferencias enable row level security;

create policy "authenticated_full_access" on public.proyectos
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.catalogo_etapas
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.catalogo_materiales
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.proyecto_etapas
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.gastos
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.facturas
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on public.transferencias
  for all to authenticated using (true) with check (true);
