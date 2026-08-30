# Fuentes de recursos

## `m72_-_moonchild.it`
Módulo Impulse Tracker original, *Moonchild* de **M72**. 452 KB.

Es la fuente de `public/audio/moonchild.opus.ogg` y `.mp3`. Ningún navegador
reproduce `.it` de forma nativa, así que se convierte:

```sh
ffmpeg -i assets/m72_-_moonchild.it -c:a libopus -b:a 64k -vbr on -ar 48000 -ac 2 \
  public/audio/moonchild.opus.ogg -y
ffmpeg -i assets/m72_-_moonchild.it -c:a libmp3lame -b:a 80k -ar 44100 -ac 2 \
  public/audio/moonchild.mp3 -y
```

El módulo se conserva porque bucla exacto y pesa 12 veces menos: si algún día
el bucle audible del ogg molesta, la vía es reproducirlo tal cual con
libopenmpt.js en vez de reencodearlo mejor.
