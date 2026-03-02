# Deploy no Coolify (Producao)

Este guia prepara o projeto para deploy em producao no Coolify usando Dockerfile multi-stage e Next standalone.

## A) Criar projeto no Coolify
1) Crie um novo projeto e conecte o repositorio Git.
2) Selecione o build pack "Dockerfile".

## B) App Service (Next.js)
- Build pack: Dockerfile
- Port: 3000
- Healthcheck: /api/health
- Variaveis de ambiente: use o .env.example como base

### Variaveis obrigatorias
```
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_PUBLIC_BASE_URL=
S3_FORCE_PATH_STYLE=true
NEXT_PUBLIC_APP_NAME="Ranking Tenis TCC"
```

## C) Supabase (PostgreSQL)
1) Crie um projeto no Supabase.
2) Copie as strings de conexao:
- Transaction pooler (porta 6543): uso da aplicacao
- Direct connection (porta 5432): uso de migration/introspection
3) Configure variaveis no app:
```
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-west-2.pooler.supabase.com:6543/postgres?schema=ranking_tcc&sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?schema=ranking_tcc&sslmode=require
```
4) Migre o schema/dados para o schema `ranking_tcc` e valide contagens antes da virada.

## D) MinIO (Coolify Service)
1) Crie o servico MinIO no Coolify.
2) Exponha as portas internas 9000 (API) e 9001 (Console).
3) Configure dominios:
- API: https://s3.seudominio.com
- Console: https://s3-console.seudominio.com
4) Ative SSL no Coolify.
5) Crie o bucket definido em S3_BUCKET (ex: tcc-avatars).
6) Configure variaveis no app:
```
S3_ENDPOINT=https://s3.seudominio.com
S3_PUBLIC_BASE_URL=https://s3.seudominio.com/tcc-avatars
S3_FORCE_PATH_STYLE=true
```

### CORS no MinIO (se necessario)
Se o upload falhar por CORS, libere o dominio do app no MinIO:
- AllowedOrigins: https://app.seudominio.com
- AllowedMethods: GET, PUT

## E) Prisma em producao
- Nao rode seed automaticamente.
- Rode manualmente quando necessario:
```
npx prisma db seed
```
- Se houver migrations:
```
npm run prisma:migrate:deploy
```

## F) Checklist de teste
- Login admin e player
- Upload de avatar
- Listar rankings/jogadores
- Criar desafio e registrar resultado
- Acessar paginas admin

## G) Rollback
- Use "Redeploy previous image" no Coolify.
- Mantenha backups do PostgreSQL/Supabase (dump periodico).
- Mantenha backup do volume do MinIO.

## Notas de build
- O Dockerfile usa output standalone e inclui libc6-compat.
- Se houver erro com sharp, instale dependencias no Alpine ou use uma imagem base debian.
