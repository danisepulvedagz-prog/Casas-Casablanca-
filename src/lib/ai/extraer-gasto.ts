import "server-only";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

/**
 * Toda la lógica específica del proveedor de IA vive en este único archivo.
 * Si en algún momento se cambia de proveedor, solo hay que reescribir esta
 * función — el resto de la app llama a extraerDatosDeFoto() (en actions.ts)
 * sin saber qué proveedor hay detrás.
 */

export interface ItemFacturaExtraido {
  material: string | null;
  cantidad: number | null;
  unidad: string | null;
  costo_unitario: number | null;
  monto_total: number | null;
  // Sugerencia de la IA sobre a qué etapa pertenece este ítem en particular
  // (una misma factura puede tener ítems de etapas distintas). Se compara
  // contra el catálogo de etapas real del proyecto — siempre editable.
  etapa_id: number | null;
}

export interface FacturaExtraida {
  proveedor: string | null;
  n_documento: string | null;
  fecha: string | null; // YYYY-MM-DD
  monto_total: number | null;
  items: ItemFacturaExtraido[];
}

export interface DatosTransferenciaExtraidos {
  destinatario: string | null;
  n_operacion: string | null;
  monto_total: number | null;
  fecha: string | null; // YYYY-MM-DD
}

interface CatalogoMaterialPrompt {
  material: string;
  etapaId: number;
  unidad: string;
}

function construirPromptFactura(
  etapas: { id: number; nombre: string }[],
  catalogoMateriales: CatalogoMaterialPrompt[]
): string {
  const listaEtapas = etapas.map((e) => `${e.id}: ${e.nombre}`).join("\n");
  const listaCatalogo = catalogoMateriales
    .map((m) => `"${m.material}" (unidad: ${m.unidad}) -> etapa ${m.etapaId}`)
    .join("\n");

  return `Eres un asistente que extrae datos de fotos o PDF de facturas o boletas chilenas de materiales de construcción.
Una misma boleta suele traer VARIOS productos distintos — identifica cada uno como un ítem separado, no los resumas en uno solo.

Estas son las etapas de obra disponibles del proyecto (id: nombre):
${listaEtapas}

Este es el catálogo real de materiales de la empresa, con su etapa y unidad correctas (nombre -> etapa):
${listaCatalogo}

Para cada ítem que identifiques en el documento:
- Compáralo contra el catálogo de arriba. Los productos casi nunca van a coincidir con el nombre EXACTO
  del catálogo — el documento puede traer marca comercial, código interno, tamaño de envase, etc.
  (ej. "MANGA POLIET.RECICL. NEGRA 100 MTS" es el mismo producto que "Polietileno negro" del catálogo;
  "CLAVO 4\" (25KG) I (1203050)(140104) . KG" es el mismo producto que "Clavos 4\"" del catálogo;
  "Adhesivo PVC Hoffens 240cc secado rápido tarro" es el mismo producto que "Vinilit" del catálogo —
  ojo que "Vinilit" existe en más de una etapa del catálogo (Electricidad y Sanitarios): este es el
  adhesivo/pegamento para tuberías PVC, así que va con el "Vinilit" de la etapa Sanitarios, no el de Electricidad;
  "Metalcon perfil AT 25 x 20 x 4 x..." (o cualquier variante de medidas de ese perfil AT) es el mismo producto
  que "Perfiles de borde" de la etapa Cielo falso — son los perfiles metálicos de borde del cielo falso;
  "Perfil perimetral" o "perfiles perimetrales" de cielo falso es el mismo producto que "Perfiles de borde" —
  son dos nombres para lo mismo, usa siempre "Perfiles de borde";
  "Fibrocemento 6mm 1.2 x 2.4 mts base cerámica Pizarreño" (o variantes de medidas/espesor de fibrocemento
  Pizarreño) es el mismo producto que "Internit" de la etapa Volcanita muros;
  "Disco de sierra 7 1/4\" 30 dientes eje 16mm" o "Disco diamantado turbo corta porcelanato" (o cualquier
  variante de medidas/dientes/eje de disco de corte para sierra circular o amoladora) es el mismo producto
  que "Discos" de la etapa Instalación porcelanato;
  "Adisol" es el mismo producto que "Puente adherente" de la etapa Afinado de piso).
- Si encuentras una coincidencia razonable, usa EXACTAMENTE el nombre de material y la etapa del catálogo
  (copia el nombre tal cual está entre comillas arriba, no inventes variaciones) — no uses el nombre ni la
  redacción del documento en ese caso.
- Solo si el producto no se parece a nada del catálogo, usa el nombre tal como aparece en el documento
  (limpio, sin códigos internos ni referencias entre paréntesis) y etapa_id null.

Para el monto de cada línea (el "monto_total" de cada ítem): usa el número que el documento ya trae impreso
en la columna del subtotal/total de esa línea (a veces se llama "Total", "Subtotal" o similar) — NO lo calcules
tú mismo multiplicando cantidad por precio unitario, sobre todo si el documento trae columnas separadas de
Precio, Descuento y Total: en esos casos el Total impreso ya incluye el descuento aplicado, y calcularlo a mano
te va a dar un número distinto (equivocado) al que realmente aparece en el documento. Si por algún motivo esa
columna no es legible con confianza, usa null en vez de inventar o calcular un número.

Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "proveedor": string o null (nombre del local/empresa que emite el documento),
  "n_documento": string o null (número de boleta, factura o cotización),
  "fecha": string o null (formato YYYY-MM-DD),
  "monto_total": number o null (monto total del documento completo, en pesos chilenos, sin puntos ni símbolos),
  "items": [
    {
      "material": string o null (nombre del producto — del catálogo si hay coincidencia, si no del documento),
      "cantidad": number o null,
      "unidad": string o null (la del catálogo si hay coincidencia; si no, ej: "un", "saco", "m2", "kg", "rollo"),
      "costo_unitario": number o null (precio unitario en pesos chilenos),
      "monto_total": number o null (el subtotal de esta línea TAL COMO APARECE IMPRESO en el documento, no calculado),
      "etapa_id": number o null (la etapa del catálogo si hubo coincidencia; null si no la hay)
    }
  ]
}
Si no puedes leer un dato con confianza, usa null en ese campo en vez de adivinar. Incluye un objeto dentro de "items" por cada producto distinto que identifiques en el documento.`;
}

const PROMPT_TRANSFERENCIA = `Eres un asistente que extrae datos de capturas de pantalla de transferencias bancarias chilenas.
Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "destinatario": string o null (nombre de la persona o empresa a la que se transfirió, tal como aparece en el comprobante),
  "n_operacion": string o null (número de operación, folio o comprobante de la transferencia),
  "monto_total": number o null (monto transferido en pesos chilenos, sin puntos ni símbolos),
  "fecha": string o null (formato YYYY-MM-DD)
}
Si no puedes leer un dato con confianza, usa null en ese campo en vez de adivinar.`;

const IVA = 0.19;
const TOLERANCIA_CUADRE = 0.03; // 3% de margen, por redondeos de la IA al sumar

/**
 * Las boletas suelen imprimir el precio unitario/subtotal de cada línea SIN
 * IVA, y recién suman el IVA una vez al final (monto_total del documento).
 * Si la suma de los ítems no calza con ese total, pero sí calza multiplicando
 * por 1.19, es que los montos venían netos — se ajustan para que reflejen la
 * plata real gastada. Si la suma ya calzaba tal cual, es que ya incluían IVA
 * y no se toca nada. Si no calza de ninguna de las dos formas (ej. faltan
 * ítems por leer), tampoco se toca — mejor no adivinar y que se revise a mano.
 */
function corregirIvaItems(data: FacturaExtraida): FacturaExtraida {
  const sumaItems = data.items.reduce((s, it) => s + (it.monto_total ?? 0), 0);
  if (data.monto_total == null || sumaItems <= 0) return data;

  const yaCalza = Math.abs(data.monto_total - sumaItems) <= data.monto_total * TOLERANCIA_CUADRE;
  if (yaCalza) return data;

  const sumaConIva = sumaItems * (1 + IVA);
  const calzaConIva = Math.abs(data.monto_total - sumaConIva) <= data.monto_total * TOLERANCIA_CUADRE;
  if (!calzaConIva) return data;

  return {
    ...data,
    items: data.items.map((it) => ({
      ...it,
      monto_total: it.monto_total != null ? Math.round(it.monto_total * (1 + IVA)) : null,
    })),
  };
}

function limpiarRespuestaJSON(texto: string): string {
  // El modelo a veces envuelve la respuesta en ```json ... ``` a pesar de pedir JSON puro.
  return texto
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "")
    .trim();
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizarMediaType(mimeType: string): ImageMediaType {
  if (mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

// Códigos de error transitorios de la API de Anthropic — vale la pena
// reintentar (servidor saturado, rate limit, error interno pasajero), a
// diferencia de un 400/401 que va a fallar siempre igual.
const STATUS_REINTENTABLES = new Set([408, 429, 500, 502, 503, 529]);
const REINTENTOS = 2; // 3 intentos en total

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function llamarClaude(
  prompt: string,
  archivoBase64: string,
  mimeType: string,
  maxTokens: number
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY en el servidor.");
  }

  // Claude lee PDF directo (facturas electrónicas suelen venir así, no solo
  // como foto); cualquier otra cosa se manda como imagen.
  const bloqueArchivo =
    mimeType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: archivoBase64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: normalizarMediaType(mimeType), data: archivoBase64 },
        } as const);

  const client = new Anthropic({ apiKey });

  for (let intento = 0; ; intento++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [bloqueArchivo, { type: "text", text: prompt }],
          },
        ],
      });

      const bloqueTexto = response.content.find((b) => b.type === "text");
      const texto = bloqueTexto && "text" in bloqueTexto ? bloqueTexto.text : "";
      if (!texto) throw new Error("La IA no devolvió ninguna respuesta.");
      return texto;
    } catch (err) {
      const status = err instanceof APIError ? err.status : undefined;
      const quedanReintentos = intento < REINTENTOS;
      if (status != null && STATUS_REINTENTABLES.has(status) && quedanReintentos) {
        await esperar(1000 * (intento + 1)); // 1s, luego 2s
        continue;
      }
      if (status === 529) {
        throw new Error(
          "Los servidores de la IA están saturados en este momento. Intenta de nuevo en unos segundos."
        );
      }
      throw err;
    }
  }
}

export async function extraerItemsFactura(
  imagenBase64: string,
  mimeType: string,
  etapas: { id: number; nombre: string }[],
  catalogoMateriales: CatalogoMaterialPrompt[]
): Promise<FacturaExtraida> {
  const prompt = construirPromptFactura(etapas, catalogoMateriales);
  const texto = await llamarClaude(prompt, imagenBase64, mimeType, 4096);
  let parsed: unknown;
  try {
    parsed = JSON.parse(limpiarRespuestaJSON(texto));
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la IA. Intenta con otra foto más nítida.");
  }

  const p = parsed as Partial<FacturaExtraida>;
  return corregirIvaItems({
    proveedor: p.proveedor ?? null,
    n_documento: p.n_documento ?? null,
    fecha: p.fecha ?? null,
    monto_total: p.monto_total ?? null,
    items: Array.isArray(p.items) ? p.items : [],
  });
}

export async function extraerDatosTransferencia(
  imagenBase64: string,
  mimeType: string
): Promise<DatosTransferenciaExtraidos> {
  const texto = await llamarClaude(PROMPT_TRANSFERENCIA, imagenBase64, mimeType, 1024);
  try {
    return JSON.parse(limpiarRespuestaJSON(texto));
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la IA. Intenta con otra foto más nítida.");
  }
}
