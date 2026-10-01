# treinador-vocal
Web-app para treinamento de afinação vocal em tempo real.

## Dispositivos de áudio

No card **02 — Ajuste o treino**, os botões de reprodução e início aparecem antes do modo de canto e dos seletores de microfone e saída. A trilha MIDI continua sendo selecionada internamente, com seu campo oculto.

- **Automático** mantém a classificação atual dos microfones e a saída padrão do sistema. Uma escolha manual vale enquanto a página estiver aberta.
- **Autorizar microfone** identifica os dispositivos antes do treino e encerra a captura temporária. Também é possível iniciar diretamente pelo fluxo de autorização habitual.
- A saída manual depende de suporte a `HTMLMediaElement.setSinkId()` e `AudioContext.setSinkId()`. Ela abrange instrumental, notas MIDI, efeitos e vídeos com áudio do Modo Festa. Quando disponível, **Escolher outra saída** abre a autorização do navegador.
- As opções ficam bloqueadas durante reprodução/treino e operações de configuração. Desconectar a captura interrompe o treino; perder uma saída manual restaura o modo automático e interrompe o treino em andamento.
- Use HTTPS ou localhost. O navegador pode limitar os dispositivos e nomes expostos; quando não permite trocar a saída, a interface orienta a escolha pelas configurações do aparelho.

Execute os testes com `node --test tests/*.test.mjs`. A validação de roteamento físico e Bluetooth deve incluir Android, iPhone e computador: autorização negada/concedida, USB, fone Bluetooth com microfone interno, desconexão e captura simultânea ao instrumental.
