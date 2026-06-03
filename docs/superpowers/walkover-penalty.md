# Superpower — Penalidade automática de Walkover

**Arquivo:** `src/lib/domain/walkover-penalty.ts`. Aplicada em `closeRound` (ver [snapshot-restore-rollover](./snapshot-restore-rollover.md)).

## Regra

Quem dá **W.O.** (não comparece) em **2 meses consecutivos** sofre penalidade automática de **−10 posições** no ranking.

```ts
WALKOVER_PENALTY_TRIGGER_STREAK = 2     // meses consecutivos de W.O.
WALKOVER_PENALTY_POSITIONS      = 10    // posições de queda
```

Um jogador "deu W.O." num mês se em algum desafio `completed` daquele mês ele consta como `challenger_walkover` (sendo challenger) ou `challenged_walkover` (sendo challenged).

## Como é detectado no fechamento

`getAutomaticWalkoverPenaltiesForRound(rankingId, referenceMonth, candidateUserIds)`:
1. Resolve o **mês anterior** ao de referência (via `listRankingReferenceMonths`).
2. Lê os desafios `completed` da janela [mês anterior, mês de referência].
3. Monta, por jogador, o conjunto de meses em que deu W.O.
4. Retorna os candidatos que deram W.O. **tanto no mês anterior quanto no de referência** (streak = 2), com `positionsDown = 10` e os `triggerMonths`.

A penalidade é aplicada via `RankingSimulator.applyPenalty` (`applyAutomaticPenalties` em `round-actions.ts`), ordenada por posição atual, e gera log explicativo (ex.: *"Fulano recebeu penalidade automática de 10 posições por 2 W.O. consecutivos (mês A e mês B); iniciará a próxima rodada na posição N."*).

> A penalidade é aplicada **mesmo no caminho de ordem manual** do fechamento.

## Histórico por jogador

`getPlayerWalkoverPenaltyHistory(rankingId, userId, baseMonth, take=6)` retorna, por mês:
```ts
{
  month: { value, label },
  tookWalkover: boolean,
  walkoverCount: number,
  streak: number,                 // meses consecutivos até aqui
  penaltyForNextRound: boolean    // streak >= 2
}
```
Exibido no histórico do perfil (`GET /api/rankings/[id]/players/[userId]/history`).

## Resolução de meses de referência

`listRankingReferenceMonths` monta a lista de meses relevantes do ranking a partir de:
1. `rounds` (rodadas existentes, específicas ou globais), e
2. se faltar, meses com desafios (consulta SQL com `date_trunc('month', ...)` sobre `challenges`).

Isso garante que "mês anterior" considere a cadência real do ranking, não apenas o calendário.

## Distinções importantes

- **W.O. simples** (1 mês) → não gera penalidade automática; o resultado normal do desafio já penaliza (quem deu W.O. perde o confronto).
- **W.O. duplo** (ambos no mesmo desafio) → ambos caem 1 posição no recálculo (tratado no simulador), independente da penalidade de streak.
- **Penalidade de streak** (2 meses) → −10 posições, adicional, no fechamento.

## Ao mexer aqui

- Constantes (`STREAK`, `POSITIONS`) ficam **neste arquivo**, não no `rankingConfig`.
- A janela considerada usa `played_at` (com fallback `scheduled_for`) — manter consistente com o resto do domínio.
