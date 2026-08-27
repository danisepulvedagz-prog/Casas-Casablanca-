-- Tipo de techo del proyecto: define qué materiales de techumbre aplican
-- (Mediterráneo: plancha lisa zinc + 5V Zincalum; Inclinado: teja asfáltica
-- o zinc prepintado, a elección del cliente).
alter table proyectos add column if not exists tipo_techo text
  check (tipo_techo in ('Mediterráneo', 'Inclinado'));

alter table proyectos add column if not exists opcion_techo_inclinado text
  check (opcion_techo_inclinado in ('Teja asfáltica', 'Zinc prepintado'));
