---
'@hp-flashcard/ui': minor
---

Adds **`SegmentedNav`** (and its `SegmentedNavProps` and `SegmentedNavItem` types), the header's pill-shaped switch between pages such as Study Mode and All Cards. It renders a `<nav>` landmark of links, not a tabs widget. Pass `items` as `{ label, href, current }` and a required `aria-label` naming the landmark. The `current` item gets `aria-current="page"` and the yellow `primary` fill. Hovering any other link shows a border, and keyboard focus shows the `ring` color. To use your router, pass `render`, either an element or a function such as `render={(props) => <Link {...props} to={props.href} />}`. It receives each link's `href`, `aria-current`, `className` and label.
