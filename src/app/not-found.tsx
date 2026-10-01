import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-5xl font-bold text-muted">404</p>
      <h1 className="text-lg font-semibold">Registro não encontrado</h1>
      <p className="text-sm text-muted">O item pode ter sido excluído ou o link está incorreto.</p>
      <Link href="/" className="mt-2 text-sm text-primary hover:underline">
        Voltar ao Meu Dia
      </Link>
    </main>
  );
}
