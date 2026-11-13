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
/** The API's error body. */
export type ApiErrorBody = Schemas['Error']
/** The query parameters of `GET /api/cards`. */
export type ListCardsQuery = NonNullable<
  operations['listCards']['parameters']['query']
>
