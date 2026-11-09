# R2 Auto

Extension Firefox pour saisir dans **R2** les sorties reçues par mail (titre, artiste principal, date de sortie, auteurs, mix & master, territoire…).

**Page de téléchargement :** https://coolbinary7.github.io/r2-auto/

## Contenu du dépôt

- `recorder/` : **R2 Recorder** (phase 1). Il enregistre les clics, les saisies et la structure des formulaires R2 pendant une création faite à la main. L’export JSON sert à construire l’automatisation.
- `extension/` : **R2 Auto** (0.1.0, en test). Il lit le mail et le WAV, puis remplit R2 écran par écran à partir d’une copie de la dernière sortie de l’artiste : release, piste (ISRC, durée, auteurs, mix/master) et cover. Le Submit final reste manuel.
- `docs/` : page de téléchargement (GitHub Pages) et fichiers `.xpi`.

## Installer pour tester

Dans Firefox, ouvre `about:debugging#/runtime/this-firefox`, clique sur *Charger un module complémentaire temporaire*, puis choisis le `manifest.json` du dossier ou le `.xpi`.

## Publier une nouvelle version

1. Monter `version` dans le `manifest.json`.
2. Zipper le contenu du dossier en `.xpi` dans `docs/downloads/`.
3. Mettre à jour le lien dans `docs/index.html`.

> Outil interne non officiel. Il écrit dans R2 : à tester d’abord sur R2 Training, en mode Guidé.
