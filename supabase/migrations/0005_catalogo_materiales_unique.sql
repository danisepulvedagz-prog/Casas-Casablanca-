-- Permite reemplazar el truncate+insert del seed por un upsert no-destructivo:
-- sin esta unique key, "insert ... on conflict" no tiene contra qué comparar
-- y seed.sql tendría que seguir truncando (lo que borra en cascada
-- proyecto_etapas y gastos de proyectos reales, ver incidente 2026-07-29).
alter table catalogo_materiales
  add constraint catalogo_materiales_etapa_material_key unique (etapa_id, material);
