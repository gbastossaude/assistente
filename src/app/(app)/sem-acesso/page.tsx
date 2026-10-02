import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/domain/constants";
import { requireUser } from "@/server/auth";

export const metadata = { title: "Acesso restrito" };

export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-surface p-6 text-center">
      <Lock className="mx-auto size-8 text-muted" />
      <h1 className="mt-2 text-lg font-semibold">Acesso restrito</h1>
      <p className="mt-1 text-sm text-muted">
        Seu perfil ({ROLE_LABELS[user.role]}) não acessa esta tela. {ROLE_DESCRIPTIONS[user.role]}
      </p>
      <Button asChild className="mt-4">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
