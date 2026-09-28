-- RUT del proveedor (emisor) de la factura — la IA lo lee del documento
-- junto al proveedor y el n° de documento.
alter table facturas add column rut text;
