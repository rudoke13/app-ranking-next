# Superpower — Simulador de Ranking

O motor que transforma os **resultados de desafios de um mês** em **novas posições**. Dois arquivos cooperam:

- `src/lib/domain/ranking-simulator.ts` — classe `RankingSimulator` (mecânica pura de mover posições).
- `src/lib/domain/ranking-round-processor.ts` — `atualizarRanking()` (orquestra, valida, ordena eventos, gera logs/violações).

> Chamado por `closeRound()` (ver [snapshot-restore-rollover](./snapshot-restore-rollover.md)).

## Entrada e saída

```ts
atualizarRanking(
  rankingAnterior: RankingBaselineRow[],   // baseline ordenado (pos 1..N)
  resultadosRodada: RankingRoundEvent[],   // eventos dos desafios completed
  maxPositionsUp: number                   // = 10
): { rankingAtualizado, logExplicativo, violacoes }
```

`RankingRoundEvent`:
```ts
{
  challengeId, challengerId, challengedId,
  result: "challenger_win" | "challenger_loss" | "double_wo",
  isAccess, accessLimit, ignoreRules,
  challengerSnapshot, challengedSnapshot,   // posições no momento do desafio
  playedAt, sourceIndex
}
```

## Ordem de processamento dos eventos

Antes de aplicar, os eventos são **ordenados** por:
1. **Topo do confronto** (`topPositionForEvent`) — a melhor posição envolvida (menor número) primeiro. Garante que disputas no topo se resolvam antes das de baixo (efeito cascata correto).
2. Empate → por `playedAt` (mais antigo primeiro).
3. Empate → por `sourceIndex` (ordem de chegada).

Desafios duplicados (mesmo `challengeId`) são ignorados (`seenChallenges`).

## Validações (geram violações, não persistem)

Para cada evento, antes de aplicar:

| Violação | Quando |
|----------|--------|
| `DADO_INCOMPLETO` | falta challenger/challenged/result. |
| `PLAYER_NOT_FOUND` | um dos jogadores não está no baseline. |
| `INVALID_CHALLENGE_ORDER` | challenger não estava **abaixo** do challenged (`challengerSnapshot <= challengedSnapshot`). Há uma correção: se os snapshots invertem mas o baseline está correto, usa o baseline. |
| `ACESSO_FORA_INTERVALO` | desafio de acesso com alvo acima do `accessLimit`. |
| `MAX_10_ACIMA` | desafio normal com `distance > maxPositionsUp` (10). |

`ignoreRules = true` (desafios criados por admin) **pula** as checagens de acesso e de máx-10.

`distance = challengerSnapshot - challengedSnapshot`.

## Aplicação por tipo de resultado

### `challenger_win` → `applyVictory(challenger, challenged, challengedPos)`
- O desafiante **assume a posição do desafiado**.
- O desafiado **desce 1**.
- Cascata: quem estava entre eles desce naturalmente (inserção/remoção na lista ordenada).
- Movimentos: challenger = `RISE`, challenged = `DROP`.

### `challenger_loss` (defesa do desafiado)
- **Acesso:** challenger vai para a **última posição** (`applyPenalty(challenger, baseline.length, ...)`).
- **Normal:** challenger **cai `distance` posições** (`applyDefeat`), limitado a `challengerSnapshot + distance`.
  - Há **proteção de queda** (`enforceMaximumPosition` + `defeatProtectionEntries`): garante que ninguém caia além da posição máxima devida, resolvendo empates por melhor baseline.
- O desafiado é marcado `DEFENSE_WIN` (`markDefenseWin`) — não move, mas registra que defendeu.

### `double_wo`
- Ambos caem 1 posição (`applyPenalty(x, 1, ...)` para os dois).

## Desempates internos (importantes)

- **Quedas na mesma faixa** (`applyDefeat`): quando vários desafiantes perdem e caem para a mesma região, prioriza **manter à frente quem tinha melhor baseline** (posição menor).
- **Proteção de defesa**: as proteções de queda são aplicadas em ordem de `maximumPosition`, depois baseline, depois userId — determinístico.

## Logs explicativos

`buildLogs` gera mensagens em pt-BR por evento (ex.: "Fulano venceu Beltrano; assumiu a posição 7."). São gravadas em `round_logs` e exibidas ao admin.

## Determinismo

Dado o mesmo baseline + mesmos eventos, o resultado é **determinístico** (ordenação total dos eventos e desempates explícitos). Isso é o que permite **recalcular** com segurança.

## Ao mexer aqui

- Toda regra de "quem sobe/cai quanto" está neste motor. Alterações afetam o histórico — **sempre** validar com snapshots e logs.
- Mudou o limite (10) ou o acesso? É `rankingConfig` (ver [modules/domain](../modules/domain.md)), não hardcode no simulador.
- Preserve o **determinismo** — não introduza dependência de ordem de iteração não estável nem de relógio.
