---
'@hp-flashcard/ui': minor
---

Adds `Input`, `Textarea` and `Field` (with `FieldLabel` and `FieldError`), plus their `InputProps`, `TextareaProps`, `FieldProps`, `FieldLabelProps` and `FieldErrorProps` types.

- `Input` and `Textarea` have a white (card) surface, a hard shadow that grows on hover, a ring-colored border and shadow on keyboard focus, and `muted-foreground` placeholder text.
- There is no error prop. A control shows its error state when it is invalid: set `aria-invalid` on it, or put it in a `Field` that is `invalid` or fails its native constraints or `validate`.
- `Field` connects its parts with no hand-written ARIA. `FieldLabel` names the control. `FieldError` shows the message in `destructive` with an error icon. The message is announced as an alert and becomes the control's accessible description. Without children it shows the browser's validation message. Use `<FieldError match>` to show it whenever the field is `invalid`.
- Place fields on `bg-card`. In light the error color meets AA contrast on that white surface but not on `bg-background`. In dark it meets AA on both.
