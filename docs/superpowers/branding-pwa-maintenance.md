# Superpower — Branding dinâmico, PWA & Modo manutenção

**Arquivos:** `src/lib/branding.ts`, `src/app/layout.tsx`, `src/app/manifest.ts`, `src/components/app/{SessionGate,MaintenanceView,ThemeToggle}.tsx`, `src/app/api/admin/app-settings/route.ts`. Dados: tabela `app_settings`.

O app é **white-label configurável em runtime**: nome, logo, favicon, ícone do PWA e modo manutenção vêm do banco e refletem sem rebuild.

## `app_settings` (única linha de configuração)

| Campo | Uso |
|-------|-----|
| `app_name` | Nome exibido e título. |
| `logo_url` | Logo no header/login. |
| `favicon_url` | Favicon. |
| `pwa_icon_url` | Ícone do PWA/manifest. |
| `maintenance_enabled` | Liga/desliga manutenção. |
| `maintenance_message` | Texto da tela de manutenção. |
| `updated_by` / `updated_at` | Auditoria. |

Editado em `/admin/configuracoes` via `GET/PATCH /api/admin/app-settings` (admin). Ativos enviados por presigned upload (ver [modules/storage](../modules/storage.md), `/api/storage/branding/presign`).

## `getAppBranding()` (`branding.ts`)

- Lê `app_settings` com **cache de 60s**.
- Fallbacks: `NEXT_PUBLIC_APP_NAME` ou "Ranking Tenis TCC" para o nome; avatar do admin (`ADMIN_LOGO_EMAIL`) como logo de fallback quando não há configuração.
- Consumido por: root layout (metadata/título/favicon), `manifest.ts`, header e login.

## PWA (`manifest.ts`)

Manifest **dinâmico**:
- `name` do branding.
- `icons` 192/512 a partir de `pwaIconUrl`/`logoUrl`.
- `display: standalone` (instalável como app).
- Cores: fundo escuro (`#0b1218`), tema teal (`#0b5a78`).

Root layout aponta para `/manifest.webmanifest` e injeta `theme-color`.

## Tema (dark/light)

- `ThemeToggle` (client): alterna `.dark` no `<html>`, persiste em `localStorage` (`theme`), **default dark**.
- Script inline no root layout aplica o tema **antes** da hidratação → sem flash (FOUC).

## Modo manutenção (gate no `SessionGate`)

Fluxo no `SessionGate` (server) a cada navegação autenticada:
1. Valida sessão (→ `/login` se inválida).
2. Lê branding (inclui `maintenance_enabled`).
3. Se manutenção **ligada** e usuário **não é admin** → renderiza `MaintenanceView` (com `maintenance_message`).
4. Admins continuam com o app normal (podem operar/desligar a manutenção).

> Permite "fechar" o app para os jogadores durante recálculos/migrações, mantendo o admin operante.

## Ao mexer aqui

- Mudanças de branding levam até **60s** para propagar (cache). Use `fresh` onde aplicável ou aguarde o TTL.
- O fallback de logo depende de `ADMIN_LOGO_EMAIL` existir como usuário com avatar.
- Não acoplar regra de negócio ao branding — é só apresentação + flag de manutenção.
