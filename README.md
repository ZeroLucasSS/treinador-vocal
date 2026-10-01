# treinador-vocal
Web-app para treinamento de afinação vocal em tempo real.

## Dispositivos de áudio

No card **02 — Ajuste o treino**, os botões de reprodução e início aparecem antes do modo de canto e dos seletores de microfone e saída. A trilha MIDI continua sendo selecionada internamente, com seu campo oculto.

- **Automático** mantém a classificação atual dos microfones e a saída padrão do sistema. Uma escolha manual vale enquanto a página estiver aberta.
- **Autorizar microfone** identifica os dispositivos antes do treino e encerra a captura temporária. Também é possível iniciar diretamente pelo fluxo de autorização habitual.
- A saída manual depende de suporte a `HTMLMediaElement.setSinkId()` e `AudioContext.setSinkId()`. Ela abrange instrumental, notas MIDI, efeitos, vídeos com áudio do Modo Festa e retorno da voz. Quando disponível, **Escolher outra saída** abre a autorização do navegador.
- As opções ficam bloqueadas durante reprodução/treino e operações de configuração. Desconectar a captura interrompe o treino; perder uma saída manual restaura o modo automático e interrompe o treino em andamento.
- Use HTTPS ou localhost. O navegador pode limitar os dispositivos e nomes expostos; quando não permite trocar a saída, a interface orienta a escolha pelas configurações do aparelho.

Execute os testes com `node --test tests/*.test.mjs`. A validação de roteamento físico e Bluetooth deve incluir Android, iPhone e computador: autorização negada/concedida, USB, fone Bluetooth com microfone interno, desconexão e captura simultânea ao instrumental.

## Retorno da voz

Escolha **Fones de ouvido** ou **Caixas de som** no aviso de preparação. Essa escolha adapta as orientações; os dispositivos continuam sendo definidos pelos seletores do card 02. Usar caixas não exige confirmar uso de fones e não altera a dificuldade de canto.

- **Reproduzir minha voz** começa desligado. O volume inicial é 20%, independente do instrumental e da análise de afinação, com limite de ganho unitário (100%).
- **Testar voz** abre o microfone selecionado e ativa o retorno sem tocar a música nem pontuar. **Encerrar teste de voz** fecha a captura. Teste, prévias e treino não funcionam simultaneamente.
- **Silenciar voz** corta somente o retorno. A captura e a avaliação continuam no treino. O volume e o silenciamento podem ser usados enquanto se canta.
- Encerrar/interromper o treino desliga o retorno. Eventos de mudança de dispositivo, saída ou interrupção do contexto de áudio também o silenciam; é necessário reativá-lo explicitamente. A recuperação de saída pelo aplicativo silencia a voz antes de mudar a rota. Mudanças físicas do sistema dependem das notificações disponibilizadas pelo navegador.
- Prefira conexões por cabo para retorno ao vivo. O navegador não garante latência imperceptível, especialmente com Bluetooth. Comece com volume baixo e afaste o microfone das caixas: o retorno não inclui supressão de microfonia. O som das caixas captado pelo microfone pode afetar a pontuação.
- Se uma mesa ou interface já reproduz a voz diretamente, mantenha o retorno do aplicativo desligado para evitar duplicação.

A reprodução usa um ramo `source → GainNode → destination`, separado de `source → analyser`, no mesmo contexto da captura, com `latencyHint: "interactive"`. Ela não usa gravação em arquivos ou transmissão a um servidor.
