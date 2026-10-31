# Diagnóstico de custos e limites gratuitos

Pesquisa feita em **31/10/2026**. Preços e franquias mudam: **confira as páginas oficiais antes de ativar em produção.**
Este sistema não contrata nada, não habilita cobrança e não envia templates pagos automaticamente.

## Visão geral

| Componente | Plano | Custo esperado | Principais limites a acompanhar |
|---|---|---|---|
| IA (Ollama + modelos abertos) | Local | R$ 0 (energia do computador) | Velocidade do computador; 1 pergunta por vez em CPU |
| Supabase | Free | R$ 0 | 500 MB de banco, 1 GB de arquivos, 2 projetos, **pausa após 7 dias sem uso** |
| Netlify (painel estático) | Free | R$ 0 | Contas novas: 300 créditos/mês (≈ 15 por deploy de produção; banda também consome créditos) |
| Extensão Chrome | — | R$ 0 (modo desenvolvedor) | Loja: taxa única de registro de desenvolvedor da Google, se optar por publicar |
| WhatsApp Cloud API | Meta | R$ 0 **se** ficar dentro da franquia de serviço | Ver abaixo — teto preventivo de 900/mês |

## WhatsApp — mudança importante (outubro de 2026)

Segundo diversas fontes publicadas por parceiros da Meta, **a partir de 1º/10/2026 as mensagens de serviço (respostas
livres dentro da janela de 24 h) passaram a ser cobradas**, com uma **franquia de 1.000 mensagens de serviço entregues por
número comercial por mês**; a partir da 1.001ª, cobra-se a tarifa de "utility" do país do destinatário. Mensagens
recebidas dos colaboradores continuam gratuitas. As páginas oficiais da Meta consultadas ainda exibiam a regra anterior
(mensagens fora de template gratuitas), então **valide na tabela oficial**:
<https://developers.facebook.com/docs/whatsapp/pricing>.

Como o sistema se protege:

- **Teto do aplicativo: 900 mensagens/mês por número** (configurável até 1.000) e **teto diário** (padrão 80).
- A contagem é **mais conservadora que a da Meta**: o sistema conta cada envio autorizado (inclusive menus, confirmações e
  avisos), enquanto a franquia da Meta conta mensagens **entregues**. Falhas de envio devolvem a reserva.
- A reserva é **atômica no banco** (bloqueio por número): mesmo com envios simultâneos o teto não é ultrapassado (testado).
- Atingido o teto, o envio é **bloqueado antes** de chamar a Meta; a pergunta continua respondida na extensão/painel.
- Alertas em 50%, 80%, 95% e 100% no Dashboard.
- Sem templates, sem mensagens proativas, sem resposta a números não autorizados (padrão), menu limitado a 1 vez a cada
  10 min e aviso de offline a 1 por hora.
- **Outros sistemas no mesmo número consomem a mesma franquia** e não aparecem nesta contagem — reduza o teto se for o caso.

Estimativa: 20 colaboradores × 2 perguntas/dia útil × 22 dias ≈ 880 respostas/mês — já no limite. Para volumes maiores,
direcione o uso diário para a **extensão** (sem custo) e mantenha o WhatsApp para uso móvel.

## Supabase — cuidados no plano gratuito

- **Pausa por inatividade**: projetos gratuitos são pausados após ~7 dias sem atividade. O worker envia sinal de vida a
  cada 30 s quando ligado, o que mantém o projeto ativo em dias úteis; em férias coletivas, reative pelo painel do Supabase.
- **500 MB de banco**: cada trecho ocupa ~6 KB (texto + vetor 1024 + índices). ≈ 40 mil trechos ≈ 250 MB — suficiente para
  centenas de manuais. Versões substituídas têm os trechos removidos; a retenção limpa perguntas antigas (padrão 180 dias).
- **1 GB de arquivos**: originais ficam no Storage para auditoria; desative/descarte versões inúteis se necessário.
- **Edge Functions**: chamadas só por mensagem do WhatsApp, envio de resposta e reenvio a cada 5 min — muito abaixo da franquia.
- **Realtime**: uma conexão por extensão aberta + worker; bem abaixo do limite do plano gratuito.

## Netlify

Painel estático (≈ 230 KB comprimidos). Evite deploys automáticos a cada commit se a conta for do modelo de créditos
(configure *Deploy only on main* ou deploy manual).

## Computador do worker

Consumo de energia de um desktop comum ligado no horário comercial. Sem GPU, as respostas levam ~15–45 s.

## Fontes consultadas (31/10/2026)

- Meta — Pricing on the WhatsApp Business Platform: <https://developers.facebook.com/docs/whatsapp/pricing>
- Zoho — WhatsApp Business Pricing Update (service messages charged from Oct/2026): <https://help.zoho.com/portal/en/community/topic/whatsapp-business-platform-message-pricing-guide>
- Wati — WhatsApp service message pricing: <https://www.wati.io/en/blog/whatsapp-service-message-pricing/>
- Supabase free tier (agregadores; conferir em supabase.com/pricing): <https://automationatlas.io/answers/supabase-free-tier-limits-2026/>
- Netlify free plan (créditos): <https://netli.fyi/blog/netlify-free-plan-limits-2026>
