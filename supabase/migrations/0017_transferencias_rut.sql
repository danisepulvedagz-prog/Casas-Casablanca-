-- RUT del destinatario de la transferencia, cuando el comprobante lo trae
-- (mismo tratamiento que facturas.rut, agregado en 0016).
alter table transferencias add column rut text;
