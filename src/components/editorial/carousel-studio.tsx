"use client";
import { ArrowDown, ArrowUp, CircleCheck, CircleX, Download, ImagePlus, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import {
  CAROUSEL_ACCENTS,
  CAROUSEL_ACCENT_LABELS,
  CAROUSEL_LIMITS,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  CAROUSEL_PALETTES,
  CAROUSEL_PALETTE_LABELS,
  CAROUSEL_PHOTO_MAX_CHARS,
  CAROUSEL_TEMPLATES,
  SLIDE_KIND_LABELS,
  carouselChecklist,
  carouselMarkdown,
  emptySlide,
  normalizeHandle,
  paletteColors,
  slideFileName,
  slideLayout,
  slideNumber,
  type Carousel,
  type CarouselAccent,
  type CarouselPalette,
  type CarouselSlide,
} from "@/lib/domain/instagram-carousel";
import { cn } from "@/lib/utils";
import { generateCarouselAction } from "@/server/actions/carousel";

export interface CarouselBriefForm {
  topic: string;
  audience: string;
  slideCount: string;
  keyword: string;
  brand: string;
  handle: string;
  palette: CarouselPalette;
  accent: CarouselAccent;
}

/** Identidade visual lembrada neste navegador (marca, @, paleta e cor). */
const STYLE_KEY = "besmart:carrossel-estilo";
const STYLE_FIELDS = ["brand", "handle", "palette", "accent"] as const;
type StyleField = (typeof STYLE_FIELDS)[number];
const isStyleField = (k: string): k is StyleField => (STYLE_FIELDS as readonly string[]).includes(k);

/** Textos aparados e listas sem linhas vazias — o formato que a API valida. */
const cleanSlide = (s: CarouselSlide): CarouselSlide => ({
  ...s,
  eyebrow: s.eyebrow.trim(),
  title: s.title.trim(),
  highlight: s.highlight.trim(),
  body: s.body.trim(),
  keyword: s.keyword.trim(),
  bullets: s.bullets.map((b) => b.trim()).filter(Boolean),
});
const cleanCarousel = (c: Carousel): Carousel => ({ ...c, slides: c.slides.map(cleanSlide) });

async function postJson(url: string, body: unknown): Promise<Response> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Não foi possível gerar as imagens. Tente novamente.");
  }
  return res;
}

/** Reduz a foto no navegador (lado menor até 1080 px) e devolve JPEG em data URL. */
async function resizePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / Math.min(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CarouselStudio({ initial, aiEnabled }: { initial: CarouselBriefForm; aiEnabled: boolean }) {
  const { run, fieldErrors } = useAction();
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<CarouselBriefForm>(initial);
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [meta, setMeta] = useState<{ mode: "claude" | "local"; note?: string } | null>(null);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  /** Chave com que cada prévia foi renderizada (para pedir de novo só o que mudou). */
  const [renderedKeys, setRenderedKeys] = useState<Record<number, string>>({});
  const [rendering, setRendering] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  /** Pedido mais recente de cada slide e a chave que está sendo renderizada agora. */
  const latest = useRef<Record<number, number>>({});
  const inflight = useRef<Record<number, string>>({});
  const seq = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? "null") as Partial<CarouselBriefForm> | null;
      if (!saved) return;
      const next: Partial<CarouselBriefForm> = {};
      if (typeof saved.brand === "string") next.brand = saved.brand.slice(0, CAROUSEL_LIMITS.brand);
      if (typeof saved.handle === "string") next.handle = saved.handle.slice(0, CAROUSEL_LIMITS.handle);
      if ((CAROUSEL_PALETTES as readonly string[]).includes(saved.palette ?? "")) next.palette = saved.palette;
      if ((CAROUSEL_ACCENTS as readonly string[]).includes(saved.accent ?? "")) next.accent = saved.accent;
      setForm((f) => ({ ...f, ...next }));
    } catch {
      /* armazenamento indisponível: segue com o padrão */
    }
  }, []);

  function setField<K extends keyof CarouselBriefForm>(k: K, val: CarouselBriefForm[K]) {
    const next = { ...form, [k]: val };
    setForm(next);
    if (!isStyleField(k)) return;
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify({ brand: next.brand, handle: next.handle, palette: next.palette, accent: next.accent }));
    } catch {
      /* ignora */
    }
    // a identidade visual vale para o carrossel aberto, sem gerar os textos de novo
    setCarousel((c) => c && { ...c, [k]: k === "handle" ? normalizeHandle(String(val)) : k === "brand" ? String(val).trim() : val });
  }

  async function generate() {
    setGenerating(true);
    const res = await run(() => generateCarouselAction(form), { refresh: false, success: false });
    setGenerating(false);
    if (!res.ok) return;
    setCarousel((prev) => ({ ...res.data.carousel, photo: prev?.photo ?? null }));
    setMeta({ mode: res.data.mode, note: res.data.note });
    toast.success(res.data.mode === "claude" ? "Carrossel escrito pelo Claude" : "Carrossel montado");
  }

  const updateSlide = (i: number, patch: Partial<CarouselSlide>) => setCarousel((c) => c && { ...c, slides: c.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveSlide = (i: number, dir: -1 | 1) =>
    setCarousel((c) => {
      if (!c) return c;
      const slides = [...c.slides];
      [slides[i], slides[i + dir]] = [slides[i + dir], slides[i]];
      return { ...c, slides };
    });
  const removeSlide = (i: number) => setCarousel((c) => c && { ...c, slides: c.slides.filter((_, j) => j !== i) });
  const addSlide = () => setCarousel((c) => c && { ...c, slides: [...c.slides.slice(0, -1), emptySlide("conteudo"), c.slides[c.slides.length - 1]] });

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    try {
      const photo = await resizePhoto(file);
      if (photo.length > CAROUSEL_PHOTO_MAX_CHARS) throw new Error("grande");
      setCarousel((c) => c && { ...c, photo });
    } catch {
      toast.error("Não foi possível usar esta imagem. Envie uma foto JPG ou PNG.");
    }
  }

  // Chave de cada slide: muda quando algo que aparece na imagem muda (texto, posição, total, estilo, foto da capa).
  const photoKey = carousel?.photo ? `${carousel.photo.length}:${carousel.photo.slice(-24)}` : "";
  const keys = useMemo(
    () => (carousel ? carousel.slides.map((s, i) => JSON.stringify([cleanSlide(s), i, carousel.slides.length, carousel.palette, carousel.accent, carousel.brand, carousel.handle, s.kind === "capa" ? photoKey : ""])) : []),
    [carousel, photoKey],
  );

  // Prévia: depois de uma pausa na digitação, renderiza só os slides que mudaram.
  useEffect(() => {
    if (!carousel) return;
    const wanted = keys.map((k, i) => (renderedKeys[i] === k || inflight.current[i] === k ? -1 : i)).filter((i) => i >= 0);
    if (!wanted.length) return;
    const timer = setTimeout(async () => {
      const id = ++seq.current;
      for (const i of wanted) {
        latest.current[i] = id;
        inflight.current[i] = keys[i];
      }
      setRendering((n) => n + 1);
      try {
        const body = { carousel: { ...cleanCarousel(carousel), photo: wanted.includes(0) ? (carousel.photo ?? null) : null }, indexes: wanted };
        const data = (await (await postJson("/api/carrossel/slides", body)).json()) as { slides: { index: number; png: string }[] };
        const fresh = data.slides.filter((s) => latest.current[s.index] === id);
        if (fresh.length) {
          setPreviews((p) => ({ ...p, ...Object.fromEntries(fresh.map((s) => [s.index, s.png])) }));
          setRenderedKeys((r) => ({ ...r, ...Object.fromEntries(fresh.map((s) => [s.index, keys[s.index]])) }));
        }
        setRenderError(null);
      } catch (e) {
        setRenderError((e as Error).message);
      } finally {
        for (const i of wanted) if (latest.current[i] === id) delete inflight.current[i];
        setRendering((n) => n - 1);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [carousel, keys, renderedKeys]);

  async function downloadZip() {
    if (!carousel) return;
    setDownloading(true);
    try {
      const res = await postJson("/api/carrossel/zip", { carousel: cleanCarousel(carousel) });
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "carrossel.zip";
      saveBlob(await res.blob(), name);
      toast.success("ZIP baixado — PNGs 1080×1080 prontos para o Instagram");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  const checklist = useMemo(() => (carousel ? carouselChecklist(cleanCarousel(carousel)) : []), [carousel]);
  const colors = paletteColors(form.palette, form.accent);
  const total = carousel?.slides.length ?? 0;

  const generateButton = (
    <>
      <Sparkles /> {carousel ? "Gerar de novo" : "Gerar carrossel"}
    </>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Tema do carrossel" required error={fieldErrors.topic} className="md:col-span-2" hint="Escreva o seu tema ou escolha um modelo pronto da lista">
              <Input value={form.topic} onChange={(e) => setField("topic", e.target.value)} list="carousel-templates" maxLength={CAROUSEL_LIMITS.topic} placeholder="Ex.: Coparticipação vale a pena?" />
            </Field>
            <datalist id="carousel-templates">
              {CAROUSEL_TEMPLATES.map((t) => (
                <option key={t.id} value={t.label} />
              ))}
            </datalist>
            <Field label="Público-alvo" error={fieldErrors.audience} className="md:col-span-2">
              <Input value={form.audience} onChange={(e) => setField("audience", e.target.value)} maxLength={CAROUSEL_LIMITS.audience} />
            </Field>
            <Field label="Quantidade de slides" error={fieldErrors.slideCount} hint="Capa + conteúdo + CTA">
              <Select value={form.slideCount} onChange={(e) => setField("slideCount", e.target.value)}>
                {Array.from({ length: CAROUSEL_MAX_SLIDES - CAROUSEL_MIN_SLIDES + 1 }, (_, i) => CAROUSEL_MIN_SLIDES + i).map((n) => (
                  <option key={n} value={String(n)}>
                    {n} slides
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Palavra-chave do CTA" error={fieldErrors.keyword} hint="Ex.: PLANO — vazio: sugerida pelo tema">
              <Input value={form.keyword} onChange={(e) => setField("keyword", e.target.value.toLocaleUpperCase("pt-BR"))} maxLength={CAROUSEL_LIMITS.keyword} />
            </Field>
            <Field label="Marca (topo dos slides)" error={fieldErrors.brand}>
              <Input value={form.brand} onChange={(e) => setField("brand", e.target.value)} maxLength={CAROUSEL_LIMITS.brand} />
            </Field>
            <Field label="@ do perfil" error={fieldErrors.handle}>
              <Input value={form.handle} onChange={(e) => setField("handle", e.target.value)} maxLength={CAROUSEL_LIMITS.handle} placeholder="@seuperfil" autoCapitalize="none" autoCorrect="off" />
            </Field>
            <Field label="Paleta">
              <Select value={form.palette} onChange={(e) => setField("palette", e.target.value as CarouselPalette)}>
                {CAROUSEL_PALETTES.map((p) => (
                  <option key={p} value={p}>
                    {CAROUSEL_PALETTE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cor de destaque">
              <Select value={form.accent} onChange={(e) => setField("accent", e.target.value as CarouselAccent)}>
                {CAROUSEL_ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {CAROUSEL_ACCENT_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2 md:col-span-2" aria-hidden>
              <span className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs" style={{ background: colors.bg, color: colors.text }}>
                <span className="font-semibold">AA</span>
                <span style={{ color: colors.accent }} className="font-semibold italic">
                  destaque
                </span>
                <span style={{ color: colors.muted }}>{normalizeHandle(form.handle) || "@perfil"}</span>
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {carousel ? (
              <ConfirmButton
                title="Gerar o carrossel de novo?"
                description="Os textos dos slides e a legenda serão substituídos. A foto da capa e a identidade visual continuam."
                confirmLabel="Gerar de novo"
                variant="default"
                triggerVariant="default"
                size="default"
                onConfirm={generate}
                disabled={generating}
              >
                {generateButton}
              </ConfirmButton>
            ) : (
              <Button onClick={generate} loading={generating}>
                {generateButton}
              </Button>
            )}
            <span className="text-xs text-muted">{aiEnabled ? "Textos escritos pelo Claude a partir do tema." : "Modo local: modelos prontos de planos de saúde (configure ANTHROPIC_API_KEY para textos sob medida)."}</span>
          </div>
        </CardContent>
      </Card>

      {carousel && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {meta && <Badge tone={meta.mode === "claude" ? "violet" : "slate"}>{meta.mode === "claude" ? "Escrito com Claude" : "Modo local"}</Badge>}
            {meta?.note && <span className="text-xs text-amber-700 dark:text-amber-300">{meta.note}</span>}
            <span className="text-sm text-muted">
              {total} slides · PNG 1080×1080 · {CAROUSEL_PALETTE_LABELS[carousel.palette]}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <CopyButton text={() => carouselMarkdown(cleanCarousel(carousel))} label="Copiar roteiro" successMessage="Roteiro copiado" />
              <Button size="sm" onClick={downloadZip} loading={downloading}>
                <Download /> Baixar ZIP
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {carousel.slides.map((s, i) => {
                const fits = slideLayout(s, s.kind === "capa" && Boolean(carousel.photo)).fits;
                const movable = s.kind === "conteudo";
                return (
                  <Card key={i}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        {slideNumber(i, total)} · {SLIDE_KIND_LABELS[s.kind]}
                      </CardTitle>
                      {movable && (
                        <div className="flex gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => moveSlide(i, -1)} disabled={i <= 1} aria-label="Mover para cima" title="Mover para cima">
                            <ArrowUp />
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => moveSlide(i, 1)} disabled={i >= total - 2} aria-label="Mover para baixo" title="Mover para baixo">
                            <ArrowDown />
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => removeSlide(i)} disabled={total <= CAROUSEL_MIN_SLIDES} aria-label="Remover slide" title="Remover slide">
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Field label="Rótulo" hint="Linha pequena acima do título">
                        <Input value={s.eyebrow} onChange={(e) => updateSlide(i, { eyebrow: e.target.value })} maxLength={CAROUSEL_LIMITS.eyebrow} />
                      </Field>
                      <Field label="Título" hint="Sai em caixa alta">
                        <Input value={s.title} onChange={(e) => updateSlide(i, { title: e.target.value })} maxLength={CAROUSEL_LIMITS.title} />
                      </Field>
                      <Field label="Destaque (itálico colorido)" className="sm:col-span-2">
                        <Input value={s.highlight} onChange={(e) => updateSlide(i, { highlight: e.target.value })} maxLength={CAROUSEL_LIMITS.highlight} />
                      </Field>
                      {s.kind === "cta" && (
                        <Field label="Palavra-chave (comentário)" className="sm:col-span-2">
                          <Input value={s.keyword} onChange={(e) => updateSlide(i, { keyword: e.target.value.toLocaleUpperCase("pt-BR").replace(/\s+/g, "") })} maxLength={CAROUSEL_LIMITS.keyword} />
                        </Field>
                      )}
                      <Field label={s.kind === "cta" ? "Texto da caixa" : s.kind === "capa" ? "Subtítulo" : "Texto"} className="sm:col-span-2">
                        <Textarea value={s.body} onChange={(e) => updateSlide(i, { body: e.target.value })} maxLength={CAROUSEL_LIMITS.body} rows={s.kind === "conteudo" ? 3 : 2} />
                      </Field>
                      {s.kind === "conteudo" && (
                        <Field label="Lista" hint={`Um item por linha (até ${CAROUSEL_LIMITS.bullets})`} className="sm:col-span-2">
                          <Textarea
                            value={s.bullets.join("\n")}
                            onChange={(e) =>
                              updateSlide(i, {
                                bullets: e.target.value
                                  .split("\n")
                                  .slice(0, CAROUSEL_LIMITS.bullets)
                                  .map((b) => b.slice(0, CAROUSEL_LIMITS.bullet)),
                              })
                            }
                            rows={3}
                          />
                        </Field>
                      )}
                      {s.kind === "capa" && (
                        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 [&_svg]:size-4">
                            <ImagePlus /> {carousel.photo ? "Trocar foto de fundo" : "Foto de fundo (opcional)"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              onChange={(e) => {
                                void choosePhoto(e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {carousel.photo && (
                            <Button size="sm" variant="ghost" onClick={() => setCarousel((c) => c && { ...c, photo: null })}>
                              <X /> Remover foto
                            </Button>
                          )}
                          <span className="text-xs text-muted">O topo fica livre para o rosto; o texto vai para a parte de baixo.</span>
                        </div>
                      )}
                      {!fits && <p className="text-xs text-red-600 sm:col-span-2">Texto longo demais para o quadro — encurte para não ficar cortado.</p>}
                    </CardContent>
                  </Card>
                );
              })}
              <Button variant="outline" onClick={addSlide} disabled={total >= CAROUSEL_MAX_SLIDES}>
                <Plus /> Slide de conteúdo
              </Button>
            </div>

            {/* no celular a prévia vem antes dos editores */}
            <div className="order-first space-y-3 lg:sticky lg:top-4 lg:order-none lg:self-start">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm">Prévia (como sai no PNG)</CardTitle>
                  {rendering > 0 ? (
                    <span className="text-xs text-muted">Atualizando…</span>
                  ) : renderError ? (
                    <Button size="sm" variant="outline" onClick={() => setRenderedKeys({})}>
                      <RefreshCw /> Tentar de novo
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {renderError && <p className="mb-2 text-xs text-red-600">{renderError}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    {carousel.slides.map((s, i) =>
                      previews[i] ? (
                        <a key={i} href={previews[i]} download={slideFileName(i)} title={`Baixar ${slideFileName(i)}`} className="block overflow-hidden rounded-md border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element -- PNG gerado na hora (data URL) */}
                          <img src={previews[i]} alt={`Slide ${i + 1}: ${s.title}`} className={cn("aspect-square w-full", renderedKeys[i] !== keys[i] && "opacity-60")} />
                        </a>
                      ) : (
                        <div key={i} className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-xs text-muted">
                          {slideNumber(i, total)}
                        </div>
                      ),
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">Toque numa imagem para baixar só aquele slide.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Checklist antes de postar</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {checklist.map((c) => (
                      <li key={c.label} className="flex items-start gap-2">
                        {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="OK" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Pendente" />}
                        <span>
                          {c.label}
                          {c.detail && <span className="text-xs text-muted"> — {c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-sm">Legenda</CardTitle>
                  <CopyButton text={() => carousel.caption} label="Copiar legenda" successMessage="Legenda copiada" />
                </CardHeader>
                <CardContent>
                  <Textarea value={carousel.caption} onChange={(e) => setCarousel((c) => c && { ...c, caption: e.target.value })} maxLength={CAROUSEL_LIMITS.caption} rows={8} />
                  <p className="mt-1 text-right text-xs text-muted">
                    {carousel.caption.length}/{CAROUSEL_LIMITS.caption}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
