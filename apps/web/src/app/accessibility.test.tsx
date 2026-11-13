import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { mockStore } from '../mocks/store.js'
import {
  cardList,
  expectShowing,
  hideMastered,
  toggleCategories,
} from '../test/helpers.js'
import { renderApp } from '../test/render-app.js'

/** Fails with the rule ids and targets of every axe violation on the page. */
async function expectNoAxeViolations(options: axe.RunOptions = {}) {
  const { violations } = await axe.run(
    // Base UI's focus guards are deliberately focusable and aria-hidden: they
    // only bounce focus back into or out of a popup, and are never read.
    { include: [document.body], exclude: ['[data-base-ui-focus-guard]'] },
    options,
  )
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([])
}

describe('axe', () => {
  it('finds no violations on All Cards', async () => {
    await renderApp()
    await expectShowing(12, 40)

    await expectNoAxeViolations()
  })

  it('finds no violations with the Category menu open', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await page.getByRole('button', { name: 'All Categories' }).click()
    await expect.element(page.getByRole('menu')).toBeVisible()

    // The open menu is portalled to the end of <body>, outside the
    // landmarks, like every popup; its trigger controls it via aria-controls.
    await expectNoAxeViolations({ rules: { region: { enabled: false } } })
  })

  it('finds no violations on Study Mode', async () => {
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect
      .element(page.getByRole('heading', { name: 'Study Mode Works' }))
      .toBeVisible()

    await expectNoAxeViolations()
  })

  it('finds no violations in the empty and error states', async () => {
    SCENARIOS.empty(mockStore)
    const empty = await renderApp()
    await expect.element(page.getByText('No cards yet.')).toBeVisible()
    await expectNoAxeViolations()
    await empty.unmount()

    mockStore.reset()
    worker.use(...SCENARIOS['initial-error']())
    await renderApp()
    await expect
      .element(page.getByText('Cards could not be loaded.'))
      .toBeVisible()
    await expectNoAxeViolations()
  })
})

describe('keyboard', () => {
  it('reaches and works every browsing control from the keyboard', async () => {
    await renderApp({ seeds: [5] })
    await expectShowing(12, 40)

    // Header: the logo, then the page links.
    await userEvent.tab()
    await expect
      .element(page.getByRole('link', { name: 'Flashcard' }))
      .toHaveFocus()
    await userEvent.tab()
    await expect
      .element(page.getByRole('link', { name: 'Study Mode' }))
      .toHaveFocus()
    await userEvent.tab()
    await expect
      .element(page.getByRole('link', { name: 'All Cards' }))
      .toHaveFocus()

    // The Category menu: open, tick the first Category, close.
    await userEvent.tab()
    const categories = page.getByRole('button', { name: 'All Categories' })
    await expect.element(categories).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const biology = page.getByRole('menuitemcheckbox', { name: /^Biology/ })
    await expect.element(biology).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect.element(biology).toBeChecked()
    await userEvent.keyboard('{Escape}')
    await expect.element(categories).toHaveFocus()
    await expectShowing(7, 7)

    // Hide Mastered.
    await userEvent.tab()
    await expect.element(hideMastered()).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect.element(hideMastered()).toBeChecked()
    await expectShowing(5, 5)

    // Shuffle.
    await userEvent.tab()
    await expect
      .element(page.getByRole('button', { name: 'Shuffle' }))
      .toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expectShowing(5, 5)
  })

  it('loads more Cards from the keyboard', async () => {
    await renderApp()
    await expectShowing(12, 40)

    const button = page.getByRole('button', { name: 'Load More' })
    button.element().focus()
    await userEvent.keyboard('{Enter}')

    await expectShowing(24, 40)
  })

  it('navigates to Study Mode and back from the keyboard', async () => {
    await renderApp()
    await expectShowing(12, 40)

    page.getByRole('link', { name: 'Study Mode' }).element().focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('heading', { name: 'Study Mode Works' }))
      .toBeVisible()

    page.getByRole('link', { name: 'All Cards' }).element().focus()
    await userEvent.keyboard('{Enter}')
    await expectShowing(12, 40)
  })
})

describe('responsive layout', () => {
  afterEach(async () => {
    await page.viewport(414, 896)
  })

  const columns = () =>
    getComputedStyle(cardList().element()).gridTemplateColumns.split(' ').length

  const overflowsHorizontally = () =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth

  it.for([
    { name: 'mobile', width: 375, height: 812, expected: 1 },
    { name: 'tablet', width: 768, height: 1024, expected: 2 },
    { name: 'small desktop', width: 1024, height: 900, expected: 3 },
    { name: 'desktop', width: 1440, height: 900, expected: 4 },
  ])(
    'lays the grid out in $expected column(s) on $name, without overflowing',
    async ({ width, height, expected }) => {
      await page.viewport(width, height)
      await renderApp()
      await expectShowing(12, 40)
      await toggleCategories('Programming')
      await expectShowing(7, 7)

      expect(columns()).toBe(expected)
      expect(overflowsHorizontally()).toBe(false)
      await expect
        .element(page.getByRole('button', { name: 'Shuffle' }))
        .toBeVisible()
      await expect.element(hideMastered()).toBeVisible()
    },
  )
})
