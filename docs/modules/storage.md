# Módulo — Storage (S3 / MinIO)

**Localização:** `src/lib/storage/` (`s3.ts`, `avatar.ts`), `src/app/api/storage/**`, `src/lib/user/avatar-field.ts`.

Armazena mídia (avatares de jogadores e ativos de branding: logo, favicon, ícone PWA) em um bucket compatível com S3. Em produção/local o backend é **MinIO**; a API é a do `@aws-sdk/client-s3`.

## Por que presigned upload

O upload **não passa pelo servidor Next**. O cliente pede uma **URL presigned**, e faz `PUT` direto no S3/MinIO. Vantagens: não carrega o servidor com binários, e o controle de acesso fica na geração da URL.

### Fluxo (avatar)
```
Client → POST /api/storage/avatar/presign { contentType }
        ← { uploadUrl, key, publicUrl }
Client → PUT uploadUrl  (bytes da imagem)
Client → POST /api/users/me/avatar { publicUrl }
        → grava users.avatar_path
```

### Fluxo (branding) — admin
```
Client → POST /api/storage/branding/presign { contentType, kind: "logo"|"favicon"|"pwa" }
        ← { uploadUrl, key, publicUrl }
Client → PUT uploadUrl
Client → PATCH /api/admin/app-settings { logoUrl|faviconUrl|pwaIconUrl }
```

## `s3.ts`

- Resolve endpoint, credenciais e bucket via env (`resolveEnv` lança se faltar).
- Suporta **endpoints distintos** para uso interno vs. público (importante atrás de proxy/Coolify):
  - `S3_ENDPOINT` / `S3_ENDPOINT_INTERNAL` / `S3_PUBLIC_ENDPOINT`.
- `S3_FORCE_PATH_STYLE=true` (necessário para MinIO).
- Capaz de criar bucket, configurar policy pública e **CORS** (`PutBucketCorsCommand`) — útil para permitir o `PUT` do navegador.
- Gera URLs presigned com `getSignedUrl`.

## `avatar.ts` / `avatar-field.ts`

- Helpers para montar a key do avatar e normalizar/derivar a URL pública gravada em `avatar_path` (exposto como `avatarUrl`).

## Variáveis de ambiente

```
S3_ENDPOINT            # endpoint principal
S3_ENDPOINT_INTERNAL   # endpoint para chamadas server-side (rede interna)
S3_PUBLIC_ENDPOINT     # endpoint que o navegador acessa
S3_REGION
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET              # ex.: tcc-avatars
S3_PUBLIC_BASE_URL     # base pública dos objetos (ex.: https://s3.dominio/tcc-avatars)
S3_FORCE_PATH_STYLE=true
```

## CORS (produção)

Se o `PUT` do navegador falhar por CORS, liberar no MinIO:
- `AllowedOrigins`: domínio do app.
- `AllowedMethods`: `GET, PUT`.

Ver [DEPLOY_COOLIFY.md](../DEPLOY_COOLIFY.md) seção D.

## Pontos de atenção

- Validar `contentType` no presign (já feito) para não aceitar uploads arbitrários.
- A URL presigned tem validade curta — o cliente deve fazer o `PUT` logo após recebê-la.
- Distinguir endpoint interno/público evita gravar no banco URLs que só funcionam dentro da rede.
