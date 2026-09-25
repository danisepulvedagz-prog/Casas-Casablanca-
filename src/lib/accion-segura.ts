interface ConError {
  error?: string;
}

/**
 * Envuelve una Server Action para que, si se corta la señal a mitad de la
 * llamada, no rompa la página con un error sin manejar.
 *
 * El fetch que Next.js genera para invocar la action en el servidor vive
 * del lado del cliente — si se corta la conexión, ese fetch rechaza dentro
 * del dispatch interno de useActionState, no en la promesa que devuelve
 * formAction() (esa ni siquiera es awaitable: formAction es void). Por eso
 * un try/catch alrededor de formAction(formData) en la pantalla no sirve de
 * nada — hay que atrapar el error DENTRO de la action, envolviéndola acá,
 * para que en vez de una excepción sin capturar devuelva el mismo tipo de
 * {error} que la action ya devuelve normalmente ante cualquier otra falla.
 */
export function conRedSegura<S extends ConError>(
  action: (state: S, formData: FormData) => Promise<S>
): (state: S, formData: FormData) => Promise<S> {
  return async (state, formData) => {
    try {
      return await action(state, formData);
    } catch (err) {
      if (err instanceof TypeError) {
        return { ...state, error: "No se pudo conectar con el servidor — revisa tu conexión a internet e intenta de nuevo." };
      }
      throw err;
    }
  };
}
