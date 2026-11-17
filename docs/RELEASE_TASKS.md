# Agent Monitor — tarefas para Free 1.0 e evolução Pro

Este arquivo é o quadro executável derivado de `PRODUCT_STATUS_AND_ROADMAP.md`.
Estados: `todo`, `doing`, `blocked`, `done`.

## Fase 0 — fechar a branch de compatibilidade

| ID | Estado | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|---|
| P0-01 | done | Correlacionar IDs divergentes do Gemini no mesmo turno | fixtures reais | prompt/Stop/SessionEnd formam uma sessão; nenhuma órfã working |
| P0-02 | done | Criar fixtures sanitizadas Cursor/Gemini e matriz de versões | P0-01 | fixtures sem segredos cobrem lifecycle, tool, failure e permission |
| P0-03 | todo | Testar permissões reais do Gemini | P0-01, P0-02 | permitir/negar/cancelar observados sem decisão pelo hook |
| P0-04 | todo | Testar permissões reais do Cursor | P0-02 | cobertura/indisponibilidade documentada sem hook permissivo |
| P0-05 | todo | Atualizar alegações e limitações EN/PT-BR | P0-01..04 | docs distinguem supported/preview/unavailable |
| P0-06 | todo | Atualizar PR, executar CI e revisão independente | P0-01..05 | HEAD remoto, 9 jobs verdes e revisão sem P0/P1 |

## Fase 1 — estabilizar Agent Monitor Free 1.0

| ID | Estado | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|---|
| P1-01 | done | Introduzir schema de eventos versionado | P0-02 | schema, validação tolerante e compatibilidade com eventos existentes |
| P1-02 | done | Separar adaptadores por runtime | P1-01 | normalizadores isolados e golden tests por versão |
| P1-03 | doing | Unificar setup e diagnóstico | P1-01 | doctor detecta binário/versão/escopo e delivery recente; falta fluxo único de preview/consentimento/uninstall |
| P1-04 | doing | Testar servidor, SSE, alertas e retenção | P1-01 | HTTP/SSE/static automatizados; falta retenção e integração de alertas |
| P1-05 | todo | Adicionar smoke test de browser e office | P0-05 | filtros, cards, badges e views exercitados automaticamente |
| P1-06 | doing | Documentar backup/restore/upgrade/rollback Docker | P1-04 | procedimento documentado; falta ensaio completo com cópia restaurada |
| P1-07 | todo | Atualizar screenshots e documentação bilíngue | P1-05 | README EN/PT-BR e imagens correspondem ao produto |
| P1-08 | todo | Preparar release candidate 1.0 | P1-01..07 | changelog, versão, instalação limpa e CI multiplataforma |

## Fase 2 — inteligência operacional

| ID | Estado | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|---|
| P2-01 | todo | Agent Health: repetição e falhas consecutivas | P1-01 | diagnóstico com evidência e confiança, sem autocorreção |
| P2-02 | todo | Agent Health: testes reincidentes e causas prováveis | P2-01 | agrupamento e ação reversível recomendada |
| P2-03 | todo | Cost Intelligence histórica | P1-01 | tendências e orçamento distinguem estimativa de cobrança |
| P2-04 | todo | Replay/auditoria e exportação local | P1-04 | timeline filtrável, incompletas e export agregado privado |
| P2-05 | todo | SDK mínimo de eventos | P1-01 | API validada para agentes externos sem JSONL manual |
| P2-06 | todo | Acessibilidade e regressão visual | P1-05 | estado não depende apenas de cor/animação |

## Fase 3 — produto Pro e ecossistema

| ID | Estado | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|---|
| P3-01 | todo | Definir matriz Free/Pro e proposta comercial | P2-01..04 | recursos pagos têm valor e não removem direitos MIT existentes |
| P3-02 | todo | Projetar licença, ativação e atualização Pro | P3-01 | fluxo offline/online, privacidade, suporte e threat model |
| P3-03 | todo | Implementar aplicativo Pro | P3-02 | pacote, ativação e recursos premium testados |
| P3-04 | todo | Adaptador GitHub Copilot | P1-01..03 | versão/OS/capacidades e teste real documentados |
| P3-05 | todo | Adaptador OpenCode | P1-01..03 | versão/OS/capacidades e teste real documentados |
| P3-06 | todo | Adaptador Aider | P1-01..03 | versão/OS/capacidades e teste real documentados |
| P3-07 | todo | Avaliar plugin Codex/ChatGPT Work | P1-01, P2-05 | apenas superfícies oficiais, scripts locais e confiança explícita |

## Fase 4 — skills Agensi

| ID | Estado | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|---|
| A-01 | todo | Versionar fontes Free/Pro em repositório privado | nenhuma | build reproduzível dos ZIPs exatos |
| A-02 | todo | Revalidar Free no release 1.0 | P1-08, A-01 | comandos e compatibilidade correspondem ao release |
| A-03 | todo | Revalidar auditor Pro | P0-01, P1-01, A-01 | testes e métricas refletem schema final |
| A-04 | todo | Preparar listing, preço, pagamentos e suporte | A-02, A-03 | revisão humana concluída, sem publicação automática |
| A-05 | todo | Submeter Free e depois Pro | A-04 | pacotes publicados e instalação observada |

## Ordem imediata de execução

1. P0-01: correlação Gemini.
2. P0-02: fixtures e matriz.
3. P0-05 (parte programática): documentação conhecida.
4. P1-01/P1-02: schema e adaptadores.
5. P1-04: integração backend.
6. P1-03: setup unificado.
7. P1-06/P1-07: operação e docs.
8. P0-03/P0-04/P1-05: testes que exigem interação com aplicativos, somente no final e após aviso ao usuário.
9. P0-06: push, CI e revisão.

