import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '../../lib/utils.js'
import { IconCheck } from '../icons/icon-check.js'
import { IconDelete } from '../icons/icon-delete.js'
import { IconEdit } from '../icons/icon-edit.js'
import { IconKebab } from '../icons/icon-kebab.js'
import { Badge } from './badge.js'
import { clampProgress, MAX_PROGRESS } from './card-progress.js'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu.js'
import { Progress } from './progress.js'

interface CardTileProps extends Omit<ComponentProps<'article'>, 'children'> {
  /** The question, the tile's title. */
  question: ReactNode
  /** The answer, shown under an "Answer:" label. */
  answer: ReactNode
  /** The card's category, shown as a Badge. */
  category: ReactNode
  /**
   * How many times the card was answered correctly, from 0 to 5. Values
   * outside that range are clamped. At 5 the tile shows the Mastered badge
   * instead of the progress bar.
   */
  progress: number
  /** Called when the user picks Edit from the tile's actions menu. */
  onEdit: () => void
  /** Called when the user picks Delete from the tile's actions menu. */
  onDelete: () => void
}

/**
 * A card in the All Cards grid: the question, the answer, and a footer with
 * the category, the progress (or the Mastered badge at 5/5) and a "Card
 * actions" menu offering Edit and Delete. It only displays its props; the
 * app does the editing and deleting from `onEdit` and `onDelete`.
 *
 * The tile is an `<article>` named by its question, so in a grid of tiles
 * each "Card actions" button and progress bar sits in a named card.
 */
function CardTile({
  question,
  answer,
  category,
  progress,
  onEdit,
  onDelete,
  className,
  ...props
}: CardTileProps) {
  const questionId = useId()
  const count = clampProgress(progress)

  return (
    <article
      data-slot="card-tile"
      aria-labelledby={questionId}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-16 border border-border bg-card text-card-foreground shadow-rest',
        className,
      )}
      {...props}
    >
      <p
        id={questionId}
        className="border-b border-border p-200 text-preset-3 wrap-break-word"
      >
        {question}
      </p>
      <div className="flex flex-1 flex-col gap-50 p-200">
        <p className="text-preset-5-medium text-muted-foreground">Answer:</p>
        <p className="text-preset-5-regular wrap-break-word">{answer}</p>
      </div>
      <div className="flex items-stretch border-t border-border">
        {/* A long category is cut short rather than pushing the progress and
            the menu out of the tile. */}
        <div className="flex min-w-0 items-center border-r border-border px-200 py-150">
          <Badge className="max-w-full shrink">
            <span className="truncate">{category}</span>
          </Badge>
        </div>
        <div className="flex flex-1 shrink-0 items-center border-r border-border px-200 py-150">
          {count === MAX_PROGRESS ? (
            <Badge variant="mastered" icon={<IconCheck />}>
              Mastered {count}/{MAX_PROGRESS}
            </Badge>
          ) : (
            <Progress
              value={count}
              max={MAX_PROGRESS}
              showCount
              aria-label="Progress"
            />
          )}
        </div>
        <Menu>
          <MenuTrigger
            aria-label="Card actions"
            className="flex shrink-0 cursor-pointer items-center justify-center px-200 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-background"
          >
            <IconKebab />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<IconEdit />} onClick={onEdit}>
              Edit
            </MenuItem>
            <MenuItem icon={<IconDelete />} onClick={onDelete}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </article>
  )
}

export { CardTile, type CardTileProps }
