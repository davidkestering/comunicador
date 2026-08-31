# Comunicador

Mensageiro privado para a família, hospedado no próprio servidor. Substitui o WhatsApp quando ele falha: texto, áudio, arquivos e notificações com o app fechado — **sem depender de Google, Firebase, SMS ou qualquer serviço de terceiros**.

- Site e app web: https://comunicador.davidkestering.com (app em `/app`, APK em `/comunicador.apk`)
- Repositório: https://github.com/davidkestering/comunicador
- Autor: David Kestering <davidkestering@gmail.com>

## Por que existe

Em 31/08/2026 a conta do WhatsApp do autor foi banida por erro da plataforma, deixando-o sem canal com a família. O Comunicador nasceu no mesmo dia com um objetivo: nunca mais depender de uma empresa para conversar com quem importa. Só entra quem está numa lista de números controlada pelo dono do servidor.

## Funcionalidades

| Recurso | Como funciona |
|---|---|
| Cadastro sem SMS | Número de telefone (E.164) + código TOTP do **Google Authenticator** (label `comunicador (+55…)`). Só números em `allowed.txt` podem se cadastrar. |
| Mensagens de texto | REST + WebSocket em tempo real |
| Mensagens de voz | `MediaRecorder` (webm/opus) no WebView, upload para o servidor |
| Arquivos | Qualquer tipo, até 100 MB, links assinados (HMAC) com validade |
| Sempre online (Android) | Serviço em primeiro plano (`foregroundServiceType="specialUse"`) com WebSocket persistente (OkHttp); reinicia no boot e quando a rede volta; notificação local ao chegar mensagem. As mensagens ficam no servidor; o app só é avisado e sincroniza. |
| Uso no navegador | O mesmo client React roda em `/app` para quem não instalou o APK |
| Multi-dispositivo | Cada login gera um token de dispositivo; o mesmo número entra em vários aparelhos com o código do Authenticator |

Fora do escopo (por enquanto): grupos, chamadas de voz/vídeo, criptografia ponta a ponta, iOS, status.

## Arquitetura

```
[APK Capacitor]──HTTPS/WSS──▶ proxy-nginx (Let's Encrypt) ──▶ comunicador-api:3000 (Node 22, 1 processo)
   │  WebView (React/Vite)                                       ├─ /            página pública + download do APK
   │  WsService (Java, OkHttp WebSocket)                          ├─ /app/        client web
   └─ notificação local                                          ├─ /api/*       REST (auth, usuários, mensagens, arquivos)
                                                                 ├─ /ws          WebSocket (app aberto e serviço nativo)
[Navegador]─────────────────────────────────────────────────────▶ └─ SQLite (node:sqlite) + data/files/
```

Escolhas deliberadas: um único processo Node, SQLite nativo do Node 22 (sem dependência nativa), TOTP implementado com `node:crypto` (RFC 6238), sem Redis/Postgres/fila. Para uma família, isso basta e cabe em ~40 MB de RAM.

```
server/          API + WebSocket + estáticos (index.js, auth.js, api.js, files.js, db.js, totp.js, admin.js, test.js)
client/          React + Vite + Capacitor (src/, android/)
client/android/app/src/main/java/com/davidkestering/comunicador/
                 WsService.java (serviço), BgPlugin.java (ponte JS), BootReceiver.java
docker/          android-build/ (imagem JDK 21 + cmdline-tools), android-sdk/, gradle-cache/, keystore/ (volumes locais)
build-apk.sh     gera data/comunicador.apk assinado, dentro do Docker
allowed.txt      números autorizados (um por linha, E.164)
docker-compose.yml
```

## Rodando

Pré-requisitos: Docker + Compose, Node 22 (para compilar o client), um proxy reverso com TLS (aqui: `proxy-nginx` + certbot na rede `proxy-net`).

```bash
git clone https://github.com/davidkestering/comunicador.git && cd comunicador
# números da família
echo "+5511999999999" >> allowed.txt
# client web
(cd client && npm install && npm run build)
# servidor
docker compose up -d --build
```

Configure o proxy para encaminhar o domínio ao container `comunicador-api:3000` com suporte a WebSocket (`Upgrade`/`Connection`), `client_max_body_size 100m` e `proxy_read_timeout 3600s`. Ajuste `PUBLIC_URL`/`ORIGINS` no `docker-compose.yml` e a constante `API` em `client/src/api.js` para o seu domínio.

### Gerar o APK

```bash
# uma vez: keystore de assinatura (guarde com backup!)
keytool -genkeypair -keystore docker/keystore/comunicador.jks -alias comunicador -keyalg RSA -keysize 2048 -validity 10000
printf 'KEYSTORE_PASSWORD=<senha>\nKEY_ALIAS=comunicador\n' > docker/keystore/.env
docker build -t comunicador-android-build docker/android-build
# sempre que mudar o app
./build-apk.sh        # -> data/comunicador.apk, servido em /comunicador.apk
```

O SDK Android (~500 MB) e o cache do Gradle ficam em `docker/android-sdk` e `docker/gradle-cache`; a primeira compilação leva ~10 min, as seguintes ~3 min.

### Testes

```bash
cd server && npm install && npm test
```

Cobre: vetor de teste TOTP da RFC 6238, cadastro negado fora da lista, cadastro + verificação + login em segundo aparelho, entrega de mensagem por WebSocket e REST, upload/download com link assinado.

### Operação

- Liberar um número: adicione a linha em `allowed.txt` (lido a cada cadastro, sem reiniciar).
- Alguém perdeu o Authenticator: `docker exec comunicador-api node admin.js reset +55…` e a pessoa se cadastra de novo.
- Listar usuários: `docker exec comunicador-api node admin.js users`.
- Dados persistentes em `data/` (`comunicador.db`, `files/`, `secret`, `comunicador.apk`).

## Evolução do projeto

### 2026-08-31 — v1.0 (primeiro dia)

1. **Planejamento**: decisão por Capacitor (um código para APK e web), cadastro por TOTP em vez de SMS, serviço próprio em segundo plano em vez de FCM, build do APK em Docker com volumes locais, lista de números permitidos.
2. **Servidor**: Node 22 + `node:sqlite` + `ws`; TOTP próprio (RFC 6238, compatível com Google Authenticator); uploads em streaming com limite de 100 MB; links de arquivo assinados; limite de tentativas no código; testes automatizados (5/5).
3. **Subdomínio**: `comunicador.davidkestering.com` no proxy Nginx com certificado Let's Encrypt e WebSocket.
4. **Client web**: React/Vite — telas de cadastro (QR + código), contatos, conversa; texto, gravação de áudio e envio de arquivos; reconexão automática do WebSocket; notificações do navegador.
5. **Android**: projeto Capacitor 8; `WsService` (foreground `specialUse`, OkHttp, backoff, reconexão ao voltar a rede), `BgPlugin` (permissões, otimização de bateria), `BootReceiver`; ícone azul com balão e a letra **K** (família Kestering).
6. **Build em Docker**: imagem `eclipse-temurin:21-jdk` + cmdline-tools; SDK, Gradle e keystore em `docker/`; APK release assinado (3,6 MB) publicado em `/comunicador.apk`.
7. **Página pública**: apresentação do app, download e passo a passo de instalação/cadastro/bateria.

Aprendizados: OkHttp 5.5 exige `compileSdk 37` (ficou o 4.12); no Android 15 o tipo `dataSync` morre em 6 h e não pode iniciar no boot — `specialUse` resolve; fabricantes (Xiaomi/Samsung) exigem desativar otimização de bateria e ligar "início automático".

### 2026-08-31 — v1.1 a v1.7 (primeiro uso real, Xiaomi/Android 16)

Sintoma relatado: "o app fecha logo depois do código do Authenticator". Sem `adb` nos celulares, o diagnóstico foi feito com instrumentação enviada ao servidor:

- **v1.1** — faltava `ACCESS_NETWORK_STATE` (exigido por `registerDefaultNetworkCallback`, que derrubaria o serviço com `SecurityException`). Relator de crash (`POST /api/crash` → `data/logs/`).
- **v1.2–v1.5** — rastro de eventos (JS e Java) gravado num arquivo local do aparelho e enviado na abertura seguinte; motivo oficial da morte do processo (`ApplicationExitInfo`); listener do renderer do WebView. Descoberta: o WebView do aparelho nunca emitia requisições para `/api/crash`, então o envio passou a ir como query de `GET /health?diag=`.
- **v1.6** — causa real do "fecha": a tela de isenção de bateria era aberta como tarefa separada (`FLAG_ACTIVITY_NEW_TASK`) e, na Xiaomi, ao sair dela o usuário caía na tela inicial. Passou a abrir a partir da Activity, na mesma tarefa.
- **v1.7** — o serviço abria duas conexões WebSocket (o primeiro `onAvailable` do callback de rede dispara no registro). Corrigido.
- Servidor: APK entregue sem cache (`no-cache`, nome com versão, link com cache-buster — o navegador do celular reinstalava a v1.0 do cache); fuso `America/Belem`; log de conexões WebSocket.

Resultado: serviço em segundo plano conectado, mensagens trocadas entre dois celulares com o app fechado.

## Licença

[MIT](LICENSE) — pode baixar, modificar, distribuir e usar comercialmente, desde que mantenha o aviso de copyright e a referência ao projeto original (https://github.com/davidkestering/comunicador) e ao autor, David Kestering.
