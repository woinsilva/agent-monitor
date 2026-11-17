# Agent Monitor — estado do produto e roadmap

Auditoria realizada em 17 de novembro de 2026 sobre a branch
`feat/agensi-readiness`. Este documento descreve evidências encontradas no
código, nos testes, no container local, no PR #1 e nos pacotes Agensi locais.
Planos e textos de roadmap não foram tratados como prova de implementação.

## Resumo executivo

O Agent Monitor atual é um aplicativo Free local e funcional, licenciado sob
MIT, com boa base para um release de preview: dashboard em tempo real, escritório
Pixel Art, painel, relatório, timeline, alertas, notificações, telemetria nativa
de Claude Code e Codex, reporter genérico e execução em Docker.

A branch adiciona adaptadores experimentais para Cursor e Gemini CLI,
diagnóstico de instalação, configuração reversível e melhorias visuais. Cursor
e Gemini foram exercitados em sessões reais no Windows, mas ainda não devem ser
anunciados como suporte de produção. Há lacunas de permissão, cobertura e
correlação de sessão, incluindo um caso real em que o Gemini headless iniciou e
finalizou o mesmo turno com IDs diferentes.

Não existe uma edição Agent Monitor Pro do aplicativo. O artefato chamado Pro é
uma skill Agensi separada, destinada a auditoria local de telemetria. A skill
Free também é um pacote separado de onboarding; nenhuma das duas está publicada.

## Estado do Git e do PR

- Branch local: `feat/agensi-readiness`.
- HEAD local auditado: `26ebae5` (`feat: improve agent rooms, limits and conflict visibility`).
- Remoto `origin/feat/agensi-readiness`: `2e331ab` no momento da auditoria.
- A branch local está um commit à frente do remoto.
- PR #1: aberto, em Draft, base `main`, merge state `CLEAN` antes do envio do
  commit local.
- Os nove jobs do CI (Node 18/20/22 em Linux, Windows e macOS) passaram no
  commit remoto `2e331ab`. Eles ainda não validaram `26ebae5`.
- Não há mudanças rastreadas sem commit. `.cursor/` e `.gemini/` estão não
  rastreados e contêm configuração local do projeto; não devem ser adicionados
  ao PR sem uma decisão explícita de distribuição.
- A diferença local contra `origin/main` envolve 13 arquivos, com 875 adições e
  108 remoções.

## Arquitetura confirmada

Fluxo principal:

```text
Claude/Codex hooks --------> hook.js -----------\
Cursor/Gemini hooks -------> agent-bridge.js ----+--> data/events-*.jsonl
Agente externo/CI/SDK -----> report.js ---------/              |
                                                                v
transcrições Claude/Codex -------------------------------> server.js
                                                                |
                                                         SSE + HTTP local
                                                                |
                                                      public/index.html
                                                      public/office.js
```

- `hook.js`: normaliza eventos Claude/Codex, reduz payloads, registra uma linha
  JSON e nunca deve bloquear o agente.
- `agent-bridge.js`: traduz hooks Cursor/Gemini para o formato interno e evita
  decisões de permissão.
- `report.js`: interface CLI genérica para agentes sem hooks nativos.
- `server.js`: replay recente, máquina de estados, tokens, limites, conflitos,
  relatórios, notificações, HTTP e Server-Sent Events.
- `public/`: frontend sem framework; escritório desenhado em canvas.
- `install.js`: instalação de hooks Claude/Codex e status line do Claude.
- `configure-agent.js`: dry-run e configuração opt-in de Cursor/Gemini.
- `doctor.js`: diagnóstico somente leitura de presença de hooks.
- `lib/notify.js`: ntfy e Telegram.
- `lib/report.js`: agregações de relatório e estimativa de custo.

O formato de eventos é uma convenção implementada, não um protocolo versionado.
Não há schema formal, migração de versões ou validação central de payload.

## Inventário de funcionalidades

### Implementadas e comprovadas

| Área | Estado | Evidência principal |
|---|---|---|
| Dashboard local ao vivo | Implementado | `server.js`, SSE, `public/index.html` |
| Hooks Claude Code e Codex | Implementado | `install.js`, `hook.js`, eventos reais em `data/` |
| Reporter genérico | Implementado | `report.js`, `lib/report.js`, testes |
| Escritório Pixel Art | Implementado | `public/office.js` |
| Salas Claude, Codex, Gemini e Cursor | Implementado na branch | `public/office.js`, commit `26ebae5` |
| Estados working/waiting/idle/stale/ended | Implementado | `server.js`, `test/server.test.js` |
| Subagentes e hierarquia | Implementado para payloads compatíveis | `hook.js`, `server.js`, testes |
| Conflito de arquivo | Implementado | `server.js`, badge e drawer em `public/` |
| Timeline por sessão | Implementado | `server.js`, drawer em `public/index.html` |
| Relatório 1/7/14 dias | Implementado | `lib/report.js`, frontend |
| Tokens Claude/Codex | Implementado | leitura de transcrições/rollouts em `server.js` |
| Custo estimado configurável | Implementado | `config/config.example.json`, `lib/report.js` |
| Notificações ntfy/Telegram | Implementado | `lib/notify.js`, `server.js` |
| Limites Codex 5h e 7d | Implementado na branch | `server.js`, `public/index.html` |
| Limites Claude via status line | Implementado para Claude Code terminal | `statusline.js`; não funciona no Claude Desktop |
| Docker local persistente | Implementado | `Dockerfile`, `docker-compose.yml`, `setup.js` |
| Diagnóstico de hooks | Implementado parcialmente | `doctor.js` |
| Configuração reversível Cursor/Gemini | Implementado | `configure-agent.js`, backups e remoção |
| Português e inglês | Implementado | `public/i18n.js` |

### Parciais ou experimentais

#### Cursor

- Sessões reais no Cursor 3.30.14 produziram `SessionStart`, prompt, tool result
  e `Stop` no Windows.
- A duplicação causada pelos hooks de compatibilidade Claude foi mitigada em
  `hook.js` e `server.js`.
- Hooks sensíveis de permissão não são instalados por padrão, corretamente.
- Consequência: espera por aprovação e início de ferramenta não têm cobertura
  completa. O adaptador observa menos do que Claude/Codex.
- O fluxo real de confirmação de permissão ainda não foi validado ponta a ponta.

#### Gemini CLI

- Gemini CLI 0.68.0 foi autenticado por API key e gerou eventos reais no Windows.
- O ciclo interativo produziu eventos de início, prompt, término do agente e
  encerramento; `SessionEnd` duplicado é tratado de forma idempotente pelo servidor.
- O bridge converte `Notification` com `notification_type=ToolPermission` em
  `PermissionRequest`, com testes automatizados.
- A confirmação real de uma permissão ainda não foi testada ponta a ponta.
- Foi observado um defeito real no modo headless: o prompt da sessão
  `11111111-2222-4333-8444-555555555555` terminou com `Stop/SessionEnd` sob
  `66861e3f-ad36-4db6-8a2a-8bdd2bf4a6ad`. Isso deixa a primeira sessão em
  `working` e cria uma segunda sessão incompleta. A correlação precisa ser
  corrigida ou o modo headless deve ser explicitamente marcado como não suportado.

#### Universal Agent Setup

- `doctor.js` detecta arquivos e hooks sem imprimir valores sensíveis.
- `configure-agent.js` oferece dry-run real para Cursor/Gemini, preserva hooks
  de terceiros, cria backup e remove somente hooks próprios.
- `install.js` preserva hooks e cria backup para Claude/Codex, mas não oferece
  preview/dry-run equivalente.
- Não existe uma experiência unificada que detecte binários, versões, escopos,
  conflitos e entrega real de eventos.
- `deliveryVerified` permanece sempre `false`; o doctor não executa um teste de
  entrega nem correlaciona eventos recentes.

#### Agent Health Monitor

Há sinais básicos: sessão stale, execução longa, espera por aprovação, falhas de
ferramenta, resultado de teste e notificações. Faltam detecção de erros repetidos,
falhas consecutivas, testes repetidamente quebrados, causas prováveis, score de
saúde e recomendações no aplicativo.

#### Cost Intelligence

Tokens, custo estimado configurável, totais por projeto/modelo e alertas de
limite existem. Faltam séries históricas de custo, tendências, orçamento,
eficiência por tarefa e distinção mais explícita entre estimativa equivalente de
API e cobrança real. Cursor/Gemini dependem de usage explícito, que os hooks
atuais não fornecem.

#### Session Replay & Audit

A timeline cronológica existe, mas não há replay visual com controles, exportação
de relatório, marcação de anomalias ou diagnóstico automático de sessão
incompleta. A skill Pro executa parte dessa auditoria fora do aplicativo.

#### Smart Pixel Office

O escritório diferencia clientes, estados, espera, conflitos e subagentes. A
branch inclui salas fixas e crescimento por fileiras. Ainda faltam testes de
browser/visuais automatizados, agrupamento real por projeto e critérios de
acessibilidade para informações transmitidas apenas por animação/cor.

### Ausentes

- Adaptadores nativos para GitHub Copilot, OpenCode e Aider.
- SDK/biblioteca formal; hoje existe a CLI `report.js` e escrita direta em JSONL.
- Protocolo de eventos versionado e schema validável.
- Agent Monitor Pro como aplicativo, feature flags, licença, ativação, canal de
  distribuição ou atualização comercial.
- Integração em tempo real com conversas ChatGPT genéricas.
- Exportação de replay/auditoria pelo aplicativo.
- Backup e restauração documentados para dados e configuração Docker.
- Testes end-to-end de browser e do container.

## Avaliação técnica

### Pontos fortes

- Arquitetura pequena, local e sem dependências npm de runtime.
- Hooks tolerantes a falha e sem saída que contamine o contexto do agente.
- Servidor ligado apenas a `127.0.0.1` no uso Docker atual.
- Configurações com segredos e eventos estão ignorados pelo Git.
- Payloads Cursor/Gemini excluem saída bruta de ferramentas e transcript.
- CI multiplataforma já cobre três versões LTS/atuais do Node.
- Separação razoável entre captura, estado, relatório, notificação e UI.

### Dívida e riscos técnicos

- `server.js` concentra parsing, estado, IO, HTTP, alertas e relatórios; a
  cobertura de linha é 59,07%, inferior às partes de captura.
- Cobertura total local: 81,37% linhas, 68,31% branches e 81% funções.
- Não há testes do frontend, do canvas, de SSE em browser ou do Docker.
- O protocolo não é versionado; mudanças de payload dos fornecedores podem
  quebrar silenciosamente a telemetria.
- Prompts, comandos, URLs e caminhos são truncados, mas ainda podem conter dados
  sensíveis. O produto não deve prometer anonimização.
- A retenção apaga arquivos de evento com mais de 14 dias. Isso é documentado,
  porém não existe backup/restore ou opt-out por configuração.
- `.cursor/` e `.gemini/` não estão no `.gitignore`, criando risco de commit
  acidental de caminhos locais.
- O README e as imagens ainda descrevem elementos antigos, como a linha vermelha
  de conflito e a disposição anterior do escritório.
- `README.pt-BR.md` está atrás do README em inglês quanto à arquitetura de
  compatibilidade experimental.

## Diagnóstico do Docker

- Container `agent-monitor` em execução e saudável do ponto de vista de processo.
- Porta: `127.0.0.1:4400`.
- A imagem contém hashes idênticos aos arquivos locais auditados para
  `server.js`, `public/index.html`, `public/office.js` e `public/i18n.js`.
- Volumes:
  - `./data` -> `/data` leitura/escrita;
  - `./config` -> `/config` somente leitura;
  - `~/.claude/projects` -> `/host/claude-projects` somente leitura;
  - `~/.codex/sessions` -> `/host/codex-sessions` somente leitura.
- O snapshot retornou 24 sessões durante a auditoria, ntfy ativo e Telegram
  inativo.
- Limite Codex semanal estava disponível; limites Claude estavam ausentes porque
  as sessões observadas vieram do Claude Desktop, que não executou a status line
  do Claude Code terminal.
- O container deliberadamente não contém instaladores/hooks; eles rodam no host
  e gravam em `data/`.
- Atualização segura atual: preservar `data/` e `config/`, executar
  `docker compose up -d --build` e verificar `/api/state`. Ainda falta um
  procedimento formal de backup e rollback.

## ChatGPT e execuções externas

O repositório não possui integração com conversas ChatGPT. `report.js` é o canal
suportado para um processo externo autorizado publicar eventos no Agent Monitor.

As opções oficiais encontradas não equivalem a uma API universal de telemetria
em tempo real de chats pessoais:

- Codex/ChatGPT Work podem executar lifecycle hooks de plugins quando os scripts
  estão presentes no ambiente e o usuário confia neles. Instalar um plugin na
  web não implanta scripts locais automaticamente.
- A exportação de dados do ChatGPT é assíncrona e voltada a histórico, não
  monitoramento ao vivo.
- A Compliance API expõe conversas para cenários Enterprise/Edu autorizados, não
  como integração local genérica para contas pessoais.
- Agentes construídos pela Agents API podem ser observados pela própria aplicação
  e adaptados ao protocolo do Agent Monitor, mas isso não dá acesso às conversas
  internas desta interface.

Conclusão: não anunciar captura automática de chats ChatGPT. Priorizar
`report.js`, um futuro SDK e, separadamente, avaliar hooks de plugins em ambientes
Codex/ChatGPT Work suportados.

## Free, Pro e Agensi

### Agent Monitor Free

É o único aplicativo existente. Está local, MIT, funcional e contém todas as
features descritas como implementadas neste documento.

### Agent Monitor Pro aplicativo

Não existe. Para criá-lo será necessário decidir produto e arquitetura antes de
codificar:

1. Matriz Free/Pro e limites claros.
2. Estratégia open-core sem retirar direitos do código MIT já publicado.
3. Empacotamento, atualização e suporte.
4. Licenciamento/ativação, operação offline e política de privacidade.
5. Recursos premium reais, provavelmente health diagnostics, auditoria, replay,
   tendências e colaboração, em vez de apenas temas visuais.

### Skills Agensi

- Free: `Agent Monitor Quickstart` v1.0.1, `SKILL.md` na raiz do ZIP, onboarding
  opt-in e sem executar instalação antes de consentimento.
- Pro: `Agent Monitor Operations Audit` v1.0.2, auditor somente leitura, métricas
  agregadas e regras explícitas contra inferir espera ausente como zero.
- Testes Pro reexecutados nesta auditoria: 13/13 aprovados.
- A última revisão independente registrou zero P0/P1 de conteúdo, mas manteve
  P2 de documentação/instalador e a necessidade de testes reais dos conectores.
- Publicação, preço, pagamentos e revisão do marketplace continuam pendentes.
- Os pacotes vivem em Downloads/bundles locais, não no Git do aplicativo; falta
  uma origem versionada privada ou processo de release reproduzível.

## Comparação com o roadmap

| Objetivo | Situação atual |
|---|---|
| Claude Code e Codex | Atendido para o escopo atual |
| Cursor e Gemini | Preview real, ainda parcial |
| Copilot/OpenCode/Aider | Não iniciado nativamente |
| Agentes personalizados | Parcial via `report.js` |
| Protocolo padronizado | Convenção não versionada |
| Setup universal seguro | Parcial; dois instaladores e doctor limitado |
| Health Monitor | Sinais básicos, sem diagnóstico inteligente |
| Cost Intelligence | Métricas básicas, sem tendências/eficiência |
| Session Replay | Timeline, sem replay/export/auditoria integrada |
| Smart Pixel Office | Avançado; faltam testes visuais e agrupamento por projeto |
| App Pro | Ausente |
| Skill Free Agensi | Conteúdo pronto, não publicada |
| Skill Pro Agensi | v1.0.2 testada, não publicada |
| ChatGPT | Sem telemetria automática; reporter genérico disponível |

## Backlog priorizado

### P0 — bloqueadores para anunciar/mesclar como suporte confiável

1. **Corrigir a identidade de sessão Gemini**
   - Dependência: fixtures reais de eventos headless e interativos.
   - Aceite: todo prompt, tool, Stop e SessionEnd do mesmo run converge para uma
     única chave; nenhuma sessão permanece working após o processo terminar.
2. **Validar permissões reais de Cursor e Gemini sem alterar decisões**
   - Aceite: cenários permitir/negar/cancelar registrados; hook não concede,
     nega ou evita a confirmação; matriz de cobertura documentada.
3. **Enviar `26ebae5` e executar o CI completo**
   - Aceite: remoto e local alinhados; nove jobs verdes; PR atualizado.
4. **Alinhar alegações de suporte**
   - Aceite: README, UI e skills distinguem `supported`, `preview` e
     `unavailable`, inclusive Gemini headless e limites Claude Desktop.

### P1 — conclusão segura do Free 1.0

1. Introduzir schema de evento versionado, validação e fixtures douradas por
   runtime/versão.
2. Unificar setup com detecção de binário, versão, escopo, preview, backup,
   remoção e verificação de entrega.
3. Adicionar testes de integração do servidor (arquivos, SSE, alertas, retenção)
   e testes básicos de browser/office.
4. Atualizar README EN/PT-BR, screenshots, matriz de capacidades e limitações.
5. Documentar backup, restore, upgrade e rollback Docker sem perda de eventos.
6. Ignorar ou documentar `.cursor/`/`.gemini/` para evitar commit acidental.
7. Definir versão/release, changelog e critérios de estabilidade 1.0.

### P2 — diferenciação e inteligência operacional

1. Agent Health Monitor: repetição, falhas consecutivas, testes reincidentes,
   causas prováveis e recomendações reversíveis.
2. Cost Intelligence: histórico, tendência, orçamento, custo por projeto/tarefa
   e confiança dos dados.
3. Replay/auditoria: filtros, anomalias, sessão incompleta e exportação local.
4. SDK pequeno para publicar eventos validados sem escrever JSONL manualmente.
5. Acessibilidade e testes visuais do Pixel Office.

### P3 — expansão comercial e ecossistema

1. Descoberta de produto do aplicativo Pro e matriz Free/Pro.
2. Licenciamento, ativação, distribuição e atualização da edição Pro.
3. Adaptadores Copilot, OpenCode e Aider, um por vez, com testes reais.
4. Avaliação de plugin para Codex/ChatGPT Work em ambientes que suportem hooks.
5. Processo privado versionado e reproduzível para releases Agensi.

## Plano de execução recomendado

### Etapa 1 — fechar o PR de compatibilidade

1. Capturar fixtures sanitizadas de Cursor/Gemini nas versões testadas.
2. Corrigir correlação do Gemini e adicionar regressão.
3. Executar testes reais de permissão.
4. Atualizar matriz e documentação de preview.
5. Enviar o commit local, aguardar CI e pedir revisão independente.

### Etapa 2 — estabilizar Agent Monitor Free 1.0

1. Versionar o schema e separar adaptadores.
2. Cobrir IO/HTTP/SSE/alertas/retention do servidor.
3. Criar fluxo único de setup e diagnóstico.
4. Atualizar documentação, screenshots e procedimentos Docker.
5. Criar release candidate e executar matriz real em Windows/macOS/Linux.

### Etapa 3 — consolidar auditoria e health

1. Incorporar no app apenas métricas da skill Pro que façam sentido no Free ou
   no futuro Pro, preservando privacidade.
2. Implementar diagnósticos com evidência/confiança e sem autocorreção perigosa.
3. Adicionar exportação agregada local.

### Etapa 4 — decidir e construir o Pro

1. Validar quais diagnósticos geram valor pago.
2. Definir fronteira de código e licença.
3. Projetar ativação, atualização, suporte e privacidade.
4. Só então implementar e comercializar o aplicativo Pro.

### Etapa 5 — publicar skills Agensi

1. Colocar fontes e testes dos pacotes em repositório privado/versionado.
2. Reexecutar revisão de segurança e testes no pacote exato de submissão.
3. Validar listing, preço, pagamentos, política e suporte manualmente.
4. Publicar primeiro a Free/onboarding; publicar a Pro após observar o fluxo real.

## Critério de conclusão do Agent Monitor Free 1.0

- Nenhuma sessão suportada fica órfã após término normal.
- Hooks de observabilidade nunca alteram permissões.
- Cada integração possui versão/OS/capacidades/limitações documentadas.
- Setup tem preview, consentimento, backup, uninstall e verificação real.
- Testes unitários, integração, browser mínimo e Docker passam no CI.
- README EN/PT-BR e screenshots correspondem ao produto.
- Backup/upgrade/rollback estão documentados.
- PR revisado, CI verde no HEAD e release candidate testado em instalações limpas.

## Próxima ação recomendada

Começar pelo P0.1: reproduzir e corrigir a correlação de sessão do Gemini
headless com uma fixture real sanitizada. Em seguida, executar os cenários de
permissão de Gemini e Cursor. Somente depois atualizar alegações de suporte e
enviar o commit local ao PR.

