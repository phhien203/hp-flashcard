---
'@hp-flashcard/ui': minor
---

`CardTile`'s `onEdit` and `onDelete` are now optional. The actions menu offers only the items whose callback you pass. With neither, the tile is read-only and has no "Card actions" button, so an app can show Cards before it supports editing or deleting them.
