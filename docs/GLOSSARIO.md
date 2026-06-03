# Glossário do domínio

Termos usados no produto e no código. Quando relevante, indico a fonte da regra.

| Termo | Significado |
|-------|-------------|
| **Ranking** | Uma categoria/lista ordenada de jogadores (ex.: Masculino, Feminino, Master 45). Tem `slug` único. Tabela `rankings`. |
| **Membership** | Vínculo de um jogador a um ranking, com `position`, flags e pontos. Tabela `ranking_memberships`. |
| **Posição** | Colocação do jogador no ranking (1 = topo). Menor número = melhor. |
| **Rodada (round)** | Ciclo mensal de um ranking. Define as janelas de tempo (ponto azul, desafios livres, prazo). Tabela `rounds`. Pode ser **global** (`ranking_id = null`, vale para todos) ou específica de um ranking. |
| **Mês de referência (`reference_month`)** | O mês ao qual a rodada/snapshot pertence (primeiro dia do mês). Identifica a rodada. |
| **Desafio (challenge)** | Uma partida marcada entre desafiante (`challenger`) e desafiado (`challenged`). Tabela `challenges`. |
| **Desafiante (challenger)** | Quem propõe o desafio. Normalmente está **abaixo** (posição maior) do desafiado. |
| **Desafiado (challenged)** | Quem é desafiado; está **acima** (posição menor). |
| **Janela de desafio** | Período da rodada em que se pode desafiar. Fases: `before → waiting_blue → blue → waiting_open → open → after_open → closed`. Ver [specs/04](./specs/04-rodadas-e-janelas.md). |
| **Ponto Azul** | Benefício/marcador de um jogador (`is_blue_point`). Habilita criar desafio na **janela exclusiva de ponto azul** e tem regras próprias de concessão/perda. Ver [specs/03](./specs/03-ponto-azul.md). |
| **Janela de Ponto Azul** | Subperíodo inicial da rodada em que **apenas** jogadores com ponto azul podem desafiar. |
| **Desafios livres (open)** | Subperíodo em que qualquer jogador elegível pode desafiar, respeitando o limite de posições. |
| **Desafio de acesso** | Membership marcada como `is_access_challenge`. Jogador "de fora" tentando entrar no corpo do ranking; segue regra de acesso por slug (limite de posição) e, se perder, vai para a última posição. Ver [specs/01](./specs/01-rankings.md). |
| **Limite de acesso (`accessLimit`)** | Posição-limite por ranking para desafios de acesso: Masculino=30, Feminino=10, Master 45=20 (`rankingConfig.accessEntryRules`). |
| **Máx. posições acima (`maxPositionsUp`)** | Distância máxima (10) que um desafiante pode estar acima do desafiado num desafio normal. |
| **Walkover (W.O.)** | Ausência/desistência. `challenger_walkover` / `challenged_walkover`. Quem dá W.O. perde por ausência. |
| **W.O. duplo (double_wo)** | Ambos deram W.O.; ambos caem 1 posição. |
| **Retirado (retired)** | Abandono durante a partida (`*_retired`). Conta como derrota de quem abandonou. |
| **Penalidade de Walkover** | Queda automática de **10 posições** para quem deu W.O. em **2 meses consecutivos**. Ver [superpowers/walkover-penalty](./superpowers/walkover-penalty.md). |
| **Snapshot** | Foto das posições de um ranking num mês. `start` (início da rodada) e `end` (após recálculo). Tabela `ranking_snapshots`. |
| **Baseline** | Ordem de partida usada pelo recálculo. Vem do snapshot `start`, ou do `end` do mês anterior, ou de "hints", ou da ordem atual. |
| **Recálculo / Fechar rodada (`closeRound`)** | Aplica os resultados dos desafios do mês ao baseline, gera penalidades, grava snapshot `end`, posições e logs. |
| **Rollover** | Fecha o mês atual e cria/abre a rodada do mês seguinte (copiando horários deslocados). |
| **Restore** | Restaura as posições a partir de um snapshot (`start` ou `end`) de um mês. |
| **Ordem manual (`MANUAL_ORDER`)** | Marcador de log que indica que o admin reordenou manualmente; faz o fechamento preservar a ordem atual e ignorar violações. |
| **Violação** | Desafio inválido detectado no recálculo (ex.: `INVALID_CHALLENGE_ORDER`, `MAX_10_ACIMA`, `ACESSO_FORA_INTERVALO`, `PLAYER_NOT_FOUND`). Bloqueia o fechamento, salvo override. |
| **Defesa (defense_win)** | Quando o desafiado vence; ele "defende" a posição. Marcador de movimento. |
| **Suspenso (`is_suspended`)** | Membership fora do jogo no mês (não desafia/não é alvo, ignorada em várias regras). |
| **Licença (`license_position`)** | Posição "reservada" para jogador de licença; aparece no dashboard como "license players". |
| **Bloqueado (`is_locked`)** | Estado de ponto azul: jogador sem oponente alcançável (recebe ponto azul por `no_reachable_opponent`). |
| **Branding** | Identidade visual/configurável do app (nome, logo, favicon, ícone PWA) + modo manutenção. Tabela `app_settings`. |
| **Modo manutenção** | Quando ativo, não-admins veem a tela de manutenção; admins seguem normal. |
| **Colaborador (collaborator)** | Staff com permissão sobre rankings específicos (`collaborator_rankings`). |
| **Round log** | Linhas explicativas geradas pelo recálculo (quem subiu/caiu, penalidades). Tabela `round_logs`. |
| **Challenge event** | Auditoria de desafio (created/updated/completed/cancelled). Tabela `challenge_events`. Usado também para detectar desafios criados por admin (`ignoreRules`). |
