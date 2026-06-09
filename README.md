# MusicBash Translation Workbench

Local tool for reviewing and editing nested locale JSON files.

## Start

```bash
cd /Users/kruegeg/Documents/MusicBash
BASE_EDIT_PASSWORD="choose-a-password" npm start
```

Open the URL printed in Terminal, usually:

```text
http://127.0.0.1:4173
```

The app loads:

- `locales/en.json` as the source language
- `locales/de.json` as German
- `locales/fr.json` as French
- `translation-state.json` for review status and notes

## Workflow

1. Select `DE` or `FR`.
2. Use filters for `Blocking issues`, `Needs review`, `Same as English`, or `Final`.
3. Select a row to edit the target translation.
4. Keep placeholders such as `{{name}}` exactly aligned with English.
5. Mark a string as final when it is ready.
6. Click `Save all` to write edited JSON and review status to disk.

Blocking rows cannot be final until the missing, empty, or placeholder issue is fixed.

## English Base Editing

English base strings are locked in the UI. Set `BASE_EDIT_PASSWORD` before starting locally, or configure the same environment variable in Vercel.

After unlocking `EN`, you can edit English strings, upload `en.json`, and download the updated English file. Without unlocking, English is read-only.

## Upload JSON

Use `Upload JSON` to load updated locale files into the browser. Filenames must include the language code, such as `en.json`, `de.json`, `fr.json`, `strings.de.json`, or `MusicBash-FR.JSON`.

## Share With A Colleague

The colleague does not need this chat to use the tool. Share the `MusicBash` folder through Git, AirDrop, a zip file, or your normal file sharing flow.

On the other Mac:

```bash
cd path/to/MusicBash
npm start
```

Node.js is required. If `npm start` is unavailable, this also works:

```bash
node server.js
```

The edited files stay local on that Mac until they are shared back through Git or file transfer.

## Hosted Link Behavior

The hosted version is link-shareable. Because it has no shared database, each reviewer saves final marks and edits in their own browser. Reviewers should use `Download DE` or `Download FR` to send edited JSON back.

## Deploy On Vercel

This repo can be imported directly into Vercel from GitHub.

1. Push this folder to a GitHub repository.
2. In Vercel, choose `Add New Project` and import the GitHub repo.
3. Use the default project root.
4. Use the `Other` framework preset if Vercel asks.
5. Vercel will use `npm run build` and serve the `build` output directory from `vercel.json`.
6. Deploy.

Vercel serves `index.html`, `app.js`, and `styles.css` from the generated `build` directory. The `/api/data` function loads the committed locale JSON files and tells the app to use browser-local save state.

When you update `locales/en.json`, `locales/de.json`, or `locales/fr.json`, commit and push the change to GitHub. Vercel will redeploy the latest source files.

Set this Vercel environment variable before sharing English editing:

```text
BASE_EDIT_PASSWORD=your-password
```
