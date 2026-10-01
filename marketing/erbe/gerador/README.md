# Gerador das artes da ERBE

Gera as artes dos 30 posts (JPG) e as legendas a partir de `conteudo.mjs`.

```bash
node marketing/erbe/gerador/gerar.mjs          # todos os posts
node marketing/erbe/gerador/gerar.mjs 05 26    # só os posts informados
```

Requer Node 20+ e Playwright com Chromium (`npm i -g playwright && npx playwright install chromium`
fora deste ambiente; para usar um Chromium já instalado, defina `CHROMIUM_PATH`).

- **Textos e legendas:** `conteudo.mjs`. `<em>…</em>` destaca o trecho em champanhe.
- **Visual (cores, fontes, layouts):** `template.mjs`.
- **Fontes:** Fraunces e Manrope (Google Fonts, licença OFL), embutidas em `fonts/`.
- **Logo:** as artes usam a palavra "ERBE" em tipografia. Para usar o logo oficial, troque o bloco
  `.brand` em `template.mjs` por uma `<img>` com o arquivo do logo.
