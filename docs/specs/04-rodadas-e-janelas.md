# Spec — Rodadas e janelas de tempo

## O que é uma rodada

Uma **rodada (round)** é o ciclo **mensal** de um ranking. Ela define **quando** se pode desafiar e organiza o recálculo de posições. Tabela `rounds`.

Uma rodada pode ser:
- **Específica de um ranking** (`ranking_id` preenchido), ou
- **Global** (`ranking_id = null`) — serve de fallback para todos os rankings que não têm rodada própria no mês.

> Fonte: `prisma/schema.prisma` (model `rounds`); `src/lib/domain/challenges.ts`; `src/lib/domain/round-actions.ts`.

## Campos de tempo da rodada

| Campo | Papel |
|-------|-------|
| `reference_month` | Mês da rodada (1º dia). Identifica a rodada. |
| `round_opens_at` | Quando a rodada "abre" (início geral). |
| `blue_point_opens_at` | Início da **janela de ponto azul**. |
| `blue_point_closes_at` | Fim da janela de ponto azul. |
| `open_challenges_at` | Início dos **desafios livres**. |
| `open_challenges_end_at` | Fim dos desafios livres. |
| `matches_deadline` | Prazo final para partidas/resultados. |
| `status` | `draft` · `open` · `closed`. |
| `closed_at` | Quando foi fechada. |

Também há campos de "partida em destaque" (`featured_*`).

## As fases da janela de desafio

`resolveChallengeWindows()` monta a janela e `toWindowState()` calcula a fase atual a partir de `now`:

```
       roundStart        blueStart      blueEnd/openStart      openEnd       roundEnd
──────────┬─────────────────┬─────────────────┬─────────────────┬─────────────┬──────►
  before  │  waiting_blue   │      blue        │  waiting_open*  │    open     │ closed
          │                 │ (só ponto azul)  │                 │ (livre)     │
```

| Fase | `canChallenge` | Quem pode desafiar |
|------|:--:|---|
| `before` | ❌ | — (rodada ainda não abriu) |
| `waiting_blue` | ❌ | — (aguardando janela de ponto azul) |
| `blue` | ✅ | **apenas ponto azul** (`requiresBlue`) |
| `waiting_open` | ❌ | — (entre fim do azul e início do livre) |
| `open` | ✅ | qualquer jogador elegível |
| `after_open` | ❌ | — (janela livre encerrada) |
| `closed` | ❌ | — (período da rodada encerrado) |

As datas são **normalizadas/saneadas** (blueStart ≥ roundStart; openStart ≥ blueEnd; openEnd ≤ roundEnd, etc.) para evitar janelas inconsistentes.

### Fallback (sem rodada configurada)
Se não houver rodada `open`, usa-se um fallback: ponto azul abre às **07:00** do 1º dia do mês por **24h**, depois desafios livres por ~30 dias. (`buildFallbackMonthWindow`).

## Criação e configuração

- `POST /api/admin/rounds` — cria rodada para um mês (gera datas padrão ou usa título/ranking informados).
- `GET/PATCH /api/admin/config` — lê/edita os horários da rodada (com conversão de timezone `America/Sao_Paulo`). Tela `/admin/config`.
- Colaborador pode mexer em rodadas/config dos seus rankings; admin em todos.

## Fechamento e recálculo

No fim do mês, o admin **fecha/recalcula** a rodada. Isso:
1. Reconstrói o **baseline** (snapshot start → end do mês anterior → hints → ordem atual).
2. Aplica os desafios `completed` do mês via simulador.
3. Aplica **penalidades automáticas de WO**.
4. Grava **snapshot `end`**, novas posições e **logs explicativos**.
5. Reavalia **ponto azul**.
6. Marca a rodada como `closed`.

APIs:
- `POST /api/admin/rankings/[id]/recalculate` — recalcula/fecha o mês.
- `POST /api/admin/rankings/[id]/reorder` — reordena manualmente e regrava snapshot do mês.
- `POST /api/admin/rankings/[id]/restore` — restaura posições de um snapshot do mês.
- `POST /api/admin/rankings/[id]/rollover` — fecha o mês e abre o seguinte (pode incluir todos os rankings canônicos com `includeAll`).

Detalhe do motor em [superpowers/snapshot-restore-rollover](../superpowers/snapshot-restore-rollover.md) e [superpowers/ranking-simulator](../superpowers/ranking-simulator.md).

## Ordem manual

Se o admin reordenou manualmente, é gravado o marcador `MANUAL_ORDER` em `round_logs`. O fechamento então **preserva a ordem atual** (`preserveCurrentState`) e **ignora violações** — mas ainda aplica penalidades automáticas de WO.

## Violações que bloqueiam o fechamento

Se algum desafio do mês violar as regras, o recálculo retorna violações e **não persiste** (a menos que haja override/ordem manual):
- `INVALID_CHALLENGE_ORDER` — desafiante não estava abaixo do desafiado.
- `MAX_10_ACIMA` — distância acima do limite (10).
- `ACESSO_FORA_INTERVALO` — desafio de acesso fora do limite do ranking.
- `PLAYER_NOT_FOUND` / `DADO_INCOMPLETO`.

## Telas relacionadas

- `/admin/rodadas` — criar/listar rodadas.
- `/admin/config` — agenda de horários da rodada.
- `/ranking` — mostra a fase atual e contagem regressiva da janela.
