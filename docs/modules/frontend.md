# Módulo — Frontend (páginas & componentes)

**Localização:** `src/app/**` (rotas/páginas) e `src/components/**` (componentes).

Next.js 16 App Router, React 19. Páginas são **Server Components** por padrão; interatividade fica em **Client Components**.

## Grupos de rota

### `(public)` — sem sessão
| Rota | Tipo | Tela |
|------|------|------|
| `/login` | server | Login com branding. |
| `/forgot-password` | client | Pedir reset de senha. |
| `/reset-password` | client (Suspense) | Definir nova senha via token. |

### `(app)` — autenticadas (dentro de `SessionGate`)
| Rota | Tipo | Tela |
|------|------|------|
| `/dashboard` | server | Resumo da rodada, stats, desafios recebidos/meus, resultados recentes; (admin) inativos/licença. |
| `/ranking` | server | Rankings + jogadores, janela de desafio, (admin) reordenar/recalcular/rollover/restore. |
| `/desafios` | server | Lista de desafios com filtros; (admin) criar manualmente. |
| `/perfil` | server | Perfil, avatar, rankings vinculados, histórico, visibilidade. |
| `/admin/usuarios` | client | Gestão de usuários, papéis, memberships, flags, challenge-lock. |
| `/admin/rankings` | client | Lista de rankings + contagem de jogadores. |
| `/admin/rodadas` | client | Criar/listar rodadas. |
| `/admin/config` | client | Agenda de horários da rodada (ponto azul / livre / prazo). |
| `/admin/configuracoes` | client | Branding (nome/logo/favicon/PWA), manutenção, categorias. |
| `/admin/ponto-azul` | server | Histórico/avaliação de ponto azul da rodada. |

### Raiz
- `/` → redireciona para `/login`.
- `layout.tsx` → root layout, script de tema (anti-flash), metadata/branding.
- `manifest.ts` → PWA manifest dinâmico.

## Componentes

### `components/app/` — layout & navegação
- **SessionGate** (server): valida sessão (→ `/login`), carrega avatar/nome (cache 5 min), aplica modo manutenção (não-admins veem `MaintenanceView`), monta `AppHeader` + `PageContainer` + `BottomNav`.
- **AppHeader**: logo/nome, usuário, badge de papel, `ThemeToggle`, `LogoutButton`.
- **BottomNav** (client): navegação inferior, item ativo via `usePathname`; itens vêm de `getNavItems(role)`.
- **ThemeToggle** (client): dark/light em `localStorage`, classe `.dark` no `<html>` (default dark).
- **MaintenanceView**, **PageContainer**, **UserAvatar**, **EmptyState**, **SectionTitle**, **StatPill**, **LogoutButton**.

### `components/auth/`
- **LoginCard**, **ResetPasswordForm**.

### `components/dashboard/`
- **DashboardCards** (client): cards de rodada/stats, desafios, modal de resultado, resultados recentes.

### `components/ranking/`
- **RankingList** (client): carrega rankings/jogadores por mês (com cache), mostra janela/contagem regressiva; (admin) drag-to-reorder, recalcular/rollover/restore, flags de jogador.

### `components/challenges/`
- **DesafiosClient** (client): lista com filtros (ranking/mês/status/sort), métricas; (admin) criar desafio com resultado opcional.
- **ChallengeCard**: card de um desafio (jogadores, status, data, resultado, ações).

### `components/profile/`
- **ProfileForm**, **AvatarUploader**, **ProfileHistoryTabs**, **RankingVisibilityToggle**.

### `components/admin/`
- **BluePointHistoryPage**.

### `components/ui/` — design system (shadcn/Radix)
`badge`, `button`, `card`, `input`, `label`, `select`, `separator`, `skeleton`, `tabs`.

## Navegação (`src/lib/nav.ts`)
- `baseNavItems`: Dashboard, Ranking, Desafios, Perfil.
- `adminNavItem`: Admin (→ `/admin/usuarios`), incluído quando `admin`/`collaborator`.
- `getNavItems(role)` decide a barra.

## Tema, branding & PWA
- Tema dark/light em `localStorage`, aplicado por script no root layout (sem flash).
- Branding (nome, logo, favicon, ícone PWA) vem de `app_settings` via `src/lib/branding.ts` (cache 60s). Ver [superpowers/branding-pwa-maintenance](../superpowers/branding-pwa-maintenance.md).
- `manifest.ts`: nome/ícones dinâmicos, `display: standalone`, cores teal/escuro.

## Helpers de cliente
- `src/lib/http.ts`, `http-prefetch.ts` — fetch e prefetch.
- `src/lib/timezone-client.ts`, `src/lib/date.ts` — datas/fuso.
- `src/lib/preferences/*` — visibilidade de ranking, refresh de desafios.
- `src/lib/whatsapp.ts` — normaliza telefone e monta link `wa.me` (compartilhar/contatar).
