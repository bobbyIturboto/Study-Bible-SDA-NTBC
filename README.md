# Bible Study (offline PWA)

A private, offline-first Bible study app: Bibles, Ellen G. White writings and commentary with two-way verse links,
word/phrase/topic search, YouVersion-style highlighting, notes with shelves, bookmarks. Everything is stored on your own device.

**This repository contains only the app code. No books.** The books are copyrighted: never commit them.
`.gitignore` blocks `data/*.json`, `*.epub`, `*.pdf` and `*.zip` to protect you from doing it by accident.

## Publish with GitHub Pages
1. Create a new repository and upload everything in this folder (keep `.nojekyll`).
2. Settings, Pages, Source: "Deploy from a branch", branch `main`, folder `/ (root)`, Save.
3. After a minute the app is at `https://<your-name>.github.io/<repo-name>/`.
   (Free accounts need a public repository for Pages. That is fine: the code is safe, the books are not in it.)

## Install on your phone
- iPhone (Safari): Share, then Add to Home Screen.
- Android (Chrome): menu, then Install app.

## Load your books (once per device)
Copy your own `.json` book files to the phone, open the app, Library, Import bundle, select them all
(NKJV, SC, MB, DA, PP, PK, AA, GC, COL, SDABC-EGW, TOPICS-*, XREF-NKJV, NOTES-NKJV, SOURCEBOOK).
They are stored inside the app on that device only and work offline. Make backups from the Me tab.

## Updating
Upload the new files over the old ones. Close and reopen the app twice to pick up the update.

## tools/
Python scripts that convert your own EPUB/PDF files into the `.json` bundles (`import_*.py`, `build_*.py`). Run them locally.
