# Spec — Rankings e posições

## O que é

Um **ranking** é uma lista ordenada de jogadores de uma categoria. Exemplos canônicos (por `slug`):

- `ranking-masculino`
- `ranking-feminino`
- `ranking-master-45`

Cada ranking tem `name`, `slug` (único), `description`, `is_active` e `only_for_enrolled_players`. Jogadores entram via **membership** (`ranking_memberships`), que guarda `position`, `points`, e flags de estado.

> Fonte: `prisma/schema.prisma` (models `rankings`, `ranking_memberships`); `src/lib/domain/ranking.ts`.

## Posições

- Posição **1 = topo** (melhor). Quanto menor o número, melhor a colocação.
- A posição "oficial" fica em `ranking_memberships.position`, mas a fonte de verdade histórica são os **snapshots** (`ranking_snapshots`), gravados no início e fim de cada mês.

## Flags de membership

| Flag | Significado |
|------|-------------|
| `is_blue_point` | Jogador tem ponto azul. Ver [03-ponto-azul](./03-ponto-azul.md). |
| `is_locked` | Sem oponente alcançável (estado de ponto azul). |
| `is_access_challenge` | Jogador em **desafio de acesso** (tentando entrar no corpo do ranking). |
| `is_suspended` | Fora do jogo no mês (ignorado em desafios e regras). |
| `license_position` | Posição reservada por licença. |

## Regras de quem pode desafiar quem

As regras de elegibilidade entre posições (resumo; detalhe e implementação em [02-desafios](./02-desafios.md) e [superpowers/ranking-simulator](../superpowers/ranking-simulator.md)):

### Desafio normal
- O desafiante deve estar **abaixo** do desafiado (posição maior).
- A distância (desafiante − desafiado) não pode exceder **`maxPositionsUp = 10`**. Acima disso o recálculo gera a violação `MAX_10_ACIMA`.

### Desafio de acesso (`is_access_challenge`)
- Vale para jogadores "de fora" tentando entrar no corpo do ranking.
- O alvo deve estar **dentro do limite de acesso** do ranking:

| Ranking (slug) | Limite de acesso (`accessLimit`) |
|----------------|----------------------------------|
| `ranking-masculino` | 30 |
| `ranking-feminino` | 10 |
| `ranking-master-45` | 20 |

  (configurado em `rankingConfig.accessEntryRules`)
- Se o desafiado estiver **acima** (posição menor) que o limite, o recálculo gera `ACESSO_FORA_INTERVALO`.
- **Se o jogador de acesso perde**, ele vai para a **última posição** do ranking (`applyPenalty(challenger, baseline.length, ...)`).
- Ao registrar resultado de um desafio cujo desafiante era de acesso, a flag `is_access_challenge` é **removida** (vira membro normal).

## Resultado do recálculo de posições

Quando a rodada fecha, o **simulador** aplica cada desafio do mês ao baseline:

- **Vitória do desafiante:** ele assume a posição do desafiado; o desafiado desce 1; cascata nos demais abaixo.
- **Derrota do desafiante (defesa):** o desafiante cai `distance` posições (no máximo até a posição `challengerSnapshot + distance`, com proteção contra cair além do devido). O desafiado é marcado como `defense_win`.
- **W.O. duplo:** ambos caem 1 posição.
- **Penalidade de WO consecutivo:** queda de 10 posições (ver [walkover-penalty](../superpowers/walkover-penalty.md)).

Detalhe fino do algoritmo em [superpowers/ranking-simulator](../superpowers/ranking-simulator.md).

## `only_for_enrolled_players`

Flag no ranking que restringe a participação a jogadores explicitamente inscritos. Há SQL auxiliar em `prisma/add_rankings_only_for_enrolled_players.sql`.

## Administração de rankings

- Criar/editar/ativar rankings: telas `/admin/rankings` e `/admin/configuracoes`; API `POST/PATCH /api/admin/rankings`.
- Reordenar manualmente, recalcular, restaurar e fazer rollover: ver [04-rodadas-e-janelas](./04-rodadas-e-janelas.md) e [modules/api](../modules/api.md).
- Admin vê e gerencia todos; colaborador só os seus (`collaborator_rankings`).

## Telas relacionadas

- `/ranking` — lista de rankings + jogadores, com janela de desafio e (admin) reordenar/recalcular.
- `/admin/rankings`, `/admin/configuracoes` — gestão.
