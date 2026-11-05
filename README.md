# Casas Casablanca — Sistema de Seguimiento de Construcción

Aplicación web interna de **Casas Casablanca** para administrar la construcción de
sus proyectos de principio a fin: qué etapa de obra va en curso, qué se ha
comprado y qué falta, cuánto se ha gastado contra el presupuesto, y un stock
centralizado (Bodega) para materiales que se compran por adelantado y se
reparten entre proyectos. Reemplaza planillas sueltas por una sola fuente de
verdad que cualquiera del equipo puede consultar desde el celular o el PC.

## Qué hace la plataforma

- **Proyectos y etapas de obra**: cada proyecto (Llave en Mano, Postventa o la
  Bodega interna) tiene su propio cronograma de etapas con fecha planificada y
  real. Una etapa pasa a "en curso" automáticamente apenas se registra la
  primera compra de material asociada, sin tener que marcarla a mano.
- **Gastos con lectura de boletas por IA**: se sube una foto o PDF de una
  factura/boleta/transferencia y la IA (Claude, de Anthropic) identifica cada
  producto, lo relaciona con el catálogo real de materiales de la empresa y
  sugiere la etapa correspondiente — todo editable antes de guardar. Una misma
  factura puede repartirse entre varios proyectos.
- **Catálogo de materiales**: lista maestra de materiales por etapa (nombre,
  unidad), que alimenta tanto el reconocimiento automático de boletas como los
  formularios manuales.
- **Bodega**: compra centralizada de materiales que todavía no tienen proyecto
  asignado. Lleva stock por material (con sus compras de origen, foto y
  factura/transferencia de respaldo) y permite despacharlos a un proyecto real
  cuando corresponde, con sugerencia de material/etapa por IA al despachar.
- **Presupuesto vs. gasto real** y **alertas de compra** por etapa, para saber
  a tiempo qué falta comprar antes de que una etapa empiece.
- **Resumen semanal**: vista agregada de avance y alertas de todos los
  proyectos activos, pensada para la revisión semanal del equipo.
- **Calculadora de materiales por m²**, para estimar cantidades antes de
  comprar.
- **Roles de acceso**: cuentas `admin` (acceso completo) y `usuario` (acotado a
  Agregar gasto, Catálogo y Bodega), controlado por Supabase Auth + middleware.
- **Exportación a Excel** de los gastos filtrados de un proyecto.

## Stack técnico

- **[Next.js](https://nextjs.org) 16 (App Router) + React 19 + TypeScript** —
  el framework de la aplicación. Usa *Server Components* (la mayoría de las
  páginas renderizan en el servidor, trayendo los datos de Supabase antes de
  mandar HTML al navegador) y *Server Actions* (funciones `"use server"` que
  el formulario llama directo, sin tener que escribir una API REST aparte)
  para todo lo que escribe datos: crear/editar/borrar proyectos, gastos,
  facturas, despachos de Bodega, etc.
- **[Tailwind CSS](https://tailwindcss.com) v4** — estilos, con la paleta de
  marca (verde `--brand`) y modo oscuro definidos en `src/app/globals.css`.
- **[Supabase](https://supabase.com)** — backend como servicio:
  - **Postgres** como base de datos (esquema completo en `supabase/migrations/`).
  - **Auth** para el login del equipo.
  - **Storage** (bucket privado `boletas`) para las fotos de facturas,
    transferencias y comprobantes, servidas con URLs firmadas de corta
    duración.
  - **RLS (Row Level Security)** habilitado: las tablas solo son accesibles
    para usuarios autenticados; algunas operaciones de mantenimiento se hacen
    con la `service_role` key, que nunca se expone al navegador.
- **[Anthropic API](https://docs.anthropic.com) (Claude, con visión)** — lee
  fotos/PDF de boletas y transferencias y devuelve los datos estructurados
  (proveedor, items, montos, etapa sugerida), reutilizando siempre el mismo
  catálogo de sinonimias de materiales aprendido con el tiempo
  (`src/lib/ai/extraer-gasto.ts`).
- **[Recharts](https://recharts.org)** — gráficos de avance/gasto.
- **[xlsx](https://www.npmjs.com/package/xlsx)** — exportación de gastos a
  Excel.
- **pnpm** como gestor de paquetes.

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
6. Agregar tu API key de Anthropic en `ANTHROPIC_API_KEY` (necesaria para la
   lectura de boletas con IA).

### 3. Aplicar las migraciones y el seed

Opción A — con la [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>   # está en la URL del dashboard
pnpm dlx supabase db push                             # aplica todo supabase/migrations/, en orden
pnpm dlx supabase db execute -f supabase/seed.sql      # carga el seed de catálogos
```

Opción B — manual desde el dashboard:

1. **SQL Editor** → pegar y ejecutar, EN ORDEN, cada archivo de
   `supabase/migrations/` (del `0001_...` al más reciente). La
   `service_role` key que usa la app para scripts puntuales no puede
   ejecutar DDL, así que las migraciones siempre se corren así, a mano.
2. Luego pegar y ejecutar el contenido de `supabase/seed.sql` (catálogo base
   de etapas y materiales).

### 4. Crear el storage bucket

En **Storage**, crear un bucket privado llamado `boletas` (ahí se guardan las
fotos de facturas/transferencias/comprobantes).

### 5. Correr la app

```bash
pnpm dev
```

Abrir http://localhost:3000.

### Antes de un deploy

```bash
pnpm exec tsc --noEmit    # chequeo de tipos
pnpm lint                 # eslint
pnpm build                # build de producción
```

## Notas de seguridad

- RLS está habilitado (migración `0012_rls_auth.sql`) — todas las tablas
  requieren un usuario autenticado. Los roles (`admin` / `usuario`) viven en
  la tabla `profiles` (`0013_profiles_roles.sql`) y se validan tanto en
  `src/middleware.ts` (bloquea rutas no permitidas para `usuario`) como en
  cada Server Action sensible.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo se usan desde el
  servidor (Server Components / Server Actions, archivos marcados
  `"server-only"`) — nunca se exponen al cliente.
- Las fotos de boletas viven en un bucket privado de Storage; se acceden con
  URLs firmadas de corta duración, nunca con una URL pública fija.

## Estructura relevante

```
src/
  app/
    proyectos/[id]/        Ficha de un proyecto: etapas, gastos, presupuesto, checklist
    gastos/nuevo/           Asistente global "Agregar gasto" (elige proyecto primero)
    bodega/                 Stock, despacho y compras registradas de Bodega
    catalogo-materiales/    CRUD del catálogo de materiales por etapa
    resumen/                Resumen semanal de avance/alertas de todos los proyectos
    calculadora-m2/         Calculadora de materiales por m²
    login/                  Autenticación
  lib/
    ai/extraer-gasto.ts     Prompts y llamadas a Claude para leer boletas/transferencias
    bodega.ts               Cálculo de stock FIFO de Bodega
    etapas.ts               Lógica de etapas por modalidad de proyecto
    resumen-proyecto.ts     Cálculo de avance/alertas para el resumen semanal
    supabase/                Clientes de Supabase (browser, server, admin) y tipos del esquema
supabase/
  migrations/               Esquema completo, una migración por cambio (orden cronológico)
  seed.sql                  Catálogo base de etapas y materiales
```

Los tipos de TypeScript del esquema (`src/lib/supabase/types.ts`) se
regeneran con:

```bash
pnpm dlx supabase gen types typescript --project-id <id>
```
