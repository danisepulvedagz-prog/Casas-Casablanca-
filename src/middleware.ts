import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { obtenerRol } from "@/lib/auth";
import type { Database } from "@/lib/supabase/types";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() (no getSession()) valida el token contra el servidor de Supabase
  // en vez de solo leer la cookie — necesario para que el gate sea confiable.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Un "usuario" normal solo puede usar Agregar gasto y el Catálogo — todo
  // lo demás (proyectos, presupuestos, etc.) rebota igual si escribe la URL
  // directo, no basta con esconder los links del nav.
  if (user) {
    const rol = await obtenerRol(supabase, user.id);
    const pathname = request.nextUrl.pathname;
    const rutaPermitida =
      pathname === "/login" ||
      pathname === "/gastos/nuevo" ||
      pathname.startsWith("/catalogo-materiales");
    if (rol === "usuario" && !rutaPermitida) {
      const url = request.nextUrl.clone();
      url.pathname = "/gastos/nuevo";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
