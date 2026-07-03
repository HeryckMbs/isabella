# Jardim da Isabella

Jogo web estatico em homenagem a Isabella, otimizado para iPhone 15 Pro Max em modo retrato.

## Rodar localmente

```bash
npm install
npm run optimize:photos
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

O build final fica em `dist/` e pode ser publicado no GitHub Pages.

## Escolher fotos

Edite `src/content/photo-selection.json` com as fotos que devem aparecer na galeria. O campo `source` aponta para os originais locais em `assets/`, e o script gera versoes leves em `public/gallery/`.

A pasta `assets/` fica ignorada para evitar publicar os 2.2GB de originais. As fotos otimizadas em `public/gallery/` podem ser versionadas e usadas pelo GitHub Pages.

Campos do manifesto:

- `id`: identificador unico.
- `source`: caminho do arquivo original local.
- `caption`: legenda da galeria.
- `year`: ano ou periodo exibido.
- `featured`: marca fotos importantes.
- `puzzle`: define a imagem usada no puzzle.
# isabella
