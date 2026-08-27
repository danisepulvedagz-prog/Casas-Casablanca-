-- Etapas que corren en paralelo a la línea secuencial de la obra (no atrasan
-- el resto del proyecto): Ventanas, Deck, Retiro de escombros, etc.
alter table catalogo_etapas add column if not exists es_paralelo boolean not null default false;
