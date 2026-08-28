-- Roles de usuario: cada cuenta de auth.users tiene una fila acá con su rol.
-- Sin política de insert/update para "authenticated" a propósito — nadie
-- puede auto-asignarse admin, solo se escribe con el service-role key.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'usuario' check (role in ('admin', 'usuario'))
);

alter table public.profiles enable row level security;

create policy "select_own_profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);
