import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { page, server, userEvent } from 'vitest/browser'

import { worker } from '../mocks/browser.js'
import { SCENARIOS } from '../mocks/scenarios.js'
import { mockStore } from '../mocks/store.js'
import {
  cardList,
  createCard,
  createForm,
  deleteButton,
  deleteDialog,
  editDialog,
  expectShowing,
  fillFields,
  hideMastered,
  openDelete,
  openEdit,
  toast,
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

/**
 * Like `expectNoAxeViolations`, for a page where a text field has had
 * focus. Firefox's content process crashes when axe-core runs over such a
 * page (Playwright's Firefox; reproduced with only the `label` or
 * `aria-allowed-attr` rule), so there these checks run in Chromium and
 * WebKit only. The interactions before them still run in Firefox.
 */
async function expectNoAxeViolationsAfterTyping(options: axe.RunOptions = {}) {
  if (server.browser === 'firefox') return
  await expectNoAxeViolations(options)
}

/**
 * Like `expectNoAxeViolations`, with a modal open over a page of text
 * fields. Firefox's content process crashes there too (seen with the delete
 * confirmation over the create form, with nothing typed), so these checks
 * run in Chromium and WebKit only; the interactions still run in Firefox.
 */
const expectNoAxeViolationsInModal = expectNoAxeViolationsAfterTyping

/**
 * Like `expectNoAxeViolations`, once a Checkbox has been clicked. Firefox's
 * content process crashes there too (seen after ticking Hide Mastered, on
 * All Cards as on Study Mode), so these checks run in Chromium and WebKit
 * only; the interactions still run in Firefox.
 */
const expectNoAxeViolationsAfterCheckbox = expectNoAxeViolationsAfterTyping

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

  it('finds no violations on Study Mode, on either side of the Card', async () => {
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect.element(page.getByText('Card 1 of 40')).toBeVisible()
    await expectNoAxeViolations()

    await page.getByRole('button', { name: 'Show answer' }).click()
    await expect
      .element(page.getByRole('button', { name: 'Show question' }))
      .toBeInTheDocument()
    await expectNoAxeViolations()

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect.element(page.getByText('Card 2 of 40')).toBeVisible()
    await expectNoAxeViolations()
  })

  it('finds no violations in Study Mode with no Cards', async () => {
    SCENARIOS.empty(mockStore)
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect
      .element(page.getByRole('heading', { name: 'No cards to study' }))
      .toBeVisible()
    await expectNoAxeViolations()
  })

  it('finds no violations in Study Mode when all caught up', async () => {
    mockStore.reset([
      { id: 'a', question: 'Q?', answer: 'A.', category: 'Art', progress: 5 },
    ])
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await hideMastered().click()
    await expect
      .element(page.getByRole('heading', { name: 'You’re all caught up!' }))
      .toBeVisible()
    await expectNoAxeViolationsAfterCheckbox()
  })

  it('finds no violations in Study Mode when a save fails', async () => {
    worker.use(...SCENARIOS['progress-error']())
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await page.getByRole('button', { name: 'Reset Progress' }).click()
    await expect
      .element(page.getByText('Your progress could not be saved.'))
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

describe('axe on Card management', () => {
  // Dialogs and toasts are portalled to the end of <body>, outside the
  // landmarks, like every popup.
  const outsideLandmarks = { rules: { region: { enabled: false } } }

  it('finds no violations in the create form with field errors', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await createForm().getByRole('button', { name: 'Create Card' }).click()
    await expect
      .element(createForm().getByText('Please enter a question.'))
      .toBeVisible()

    await expectNoAxeViolationsAfterTyping()
  })

  it('finds no violations in the edit dialog and its discard confirmation', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await openEdit('What is the capital of Australia?')
    await fillFields(editDialog(), { answer: ' ' })
    await editDialog().getByRole('button', { name: 'Update Card' }).click()
    await expect
      .element(editDialog().getByText('Please enter an answer.'))
      .toBeVisible()
    await expectNoAxeViolationsAfterTyping(outsideLandmarks)

    await userEvent.keyboard('{Escape}')
    await expect
      .element(page.getByRole('alertdialog', { name: 'Discard your changes?' }))
      .toBeVisible()
    await expectNoAxeViolationsAfterTyping(outsideLandmarks)
  })

  it('finds no violations in the delete confirmation and its error', async () => {
    worker.use(...SCENARIOS['delete-error']())
    await renderApp()
    await expectShowing(12, 40)
    await openDelete('What is the capital of Australia?')
    await expectNoAxeViolationsInModal(outsideLandmarks)

    await deleteButton().click()
    await expect.element(deleteDialog().getByRole('alert')).toBeVisible()
    await expectNoAxeViolationsInModal(outsideLandmarks)
  })

  it('finds no violations with a Show card notification', async () => {
    await renderApp()
    await toggleCategories('History')
    await createCard({ question: 'Q?', answer: 'A.', category: 'Art' })
    await expect
      .element(toast('Card created successfully. Your filters hide it.'))
      .toBeVisible()

    // Visibility does not mean the fade-in has finished. Axe must measure
    // the settled colors rather than the transient, translucent text.
    await Promise.all(
      toast('Card created successfully. Your filters hide it.')
        .element()
        .getAnimations()
        .map((animation) => animation.finished),
    )
    await expectNoAxeViolationsAfterTyping(outsideLandmarks)
  })

  it('finds no violations in the leave confirmation', async () => {
    await renderApp()
    await expectShowing(12, 40)
    await fillFields(createForm(), { question: 'Unfinished?' })
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect.element(page.getByRole('alertdialog')).toBeVisible()

    await expectNoAxeViolationsAfterTyping(outsideLandmarks)
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

    // The create form.
    for (const name of ['Question', 'Answer', 'Category']) {
      await userEvent.tab()
      await expect
        .element(page.getByRole('textbox', { name, exact: true }))
        .toHaveFocus()
    }
    await userEvent.tab()
    await expect
      .element(page.getByRole('button', { name: 'Create Card' }))
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
      .element(page.getByRole('heading', { name: 'Study Mode', level: 1 }))
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

  it.for([
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ])(
    'fits the create form and the edit dialog on $name',
    async ({ width, height }) => {
      await page.viewport(width, height)
      await renderApp()
      await expectShowing(12, 40)

      const form = createForm().element().getBoundingClientRect()
      expect(form.width).toBeGreaterThan(0)
      expect(form.right).toBeLessThanOrEqual(window.innerWidth)
      expect(overflowsHorizontally()).toBe(false)

      await openEdit('What is the capital of Australia?')
      const dialog = editDialog().element().getBoundingClientRect()
      expect(dialog.left).toBeGreaterThanOrEqual(0)
      expect(dialog.right).toBeLessThanOrEqual(window.innerWidth)
      expect(dialog.top).toBeGreaterThanOrEqual(0)
      expect(dialog.bottom).toBeLessThanOrEqual(window.innerHeight)
    },
  )

  it.for([
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ])('fits the delete confirmation on $name', async ({ width, height }) => {
    await page.viewport(width, height)
    await renderApp()
    await expectShowing(12, 40)

    await openDelete('What is the capital of Australia?')

    const dialog = deleteDialog().element().getBoundingClientRect()
    expect(dialog.left).toBeGreaterThanOrEqual(0)
    expect(dialog.right).toBeLessThanOrEqual(window.innerWidth)
    expect(dialog.top).toBeGreaterThanOrEqual(0)
    expect(dialog.bottom).toBeLessThanOrEqual(window.innerHeight)
    for (const name of ['Cancel', 'Delete Card']) {
      const button = deleteDialog()
        .getByRole('button', { name })
        .element()
        .getBoundingClientRect()
      expect(button.right).toBeLessThanOrEqual(dialog.right)
    }
  })

  it.for([
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ])('fits Study Mode on $name', async ({ width, height }) => {
    await page.viewport(width, height)
    await renderApp()
    await page.getByRole('link', { name: 'Study Mode' }).click()
    await expect.element(page.getByText('Card 1 of 40')).toBeVisible()

    expect(overflowsHorizontally()).toBe(false)
    const study = page.getByRole('region', { name: 'Study' }).element()
    const statistics = page
      .getByRole('region', { name: 'Study Statistics' })
      .element()
    for (const name of [
      'All Categories',
      'Shuffle',
      'Already Mastered',
      'Reset Progress',
      'Previous',
      'Next',
    ]) {
      const button = page
        .getByRole('button', { name, exact: true })
        .element()
        .getBoundingClientRect()
      expect(button.right).toBeLessThanOrEqual(
        study.getBoundingClientRect().right,
      )
    }
    // Side by side on desktop; the statistics follow the Card below it.
    const beside = width >= 1280
    expect(
      statistics.getBoundingClientRect().left >=
        study.getBoundingClientRect().right,
    ).toBe(beside)
  })
})
