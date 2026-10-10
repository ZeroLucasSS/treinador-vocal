# Volumes do modo festa

Edite `volumes` em `party-manifest.json` e recarregue a página.

- `sounds`: efeitos de áudio (MP3), como as risadas.
- `memes`: áudio dos vídeos (MP4). Imagens não têm áudio.
- `default`: volume padrão dessa mídia.
- `categories`: volume por estado (`good`, `great`, `struggling`, `comeback`).
- `items`: volume por arquivo, usando o mesmo caminho da lista de mídias.

Os valores vão de **0** (mudo) a **1** (máximo). São volumes absolutos,
sem multiplicação: **item > categoria > default > configuração em JS**.
Campos ausentes ou valores inválidos usam o próximo nível. Manifestos antigos
continuam funcionando com os padrões de `PARTY_CONFIG` em `js/party-mode.js`.

Por exemplo, para deixar uma risada específica ainda mais baixa, coloque em
`volumes.sounds.items`:

```json
{
    "./sounds/struggling/struggling-01.mp3": 0.15
}
```

Para ajustar um vídeo, coloque em `volumes.memes.items`:

```json
{
    "./memes/struggling/struggling-01.mp4": 0.20
}
```

Atualmente os efeitos de `struggling` usam `0.30`; os demais efeitos usam `0.80`
e os vídeos usam `0.42`. Esses controles não alteram o volume da música nem o
retorno do microfone.
