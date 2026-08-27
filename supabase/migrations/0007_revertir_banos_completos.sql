-- Se revierte la distinción "banos_completos" (baños con ducha vs. medio
-- baño/visita): quedó como complejidad innecesaria para cargar materiales.
-- Todo lo que escalaba por "banos_completos" vuelve a "banos" simple.
update catalogo_materiales set escala_por = 'banos' where escala_por = 'banos_completos';

alter table catalogo_materiales drop constraint if exists catalogo_materiales_escala_por_check;
alter table catalogo_materiales add constraint catalogo_materiales_escala_por_check
  check (escala_por in ('m2', 'banos', 'fijo'));
