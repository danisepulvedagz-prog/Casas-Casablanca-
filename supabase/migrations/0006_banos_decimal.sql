-- n_banos ahora acepta medios baños (ej. 2.5 = 2 baños completos + 1 baño de
-- visita con wc y lavamanos, sin ducha). Antes era int, solo enteros.
alter table proyectos alter column n_banos type numeric using n_banos::numeric;
alter table proyectos add constraint proyectos_n_banos_check
  check (n_banos is null or n_banos = round(n_banos * 2) / 2);

-- Nueva base de escala "banos_completos": para artefactos que un baño de
-- visita no tiene (ducha/receptáculo, mampara y su escuadra). A diferencia
-- de "banos" (que usa n_banos tal cual), "banos_completos" descarta el medio
-- baño con floor(n_banos) antes de escalar.
alter table catalogo_materiales drop constraint if exists catalogo_materiales_escala_por_check;
alter table catalogo_materiales add constraint catalogo_materiales_escala_por_check
  check (escala_por in ('m2', 'banos', 'banos_completos', 'fijo'));
