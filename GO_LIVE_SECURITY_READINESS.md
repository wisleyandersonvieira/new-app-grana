# Go-Live Security Readiness

Data: 2026-04-27

Referencias usadas como checklist: OWASP Top 10 2021 e OWASP ASVS.

## Parecer executivo

Status atual: **nao pronto para producao ate executar o teste A/B contra o Supabase de staging/producao e confirmar as configuracoes do painel Supabase Auth**.

O codigo recebeu os principais fechamentos de alto risco desta rodada:

- RLS habilitado nas tabelas sensiveis.
- Policies de dados do usuario padronizadas com `USING auth.uid() = usuario_id` e `WITH CHECK auth.uid() = usuario_id` em inserts/updates.
- Triggers de integridade de proprietario bloqueando referencias cruzadas entre usuarios.
- Edge Functions autenticadas por JWT por padrao, mantendo sem JWT apenas webhook Stripe e job de expiracao de trial.
- Teste A/B automatizado para validar isolamento entre usuarios.

Bloqueios objetivos restantes:

- Rodar `npm run security:rls` com `SUPABASE_SERVICE_ROLE_KEY` em ambiente controlado e obter 100% PASS.
- Confirmar manualmente no painel Supabase Auth as configuracoes listadas neste documento.

## Evidencias desta rodada

| Verificacao | Resultado |
| --- | --- |
| `npm run build` | PASS |
| `npm test` | PASS, 62 testes |
| `npm audit --omit=dev` | PASS, 0 vulnerabilidades |
| `npm run security:rls` | BLOQUEADO localmente por falta de `SUPABASE_SERVICE_ROLE_KEY`; teste criado e pronto para execucao em staging/producao |
| Varredura de secrets no codigo | Sem secret privado hardcoded; apenas anon/publishable key publica em `.env` local |
| Edge Functions com JWT | Todas autenticadas, exceto `stripe-webhook` e `expire-trials`, que sao fluxos nao interativos e dependem de assinatura/segredo |

## RLS e isolamento por tabela

| Tabela | RLS | SELECT | INSERT | UPDATE | DELETE | Risco encontrado | Correcao aplicada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| profiles | Sim | Proprio perfil; admins por policy separada | Proprio `user_id` | Proprio `user_id`; trigger bloqueia escalada | Sem delete client | Escalada de campos privilegiados | Trigger de protecao ja existente mantido |
| assinaturas | Sim | Propria `usuario_id`; admins por policy separada | Propria `usuario_id` | Propria `usuario_id`; admins por policy separada | Sem delete client | Service role em billing precisa ficar so em Edge | Mantido no backend/Edge |
| contas | Sim | `auth.uid() = usuario_id` | `WITH CHECK` usuario proprio | `USING` + `WITH CHECK` usuario proprio | Usuario proprio | Possivel update ambiguo de dono | Policy reescrita explicitamente |
| categorias | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Possivel update ambiguo de dono | Policy reescrita explicitamente |
| subcategorias | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para categoria de outro usuario | Trigger valida `categoria_id` |
| receitas | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para conta/categoria/subcategoria de outro usuario | Trigger valida referencias |
| despesas | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para conta/categoria/subcategoria/despesa pai/fatura de outro usuario | Trigger valida referencias |
| transferencias | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para conta origem/destino de outro usuario | Trigger valida ambas as contas |
| faturas_cartao | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para cartao/conta de outro usuario | Trigger valida conta |
| itens_fatura | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para fatura/categorias de outro usuario | Trigger valida fatura e categorias |
| metas | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para categoria de outro usuario | Trigger valida categoria |
| bloqueios | Sim | Usuario proprio | Usuario proprio | N/A | Usuario proprio | Baixo; sem FK sensivel | Policy padronizada |
| categorias_sugeridas_cartao | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para cartao/categoria de outro usuario | Trigger valida referencias |
| importacoes_fatura_pdf | Sim | Usuario proprio | Usuario proprio | Usuario proprio | Usuario proprio | Poderia apontar para cartao/fatura de outro usuario | Trigger valida referencias |
| billing_subscriptions | Sim | Proprio `user_id` | Sem client | Sem client/admin | Sem client | Dados de billing sensiveis | Mantido por Edge/service role |
| billing_payment_methods | Sim | Proprio `user_id` | Sem client | Sem client | Sem client | Dados de cartao mascarado | Mantido por Edge/service role |
| billing_invoices | Sim | Proprio `user_id` | Sem client | Sem client | Sem client | Invoices de outro usuario | Mantido por Edge/service role |
| admin_user_logs | Sim | Usuario ve proprios logs; admins inserem | Admin/service | Sem client | Sem client | Auditoria administrativa | Mantido restrito |
| security_rate_limits | Sim | Sem acesso client | Sem acesso client | Sem acesso client | Sem acesso client | Manipulacao de rate limit | Policy nega client |
| security_audit_events | Sim | Admin | Sem escrita client | Sem escrita client | Sem escrita client | Vazamento de auditoria | Policy admin-only |

## Teste A/B de isolamento

Comando:

```bash
npm run security:rls
```

Variaveis exigidas:

- `SUPABASE_URL` ou `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` ou `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

O teste cria dois usuarios temporarios, autentica ambos com anon key, cria dados para A e B e valida:

- A nao le dados de B.
- A nao altera dados de B.
- A nao exclui dados de B.
- A nao cria receitas/despesas/faturas/transferencias/itens apontando para IDs de B.

Resultado esperado para go-live: **100% PASS**.

## Supabase Auth para producao

Configurar no painel Supabase:

| Configuracao | Valor esperado | Risco se errado |
| --- | --- | --- |
| Site URL | `https://SEU-DOMINIO` | Links de auth/reset para origem indevida |
| Redirect URLs | Apenas dominios oficiais, ex.: `https://SEU-DOMINIO/*` e callbacks usados pela app | Open redirect ou captura de sessao |
| Email confirmation | Ativado | Contas falsas/abuso de cadastro |
| Password recovery redirects | Apenas dominio oficial | Roubo de fluxo de reset |
| SMTP | Provedor confiavel com SPF/DKIM/DMARC | Entrega ruim e phishing operacional |
| Password policy | Minimo 10 caracteres, complexidade razoavel e protecao contra senha vazada quando disponivel | Credenciais fracas |
| Captcha/bot protection | Ativar em signup/login/reset se disponivel no plano | Abuso automatizado |
| Rate limits Auth | Endurecer login, signup, OTP/reset e token refresh conforme limites do painel | Brute force e enumeracao |
| Email enumeration protection | Ativar quando disponivel | Descoberta de contas existentes |
| Session expiration | Access token curto, recomendado 30-60 min | Janela maior para token roubado |
| Refresh token rotation | Ativado, reuse interval minimo compativel | Reuso de refresh token |
| MFA | Recomendado para administradores | Conta admin comprometida sem segundo fator |

## Sessao e token

Estado atual:

- A SPA usa Supabase Auth no browser.
- Persistencia foi reduzida para `sessionStorage`.
- Logout remove a sessao do client.
- Tokens nao foram encontrados hardcoded no frontend alem da anon/publishable key, que e publica por design.

Risco residual:

- Em uma SPA pura, access token e refresh token ainda ficam acessiveis a JavaScript durante a sessao.
- Um XSS bem-sucedido pode roubar token enquanto a aba estiver aberta.

Caminho ideal para nivel mais forte:

- Migrar para arquitetura BFF/SSR ou gateway proprio.
- Guardar sessao em cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
- Fazer operacoes mutaveis via backend com CSRF token.
- Remover acesso direto do browser a operacoes sensiveis quando possivel.

## Importacao, exportacao e fluxos sensiveis

Estado atual:

- Importacao de PDF/CSV tem validacao de tipo/tamanho no frontend.
- Exportacao usa dados ja filtrados por RLS e mitigacao de formula injection em CSV.
- Edge Functions de billing/admin possuem JWT, origem permitida, rate limit e erros seguros.

Recomendado pos go-live:

- Migrar importacoes grandes para Edge Function com fila/auditoria.
- Migrar exportacoes sensiveis para Edge Function com rate limit e log de auditoria.
- Registrar eventos de exportacao/importacao em `security_audit_events`.

## Secrets e variaveis de producao

Pode ficar no frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Nunca colocar no frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET`
- segredos SMTP
- tokens de integracao

Obrigatorio nas Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_IDS`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`
- `CRON_SECRET`

## Headers, CSP e HTTPS

Configuracao esperada:

- HTTPS obrigatorio no provedor.
- HSTS ativo em producao.
- `Content-Security-Policy` sem `frame-ancestors` permissivo.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` restritiva.
- `Cache-Control: no-store` para rotas autenticadas ou app shell sensivel.

## Checklist final de go-live

- [ ] Aplicar migrations no Supabase de staging.
- [ ] Rodar `npm run security:rls` em staging e anexar saida 100% PASS.
- [ ] Conferir Supabase Auth com a tabela deste documento.
- [ ] Configurar secrets das Edge Functions.
- [ ] Confirmar dominio real em `APP_ORIGIN` e `ALLOWED_ORIGINS`.
- [ ] Confirmar Stripe webhook endpoint e secret.
- [ ] Confirmar HTTPS/HSTS no provedor.
- [ ] Rodar `npm run build`, `npm test`, `npm audit --omit=dev`.
- [ ] Fazer teste manual de login/logout/reset de senha.
- [ ] Fazer teste manual de importacao/exportacao com dois usuarios reais de staging.
