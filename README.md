# sofá.

Transforma o PC com Windows numa **smart TV**: um launcher em tela cheia, no estilo das interfaces de console, que abre YouTube, Netflix, Prime Video, Disney+ e Jellyfin e que é controlado por **controle de videogame, celular ou voz**.

## Recursos

- **Launcher 10-foot** com navegação por foco, relógio e tela de transmissão quando ocioso.
- **Streaming com DRM** em alta resolução: os serviços abrem no Microsoft Edge (PlayReady), controlado via Chrome DevTools Protocol.
- **YouTube na interface oficial de TV** (`youtube.com/tv`), até **4K60 em VP9**.
- **Controles**: Xbox (XInput) e **DualSense / DualShock 4 direto via HID** (USB e Bluetooth, sem Steam nem DS4Windows).
  - Analógico esquerdo/direcional = navegar; analógico direito = rolar a página; touchpad = mouse (um dedo move, dois dedos rolam, clique = clique).
  - L2/R2 = volume sensível à pressão; △ = proporção; botão do microfone = voz; PS = início.
- **Controle pelo celular**: PWA na rede local (escaneie o QR code do launcher), com direcional, mídia, touchpad, teclado e lista de apps.
- **Transmitir pelo app do YouTube**: receptor DIAL, e o PC aparece como "Sofá (PC)" no botão de transmitir.
- **Comandos de voz em português** com Whisper local, sem enviar áudio para a nuvem: "abrir Netflix", "procurar Round 6 na Netflix", "pausar", "aumentar volume".
- **Monitores ultrawide**: modos Original (com modo ambiente nas laterais), Zoom suave, Preencher e Esticar.
- **Navegação espacial** injetada em sites feitos para mouse (Netflix, Prime, Disney+).
- **Barra de volume na tela**, com o volume exato do Windows via Core Audio.

## Requisitos

- Windows 10/11 com Microsoft Edge
- Node.js 20+
- Opcional, para voz: Python 3 com [`openai-whisper`](https://github.com/openai/whisper) (`pip install openai-whisper`)
- Opcional: servidor [Jellyfin](https://jellyfin.org) em `localhost:8096`

## Como usar

```bash
npm install
npm start
```

O npm 11+ pode pedir para aprovar os scripts de instalação de `electron`, `koffi` e `node-hid`:

```bash
npm install-scripts approve electron koffi node-hid
```

Na primeira execução, o Windows pergunta se o Sofá pode usar a rede. Permita na **rede privada** para o celular conseguir se conectar.

### Variáveis opcionais

| Variável | Padrão | Uso |
|---|---|---|
| `SOFA_PYTHON` | `python` | Interpretador Python usado para a voz |
| `SOFA_WHISPER_MODEL` | `small` | Modelo do Whisper (`base`, `small`, `medium`…) |

## Portas usadas

| Porta | Uso |
|---|---|
| 8787 | Controle remoto do celular (HTTP + WebSocket) |
| 56790 + UDP 1900 | Receptor DIAL/SSDP (transmissão do YouTube) |
| 8790 | Servidor de voz local (só `127.0.0.1`) |
| 9333 | Depuração do Edge controlado (só local) |

## Segurança

O controle remoto **não tem senha**: qualquer aparelho na mesma rede consegue usá-lo. Use só em redes de confiança, como a da sua casa.

## Estrutura

```
src/main/      processo principal (Electron): Edge/CDP, controles, celular, DIAL, voz, volume
src/launcher/  interface do launcher
src/inject/    scripts injetados nos sites (navegação espacial, ultrawide, qualidade)
src/remote/    PWA do controle no celular
src/voice/     barra de voz e servidor Whisper
```

## Aviso

Projeto pessoal, sem nenhuma afiliação com Netflix, Google/YouTube, Amazon, Disney, Sony, Microsoft ou Jellyfin. Os nomes aparecem só para identificar os serviços. Nenhuma proteção de conteúdo (DRM) é contornada: o vídeo protegido toca pelo Microsoft Edge, com as suas próprias contas.

## Licença

[MIT](LICENSE)
