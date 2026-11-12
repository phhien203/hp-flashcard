import { useRender } from '@base-ui/react/use-render'
import type {
  ComponentProps,
  ComponentPropsWithRef,
  ReactElement,
  ReactNode,
} from 'react'

import { cn } from '../../lib/utils.js'

/** One page in a `SegmentedNav`. */
interface SegmentedNavItem {
  /** The visible link text, which is also its accessible name. */
  label: ReactNode
  /** Where the link goes. */
  href: string
  /** Marks the page the user is on: `aria-current="page"` and the yellow fill. */
  current?: boolean
}

interface SegmentedNavProps extends Omit<ComponentProps<'nav'>, 'children'> {
  /** The pages to switch between, in order. */
  items: readonly SegmentedNavItem[]
  /**
   * Names the navigation landmark, e.g. "Pages". Required: a page can have
   * more than one `<nav>`, and screen readers list them by name.
   */
  'aria-label': string
  /**
   * Replaces each `<a>` with the app's router link. Pass an element, such as
   * `<Link />`, or a function `(props) => <Link {...props} to={props.href} />`.
   * It receives the link's `href`, `aria-current`, `className` and label.
   */
  render?: ReactElement | ((props: ComponentPropsWithRef<'a'>) => ReactElement)
}

function SegmentedNavLink({
  item,
  render,
}: {
  item: SegmentedNavItem
  render: SegmentedNavProps['render']
}) {
  return useRender({
    render,
    defaultTagName: 'a',
    props: {
      href: item.href,
      'aria-current': item.current ? 'page' : undefined,
      'data-slot': 'segmented-nav-link',
      // Rest: plain text. Hover: a border. Current: the yellow fill and a
      // border. Keyboard focus: the border and a ring in the ring color.
      className: cn(
        'inline-flex items-center rounded-full border px-200 py-125 text-preset-4-semibold whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring',
        item.current
          ? 'border-border bg-primary text-primary-foreground'
          : 'border-transparent text-foreground hover:border-border',
      ),
      children: item.label,
    },
  })
}

/**
 * The header's switch between pages, such as Study Mode and All Cards. It is
 * a navigation landmark of links, not a tabs widget: each item goes to a page,
 * and the current one is marked with `aria-current="page"`.
 */
function SegmentedNav({
  items,
  render,
  className,
  ...props
}: SegmentedNavProps) {
  return (
    <nav
      data-slot="segmented-nav"
      className={cn(
        'inline-flex rounded-full border border-border bg-card p-50 shadow-rest',
        className,
      )}
      {...props}
    >
      <ul className="flex items-center gap-50">
        {items.map((item) => (
          <li key={item.href} className="flex">
            <SegmentedNavLink item={item} render={render} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

export { SegmentedNav, type SegmentedNavItem, type SegmentedNavProps }
