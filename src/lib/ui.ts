// Estilos de botón alineados a la marca Casas Casablanca (casascasablanca.cl):
// píldoras (border-radius completo), verde #31a47b como color de acción.

export const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50";

// Texto en tinta oscura, no verde: #31a47b sobre blanco da ~3.1:1 de contraste,
// insuficiente para texto normal (WCAG pide 4.5:1). El verde queda en el borde
// y en el hover, no en la letra.
export const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-full border border-brand px-5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-brand-tint dark:text-zinc-100";

export const LINK_MUTED =
  "text-sm text-zinc-600 hover:text-brand hover:underline dark:text-zinc-400";
