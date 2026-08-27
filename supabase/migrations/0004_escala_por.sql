-- Reemplaza escalable_por_m2 (sí/no) por escala_por: un material puede
-- escalar por m² de la casa, por cantidad de baños (artefactos, muebles de
-- baño, etc.) o ser un valor fijo por proyecto (ej. calefón, fosa séptica).
alter table catalogo_materiales add column if not exists escala_por text;

update catalogo_materiales
set escala_por = case when escalable_por_m2 then 'm2' else 'fijo' end
where escala_por is null;

alter table catalogo_materiales alter column escala_por set not null;
alter table catalogo_materiales alter column escala_por set default 'm2';
alter table catalogo_materiales add constraint catalogo_materiales_escala_por_check
  check (escala_por in ('m2', 'banos', 'fijo'));

alter table catalogo_materiales drop column if exists escalable_por_m2;
