-- Rastrea de qué compra específica (gasto de Bodega, con su factura o
-- transferencia real) sale cada despacho, para poder mantener el respaldo
-- real (foto, proveedor, n° de documento) cuando el material llega al
-- proyecto destino, en vez de crear un gasto sin documento de respaldo.
-- El stock pasa de ser "un número total" a rastrear lote por lote (FIFO):
-- cada despacho puede terminar consumiendo de más de una compra si la
-- cantidad pedida cruza el límite de la más antigua.

alter table bodega_despachos add column gasto_origen_id uuid references gastos(id);

-- Backfill del único despacho de prueba ya hecho (esmalte semibrillo gris
-- grafito), que salió de la compra registrada en ese mismo gasto.
update bodega_despachos
set gasto_origen_id = '09fbd634-c8a0-476b-a907-16809978fecf'
where id = '9b0f2fcf-d3a3-404c-8c9a-aad1b47b74cd' and gasto_origen_id is null;

alter table bodega_despachos alter column gasto_origen_id set not null;
