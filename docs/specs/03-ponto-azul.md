# Spec — Ponto Azul

## O que é

O **Ponto Azul** (`is_blue_point`) é um marcador/benefício que dá ao jogador o direito de desafiar na **janela exclusiva de ponto azul** (início da rodada, antes dos desafios livres). É um mecanismo de **proteção/incentivo**: garante oportunidade de desafiar a quem está sendo muito desafiado ou a quem não tem oponente alcançável.

> Fonte: `src/lib/domain/blue-point.ts`. Engine detalhado em [superpowers/blue-point-engine](../superpowers/blue-point-engine.md).

## Quando o jogador recebe ponto azul

Há **dois motivos** que concedem ponto azul (campo `reason`), além do manual:

### 1. `consecutive_challenges` — desafiado em meses consecutivos
Se o jogador foi **desafiado** em **N meses consecutivos** (`threshold = 2`, de `bluePointPolicy.consecutiveChallengesThreshold`), ele ganha ponto azul. A ideia: quem está apanhando de desafios seguidos ganha o direito de partir para o ataque na janela protegida.

- Conta apenas quem está em **posição > 1** (o nº 1 não recebe).
- A contagem percorre os meses cronologicamente.

### 2. `no_reachable_opponent` — sem oponente alcançável (`is_locked`)
Se o jogador (posição > 1, não suspenso, sem desafio no mês) **não tem nenhum oponente válido** que possa desafiar dentro das regras, ele fica `locked` e recebe ponto azul. Garante que ninguém fique "preso" sem poder jogar.

A busca por oponente alcançável considera:
- **Acesso:** alvos a partir do `accessLimit`.
- **Normal:** alvos acima dele e dentro de `maxPositionsUp` (10).
- Ignora suspensos, ignora pares blue-vs-blue, e quem já tem desafio no mês.

### 3. `manual`
Admin concede/remove diretamente (via gestão de usuário). Enum `blue_point_history_reason` inclui `manual`.

## Quando o ponto azul é perdido (`unused_previous_blue_point`)

Regra de **uso obrigatório**: se o jogador **tinha** ponto azul (atingiu o threshold) e **não usou** o benefício na janela de ponto azul daquele mês, o contador **reseta** e fica registrado `lastUnusedBluePointMonth`. Ou seja: ponto azul não usado **caduca** — não acumula indefinidamente.

"Usar" = ter criado um desafio dentro da janela `blue_point_opens_at … blue_point_closes_at` (ou `open_challenges_at`) daquele mês.

## Avaliação (`getBluePointEvaluation`)

Produz, por jogador, um item rico (`BluePointEvaluationItem`) com: posição, `enabled`, `locked`, `reason`, meses recentes desafiado, contagem no mês, se tem desafio no mês, estado atual, etc. Usado:
- Na avaliação automática durante o fechamento da rodada (`persistBluePointEvaluation` grava `is_blue_point` e `is_locked`).
- Na tela admin de histórico (`/admin/ponto-azul`, `GET /api/admin/blue-point-history`).

`enabled = (posição > 1 && desafiado em meses consecutivos) || locked`.

## Histórico

`blue_point_history` registra concessões com `ranking_id`, `user_id`, `month_key` e `reason` (único por essa combinação). Exposto no perfil ("histórico de ponto azul") e na tela admin.

## Janela de tempo

A janela exclusiva de ponto azul é definida na rodada (`blue_point_opens_at` / `blue_point_closes_at`). Ver [04-rodadas-e-janelas](./04-rodadas-e-janelas.md).

## Parâmetros configuráveis

```ts
// src/lib/domain/ranking.ts
bluePointPolicy: {
  consecutiveChallengesThreshold: 2,  // meses consecutivos desafiado
  rangeLimit: 10,
}
```

## Telas relacionadas

- `/admin/ponto-azul` — histórico/avaliação por rodada (admin).
- `/perfil` — abas de histórico mostram status de ponto azul do jogador.
- Componente: `BluePointHistoryPage`.
