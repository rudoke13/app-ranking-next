# Módulo — API (rotas REST)

**Localização:** `src/app/api/**/route.ts` (Next.js Route Handlers).

## Convenções

- Resposta padrão: `{ ok: boolean, data?: ... }` em sucesso; `{ ok: false, message: string }` em erro (status HTTP apropriado).
- Quase todas exigem sessão válida (`getSessionFromCookies`); rotas admin checam papel/permissão de ranking.
- Query flag `fresh=1|true|yes` força ignorar caches em várias rotas de leitura.
- Datas de mês no formato `YYYY-MM`.

## Catálogo (41 rotas)

### Auth — `/api/auth`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/login` | POST | Autentica, cria sessão. | público |
| `/logout` | POST | Encerra sessão. | sessão |
| `/forgot` | POST | Inicia reset de senha (e-mail). | público |
| `/reset` | POST | Conclui reset. | público |
| `/validate` | GET | Valida sessão atual. | sessão |

### Admin — Rankings — `/api/admin/rankings`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/` | GET, POST | Listar / criar ranking (slug auto). | admin/staff |
| `/[id]` | PATCH | Editar metadados do ranking. | admin |
| `/[id]/recalculate` | POST | Fechar/recalcular mês. | admin/staff c/ permissão |
| `/[id]/reorder` | POST | Reordenar manualmente + snapshot. | admin/staff c/ permissão |
| `/[id]/restore` | POST | Restaurar de snapshot. | admin/staff c/ permissão |
| `/[id]/rollover` | POST | Fechar mês e abrir o próximo. | admin/staff c/ permissão |

### Admin — Usuários — `/api/admin/users`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/` | GET, POST | Listar / criar usuário (+ memberships/colab). | admin/staff |
| `/[id]` | PATCH | Editar usuário, papel, memberships, flags. | admin/staff |
| `/[id]/challenge-lock` | GET, POST | Ver/cancelar desafios que travam o jogador. | admin |

### Admin — Rodadas & Config
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/api/admin/rounds` | GET, POST | Listar / criar rodada. | admin/staff |
| `/api/admin/config` | GET, PATCH | Ler/editar horários da rodada (timezone-aware). | admin/staff |
| `/api/admin/app-settings` | GET, PATCH | Branding + modo manutenção. | admin |
| `/api/admin/blue-point-history` | GET | Avaliação/histórico de ponto azul. | admin |

### Challenges — `/api/challenges`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/` | GET, POST | Listar (filtros) / criar desafio. | sessão (admin sobrepõe) |
| `/[id]` | PATCH, DELETE | Editar/reagendar / excluir (admin). | participantes/admin |
| `/[id]/result` | POST | Registrar resultado (+ penalidades). | participantes(≥5min)/admin |
| `/[id]/cancel` | POST | Cancelar (desafiante ≤5min / admin). | challenger/admin |
| `/[id]/accept` | POST | **Desativado** (422). | — |
| `/[id]/decline` | POST | **Desativado** (422). | — |
| `/months` | GET | Meses com desafios/rodadas. | sessão |

### Rankings (jogador) — `/api/rankings`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/` | GET | Rankings ativos + se sou membro. | sessão |
| `/[id]/players` | GET | Jogadores do ranking + janela + (admin) histórico do mês. | sessão |
| `/[id]/players/[userId]/history` | GET | Histórico do jogador (desafios, ponto azul, WO). | sessão |

### Storage — `/api/storage`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/avatar/presign` | POST | URL presigned p/ avatar. | sessão |
| `/branding/presign` | POST | URL presigned p/ logo/favicon/pwa. | admin |

### Perfil — `/api/users/me`
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/` | POST | Editar perfil + preferências de visibilidade. | sessão |
| `/avatar` | POST | Gravar URL do avatar. | sessão |

### Outros
| Rota | Métodos | Função | Acesso |
|------|---------|--------|--------|
| `/api/dashboard` | GET | Dados do dashboard do jogador. | sessão |
| `/api/health` | GET | Healthcheck `{ ok, ts }`. | público |

## Onde a regra mora

As rotas validam entrada (zod) e permissão, depois delegam para `src/lib/domain/**`. Ver [modules/domain](./domain.md). Ao adicionar/alterar endpoints, mantenha a regra de negócio no domínio, não no handler.
