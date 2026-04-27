# Revisao de Seguranca Pre-Producao

Data: 2026-04-27

Referencia usada: OWASP Top 10 2021 e OWASP ASVS 5.0.0.

## Corrigido no codigo

- Sessao do Supabase no frontend passou de `localStorage` para `sessionStorage`, reduzindo persistencia de token apos fechamento do navegador.
- Mensagens de login/cadastro foram tornadas genericas para reduzir enumeracao de usuarios.
- Politica de senha no cadastro passou a exigir pelo menos 10 caracteres, letra maiuscula, minuscula e numero.
- Edge Functions receberam CORS restrito por `ALLOWED_ORIGINS`, headers de seguranca, `Cache-Control: no-store`, rate limit por IP/usuario e erros sanitizados.
- Acoes sensiveis de assinatura/admin agora exigem `POST`, origem permitida e registram eventos de seguranca.
- `create-checkout` valida `priceId` contra `STRIPE_PRICE_IDS` quando configurado.
- `verify-checkout` valida formato da sessao e impede verificar checkout associado a outro e-mail.
- `expire-trials` pode exigir `CRON_SECRET`.
- Migração adicionada para tabelas de rate limit/auditoria e trigger que impede usuario comum de alterar campos privilegiados em `profiles`.
- Validacao de upload de PDF por tamanho, extensao, MIME e magic bytes.
- Importacao de planilhas passou a aceitar CSV validado, removendo o parser `xlsx` vulneravel.
- Exportacoes foram protegidas contra formula injection e nomes de arquivo inseguros; exportacao tabular agora gera CSV compativel com Excel.
- Headers de seguranca foram adicionados para Netlify/Cloudflare Pages (`public/_headers`) e Vercel (`vercel.json`).
- `.env` foi colocado no `.gitignore` e foi criado `.env.example`.
- `npm audit --omit=dev` ficou sem vulnerabilidades conhecidas.

## Pendencias prioritarias

### Critica

- Configurar Supabase Auth em producao: email confirmation, SMTP confiavel, protecao de senha vazada/captcha/rate limit nativo, URLs de redirect permitidas e expiracao/refresh token conforme politica do negocio.
- Definir `ALLOWED_ORIGINS`, `APP_ORIGIN`, `STRIPE_PRICE_IDS` e `CRON_SECRET` nos secrets das Edge Functions antes do deploy.

### Alta

- Considerar arquitetura BFF/SSR para guardar tokens em cookies `HttpOnly`, `Secure`, `SameSite=Lax/Strict`. Em SPA pura com `supabase-js`, o token ainda fica acessivel ao JavaScript, agora em `sessionStorage`.
- Mover importacoes/exportacoes sensiveis para backend se for necessario aplicar rate limit e auditoria fortes sobre esses fluxos; hoje exportacoes ainda sao client-side sobre dados ja filtrados por RLS.
- Aplicar as migrations no banco de producao e validar que RLS esta habilitado em todas as tabelas.

### Media

- Reduzir logs de diagnostico do parser Itaú em producao.
- Revisar CSP depois do deploy real e remover qualquer permissao nao usada.
- Adicionar testes automatizados com usuario A/B contra RLS em ambiente Supabase de teste.

### Baixa

- Fazer code splitting para reduzir chunks grandes.
- Atualizar base Browserslist periodicamente.

## Checklist de publicacao segura

- Rodar `npm audit --omit=dev`, `npm test` e `npm run build`.
- Aplicar migrations Supabase.
- Configurar Auth: confirmacao de e-mail, redirects de producao, politicas de senha, rate limit/captcha.
- Configurar Edge Function secrets: `ALLOWED_ORIGINS`, `APP_ORIGIN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_IDS`, `CRON_SECRET`.
- Configurar dominio HTTPS e verificar HSTS/CSP/Referrer-Policy/Permissions-Policy/X-Content-Type-Options.
- Confirmar que o anon key do Supabase e a URL sao os unicos valores `VITE_*` expostos ao browser.
- Testar usuario A tentando ler/editar IDs do usuario B via DevTools/Supabase REST.
- Testar logout e fechamento do navegador limpando a sessao.
- Testar upload de PDF invalido/grande e CSV invalido/grande.
- Testar exportacao com campos iniciados por `=`, `+`, `-` e `@`.
