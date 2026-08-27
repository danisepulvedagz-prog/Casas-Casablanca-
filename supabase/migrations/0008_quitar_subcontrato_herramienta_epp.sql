-- Se sacan "Subcontrato", "Herramienta-EPP" y "Otro" como categorías de
-- gasto: no se usaban (0 gastos registrados con esas categorías al momento
-- de este cambio). Quedan solo Material y Mano de Obra. Los gastos que no
-- calcen con ningún material del catálogo se registran igual como Material
-- con el nombre "Otros" (ver gasto-form.tsx), no como categoría aparte.
alter table gastos drop constraint if exists gastos_categoria_check;
alter table gastos add constraint gastos_categoria_check
  check (categoria in ('Material', 'Mano de Obra'));
