"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { formatCnpj } from "@/lib/domain/cnpj";
import { UFS } from "@/lib/domain/constants";
import { companySchema, type CompanyInput } from "@/lib/validation/schemas";
import { createCompanyAction, updateCompanyAction } from "@/server/actions/companies";

type FormValues = Record<keyof CompanyInput, string | boolean | null | undefined>;

export function CompanyForm({ initial, id, users }: { initial?: Partial<FormValues>; id?: string; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const { run, fieldErrors } = useAction();
  const form = useForm<FormValues>({
    resolver: zodResolver(companySchema) as never,
    defaultValues: { legalName: "", tradeName: "", mainCnpj: "", economicGroup: "", segment: "", estimatedLives: "", address: "", city: "", uf: "", ownerId: "", origin: "", notes: "", isClient: false, ...initial },
  });
  const err = (k: keyof FormValues) => (form.formState.errors[k]?.message as string | undefined) ?? fieldErrors[k as string]?.[0];
  const onSubmit = form.handleSubmit(async (values) => {
    const r = await run<unknown>(() => (id ? updateCompanyAction(id, values) : createCompanyAction(values)), { refresh: false });
    if (r.ok) router.push(`/empresas/${id ?? (r.data as string)}`);
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Razão social" required error={err("legalName")} className="md:col-span-2">
            <Input {...form.register("legalName")} aria-invalid={!!err("legalName")} />
          </Field>
          <Field label="Nome fantasia" error={err("tradeName")}>
            <Input {...form.register("tradeName")} />
          </Field>
          <Field label="CNPJ principal" error={err("mainCnpj")} hint="Aceita CNPJ numérico e alfanumérico">
            <Input
              {...form.register("mainCnpj")}
              onBlur={(e) => form.setValue("mainCnpj", formatCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              aria-invalid={!!err("mainCnpj")}
            />
          </Field>
          <Field label="Grupo econômico" error={err("economicGroup")}>
            <Input {...form.register("economicGroup")} />
          </Field>
          <Field label="Segmento" error={err("segment")}>
            <Input {...form.register("segment")} placeholder="Indústria, varejo, serviços…" />
          </Field>
          <Field label="Quantidade estimada de vidas" error={err("estimatedLives")}>
            <Input type="number" min={0} {...form.register("estimatedLives")} />
          </Field>
          <Field label="Endereço" error={err("address")}>
            <Input {...form.register("address")} placeholder="Rua, número, bairro, CEP" />
          </Field>
          <Field label="Cidade" error={err("city")}>
            <Input {...form.register("city")} />
          </Field>
          <Field label="UF" error={err("uf")}>
            <Select {...form.register("uf")}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Executivo responsável" error={err("ownerId")}>
            <Select {...form.register("ownerId")}>
              <option value="">(eu)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Origem da oportunidade" error={err("origin")}>
            <Input {...form.register("origin")} placeholder="Indicação, prospecção, carteira…" />
          </Field>
          <Field label="Relacionamento">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isClient")} className="size-4" /> Já é cliente da BeSmart
            </label>
          </Field>
          <Field label="Observações" error={err("notes")} className="md:col-span-2 lg:col-span-3">
            <Textarea {...form.register("notes")} rows={3} />
          </Field>
        </CardContent>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {id ? "Salvar alterações" : "Cadastrar empresa"}
        </Button>
      </div>
    </form>
  );
}
