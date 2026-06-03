# Spec — Perfil e conta

## Cadastro e identidade do jogador

Campos de `users`: `first_name`, `last_name`, `nickname`, `email` (único), `phone`, `birth_date`, `gender`, `role`, `avatar_path` (mapeado para `avatarUrl`).

Exibição de nome: usa `nickname` entre aspas quando há, senão nome completo; fallback "Jogador". Iniciais para avatar em `src/lib/user/initials.ts`.

> Fonte: `src/app/(app)/perfil/`, `src/components/profile/*`, `src/app/api/users/me/**`.

## Login

`POST /api/auth/login` com `{ email, password }`:
- Valida senha (bcrypt, `password_hash`).
- Gera novo `session_token`, assina JWT (`jose`, HS256, validade 1 ano) e grava no cookie `tcc_session` (httpOnly, sameSite lax, secure em prod).
- Responde `{ ok, user: { name, role } }`.

`GET /api/auth/validate` confere a sessão atual. `POST /api/auth/logout` limpa o cookie e invalida o token.

Detalhes em [modules/auth](../modules/auth.md).

## Reset de senha

1. `POST /api/auth/forgot` `{ email }` → gera `password_reset_token` + `password_reset_expires_at` e envia e-mail (nodemailer/SMTP). Resposta genérica (não revela se o e-mail existe).
2. Usuário acessa `/reset-password?token=...`.
3. `POST /api/auth/reset` `{ token, password }` → valida token/expiração, troca `password_hash`, limpa o token.

`must_reset_password` força a troca de senha quando marcado.

## Editar perfil (`POST /api/users/me`)

Atualiza: `firstName`, `lastName`, `nickname`, `email`, `phone`, `birthDate`, `password` (opcional). Também grava preferências de visibilidade de ranking via cookies (`showOtherRankings`, `visibleRankingIds`).

## Avatar (upload)

Fluxo com **URL presigned** (S3/MinIO):
1. `POST /api/storage/avatar/presign` `{ contentType }` → retorna `uploadUrl`, `key`, `publicUrl`.
2. Cliente faz `PUT` direto no `uploadUrl` (sem passar pelo servidor).
3. `POST /api/users/me/avatar` `{ publicUrl }` → grava `avatar_path` no usuário.

Componente: `AvatarUploader`. Detalhe em [modules/storage](../modules/storage.md).

## Histórico no perfil

`GET /api/rankings/[id]/players/[userId]/history` retorna, por jogador (até 3 meses):
- Histórico de **desafios** (vitórias/derrotas/pendentes).
- Status de **ponto azul**.
- Histórico de **penalidade de walkover** (streak de W.O., penalidade prevista).

Exibido em abas por ranking (`ProfileHistoryTabs`).

## Preferências de visibilidade de ranking

O jogador pode escolher ver outros rankings além do seu. Guardado em cookies e lido por `ranking-visibility*`. Componente `RankingVisibilityToggle`.

## Telas relacionadas

- `/perfil` — formulário, avatar, rankings vinculados, histórico, visibilidade.
- `/login`, `/forgot-password`, `/reset-password` (públicas).
- Componentes: `ProfileForm`, `AvatarUploader`, `ProfileHistoryTabs`, `RankingVisibilityToggle`, `LoginCard`, `ResetPasswordForm`.

## Gestão de usuários (admin)

`/admin/usuarios` + `GET/POST /api/admin/users`, `PATCH /api/admin/users/[id]`:
- Criar/editar usuários, definir papel, vincular a rankings (player) e a rankings de colaborador.
- Alternar flags de membership: ponto azul, acesso, suspenso, licença, posição.
- **Challenge-lock** (`/api/admin/users/[id]/challenge-lock`): ver/cancelar desafios pendentes que estejam "travando" um jogador num período.
