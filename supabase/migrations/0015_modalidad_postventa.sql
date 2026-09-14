-- Agrega "Postventa" como modalidad válida: proyectos livianos creados
-- después de que una casa ya está Terminada, solo para llevar el registro
-- de gastos posteriores a la entrega (sin etapas ni cronograma — el
-- catálogo de etapas no tiene filas con esta modalidad, así que un proyecto
-- Postventa queda automáticamente sin proyecto_etapas).
alter table proyectos drop constraint proyectos_modalidad_check;
alter table proyectos add constraint proyectos_modalidad_check
  check (modalidad in ('Obra Gruesa Habitable', 'Llave en Mano', 'Postventa'));
