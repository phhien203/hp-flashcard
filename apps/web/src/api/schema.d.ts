/**
 * Generated from api/openapi.yaml by openapi-typescript. Do not edit:
 * run `pnpm --filter @hp-flashcard/web generate:api` instead.
 */

export interface paths {
    "/api/cards": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List matching Cards, one page at a time
         * @description Returns a page of the Cards that match the filters. With no `seed`,
         *     Cards come in the default order: most recently created first. With a
         *     `seed`, the whole matching collection is shuffled by that seed before
         *     it is paged, so requesting the next pages with the same filters and
         *     `seed` continues the same order, without duplicates or omissions,
         *     while the collection is unchanged. A Card's place in a shuffled
         *     order depends only on the `seed` and the Card's identifier, so
         *     creating, editing or deleting a Card leaves the other Cards in the
         *     same relative order.
         */
        get: operations["listCards"];
        put?: never;
        /**
         * Create a Card
         * @description Creates a Card with Progress 0, first in the default order. Fields
         *     are trimmed; blank values are rejected. Duplicate questions are
         *     allowed. The Category is matched to an existing one ignoring letter
         *     case and surrounding whitespace (keeping that Category's spelling),
         *     or created. A `400` names each rejected field in `fieldErrors`.
         */
        post: operations["createCard"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cards/statistics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Count matching Cards by Progress
         * @description Counts every Card that matches the Category filter, whatever its
         *     Progress, page or shuffled place: `notStarted` (Progress 0),
         *     `inProgress` (1 to 4) and `mastered` (5) add up to `total`.
         */
        get: operations["getCardStatistics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cards/{cardId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        /** Get one Card */
        get: operations["getCard"];
        put?: never;
        post?: never;
        /**
         * Delete a Card
         * @description A Category left without Cards ceases to exist.
         */
        delete: operations["deleteCard"];
        options?: never;
        head?: never;
        /**
         * Edit a Card's content or Category
         * @description Updates the given fields, with the same rules as creation. The Card
         *     keeps its identifier, Progress and place in the default order. A
         *     Category left without Cards ceases to exist. A `400` names each
         *     rejected field in `fieldErrors`.
         */
        patch: operations["updateCard"];
        trace?: never;
    };
    "/api/cards/{cardId}/progress": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Set a Card's Progress
         * @description Sets the Card's Progress to the given value: one more to credit an
         *     "I Know This", 0 to reset it. The value is absolute, so repeating
         *     the request changes nothing more. The Card keeps its identifier,
         *     content, Category and place in the default order. A `400` names
         *     each rejected field in `fieldErrors`.
         */
        put: operations["setCardProgress"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List every Category with its Card count
         * @description Counts are global: they cover every Card, whatever filters or pages
         *     a client is showing. Categories are ordered by name.
         */
        get: operations["listCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description A Card's stable, opaque identifier. */
        CardId: string;
        /** @description A Category's stable, opaque identifier. */
        CategoryId: string;
        /** @description A 32-bit unsigned shuffle seed. */
        ShuffleSeed: number;
        /** @description Study Progress; 5 means Mastered. */
        Progress: number;
        CategoryRef: {
            id: components["schemas"]["CategoryId"];
            name: string;
        };
        Card: {
            id: components["schemas"]["CardId"];
            question: string;
            answer: string;
            category: components["schemas"]["CategoryRef"];
            progress: components["schemas"]["Progress"];
        };
        CardPage: {
            items: components["schemas"]["Card"][];
            /** @description How many Cards match the filters, across all pages. */
            total: number;
            offset: number;
            limit: number;
            /** @description The `offset` of the next page, or null on the last page. */
            nextOffset: number | null;
        };
        CardInput: {
            /** @description Trimmed; must not be blank. */
            question: string;
            /** @description Trimmed; must not be blank. */
            answer: string;
            /** @description A Category name. Trimmed; must not be blank. */
            category: string;
        };
        /** @description The fields to change; at least one. */
        CardPatch: {
            /** @description Trimmed; must not be blank. */
            question?: string;
            /** @description Trimmed; must not be blank. */
            answer?: string;
            /** @description A Category name. Trimmed; must not be blank. */
            category?: string;
        };
        ProgressInput: {
            progress: components["schemas"]["Progress"];
        };
        CardStatistics: {
            /** @description How many Cards match the Category filter. */
            total: number;
            /** @description How many of them have Progress 0. */
            notStarted: number;
            /** @description How many of them have Progress 1 to 4. */
            inProgress: number;
            /** @description How many of them have Progress 5. */
            mastered: number;
        };
        Category: {
            id: components["schemas"]["CategoryId"];
            name: string;
            /** @description How many Cards are in the Category. */
            count: number;
        };
        CategoryList: {
            items: components["schemas"]["Category"][];
        };
        Error: {
            /** @enum {string} */
            code: "validation_failed" | "not_found" | "server_error";
            message: string;
            /** @description Messages keyed by body field or query parameter name. */
            fieldErrors?: {
                [key: string]: string;
            };
        };
    };
    responses: {
        /** @description The request is invalid; `fieldErrors` says why. */
        ValidationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description No Card has this identifier. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The server failed. */
        ServerError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listCards: {
        parameters: {
            query?: {
                /**
                 * @description Category identifiers. A Card matches when its Category is any of
                 *     them. Omit to match every Category. Identifiers that name no
                 *     Category match nothing.
                 */
                category?: components["schemas"]["CategoryId"][];
                /** @description Exclude Mastered Cards (Progress 5 of 5). */
                hideMastered?: boolean;
                /** @description How many matching Cards to skip. */
                offset?: number;
                /** @description The page size. */
                limit?: number;
                /** @description Shuffle the matching collection with this seed. */
                seed?: components["schemas"]["ShuffleSeed"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of matching Cards. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardPage"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            500: components["responses"]["ServerError"];
        };
    };
    createCard: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardInput"];
            };
        };
        responses: {
            /** @description The created Card. */
            201: {
                headers: {
                    /** @description The Card's URL. */
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            500: components["responses"]["ServerError"];
        };
    };
    getCardStatistics: {
        parameters: {
            query?: {
                /**
                 * @description Category identifiers, as for listing Cards. A Card counts when
                 *     its Category is any of them. Omit to count every Category.
                 *     Identifiers that name no Category match nothing.
                 */
                category?: components["schemas"]["CategoryId"][];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The counts. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CardStatistics"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            500: components["responses"]["ServerError"];
        };
    };
    getCard: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The Card. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["ServerError"];
        };
    };
    deleteCard: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The Card was deleted. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["ServerError"];
        };
    };
    updateCard: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardPatch"];
            };
        };
        responses: {
            /** @description The updated Card. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["ServerError"];
        };
    };
    setCardProgress: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProgressInput"];
            };
        };
        responses: {
            /** @description The updated Card. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["ServerError"];
        };
    };
    listCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description All Categories. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryList"];
                };
            };
            500: components["responses"]["ServerError"];
        };
    };
}
