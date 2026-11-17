# Licença, ativação e atualização do Agent Monitor Pro

## Fluxos

1. **Offline:** o comprador recebe um arquivo assinado Ed25519. O aplicativo
   valida assinatura, produto e expiração localmente; nenhuma rede é usada.
2. **Online opcional:** somente `activate --online --key-stdin` envia a chave e um UUID local
   aleatório ao endpoint configurado. A resposta deve ser o mesmo arquivo
   assinado, que continua validável offline.
3. **Atualização:** pacotes têm versão e checksum publicados separadamente. A
   aplicação informa a versão; não baixa nem executa atualização sem comando
   explícito.

Não há fingerprint de hardware, telemetria de uso, prompts, caminhos, nomes de
projeto ou eventos na ativação. O UUID pode ser apagado junto com a licença.
Redirecionamentos HTTP são rejeitados e a chave deve vir por stdin ou variável de
ambiente, não por argumento visível no histórico/processo.

## Formato

`base64url(JSON).base64url(assinatura Ed25519)` com os campos `product`,
`licenseId`, `subject`, `issuedAt`, `expiresAt` e `features`. A chave pública é
embutida no pacote de release; a chave privada nunca entra no aplicativo, CI ou
ZIP distribuído.

A chave pública de release está em `pro/public-key.pem`. A chave privada do
publicador é mantida fora de qualquer repositório e pacote distribuído, com acesso
restrito ao responsável pela emissão.

## Threat model

- Arquivo adulterado: assinatura falha.
- Licença expirada ou de outro produto: validação falha fechada.
- Replay/cópia: aceito no fluxo offline dentro dos assentos contratados; controle
  de assentos online é opcional e não justifica coleta de dados do projeto.
- Endpoint comprometido: não pode criar licença válida sem a chave privada.
- Chave privada comprometida: rotacionar chave de release e emitir novas licenças.
- Relógio local alterado: pode ampliar validade offline; mitigar apenas no modo
  online, sem transformar o Free nem o uso offline em dependência de servidor.
- Indisponibilidade de rede: licença offline válida continua funcionando.

Mensagens de erro não exibem a chave informada. Logs registram apenas categoria
do erro e versão do aplicativo.
