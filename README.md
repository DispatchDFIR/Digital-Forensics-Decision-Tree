# DFIR Decision Trees

A static site (GitHub Pages) backed by Firebase Firestore, with two parts:

- **Decision Trees**: official yes/no triage trees (General Forensic Process,
  plus one per MITRE ATT&CK Enterprise tactic). Everyone can view them, but
  only the admin account can edit them.
- **Mind Maps**: anyone can create a free-form branching mind map. Each map
  gets a share code / invite link, and anyone who has the code can view and
  edit that map with live updates. Mind maps are not listed publicly.

## Using it

- **Move around**: drag any empty part of the canvas.
- **Zoom**: the − / + / Fit buttons in the bottom-right corner, Ctrl/⌘ +
  scroll wheel, trackpad pinch, or two-finger pinch on a phone. Click the
  percentage to go back to 100%.
- **Admin editing**: click **Admin login** and sign in with the admin
  Firebase account. Edit controls then appear on the official trees, and
  changes save for everyone straight away. Questions branch into Yes/No;
  an Action can continue to another box with **↓ Next step** (a plain
  arrow with no Yes/No).
- **Mind maps**: open the **Mind Maps** tab, create a map, then use
  **Copy invite link** to share it. Click a box's text to edit it,
  **+ Child** to branch, the dashed **+ label** pill to label a connection,
  and **✕** to delete a box and everything below it.
- **Export / Import JSON** gives you a backup copy of a tree or map.

## Firebase setup

- Project: `dfir-decision-tree` (Spark / free plan)
- Firestore collections:
  - `officialTrees/{treeId}`: `{ tree, updatedAt }`
  - `mindmaps/{shareCode}`: `{ name, tree, createdAt, updatedAt }`
- Authentication: Email/Password, with a single admin user.
- The admin email appears in two places and they must match:
  `js/firebase.js` (`ADMIN_EMAIL`, controls which UI is shown) and the
  Firestore rules (which enforce it).

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
          && request.auth.token.email == 'joshuagayjh@gmail.com';
    }
    function validMap() {
      return request.resource.data.keys().hasOnly(['name', 'tree', 'createdAt', 'updatedAt'])
          && request.resource.data.name is string
          && request.resource.data.name.size() <= 120
          && request.resource.data.tree is map;
    }

    match /officialTrees/{treeId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /mindmaps/{mapId} {
      allow get: if true;
      allow list: if false;
      allow create: if mapId.size() == 10 && validMap();
      allow update: if validMap();
      allow delete: if isAdmin();
    }
  }
}
```

`allow list: if false` is what keeps mind maps private: a map can only be
opened by someone who already knows its code.

## Releasing changes

GitHub Pages caches files for about 10 minutes. Every script and stylesheet
reference carries a `?v=N` tag (in `index.html` and in each `import` line in
`js/`). When you change any of them, bump N everywhere to the same new
number so visitors don't get a mix of old and new files.

## Files

- `index.html`, `style.css`: page structure and styling
- `js/firebase.js`: Firebase config and admin email
- `js/official-trees.js`: starter content for each official tree (used until
  the admin first saves that tree)
- `js/decision-trees.js`: official tree viewer/editor
- `js/mind-maps.js`: collaborative mind maps and share codes
- `js/shared.js`: drag-to-pan and other helpers
- `js/main.js`: tabs, admin login, startup
- `robots.txt` + `noindex` meta tag: keep the site out of search engines
