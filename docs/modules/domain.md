# Módulo — Domínio (regras de negócio)

**Localização:** `src/lib/domain/` + `src/lib/challenges/result.ts`.

É o **núcleo** do sistema. Toda regra de ranking, ponto azul, desafio, rodada e penalidade vive aqui. As rotas de API são finas e delegam para este módulo.

## Mapa dos arquivos

| Arquivo | Responsabilidade | Doc aprofundada |
|---------|------------------|-----------------|
| `ranking.ts` | **Config central** (`rankingConfig`), limites de acesso por slug, helpers de mês, `ensureBaselineSnapshot`. | [specs/01](../specs/01-rankings.md) |
| `ranking-simulator.ts` | Classe `RankingSimulator`: aplica vitória/derrota/penalidade às posições. | [superpowers/ranking-simulator](../superpowers/ranking-simulator.md) |
| `ranking-round-processor.ts` | `atualizarRanking()`: orquestra eventos do mês, valida ordem/limites, gera violações e logs. | [superpowers/ranking-simulator](../superpowers/ranking-simulator.md) |
| `round-actions.ts` | `closeRound`, `restoreSnapshot`, `rolloverRound`: fechamento de rodada, snapshots, persistência, rollover. (~1000 linhas) | [superpowers/snapshot-restore-rollover](../superpowers/snapshot-restore-rollover.md) |
| `blue-point.ts` | `getBluePointEvaluation` / `persistBluePointEvaluation`: avaliação de ponto azul. | [superpowers/blue-point-engine](../superpowers/blue-point-engine.md) |
| `walkover-penalty.ts` | Penalidade automática de W.O. consecutivo; histórico por jogador. | [superpowers/walkover-penalty](../superpowers/walkover-penalty.md) |
| `challenges.ts` | `resolveChallengeWindows` / `toWindowState`: janelas e fases da rodada. | [specs/04](../specs/04-rodadas-e-janelas.md) |
| `permissions.ts` | Helpers de papel (`hasAdminAccess`, `hasStaffAccess`). | [specs/05](../specs/05-papeis-e-permissoes.md) |
| `collaborator-access.ts` | Rankings que um colaborador pode gerenciar (com cache). | [specs/05](../specs/05-papeis-e-permissoes.md) |
| `round-overrides.ts` | Constantes do marcador de **ordem manual** (`MANUAL_ORDER`). | [specs/04](../specs/04-rodadas-e-janelas.md) |
| `ranking-simulator.ts` | (acima) | |
| `../challenges/result.ts` | `resolveChallengeWinner` / `resolveChallengeStatus` / `resolveChallengeResultForUser`: deriva vencedor/status a partir de placar/WO/retired. | [specs/02](../specs/02-desafios.md) |

## Configuração central (`rankingConfig`)

```ts
// src/lib/domain/ranking.ts
export const rankingConfig = {
  maxPositionsUp: 10,            // distância máx. em desafio normal
  inactiveMonths: [],           // meses pulados no rollover (nenhum hoje)
  accessEntryRules: {           // limite de acesso por ranking
    "ranking-masculino": 30,
    "ranking-feminino": 10,
    "ranking-master-45": 20,
  },
  bluePointPolicy: {
    consecutiveChallengesThreshold: 2,  // meses consecutivos p/ ponto azul
    rangeLimit: 10,
  },
}
```

> **Mudar uma regra geralmente passa por aqui.** Constantes de WO ficam em `walkover-penalty.ts` (`WALKOVER_PENALTY_TRIGGER_STREAK = 2`, `WALKOVER_PENALTY_POSITIONS = 10`).

## Fluxo de fechamento (visão de alto nível)

```
closeRound(rankingId, "YYYY-MM", actorId, options)
  1. resolve baseline (snapshot start → end mês anterior → hints → ordem atual)
  2. grava snapshot "start"
  3. se ordem manual/preserve → mantém ordem atual (+ penalidades WO) e encerra
  4. senão:
     a. lê desafios completed do mês → vira eventos
     b. atualizarRanking(baseline, eventos, maxPositionsUp)  ← simulador + validações
     c. se violações e !ignore → retorna sem persistir
     d. aplica penalidades automáticas de WO
     e. transação: grava posições + snapshot "end" + round_logs (+ status closed)
     f. reavalia ponto azul
```

## Princípios ao mexer

- **Mantenha o domínio puro e testável.** Regras devem ficar aqui, não nas rotas nem nos componentes.
- **Snapshots são a fonte de verdade histórica.** Não recalcule "destrutivamente" sem preservar/poder restaurar o snapshot.
- **Violações primeiro, persistência depois.** Nunca grave posições com desafios inválidos sem override explícito.
- **Idempotência:** `closeRound` regrava snapshots/logs e pode ser reexecutado para o mesmo mês.
- **Datas em `America/Sao_Paulo`** — use os helpers de `src/lib/date.ts` / `src/lib/timezone.ts`.
