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
  rut: string | null;
  n_documento: string | null;
  fecha: string | null; // YYYY-MM-DD
  monto_total: number | null;
  items: ItemFacturaExtraido[];
}

export interface DatosTransferenciaExtraidos {
  destinatario: string | null;
  rut: string | null;
  n_operacion: string | null;
  monto_total: number | null;
  fecha: string | null; // YYYY-MM-DD
}

export interface CatalogoMaterialPrompt {
  material: string;
  etapaId: number;
  unidad: string;
}

export interface EtapaPrompt {
  id: number;
  nombre: string;
  // Rango de fechas de ESTE proyecto para esta etapa (si ya se registró) —
  // sirve para desambiguar cuando un material existe en más de una etapa del
  // catálogo con el mismo nombre (ver REGLA_DESAMBIGUAR_POR_FECHA más abajo).
  fechaInicioPlan: string | null;
  fechaFinPlan: string | null;
  fechaInicioReal: string | null;
  fechaFinReal: string | null;
}

// Compartido entre el prompt que lee boletas (construirPromptFactura) y el
// que sugiere a qué material del catálogo corresponde algo al despachar
// desde Bodega (sugerirMaterialCatalogo) — toda sinonimia/criterio de
// coincidencia aprendido acá (marcas, códigos, casos ambiguos) debe servir
// para los dos casos por igual, no solo para el que se escribió primero.
const EJEMPLOS_Y_REGLAS_CATALOGO = `Compáralo contra el catálogo. Los productos casi nunca van a coincidir con el nombre EXACTO
del catálogo — puede traer marca comercial, código interno, tamaño de envase, etc.
(ej. "MANGA POLIET.RECICL. NEGRA 100 MTS" es el mismo producto que "Polietileno negro" del catálogo;
  "CLAVO 4\" (25KG) I (1203050)(140104) . KG" es el mismo producto que "Clavos 4\"" del catálogo;
  "Adhesivo PVC Hoffens 240cc secado rápido tarro" es el mismo producto que "Vinilit" del catálogo —
  ojo que "Vinilit" existe en más de una etapa del catálogo (Electricidad y Sanitarios): este es el
  adhesivo/pegamento para tuberías PVC, así que va con el "Vinilit" de la etapa Sanitarios, no el de Electricidad;
  "Metalcon perfil AT 25 x 20 x 4 x..." (o cualquier variante de medidas de ese perfil AT) es el mismo producto
  que "Perfiles de borde" de la etapa Cielo falso — son los perfiles metálicos de borde del cielo falso;
  "Perfil perimetral" o "perfiles perimetrales" de cielo falso es el mismo producto que "Perfiles de borde" —
  son dos nombres para lo mismo, usa siempre "Perfiles de borde";
  "Metalcon Port 40R", "Metalcon portante" o "Perfiles omega" (cualquiera de estos tres nombres) es el mismo
  producto que "Perfil portante cielo" de la etapa Cielo falso — usa siempre "Perfil portante cielo";
  "Pino verde bruto 2x4" (o cualquier variante de "pino verde" en dimensión 2x4) es "Madera deck" de la
  etapa Deck exterior — es la madera para construir el deck, no confundir con la madera de estructura;
  "Fibrocemento 6mm 1.2 x 2.4 mts base cerámica Pizarreño" (o variantes de medidas/espesor de fibrocemento
  Pizarreño) es el mismo producto que "Internit" de la etapa Cielo falso y muro de volcanita;
  "Disco de sierra 7 1/4\" 30 dientes eje 16mm" o "Disco diamantado turbo corta porcelanato" (o cualquier
  variante de medidas/dientes/eje de disco de corte para sierra circular o amoladora) es el mismo producto
  que "Discos" de la etapa Instalación porcelanato;
  "Adisol" (incluida la variante "Adisol Latex", aunque venga en una boleta junto a brochas, rodillos u
  otros insumos de pintura) es el mismo producto que "Puente adherente" de la etapa Afinado de piso;
  una línea de boleta que diga "Puerta Ext" seguido de una especie de madera como "Pino Italia" (ej. "PUERTA
  EXT PINO ITALIA 80X200") es en realidad una "Puerta Interior" de la etapa Puertas interiores y exteriores
  — a pesar de decir "Ext" en la abreviatura, ese producto puntual siempre es la puerta interior, no la
  exterior; la puerta exterior real casi siempre aparece en las boletas como "Puerta de Lenga" (o variantes
  con esa madera) — usa "Puerta Exterior" del catálogo para esa;
  "Tornillo Chipboard 14 (6.0) x 100/60" y "Turbo 4\"" son el mismo tornillo con dos nombres distintos —
  usa siempre "Turbo 4\""; de la misma forma, "Tornillo Chipboard 14 (6.0) x 160/72" es "Turbo 6\"", y
  "Tornillo Chipboard 14 (6.0) x 140/72" es "Turbo 5 1/2\""; "Tornillo Chipboard 8 (4.0) x 25" es "Turbo 1\"";
  "Tornillo Chipboard 8 (4.0) x 40" es "Turbo 1,5\"" — en todos estos casos de tornillos Chipboard/Turbo,
  siempre usa el nombre "Turbo ..." del catálogo;
  "Tornillo Zincado CRS B-Phillips 6-9 x 1 5/8" (o variantes con esas mismas medidas) es el mismo producto
  que "Tornillo CRS 6-9 x 1 5/8" del catálogo — usa siempre el nombre del catálogo;
  "Perno de anclaje" y "Perno de expansión" son dos nombres para el mismo tipo de producto — en las boletas
  aparecen indistintamente para el mismo perno, así que al buscar coincidencia en el catálogo compara por
  diámetro y largo sin importar cuál de los dos nombres traiga la boleta ni cuál tenga el catálogo;
  una boleta que traiga dos líneas de "Tira, Marco... Madera Lenga..." (marcos de puerta) con distinto
  "LARGO" es porque una es el marco horizontal y la otra el vertical: el LARGO más corto (~1100mm) es
  "Marcos de lenga horizontales" y el LARGO más largo (~2200mm, similar a la altura de una puerta) es
  "Marcos de lenga verticales", ambos de la etapa Puertas interiores y exteriores;
  "VOLCANITA ST BR" (o cualquier variante de espesor/medida de volcanita estándar de bordes rebajados) es la
  "Volcanita" del catálogo — no se distingue entre cielo y muro, es un solo material genérico;
  a veces la boleta de cable eléctrico solo trae el código, sin decir el color — usa este código para saber
  el color y el espesor: 0002604100 = Blanco 1,5mm, 0002604103 = Rojo 1,5mm, 0002604112 = Verde 1,5mm,
  0002604120 = Blanco 2,5mm, 0002604123 = Rojo 2,5mm, 0002604132 = Verde 2,5mm — así identificas si es
  "Cable Blanco/Rojo/Verde 1,5mm" o "2,5mm" del catálogo aunque no diga el color en la descripción;
  "Taza WC", "Estanque WC" y "Asiento y Tapa WC" (las 3 partes de un inodoro, aunque vengan en líneas
  separadas de la boleta) son todas el mismo material "WC" de la etapa Baños terminaciones — no las separes;
  "Tornillo Drywall CRS 6-9 x 1 1/4" es el mismo producto que "Tornillos 1 1/4" de la etapa Revestimiento
  exterior y aleros — usa siempre "Tornillos 1 1/4"; "Tapacán 1x8" es el mismo producto que "Pino Cepillado
  1x8" (misma etapa) — usa siempre "Pino Cepillado 1x8"; "Barniz" es el mismo producto que "Pintura
  Cerestain" (misma etapa) — usa siempre "Pintura Cerestain"; "Cerestain Encina o natural" (aunque la boleta
  la relacione con techumbre) también es "Pintura Cerestain" de la etapa Revestimiento exterior y aleros;
  "Insumos de limpieza" existe en dos etapas (Retiro de escombros y limpieza, y Limpieza interior) con el
  mismo nombre y no se puede distinguir por el contenido de la boleta — por defecto usa "Limpieza interior",
  salvo que el documento o el contexto dejen claro que es limpieza de escombros/obra gruesa durante la
  construcción; una boleta de supermercado (ej. Cencosud/Santa Isabel/Jumbo, Líder, etc.) con productos de
  aseo genéricos (paños o toallas de papel tipo "Toalla Home", limpiadores de marca como "Lysol" o "Cif",
  detergentes, cloro, escobillas) y sin materiales de construcción es también "Insumos de limpieza" de
  Limpieza interior — agrupa todos los productos de esa boleta en un solo ítem con el monto total de la
  boleta, no los separes línea por línea;
  un gres/porcelánico de revestimiento de baño (ej. "POR.ESMAL.MATE..." u otro gres esmaltado para baño,
  no confundir con el porcelanato de piso de la etapa Instalación porcelanato) es "Revestimiento piso" o
  "Revestimiento muro" de la etapa Baños terminaciones según su formato: 60x60 es piso, 30x60 es muro;
  "Omega Normal" seguido de medidas (ej. "OMEGA NORMAL 38X35X15X8X0,85 L=6,00M", o cualquier variante de esas
  dimensiones/largo) es el mismo producto que "Omega estructural 0,85" de la etapa Techumbre — usa siempre
  "Omega estructural 0,85";
  cualquier espuma de poliuretano en aerosol (ej. "Espuma expansiva", "Espuma PU", con cualquier marca como
  Fischer/Sika/Tytan o tamaño de envase, p. ej. "750ml") es el mismo producto que "Espuma" del catálogo, de
  la etapa Sanitarios — usa siempre "Espuma", sin marca ni tamaño;
  "Acople" (manguera/trazado, sin más especificación) es "Copla" de la etapa Preparación de terreno — ojo que
  el catálogo también tiene "Coplas" y "Copla 50mm" en la etapa Sanitarios, pero esas son conexiones de cañería
  PVC/PPR, un producto distinto; "Acople" a secas (sin mención de cañería/PVC) siempre es el de Preparación de
  terreno).

Si encuentras una coincidencia razonable, usa EXACTAMENTE el nombre de material y la etapa del catálogo
(copia el nombre tal cual está entre comillas, no inventes variaciones) — no uses el nombre ni la redacción
del documento/consulta en ese caso.

Si el producto claramente pertenece a una etapa del catálogo pero no puedes decidir con confianza CUÁL de
dos o más materiales de esa etapa es (ej. el catálogo tiene "Panel SIP 114mm" y "Panel SIP 90mm", y el
documento solo dice "Panel SIP" o trae un código/SKU que no indica el espesor) — NO elijas uno al azar ni
mezcles el nombre del documento con la etapa del catálogo. Trátalo igual que si no hubiera coincidencia:
usa el nombre tal como aparece en el documento/consulta y etapa_id null, aunque sepas en general a qué
etapa pertenece. etapa_id null es justamente la señal de "revisar a mano" — dejar la etapa puesta con un
nombre que no es ninguno de los del catálogo hace que esa compra no se reconozca como hecha y quede como
si todavía faltara comprar.

Solo si el producto no se parece a nada del catálogo, o cae en el caso de arriba, usa el nombre tal como
aparece en el documento/consulta (limpio, sin códigos internos ni referencias entre paréntesis) y etapa_id null.`;

function construirPromptFactura(etapas: EtapaPrompt[], catalogoMateriales: CatalogoMaterialPrompt[]): string {
  const listaEtapas = etapas
    .map((e) => {
      const real = e.fechaInicioReal && e.fechaFinReal ? `, real: ${e.fechaInicioReal} a ${e.fechaFinReal}` : "";
      const plan = e.fechaInicioPlan && e.fechaFinPlan ? `, plan: ${e.fechaInicioPlan} a ${e.fechaFinPlan}` : "";
      return `${e.id}: ${e.nombre}${real}${plan}`;
    })
    .join("\n");
  const listaCatalogo = catalogoMateriales
    .map((m) => `"${m.material}" (unidad: ${m.unidad}) -> etapa ${m.etapaId}`)
    .join("\n");

  return `Eres un asistente que extrae datos de fotos o PDF de facturas o boletas chilenas de materiales de construcción.
Una misma boleta suele traer VARIOS productos distintos — identifica cada uno como un ítem separado, no los resumas en uno solo.

Estas son las etapas de obra disponibles del proyecto (id: nombre, con su rango de fechas real y/o planificado si ya
se registró — no todas tienen fechas todavía):
${listaEtapas}

Este es el catálogo real de materiales de la empresa, con su etapa y unidad correctas (nombre -> etapa):
${listaCatalogo}

Para cada ítem que identifiques en el documento:
${EJEMPLOS_Y_REGLAS_CATALOGO}

Caso particular: cuando el MISMO nombre de material existe en el catálogo bajo MÁS DE UNA etapa (ej. "Pino Bruto
2x2" existe tanto en la etapa Radier como en Revestimiento exterior y aleros) — esto es distinto al caso de arriba
(ese era sobre variantes de un mismo tipo de producto dentro de UNA etapa, como espesores de Panel SIP). Acá, en
vez de tratarlo como ambiguo, usa la fecha del documento (la que tú mismo extraigas) para decidir: compárala
contra el rango de fechas de cada etapa candidata de la lista de arriba (preferir el rango "real" si lo tiene esa
etapa; si no, usa el "plan") y elige la etapa candidata cuyo rango esté MÁS CERCA de la fecha del documento — no
hace falta que la fecha caiga dentro del rango, solo que sea la más próxima entre las candidatas. Solo si NINGUNA
de las etapas candidatas tiene fechas disponibles para comparar, trátalo entonces como el caso de arriba (nombre
tal como aparece en el documento, etapa_id null).

Para el monto de cada línea (el "monto_total" de cada ítem): usa el número que el documento ya trae impreso
en la columna del subtotal/total de esa línea (a veces se llama "Total", "Subtotal" o similar) — NO lo calcules
tú mismo multiplicando cantidad por precio unitario, sobre todo si el documento trae columnas separadas de
Precio, Descuento y Total: en esos casos el Total impreso ya incluye el descuento aplicado, y calcularlo a mano
te va a dar un número distinto (equivocado) al que realmente aparece en el documento. Si por algún motivo esa
columna no es legible con confianza, usa null en vez de inventar o calcular un número.

Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "proveedor": string o null (nombre del local/empresa que emite el documento),
  "rut": string o null (RUT del proveedor/emisor del documento, SIN puntos y CON guion — ej "76647271-0",
    aunque en el documento aparezca con puntos — el que aparece junto al nombre o logo del local/empresa
    que vende, en el encabezado; NO el RUT del cliente/comprador que suele aparecer más abajo en una
    sección "Sres:"/"Cliente:"/"Señor(es):" — si el documento solo trae un RUT y no queda claro si es de
    la empresa o del cliente, usa null),
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
      "etapa_id": number o null (la etapa del catálogo SOLO si "material" quedó con el nombre exacto de un
        material de esa etapa en el catálogo; si "material" quedó con el nombre del documento, etapa_id
        siempre va null, nunca mezcles una etapa del catálogo con un material que no es de ese catálogo)
    }
  ]
}
Si no puedes leer un dato con confianza, usa null en ese campo en vez de adivinar. Incluye un objeto dentro de "items" por cada producto distinto que identifiques en el documento.`;
}

const PROMPT_TRANSFERENCIA = `Eres un asistente que extrae datos de capturas de pantalla de transferencias bancarias chilenas.
Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{
  "destinatario": string o null (nombre de la persona o empresa a la que se transfirió, tal como aparece en el comprobante),
  "rut": string o null (RUT del destinatario, SIN puntos y CON guion — ej "76647271-0" — si el comprobante
    lo muestra; muchos comprobantes bancarios no lo traen, en ese caso usa null),
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

interface ArchivoAdjunto {
  base64: string;
  mimeType: string;
}

async function llamarClaude(prompt: string, archivo: ArchivoAdjunto | null, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY en el servidor.");
  }

  // Claude lee PDF directo (facturas electrónicas suelen venir así, no solo
  // como foto); cualquier otra cosa se manda como imagen. Sin archivo (ej.
  // para comparar solo texto contra el catálogo) se manda únicamente el prompt.
  const bloqueArchivo = archivo
    ? archivo.mimeType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: archivo.base64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: normalizarMediaType(archivo.mimeType), data: archivo.base64 },
        } as const)
    : null;

  const client = new Anthropic({ apiKey });

  for (let intento = 0; ; intento++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: bloqueArchivo ? [bloqueArchivo, { type: "text", text: prompt }] : prompt,
          },
        ],
      });

      const bloqueTexto = response.content.find((b) => b.type === "text");
      const texto = bloqueTexto && "text" in bloqueTexto ? bloqueTexto.text : "";
      if (!texto) {
        // No debería pasar (no se piden tools ni thinking, la respuesta
        // siempre debería traer un bloque de texto) — se deja registrado acá
        // por si vuelve a ocurrir, para poder ver en los logs de Vercel qué
        // devolvió realmente Claude en vez de adivinar a ciegas.
        console.error(
          "Respuesta de Claude sin texto:",
          JSON.stringify({ stopReason: response.stop_reason, tiposDeBloque: response.content.map((b) => b.type) })
        );
        throw new Error("La IA no devolvió ninguna respuesta.");
      }
      return texto;
    } catch (err) {
      const status = err instanceof APIError ? err.status : undefined;
      const esRespuestaVacia = err instanceof Error && err.message === "La IA no devolvió ninguna respuesta.";
      const quedanReintentos = intento < REINTENTOS;
      if (((status != null && STATUS_REINTENTABLES.has(status)) || esRespuestaVacia) && quedanReintentos) {
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
  etapas: EtapaPrompt[],
  catalogoMateriales: CatalogoMaterialPrompt[]
): Promise<FacturaExtraida> {
  const prompt = construirPromptFactura(etapas, catalogoMateriales);
  // 4096 se quedaba corto con boletas de 15-20+ ítems (ej. una ferretería
  // con una línea por cada tipo de codo/tapa/tornillo) — el stop_reason
  // venía "max_tokens" y a veces cortaba justo antes de terminar el bloque
  // de texto, dejando la respuesta vacía en vez de un JSON truncado.
  const texto = await llamarClaude(prompt, { base64: imagenBase64, mimeType }, 8192);
  let parsed: unknown;
  try {
    parsed = JSON.parse(limpiarRespuestaJSON(texto));
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la IA. Intenta con otra foto más nítida.");
  }

  const p = parsed as Partial<FacturaExtraida>;
  return corregirIvaItems({
    proveedor: p.proveedor ?? null,
    rut: p.rut ?? null,
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
  const texto = await llamarClaude(PROMPT_TRANSFERENCIA, { base64: imagenBase64, mimeType }, 1024);
  try {
    return JSON.parse(limpiarRespuestaJSON(texto));
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la IA. Intenta con otra foto más nítida.");
  }
}

export interface SugerenciaMaterial {
  material: string;
  etapaId: number;
}

/**
 * Para cuando un material de Bodega (ej. "Esmalte Semibrillo Gris Grafito",
 * escrito así porque no calzó con el catálogo al comprarlo) se está por
 * despachar a un proyecto: compara el nombre contra el catálogo completo,
 * igual que al leer una boleta, pero solo con texto (sin foto) — para
 * sugerir a qué material/etapa real del catálogo corresponde, por si
 * conviene dejarlo con ese nombre en vez del original.
 */
export async function sugerirMaterialCatalogo(
  nombreProducto: string,
  catalogoMateriales: CatalogoMaterialPrompt[]
): Promise<SugerenciaMaterial | null> {
  const listaCatalogo = catalogoMateriales.map((m) => `"${m.material}" -> etapa ${m.etapaId}`).join("\n");
  const prompt = `Eres un asistente que identifica a qué material de un catálogo de construcción corresponde el nombre de un producto.

Catálogo (nombre -> etapa):
${listaCatalogo}

Producto a identificar: "${nombreProducto}"

${EJEMPLOS_Y_REGLAS_CATALOGO}

Devuelve SOLO un JSON válido (sin markdown, sin texto extra) con esta forma exacta:
{"material": string o null, "etapa_id": number o null}`;

  const texto = await llamarClaude(prompt, null, 200);
  try {
    const parsed = JSON.parse(limpiarRespuestaJSON(texto)) as { material?: string | null; etapa_id?: number | null };
    if (!parsed.material || parsed.etapa_id == null) return null;
    return { material: parsed.material, etapaId: parsed.etapa_id };
  } catch {
    return null;
  }
}
