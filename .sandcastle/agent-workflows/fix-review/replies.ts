import { z } from 'zod/v4'

export const repliesSchema = z.strictObject({
  replies: z.array(
    z.strictObject({
      threadId: z.string().min(1),
      status: z.enum(['fixed', 'blocked']),
      body: z.string().min(1),
    }),
  ),
})

// The agent may only reply to threads actually supplied to this run, once
// each. Validate again before any GitHub write, independent of extraction.
export const validateReplies = (
  threads: readonly { id: string }[],
  output: unknown,
): z.infer<typeof repliesSchema> => {
  const result = repliesSchema.parse(output)
  const expected = new Set(threads.map(({ id }) => id))
  const returned = new Set(result.replies.map(({ threadId }) => threadId))
  if (
    returned.size !== result.replies.length ||
    returned.size !== expected.size ||
    [...returned].some((id) => !expected.has(id))
  ) {
    throw new Error('Expected exactly one reply per supplied review thread.')
  }
  return result
}
