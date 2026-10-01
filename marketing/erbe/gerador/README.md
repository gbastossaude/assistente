# Gerador das artes da ERBE

Gera as artes dos 30 posts (JPG) e as legendas a partir de `conteudo.mjs`.

```bash
node marketing/erbe/gerador/gerar.mjs          # todos os posts
node marketing/erbe/gerador/gerar.mjs 05 26    # só os posts informados
```

Requer Node 20+ e Playwright com Chromium (`npm i -g playwright && npx playwright install chromium`
fora deste ambiente; para usar um Chromium já instalado, defina `CHROMIUM_PATH`).

- **Textos e legendas:** `conteudo.mjs`. `<em>…</em>` destaca o trecho na cor de destaque (verde ou menta).
- **Visual (cores, fontes, layouts):** `template.mjs`.
- **Fontes:** Plus Jakarta Sans e Inter (Google Fonts, licença OFL), embutidas em `fonts/`.
- **Logo:** o escudo com "E" vazado é uma recriação em SVG (`logoMark` em `template.mjs`). Com o arquivo
  oficial (SVG), troque o desenho dessa função e rode o gerador de novo.
