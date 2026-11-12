---
'@hp-flashcard/ui': minor
---

Adds **`AppHeader`** (and its `AppHeaderProps` type), the app's shared header. It renders a `<header>` (the banner landmark) with the logo at the start and the `nav` slot, usually a `SegmentedNav`, at the end. Below the `md` breakpoint (768px) the logo is the 40×40 mark; from `md` up it is the full logo. Pass `logoHref` to make the logo a link, named "Flashcard" at every width; without it the logo is not a link. `className` and other props go on the `<header>`. The logo artwork is a temporary stand-in until the Figma logos ship; that swap won't change `AppHeader`'s props.
