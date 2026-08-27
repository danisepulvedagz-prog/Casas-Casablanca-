-- Nota libre por gasto (ej. "faltó boleta, pagado en efectivo", "sobrante
-- para la próxima etapa"), opcional, sin efecto en ningún cálculo.
alter table gastos add column if not exists notas text;
