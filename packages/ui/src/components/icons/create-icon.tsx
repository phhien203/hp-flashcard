import { useId, type ReactNode, type SVGProps } from 'react'

import { cn } from '../../lib/utils.js'

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'viewBox'
> {
  /**
   * Accessible name. Without it the icon is decorative and hidden from
   * assistive technology (unless `aria-label` or `aria-labelledby` names
   * it); with it the icon is exposed as an image.
   */
  title?: string
}

/**
 * Builds an icon component from SVG path data exported from Figma.
 *
 * Every icon fills with `currentColor`, is `size-200` (16px) unless
 * `className` says otherwise, and is `aria-hidden` unless given a `title`
 * or an `aria-label`/`aria-labelledby`.
 */
export function createIcon(
  displayName: string,
  viewBox: string,
  paths: ReactNode,
) {
  function Icon({ title, className, ...props }: IconProps) {
    const titleId = useId()
    const titled = title !== undefined && title !== ''
    const labelled =
      titled || Boolean(props['aria-label'] || props['aria-labelledby'])

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={viewBox}
        fill="currentColor"
        focusable="false"
        {...(labelled ? { role: 'img' } : { 'aria-hidden': true })}
        {...(titled ? { 'aria-labelledby': titleId } : {})}
        className={cn('size-200 shrink-0', className)}
        {...props}
      >
        {titled ? <title id={titleId}>{title}</title> : null}
        {paths}
      </svg>
    )
  }
  Icon.displayName = displayName
  return Icon
}
