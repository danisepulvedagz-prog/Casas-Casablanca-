# Casas Casablanca — Seguimiento de Construcción

Sistema interno para seguimiento de avance de obra, alertas de compra por etapa,
presupuesto vs. gasto real, calculadora de materiales por m² y lectura de
boletas con IA.

Stack: Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres/Auth/Storage)
+ Anthropic API (visión, para boletas) + recharts.

## Setup

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Crear el proyecto de Supabase

1. Crear una cuenta / iniciar sesión en https://supabase.com.
2. "New project" → elegir organización, nombre (ej. `casas-casablanca`),
   contraseña de base de datos y región (la más cercana a Chile disponible).
3. Esperar a que aprovisione (1-2 min).
4. En **Project Settings → API** copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secreta) → `SUPABASE_SERVICE_ROLE_KEY`
5. Pegar esos valores en `.env.local` (ya está creado en la raíz, ignorado por git).
6. Agregar tu API key de Anthropic en `ANTHROPIC_API_KEY` (para el paso 8 del plan,
   lectura de boletas — no es necesaria todavía).

### 3. Aplicar el esquema y el seed

Opción A — con la [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>   # está en la URL del dashboard
pnpm dlx supabase db push                             # aplica supabase/migrations/
pnpm dlx supabase db execute -f supabase/seed.sql      # carga el seed de catálogos
```

Opción B — manual desde el dashboard:

1. **SQL Editor** → pegar y ejecutar el contenido de `supabase/migrations/0001_initial_schema.sql`.
2. Luego pegar y ejecutar el contenido de `supabase/seed.sql`
   (33 etapas y 113 materiales, ya completo).

### 4. Correr la app

```bash
pnpm dev
```

Abrir http://localhost:3000.

## Notas de seguridad

- La migración inicial deja RLS **deshabilitado** en las 5 tablas porque la v1
  no tiene login todavía (Supabase Auth es el paso 9, opcional). Antes de dar
  acceso fuera del equipo interno, habilitar RLS y agregar políticas para el
  rol `authenticated`.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo se usan desde el
  servidor (API routes / server components) — nunca se exponen al cliente.

## Estructura relevante

- `supabase/migrations/0001_initial_schema.sql` — esquema completo.
- `supabase/seed.sql` — catálogo de 33 etapas y 113 materiales.
- `src/lib/supabase/client.ts` — cliente Supabase para Client Components.
- `src/lib/supabase/server.ts` — cliente Supabase para Server Components/Actions.
- `src/lib/supabase/admin.ts` — cliente con `service_role`, solo server-only.
- `src/lib/supabase/types.ts` — tipos TS del esquema (regenerar con
  `pnpm dlx supabase gen types typescript --project-id <id>` una vez enlazado el proyecto).
