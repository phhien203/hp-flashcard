/**
 * Generated from api/openapi.yaml by openapi-typescript. Do not edit:
 * run `pnpm --filter @hp-flashcard/web generate:api` instead.
 */

export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Verify serving version and database schema availability */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
         *
         *     A Collection holds at most 1,000 Cards; creating one more answers
         *     `409` with `quota_exceeded`, even when requests race for the last
         *     place.
         *
         *     Send a fresh `Idempotency-Key` for each Card you mean to create, and
         *     the same key when retrying it (say, after a lost response). For 24
         *     hours the backend remembers the creation under your account, this
         *     operation and the key: repeating it with the same body answers the
         *     original `201` again, with `Idempotent-Replayed: true`, without
         *     creating another Card or using quota. Reusing the key with a
         *     different body answers `422`. After 24 hours the key is forgotten,
         *     and a request with it creates a new Card.
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
         * @description Permanently deletes the Card and its Progress, if it is still at the
         *     `contentVersion` named in `If-Match`. A Category left without Cards
         *     ceases to exist, and the Card's place in the 1,000-Card quota is
         *     free at once. There is no trash and no restore.
         *
         *     If the Card's content has been edited since, the deletion answers
         *     `409` with `version_conflict` and deletes nothing. A Card that
         *     doesn't exist, or isn't yours, answers `404`.
         *
         *     Retrying with the same `Idempotency-Key` and `If-Match` answers the
         *     original `204` again (`Idempotent-Replayed: true`) for 24 hours.
         */
        delete: operations["deleteCard"];
        options?: never;
        head?: never;
        /**
         * Edit a Card's content or Category
         * @description Updates the given fields, with the same rules as creation, if the
         *     Card is still at the `contentVersion` named in `If-Match`, and
         *     advances its `contentVersion`. The Card keeps its identifier,
         *     Progress and place in the default order. A Category left without
         *     Cards ceases to exist. A `400` names each rejected field in
         *     `fieldErrors`.
         *
         *     If the Card has been edited since (another device, say), the edit
         *     answers `409` with `version_conflict` and changes nothing: of two
         *     edits based on the same version, at most one succeeds. A Card that
         *     doesn't exist, or isn't yours, answers `404`; a stale edit never
         *     recreates a deleted Card.
         *
         *     Retrying with the same `Idempotency-Key` and request answers the
         *     original `200` again (`Idempotent-Replayed: true`) for 24 hours,
         *     even after later edits or the Card's deletion. That Card is as it
         *     was then: refetch rather than display it over newer data.
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
         * @description Sets the Card's Progress to the given value, if its Progress is
         *     still at the `progressVersion` named in `If-Match`, and advances its
         *     `progressVersion`: one more to credit an "I Know This" (at most 5),
         *     0 to reset it. The value is absolute. The Card keeps its identifier,
         *     content, `contentVersion`, Category and place in the default order.
         *     A `400` names each rejected field in `fieldErrors`.
         *
         *     If the Card's Progress has been saved since (another device, say),
         *     the save answers `409` with `version_conflict` and changes nothing:
         *     of two saves based on the same version, at most one succeeds. A
         *     content edit doesn't make a Progress save stale. A Card that
         *     doesn't exist, or isn't yours, answers `404`; a save never
         *     recreates a deleted Card.
         *
         *     Retrying with the same `Idempotency-Key` and request answers the
         *     original `200` again (`Idempotent-Replayed: true`) for 24 hours,
         *     even after later saves, edits or the Card's deletion. That Card is
         *     as it was then: refetch rather than display it over newer data.
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
    "/api/webhooks/clerk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Receive a Clerk event
         * @description Clerk's webhook endpoint, not for the app. Authenticated by its
         *     Standard Webhooks (Svix) signature over the original body, not a
         *     session: `svix-id`, `svix-timestamp` and `svix-signature`. A missing,
         *     forged or altered signature, or a timestamp more than five minutes
         *     off, answers `400` and changes nothing.
         *
         *     `user.deleted` (an administrator deleted the account) deletes the
         *     account's whole Collection for good and refuses every later
         *     request for it. Other events are acknowledged and ignored. A
         *     delivery repeated with the same `svix-id` is acknowledged without
         *     being applied again. `200` means the event's effect has committed;
         *     anything else, and Clerk delivers it again.
         */
        post: operations["receiveClerkWebhook"];
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
        /**
         * @description The version of a Card's content (question, answer, Category):
         *     1 when created, one more after each edit. Progress changes leave it.
         */
        ContentVersion: number;
        /**
         * @description The version of a Card's Progress: 1 when created, one more after
         *     each Progress save. Content edits leave it.
         */
        ProgressVersion: number;
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
            contentVersion: components["schemas"]["ContentVersion"];
            progressVersion: components["schemas"]["ProgressVersion"];
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
            /** @description Trimmed; must not be blank; at most 2,000 characters. */
            question: string;
            /** @description Trimmed; must not be blank; at most 10,000 characters. */
            answer: string;
            /**
             * @description A Category name. Trimmed; must not be blank; at most 100
             *     characters.
             */
            category: string;
        };
        /** @description The fields to change; at least one. */
        CardPatch: {
            /** @description Trimmed; must not be blank; at most 2,000 characters. */
            question?: string;
            /** @description Trimmed; must not be blank; at most 10,000 characters. */
            answer?: string;
            /**
             * @description A Category name. Trimmed; must not be blank; at most 100
             *     characters.
             */
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
            code: "validation_failed" | "unauthorized" | "not_found" | "quota_exceeded" | "idempotency_key_reused" | "version_conflict" | "server_error" | "rate_limited" | "payload_too_large" | "invalid_signature";
            message: string;
            /** @description Messages keyed by body field or query parameter name. */
            fieldErrors?: {
                [key: string]: string;
            };
        };
        /**
         * @description A Clerk webhook event, e.g. `user.deleted`, whose `data.id` is the
         *     deleted user's id.
         */
        ClerkEvent: {
            type: string;
            data: Record<string, never>;
        };
        WebhookReceipt: {
            /** @enum {boolean} */
            received: true;
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
        /**
         * @description The request has no session token, or one that is expired, malformed
         *     or otherwise invalid, or its account has been deleted. Sign in
         *     again.
         */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The Collection already holds 1,000 Cards. */
        QuotaExceeded: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /**
         * @description The Card has changed since the version named in `If-Match`; nothing
         *     was changed. Fetch it again to review the latest version.
         */
        VersionConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The `Idempotency-Key` was used for a different request. */
        IdempotencyKeyReused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The request body is larger than 128 KiB; nothing was read. */
        PayloadTooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /**
         * @description This account has made 60 write requests in the last 60 seconds.
         *     Nothing was done, and this request doesn't count. Wait
         *     `Retry-After` seconds, then send it again.
         */
        RateLimited: {
            headers: {
                /** @description Whole seconds until the account may write again. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The webhook's signature is missing, invalid or too old. */
        InvalidSignature: {
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
    parameters: {
        /**
         * @description Identifies this intended write across retries: 16 to 128 letters,
         *     digits, `-` or `_`, such as a UUID. Send a fresh key for each write
         *     you mean to make, and the same key when retrying it. Keys are scoped
         *     to your account and the operation.
         */
        IdempotencyKey: string;
        /**
         * @description The Card's `contentVersion` this write is based on, as a quoted
         *     entity tag: `"3"`.
         */
        IfMatch: string;
        /**
         * @description The Card's `progressVersion` this save is based on, as a quoted
         *     entity tag: `"3"`.
         */
        IfMatchProgress: string;
    };
    requestBodies: never;
    headers: {
        /**
         * @description `true` when this repeats the result of an earlier request with the
         *     same key.
         */
        IdempotentReplayed: "true";
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Worker and database schema are available; contains no private data. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "ok";
                        version: string;
                        commit: string;
                    };
                };
            };
            500: components["responses"]["ServerError"];
        };
    };
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
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["ServerError"];
        };
    };
    createCard: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Identifies this intended write across retries: 16 to 128 letters,
                 *     digits, `-` or `_`, such as a UUID. Send a fresh key for each write
                 *     you mean to make, and the same key when retrying it. Keys are scoped
                 *     to your account and the operation.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CardInput"];
            };
        };
        responses: {
            /** @description The created Card, or the one this key created before. */
            201: {
                headers: {
                    /** @description The Card's URL. */
                    Location?: string;
                    "Idempotent-Replayed": components["headers"]["IdempotentReplayed"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["Unauthorized"];
            409: components["responses"]["QuotaExceeded"];
            413: components["responses"]["PayloadTooLarge"];
            422: components["responses"]["IdempotencyKeyReused"];
            429: components["responses"]["RateLimited"];
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
            401: components["responses"]["Unauthorized"];
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
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["ServerError"];
        };
    };
    deleteCard: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Identifies this intended write across retries: 16 to 128 letters,
                 *     digits, `-` or `_`, such as a UUID. Send a fresh key for each write
                 *     you mean to make, and the same key when retrying it. Keys are scoped
                 *     to your account and the operation.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /**
                 * @description The Card's `contentVersion` this write is based on, as a quoted
                 *     entity tag: `"3"`.
                 */
                "If-Match": components["parameters"]["IfMatch"];
            };
            path: {
                cardId: components["schemas"]["CardId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The Card was deleted, by this request or by this key before. */
            204: {
                headers: {
                    "Idempotent-Replayed": components["headers"]["IdempotentReplayed"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["VersionConflict"];
            413: components["responses"]["PayloadTooLarge"];
            422: components["responses"]["IdempotencyKeyReused"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["ServerError"];
        };
    };
    updateCard: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Identifies this intended write across retries: 16 to 128 letters,
                 *     digits, `-` or `_`, such as a UUID. Send a fresh key for each write
                 *     you mean to make, and the same key when retrying it. Keys are scoped
                 *     to your account and the operation.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /**
                 * @description The Card's `contentVersion` this write is based on, as a quoted
                 *     entity tag: `"3"`.
                 */
                "If-Match": components["parameters"]["IfMatch"];
            };
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
            /** @description The updated Card, or the one this key updated before. */
            200: {
                headers: {
                    "Idempotent-Replayed": components["headers"]["IdempotentReplayed"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["VersionConflict"];
            413: components["responses"]["PayloadTooLarge"];
            422: components["responses"]["IdempotencyKeyReused"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["ServerError"];
        };
    };
    setCardProgress: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description Identifies this intended write across retries: 16 to 128 letters,
                 *     digits, `-` or `_`, such as a UUID. Send a fresh key for each write
                 *     you mean to make, and the same key when retrying it. Keys are scoped
                 *     to your account and the operation.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
                /**
                 * @description The Card's `progressVersion` this save is based on, as a quoted
                 *     entity tag: `"3"`.
                 */
                "If-Match": components["parameters"]["IfMatchProgress"];
            };
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
            /** @description The updated Card, or the one this key updated before. */
            200: {
                headers: {
                    "Idempotent-Replayed": components["headers"]["IdempotentReplayed"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Card"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["VersionConflict"];
            413: components["responses"]["PayloadTooLarge"];
            422: components["responses"]["IdempotencyKeyReused"];
            429: components["responses"]["RateLimited"];
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
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["ServerError"];
        };
    };
    receiveClerkWebhook: {
        parameters: {
            query?: never;
            header: {
                "svix-id": string;
                "svix-timestamp": string;
                "svix-signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClerkEvent"];
            };
        };
        responses: {
            /** @description The event was processed, now or before. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookReceipt"];
                };
            };
            400: components["responses"]["InvalidSignature"];
            413: components["responses"]["PayloadTooLarge"];
            500: components["responses"]["ServerError"];
        };
    };
}
