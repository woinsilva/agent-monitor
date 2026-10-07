# Agent Monitor

Painel local e ao vivo para agentes de IA de programação. Mostra quantos agentes
estão trabalhando, o que cada um está fazendo agora, quem está esperando sua
aprovação, quais arquivos foram mexidos e quando dois deles editam o mesmo arquivo.

Funciona com **Claude Code** e **Codex** direto (pelos hooks deles) e com
**qualquer outro agente ou script** por um comando de uma linha. Tudo roda no seu
computador em http://localhost:4400; nada é enviado para fora.

*[English](README.md)*

## Telas

- **Escritório:** um escritório em pixel art onde cada sessão é um funcionário.
  Claude Code à esquerda, Codex à direita, outros agentes na sala de reunião,
  subagentes como estagiários atrás da cadeira de quem os chamou.
  - digitando: editando arquivos ou rodando comando (o monitor mostra qual)
  - lendo um papel: lendo ou buscando código
  - em pé, com a mão levantada e balão amarelo: **esperando você**
  - com café na mão: ocioso
  - cabeça na mesa: sem sinal há mais de 20 minutos

  Os agentes entram pela porta quando começam e saem quando encerram. Uma linha
  vermelha liga dois agentes que editaram o mesmo arquivo. Clique em alguém para ver
  o histórico.
- **Painel:** um card por sessão com a ação atual, contadores, uso de contexto e
  subagentes, além de filtros.
- **Linha do tempo:** a atividade do dia por sessão e quantos agentes rodaram juntos.
- **Notificações:** aviso no sistema (com som) quando um agente fica esperando você
  e, se quiser, quando termina. O título da aba mostra quantos estão esperando.
  Funcionam com a aba aberta, mesmo em segundo plano.

Em inglês e português, conforme o navegador (troque no botão EN/PT).

## Requisitos

- Node.js 18+ (os hooks rodam no seu computador)
- Opcional: Docker, para o painel ficar sempre no ar e subir junto com o computador

## Começando

```sh
git clone https://github.com/<voce>/agent-monitor.git
cd agent-monitor

# 1. hooks: por projeto, ou --global para todos os projetos do seu usuário
node install.js /caminho/do/seu/projeto
# node install.js --global

# 2a. rodar com Node
node server.js

# 2b. ou rodar no Docker (volta sozinho sempre que o Docker iniciar)
node setup.js
docker compose up -d --build
```

Abra http://localhost:4400 e mande um pedido ao Claude Code ou ao Codex nesse
projeto. Na primeira vez o Codex pede para confiar nos hooks novos: aceite.

`start.cmd` / `start.sh` sobem o container e abrem o navegador; `stop.cmd` /
`stop.sh` param (ele fica parado até você iniciar de novo). Depois de alterar
`server.js` ou `public/`, rode `docker compose up -d --build` de novo.

O funcionamento, a instalação dos hooks, o formato para outros agentes e a lista de
status estão detalhados no [README em inglês](README.md).

## Outros agentes (resumo)

```sh
node report.js start --client revisor --prompt "Revisão independente do diff"
node report.js stop  --client revisor --reply "3 achados" --input-tokens 41000 --output-tokens 2300
node report.js end   --client revisor
```

Chamadas do mesmo script caem na mesma sessão automaticamente. `wait` marca como
esperando você e `stop --failed` registra falha.
