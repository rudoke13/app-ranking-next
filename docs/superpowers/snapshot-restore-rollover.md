# Superpower — Snapshot / Restore / Rollover

**Arquivo:** `src/lib/domain/round-actions.ts` (~1000 linhas). O orquestrador do ciclo de vida de uma rodada.

Três operações públicas: `closeRound`, `restoreSnapshot`, `rolloverRound`.

## Snapshots — a fonte de verdade histórica

Tabela `ranking_snapshots`, por mês:
- **`start`** — foto das posições no **início** da rodada (baseline).
- **`end`** — foto após o **recálculo**.

Snapshots permitem: recalcular sem perder o ponto de partida, restaurar um mês e encadear meses (o `end` de um mês é o `start` candidato do seguinte).

## `closeRound(rankingId, "YYYY-MM", actorId, options)`

Fecha/recalcula a rodada de um mês. Passos:

### 1. Resolver o baseline (ordem de preferência)
1. Snapshot `start` do mês.
2. Snapshot `end` do **mês anterior**.
3. **Hints** (`buildBaselineFromHints`): reconstrói a ordem a partir das posições gravadas nos desafios do mês (`*_position_at_challenge`).
4. **Fallback**: ordem atual das memberships.

Depois grava o snapshot `start` (garante baseline registrado).

### 2. Caminho "ordem manual / preserve"
Se `manualOverride`/`preserveCurrentState`, **ou** se existe o marcador `MANUAL_ORDER` em `round_logs`:
- Usa a **ordem atual** das memberships como final.
- Aplica **penalidades automáticas de WO** mesmo assim.
- Grava posições + snapshot `end` + logs; marca rodada `closed`.
- Reavalia ponto azul (salvo `recomputeBluePoints = false`).
- **Ignora violações.**

### 3. Caminho normal (recálculo)
1. Lê desafios `completed` do mês (por `played_at`/`scheduled_for`).
2. Detecta desafios **criados por admin** (`challenge_events`) → marca `ignoreRules`.
3. Converte em `RankingRoundEvent[]` e chama `atualizarRanking()` (ver [ranking-simulator](./ranking-simulator.md)).
4. **Se houver violações e `!ignoreViolations`** → retorna violações e **não persiste**.
5. Aplica **penalidades automáticas de WO** (`applyAutomaticPenalties`).
6. **Transação:** grava posições (`applyMembershipPositions`, UPDATE em lote via `VALUES`), snapshot `end`, `round_logs`, e (se `closeStatus`) marca `rounds` como `closed`.
7. Reavalia **ponto azul**.

### Options
```ts
{
  manualOverride, preserveCurrentState, ignoreViolations,
  persistMemberships = true, recomputeBluePoints = true,
  closeStatus = true, closeGlobal = false
}
```
`closeGlobal` também fecha a rodada global (`ranking_id = null`) do mês.

### Retorno
`{ log, violations, positions, manualOverride }`.

## `restoreSnapshot(rankingId, "YYYY-MM", options)`

Restaura as posições das memberships a partir de um snapshot:
- `preferEndSnapshot` → tenta `end`, senão `start`.
- Sem snapshot → erro.
- Aplica via transação (salvo `persistMemberships = false`).

Usado por `POST /api/admin/rankings/[id]/restore` para desfazer/voltar um estado.

## `rolloverRound(rankingId, "YYYY-MM", actorId, options)`

Fecha o mês atual e **abre o próximo**:

1. Define `nextMonth` (`targetMonth` ou `nextActiveMonth` pulando `inactiveMonths`).
2. `targetIds`: o ranking; com `includeAll`, também os três canônicos (`ranking-masculino`, `ranking-feminino`, `ranking-master-45`).
3. Salvo `skipRecalculate`, chama `closeRound` (modo `manualOverride + preserveCurrentState`, sem reavaliar ponto azul) para cada ranking; se houver violações, **aborta** com erro.
4. Para cada ranking: fecha a rodada-fonte e **cria/atualiza** a rodada do `nextMonth`, **deslocando os horários** (`shiftMonth`) da rodada anterior — ou usa defaults (ponto azul 07:00–23:59 do 1º dia; livres no dia seguinte; deadline).

### Options
```ts
{ skipRecalculate, targetMonth?, includeAll? }
```

## Helpers internos relevantes

- `applyMembershipPositions` — UPDATE em lote via `Prisma.sql VALUES` (performático).
- `fetchSnapshot` / `storeSnapshot` / `storeEndSnapshot` — leitura/gravação de snapshots (dedupe por usuário).
- `buildBaselineFromHints` — reconstrói ordem a partir dos desafios.
- `applyAutomaticPenalties` — aplica WO consecutivo via `RankingSimulator` e gera logs.

## Garantias

- **Idempotente por mês:** regrava snapshot/logs; reexecutável.
- **Atômico:** persistência crítica em `$transaction`.
- **Seguro contra violações:** não persiste recálculo inválido sem override.

## Ao mexer aqui

- Cuidado com a **ordem do baseline** — é a base de tudo. Não altere a precedência sem entender o impacto histórico.
- Rollover com `includeAll` afeta vários rankings de uma vez; teste em staging.
- Penalidades de WO são aplicadas **mesmo no caminho manual** — não remova isso sem intenção.
