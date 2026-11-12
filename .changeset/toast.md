---
'@hp-flashcard/ui': minor
---

Adds **`ToastProvider`** and **`useToast`** (plus their `ToastProviderProps` and `ToastOptions` types) for short confirmations such as "Card created successfully.".

- Put `ToastProvider` once near the root of the app. Anything inside it can call `useToast().add({ title })` to show a toast, and `close(id)` (or `close()` for all) to close one. `add` returns the toast's id; adding again with the same `id` updates it in place.
- Toasts appear bottom-centre over the page, stacked, as a pill on the card surface with the `shadow-rest` hard shadow and a ✕ close button named "Close". Keyboard focus shows the `ring` color.
- They close on their own after 5 seconds. Change that with the provider's `timeout`, or per toast with `timeout` (`0` keeps it open). They also close with ✕, or with Escape once focused (F6 jumps to the notifications). `onClose` is called either way.
- Toasts are announced politely to screen readers. `priority: 'high'` announces one at once as an alert.
