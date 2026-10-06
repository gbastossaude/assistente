import { CarouselStudio } from "@/components/editorial/carousel-studio";
import { PageHeader } from "@/components/ui/misc";
import { CAROUSEL_DEFAULT_SLIDES, CAROUSEL_LIMITS } from "@/lib/domain/instagram-carousel";
import { sp } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth";

export const metadata = { title: "Carrossel Instagram" };

export default async function CarouselPage({ searchParams }: { searchParams: Promise<{ tema?: string | string[] }> }) {
  await requirePagePermission("content:write");
  const { tema } = await searchParams;
  return (
    <>
      <PageHeader
        title="Carrossel Instagram"
        description="Capa, slides de conteúdo e CTA com palavra-chave, na identidade visual escolhida. Edite os textos, confira a prévia e baixe o ZIP com os PNGs 1080×1080 e a legenda. Nada é publicado automaticamente."
      />
      <CarouselStudio
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        initial={{
          topic: sp(tema)?.slice(0, CAROUSEL_LIMITS.topic) ?? "",
          audience: "Sócios, RH e gestores de empresas e famílias que querem pagar menos sem perder rede",
          slideCount: String(CAROUSEL_DEFAULT_SLIDES),
          keyword: "",
          brand: "BeSmart",
          handle: "",
          palette: "besmart",
          accent: "dourado",
        }}
      />
    </>
  );
}
