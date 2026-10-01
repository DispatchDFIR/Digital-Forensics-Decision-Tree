# Digital Forensics Decision Tree

A small static website: an editable yes/no decision-tree ("mindmap") for digital
forensics triage. No build step, no backend — just `index.html`, `style.css`,
`script.js`, and a `data.json` file holding the tree content.

## Using it

- Click any box's text to edit it in place.
- **+ Question** / **+ Action** fills an empty branch slot with a new question
  (another yes/no fork) or a final action box.
- **⇄ Make question** / **⇄ Make final action** converts a box between the two
  types.
- **✕** deletes a box and everything below it.
- Edits autosave to your browser's local storage, so they survive a reload on
  the same device/browser.
- **Export JSON** downloads the current tree as `data.json`.
- **Import JSON** loads a previously exported file.
- **Print / PDF** gives a clean printable view (toolbar/controls hidden).

## Making your edits visible to everyone (GitHub Pages)

Local storage is per-browser, so edits you make on the live site only persist
for you. To make a change permanent for all visitors:

1. Edit the tree on the live site (or locally).
2. Click **Export JSON** — this downloads `data.json`.
3. Replace the `data.json` file in this repo with the downloaded one.
4. Commit and push. GitHub Pages will serve your updated tree to everyone,
   since the page loads `data.json` on first visit (before falling back to
   local storage or the built-in example).

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`.
4. Save. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Files

- `index.html` — page structure and toolbar
- `style.css` — dark/light theme + the CSS-only tree/connector layout
- `script.js` — tree data model, rendering, editing, import/export, autosave
- `data.json` — the committed tree content (edit via Export JSON, above)
