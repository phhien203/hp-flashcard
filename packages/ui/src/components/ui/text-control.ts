/**
 * Shared look of the text controls (Input and Textarea).
 *
 * The error state is not a prop: it follows the control's own invalid state,
 * `aria-invalid` when set directly or `data-invalid` inside an invalid
 * `Field`. Keyboard focus takes priority over the error colors so the
 * focused control stays recognisable.
 */
export const textControlClassName =
  'w-full min-w-0 rounded-12 border border-input bg-card px-200 py-150 text-preset-4-regular text-card-foreground shadow-rest transition-shadow outline-none placeholder:text-muted-foreground hover:shadow-hover focus-visible:border-ring focus-visible:shadow-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-rest aria-invalid:not-focus-visible:border-destructive aria-invalid:not-focus-visible:shadow-destructive data-invalid:not-focus-visible:border-destructive data-invalid:not-focus-visible:shadow-destructive'
