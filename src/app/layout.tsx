import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Roboto, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Casas Casablanca",
  description: "Seguimiento de construcción de casas",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="es"
      className={`${roboto.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <header className="border-b border-[var(--header-border)] bg-white dark:bg-zinc-950">
          <nav className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-5">
            <Link href="/proyectos" className="shrink-0">
              <Image
                src="/logo-casas-casablanca.png"
                alt="Casas Casablanca"
                width={1286}
                height={458}
                priority
                className="block h-10 w-auto dark:hidden"
              />
              <Image
                src="/logo-casas-casablanca-dark.png"
                alt="Casas Casablanca"
                width={1286}
                height={458}
                priority
                className="hidden h-10 w-auto dark:block"
              />
            </Link>
            <Link
              href="/proyectos"
              className="text-sm font-light uppercase tracking-wide text-zinc-700 transition-colors hover:text-brand dark:text-zinc-300"
            >
              Proyectos
            </Link>
            <Link
              href="/gastos/nuevo"
              className="text-sm font-light uppercase tracking-wide text-zinc-700 transition-colors hover:text-brand dark:text-zinc-300"
            >
              Agregar gasto
            </Link>
            <Link
              href="/catalogo-materiales"
              className="text-sm font-light uppercase tracking-wide text-zinc-700 transition-colors hover:text-brand dark:text-zinc-300"
            >
              Catálogo
            </Link>
            {user && (
              <form action={signOut} className="ml-auto">
                <button
                  type="submit"
                  className="text-sm font-light uppercase tracking-wide text-zinc-700 transition-colors hover:text-brand dark:text-zinc-300"
                >
                  Cerrar sesión
                </button>
              </form>
            )}
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
