import { useState, type ComponentProps, type ReactNode } from 'react'

import { cn } from '../../lib/utils.js'
import { Badge } from './badge.js'
import { FlashcardPattern, FlashcardSparkles } from './flashcard-decor.js'
import { Progress } from './progress.js'

/** A card is mastered after this many correct answers. */
const MAX_PROGRESS = 5

interface FlashcardProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** The question, shown on the front. */
  question: ReactNode
  /** The answer, shown on the back. It isn't rendered until the card is flipped. */
  answer: ReactNode
  /** The card's category, shown as a Badge on both sides. */
  category: ReactNode
  /** How many times the card was answered correctly, from 0 to 5. Values outside that range are clamped. */
  progress: number
  /** Whether the answer side shows. Set it to control the card; leave it out to let the card manage itself. */
  flipped?: boolean
  /**
   * Whether the answer side shows at first, when `flipped` isn't set.
   * @default false
   */
  defaultFlipped?: boolean
  /** Called with the new side when the user flips the card. */
  onFlippedChange?: (flipped: boolean) => void
}

// Keyboard focus on the flip button shows on the visible face, in the ring color.
const faceClassName =
  'relative col-start-1 row-start-1 flex flex-col items-center justify-between gap-300 overflow-hidden rounded-24 border border-border p-300 text-center text-neutral-900 shadow-hover transition-shadow backface-hidden group-has-focus-visible:border-ring group-has-focus-visible:shadow-ring md:p-400'

function FlashcardFooter({ progress }: { progress: number }) {
  return (
    <div className="relative flex items-center gap-100">
      <Progress value={progress} max={MAX_PROGRESS} aria-label="Progress" />
      <span className="text-preset-6 tabular-nums">
        {progress}/{MAX_PROGRESS}
      </span>
    </div>
  )
}

/**
 * The Study Mode card. The front is pink and shows the question, the back is
 * blue and shows the answer; both carry the category and the progress count.
 *
 * The whole face is one toggle button (`aria-pressed`), named "Show answer"
 * or "Show question". It lies over the card's content rather than wrapping
 * it, so screen readers still read the question and answer as text. Click,
 * Enter or Space flips the card with a 3D turn, instant under
 * `prefers-reduced-motion`. Pass `flipped` and `onFlippedChange` to control
 * it, or `defaultFlipped` to let it manage itself.
 */
function Flashcard({
  question,
  answer,
  category,
  progress,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlippedChange,
  className,
  ...props
}: FlashcardProps) {
  const [flippedState, setFlippedState] = useState(defaultFlipped)
  const flipped = flippedProp ?? flippedState
  const count = Number.isFinite(progress)
    ? Math.min(Math.max(Math.round(progress), 0), MAX_PROGRESS)
    : 0

  const flip = () => {
    if (flippedProp === undefined) setFlippedState(!flipped)
    onFlippedChange?.(!flipped)
  }

  return (
    <div
      data-slot="flashcard"
      className={cn('group relative grid perspective-distant', className)}
      {...props}
    >
      <div
        data-slot="flashcard-inner"
        className={cn(
          'grid transition-transform duration-400 ease-in-out transform-3d motion-reduce:transition-none',
          flipped && 'rotate-y-180',
        )}
      >
        <div
          data-slot="flashcard-front"
          aria-hidden={flipped || undefined}
          className={cn(faceClassName, 'bg-pink-400')}
        >
          <FlashcardPattern />
          <FlashcardSparkles />
          <Badge className="relative">{category}</Badge>
          <div className="relative flex flex-col items-center gap-200 py-1000 md:py-1400">
            <p className="text-preset-1">{question}</p>
            {/* The flip button's name already says this. */}
            <p aria-hidden="true" className="text-preset-4-medium">
              Click to reveal answer
            </p>
          </div>
          <FlashcardFooter progress={count} />
        </div>
        <div
          data-slot="flashcard-back"
          aria-hidden={!flipped || undefined}
          className={cn(faceClassName, 'rotate-y-180 bg-blue-400')}
        >
          <FlashcardPattern />
          <FlashcardSparkles />
          <Badge className="relative">{category}</Badge>
          <div className="relative flex flex-col items-center gap-200 py-1000 md:py-1400">
            {flipped ? (
              <>
                <p className="text-preset-4-medium">Answer:</p>
                <p className="text-preset-1">{answer}</p>
              </>
            ) : null}
          </div>
          <FlashcardFooter progress={count} />
        </div>
      </div>
      <button
        type="button"
        data-slot="flashcard-button"
        aria-pressed={flipped}
        aria-label={flipped ? 'Show question' : 'Show answer'}
        onClick={flip}
        className="absolute inset-0 cursor-pointer rounded-24 outline-none"
      />
    </div>
  )
}

export { Flashcard, type FlashcardProps }
