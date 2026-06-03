# Superpower — Engine de Ponto Azul

**Arquivo:** `src/lib/domain/blue-point.ts`. Spec de produto: [specs/03-ponto-azul](../specs/03-ponto-azul.md).

Avalia, por jogador de um ranking, se ele deve ter **ponto azul** (`is_blue_point`) e/ou estar **bloqueado** (`is_locked`), e por qual motivo. É chamado no fechamento da rodada e na tela admin de histórico.

## API

```ts
getBluePointEvaluation({ rankingId, monthStart, positionsByUser? })
  : Promise<{ threshold, recentMonthKeys, items: BluePointEvaluationItem[] }>

persistBluePointEvaluation(rankingId, items)   // grava is_blue_point e is_locked
```

`positionsByUser` permite avaliar contra posições já calculadas (no fechamento). Sem ele, resolve posições via snapshot (`end` preferido, senão `start`).

## Os dois critérios de concessão

### 1. Desafiado em meses consecutivos (`consecutive_challenges`)
O engine monta, por jogador, a **contagem de meses consecutivos em que foi desafiado**:
- Resolve os meses de referência recentes do ranking (`resolveRecentReferenceMonthKeys`, via rounds + snapshots).
- Para cada mês, conta quantas vezes o jogador foi **challenged** (desafios completed/scheduled/accepted).
- Percorre os meses cronologicamente, mantendo um `count` de streak.
- `challengedConsecutive = count >= threshold` (threshold = **2**).

### 2. Sem oponente alcançável (`no_reachable_opponent` → `locked`)
Para um jogador em posição > 1, não suspenso e **sem desafio no mês**, verifica se existe **algum** oponente válido:
- Itera os demais membros (ignora suspensos).
- **Acesso:** alvo precisa estar a partir do `accessLimit`.
- **Normal:** alvo acima dele e dentro de `maxPositionsUp` (10).
- Ignora pares blue-vs-blue e quem já tem desafio no mês.
- Se **nenhum** alvo serve → `locked = true`.

`enabled = (posição > 1 && challengedConsecutive) || locked`.

`reason` (precedência): `no_reachable_opponent` → `consecutive_challenges` → `unused_previous_blue_point` → `null`.

## Regra do "uso obrigatório" (caducidade)

O engine detecta se o jogador **usou** o ponto azul no mês: um desafio **criado por ele** dentro da janela `blue_point_opens_at … (blue_point_closes_at | open_challenges_at)` daquele mês conta como uso (`bluePointUsedInMonthByUser`).

Ao percorrer os meses:
- Se o jogador **tinha** ponto azul (atingiu threshold) e **não usou** naquele mês → o streak **reseta** e grava `lastUnusedBluePointMonth` (motivo `unused_previous_blue_point`).

Ou seja: ponto azul não usado **não acumula** — caduca.

## Janelas por mês (`resolveMonthRoundWindows`)

Para cada mês recente, busca a rodada (específica do ranking ou global) e deriva a janela de ponto azul. Sem rodada → fallback (07:00 + 24h). É o que define "dentro da janela" para a regra de uso.

## `BluePointEvaluationItem` (saída por jogador)

Campos ricos para UI/depuração: `position`, `enabled`, `locked`, `reason`, `challengedConsecutive`, `recentChallengeMonths`, `recentChallengeCount`, `lastUnusedBluePointMonth`, `challengedCountInMonth`, `totalMatchesInMonth`, `hasChallengeInMonth`, `currentBluePoint`, `currentLocked`, `isAccessChallenge`, `isSuspended`.

## Persistência

`persistBluePointEvaluation` faz `updateMany` em `ranking_memberships` gravando `is_blue_point = enabled` e `is_locked = locked`. Concessões ficam registradas em `blue_point_history` (único por ranking+user+mês+motivo).

## Parâmetros

```ts
bluePointPolicy.consecutiveChallengesThreshold = 2   // src/lib/domain/ranking.ts
```

## Ao mexer aqui

- Mudar o threshold é em `rankingConfig`.
- A definição de "usou o ponto azul" depende das janelas da rodada — alterações em horários de rodada afetam a caducidade.
- O nº 1 do ranking nunca recebe ponto azul por consecutivos (regra `position > 1`).
