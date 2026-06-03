# Spec — Desafios

## O que é

Um **desafio** é uma partida marcada entre dois jogadores do mesmo ranking. O desafiante (`challenger`, normalmente abaixo) desafia o desafiado (`challenged`, acima). O resultado, ao fim do mês, altera as posições.

> Fonte: `prisma/schema.prisma` (model `challenges`); rotas em `src/app/api/challenges/**`; lógica em `src/lib/domain/challenges.ts` e `src/lib/challenges/result.ts`.

## Ciclo de vida (status)

`scheduled` → `accepted` → `completed`, ou `declined` / `cancelled`.

```
                    ┌──────────► declined  (fluxo desativado)
scheduled ─────────►│
   │                └──────────► accepted ──► completed
   │                                            ▲
   └──► cancelled                               │
              resultado registrado ─────────────┘
```

- **`scheduled`** — criado, aguardando.
- **`accepted`** — aceito (fluxo de aceite manual hoje está **desativado**, ver abaixo).
- **`completed`** — resultado registrado (ou inferido de placar/WO).
- **`declined`** — recusado (**desativado**).
- **`cancelled`** — cancelado pelo desafiante (janela de 5 min) ou pelo admin (a qualquer momento; `cancelled_by_admin`).

> **Importante:** os endpoints `accept` e `decline` retornam 422 (desativados). O fluxo atual é: criar → registrar resultado (ou cancelar dentro de 5 min).

## Criar desafio (`POST /api/challenges`)

Validações para jogador comum:
1. **Janela de tempo** aberta para a fase certa (ver [04-rodadas-e-janelas](./04-rodadas-e-janelas.md)):
   - Fase **blue**: só quem tem ponto azul (`requiresBlue`).
   - Fase **open**: qualquer elegível.
   - Fases `before/waiting_*/after_open/closed`: bloqueado.
2. **Elegibilidade de posição** (ver [01-rankings](./01-rankings.md)): distância ≤ 10 (normal) ou dentro do `accessLimit` (acesso).
3. **Locks de concorrência**: não pode haver outro desafio pendente conflitante para os envolvidos no mês.

O **admin pode sobrepor** (criar manualmente, definir `challenger_id`, ignorar regras). Desafios criados por admin são marcados via `challenge_events(event_type=created, created_by=admin)` e recebem `ignoreRules` no recálculo.

Ao criar, o sistema grava `challenger_position_at_challenge` e `challenged_position_at_challenge` (snapshot das posições no momento) — usados depois como "hints" e para validar a ordem no recálculo.

## Registrar resultado (`POST /api/challenges/[id]/result`)

Campos possíveis: `winner`, `played_at`, `challenger_games`/`challenged_games`, `challenger_tiebreak`/`challenged_tiebreak`, flags `*_walkover` / `*_retired`, e `penalties[]` (penalidades manuais por posição).

### Como o vencedor é resolvido (`resolveChallengeWinner`)

Ordem de precedência:
1. `winner` explícito (`challenger`/`challenged`).
2. **Walkover:** se ambos → sem vencedor (WO duplo); se um deu WO → o outro vence.
3. **Retired:** se ambos → sem vencedor; se um abandonou → o outro vence.
4. **Placar (games):** maior número de games vence.
5. Caso nada decida → `null` (pendente).

`resolveChallengeStatus`: se há qualquer evidência de resultado (vencedor, `played_at`, games ou flags WO/retired) → `completed`.

### Janela de edição
- **Participantes** só podem registrar/editar resultado após ~5 min da criação; **admin** pode imediatamente.
- Ao completar um desafio de acesso, remove-se `is_access_challenge` do desafiante.

## Editar / cancelar / excluir

- `PATCH /api/challenges/[id]` — reagenda ou edita resultado (participantes ou admin).
- `POST /api/challenges/[id]/cancel` — cancela (desafiante em até 5 min; admin sempre).
- `DELETE /api/challenges/[id]` — exclui (admin).

## Penalidades

- **Manuais:** registradas junto ao resultado (`challenge_penalties`, `applies_to` = challenger/challenged/both, `positions`).
- **Automática de WO consecutivo:** aplicada no fechamento da rodada (10 posições por 2 W.O. seguidos). Ver [walkover-penalty](../superpowers/walkover-penalty.md).

## Visibilidade e filtros (`GET /api/challenges`)

Filtros: `ranking`, `month` (YYYY-MM), `status`, `sort`. Admin vê tudo; jogador vê os relevantes. `GET /api/challenges/months` lista meses com desafios/rodadas.

## Como o resultado entra no ranking

Os desafios `completed` do mês são lidos por `closeRound()` e convertidos em eventos (`challenger_win` / `challenger_loss` / `double_wo`) aplicados pelo simulador. Detalhe em [superpowers/ranking-simulator](../superpowers/ranking-simulator.md).

## Telas relacionadas

- `/desafios` — lista, filtros, criação (admin), registro de resultado.
- `/dashboard` — desafios recebidos/meus, resultados recentes.
- Componentes: `DesafiosClient`, `ChallengeCard`.
