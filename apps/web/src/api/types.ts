import type { components, operations } from './schema.js'

type Schemas = components['schemas']

/** A Card as the API returns it. */
export type Card = Schemas['Card']
/** One page of a Card listing. */
export type CardPage = Schemas['CardPage']
/** A Category with its global Card count. */
export type Category = Schemas['Category']
/** The `/api/categories` response. */
export type CategoryList = Schemas['CategoryList']
/** The body of `POST /api/cards`. */
export type CardInput = Schemas['CardInput']
/** The body of `PATCH /api/cards/{cardId}`. */
export type CardPatch = Schemas['CardPatch']
/** The body of `PUT /api/cards/{cardId}/progress`. */
export type ProgressInput = Schemas['ProgressInput']
/** How many matching Cards are Not Started, In Progress and Mastered. */
export type CardStatistics = Schemas['CardStatistics']
/** The API's error body. */
export type ApiErrorBody = Schemas['Error']
/** The query parameters of `GET /api/cards`. */
export type ListCardsQuery = NonNullable<
  operations['listCards']['parameters']['query']
>
/** The query parameters of `GET /api/cards/statistics`. */
export type CardStatisticsQuery = NonNullable<
  operations['getCardStatistics']['parameters']['query']
>
