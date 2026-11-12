import { useId } from 'react'

/*
 * The Flashcard's decorations: the background pattern and the sparkles. They
 * are inline SVG so the card needs no image assets, hidden from assistive
 * technology, and private to the Flashcard (not exported from the barrel).
 */

/** A four-pointed sparkle, drawn in a 24×24 box. */
const SPARKLE =
  'M12 0c.9 6.4 5.1 10.6 12 12-6.9 1.4-11.1 5.6-12 12-.9-6.4-5.1-10.6-12-12C6.9 10.6 11.1 6.4 12 0Z'

/** The face's background pattern: rows of small rings, in faint ink. */
function FlashcardPattern() {
  // Each face draws its own pattern, so the <pattern> id must be unique.
  const id = useId()
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-slot="flashcard-pattern"
      className="pointer-events-none absolute inset-0 size-full text-neutral-900 opacity-10"
    >
      <defs>
        <pattern id={id} width="32" height="32" patternUnits="userSpaceOnUse">
          <circle
            cx="16"
            cy="16"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="0" cy="0" r="2" fill="currentColor" />
          <circle cx="32" cy="0" r="2" fill="currentColor" />
          <circle cx="0" cy="32" r="2" fill="currentColor" />
          <circle cx="32" cy="32" r="2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

/** One sparkle: a yellow star outlined in dark ink. */
function Sparkle({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-2 -2 28 28"
      className={className}
    >
      <path
        d={SPARKLE}
        className="fill-yellow-500 stroke-neutral-900"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A large sparkle near the top-right corner and a small one bottom-left. */
function FlashcardSparkles() {
  return (
    <span
      aria-hidden="true"
      data-slot="flashcard-sparkles"
      className="pointer-events-none absolute inset-0"
    >
      <Sparkle className="absolute top-500 right-400 size-500 md:size-600" />
      <Sparkle className="absolute bottom-1000 left-400 size-300 md:size-400" />
    </span>
  )
}

export { FlashcardPattern, FlashcardSparkles }
