---
'@hp-flashcard/ui': minor
---

Toasts can offer an action button. Pass `action: { label, onClick }` to `useToast().add()`, for example a "Show card" button on a "Your filters hide it" notice. Clicking it runs `onClick` and closes the toast. The new `ToastAction` type describes the option.
