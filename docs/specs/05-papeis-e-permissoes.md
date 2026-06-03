# Spec — Papéis e permissões

## Papéis (`users_role`)

| Papel | Descrição | Acesso |
|-------|-----------|--------|
| `admin` | Administrador geral. | Tudo: todas as telas `/admin`, todos os rankings, override de regras. |
| `collaborator` | Staff parcial. | Rankings específicos (`collaborator_rankings`) + telas admin limitadas. |
| `player` | Jogador participante. | App do jogador (dashboard, ranking, desafios, perfil). |
| `member` | Participante (variante). | Igual a player no acesso. |

> Fonte: `src/lib/domain/permissions.ts`, `src/lib/domain/collaborator-access.ts`, `src/proxy.ts`.

## Gating de rotas (`src/proxy.ts`)

Rotas públicas (sem sessão): `/login`, `/forgot-password`, `/reset-password`.

Demais rotas exigem cookie de sessão válido (`tcc_session`), senão → redireciona a `/login`.

Para `/admin/*`:
- `/admin` ou `/admin/` → redireciona a `/admin/usuarios`.
- **admin** → acesso total.
- **collaborator** → só `/admin/usuarios`, `/admin/rodadas`, `/admin/config`. Qualquer outra rota admin → redireciona a `/dashboard`.
- demais papéis → `/dashboard`.

O middleware cobre: `/dashboard`, `/ranking`, `/desafios`, `/perfil`, `/admin/*`.

## Helpers de permissão

```ts
hasAdminAccess(session)   // role === "admin"
hasStaffAccess(session)   // admin || collaborator
isAdminRole / isCollaboratorRole
```

## Acesso de colaborador a rankings

`collaborator-access.ts` resolve **quais rankings** um colaborador pode gerenciar:

- `getAllowedRankingIds(session)`:
  - admin → `null` (= **todos**).
  - collaborator → IDs de `collaborator_rankings` (com cache em memória, TTL `COLLABORATOR_RANKING_IDS_CACHE_TTL_MS`, padrão 60s).
  - outros → `[]` (nenhum).
- `canManageRanking(session, rankingId)` → `true` se admin, ou se o ranking está na lista do colaborador.

As APIs admin de rankings (recalculate/reorder/restore/rollover, config, rounds, users) usam esses helpers para filtrar o que cada colaborador enxerga e pode alterar.

## Camadas de verificação (defesa em profundidade)

1. **Middleware** (`proxy.ts`) — bloqueio grosso por rota/papel antes de renderizar página.
2. **SessionGate** (componente server) — revalida sessão, carrega header/nav, aplica modo manutenção.
3. **Cada Route Handler** — revalida sessão (`getSessionFromCookies`) e checa permissão fina (admin/staff/ranking) antes de agir.

## Override de admin

Admins podem:
- Criar desafios manualmente (definindo `challenger_id`, ignorando janelas/limites) — marcados via `challenge_events` e tratados com `ignoreRules` no recálculo.
- Registrar/editar resultados imediatamente (sem esperar 5 min).
- Cancelar/excluir qualquer desafio.
- Reordenar, recalcular, restaurar e fazer rollover de rankings.
- Forçar fechamento ignorando violações (ordem manual).

## Modo manutenção

Quando `app_settings.maintenance_enabled = true`, o `SessionGate` mostra a tela de manutenção para **não-admins**; admins continuam usando o app. Ver [superpowers/branding-pwa-maintenance](../superpowers/branding-pwa-maintenance.md).
