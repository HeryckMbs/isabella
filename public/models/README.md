# Modelos 3D

O jogo carrega automaticamente `public/models/isabella.glb`.

## Modelo temporario

`isabella.glb` e um placeholder realista temporario derivado do arquivo `avatars/mpfb.glb` do projeto open source TalkingHead:

- Repositorio: https://github.com/met4citizen/TalkingHead
- Arquivo original: https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb
- Origem do personagem: MPFB/MakeHuman
- Licenca declarada pelo projeto para o modelo MPFB: CC0

O arquivo local foi reduzido para texturas 1024px e WebP com `gltf-transform`, mantendo formato GLB estatico para GitHub Pages.

## Substituir pela Isabella final

Para trocar pelo modelo definitivo:

1. Exporte um humano rigado em GLB pelo MakeHuman/MPFB, Blender, Mixamo ou fluxo equivalente.
2. Deixe o modelo com origem nos pes e altura entre 1.7m e 2.1m. O jogo normaliza a escala automaticamente.
3. Salve como `public/models/isabella.glb`.
4. Mantenha ossos humanoides com nomes como `Hips`, `Spine`, `LeftUpLeg`, `LeftLeg`, `RightUpLeg`, `RightLeg`, `LeftArm`, `RightArm`, `Head`. Se o GLB nao trouxer clipes de animacao, o jogo anima esses ossos manualmente.

O fallback procedural antigo continua no codigo e aparece somente se esse GLB nao carregar.
