-- El despacho ahora RESTA de la compra original en Bodega (o la borra si se
-- despachó todo) en vez de dejarla intacta y duplicar el monto bajo la misma
-- factura. Si la compra queda en 0 y se borra, bodega_despachos.gasto_origen_id
-- ya no puede ser NOT NULL con referencia obligatoria — queda nullable, y se
-- pone en null automáticamente si el gasto de origen se borra (el resto de la
-- info del despacho, para el historial, ya quedó copiada en la propia fila).

alter table bodega_despachos alter column gasto_origen_id drop not null;

alter table bodega_despachos drop constraint bodega_despachos_gasto_origen_id_fkey;
alter table bodega_despachos add constraint bodega_despachos_gasto_origen_id_fkey
  foreign key (gasto_origen_id) references gastos(id) on delete set null;
