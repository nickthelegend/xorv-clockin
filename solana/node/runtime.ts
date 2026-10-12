/** Bound model concurrency on a shared host; invalid configuration fails at startup. */
export function concurrencyLimit(value = '1'): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
    throw new Error('XORV_MAX_CONCURRENT_JOBS must be an integer between 1 and 8');
  }
  return limit;
}

/** Never send an empty answer, or split a UTF-8 code point at the account byte limit. */
export function resultBytes(answer: string, max = 2048): Buffer {
  const text = answer.trim();
  if (!text) throw new Error('The agent returned an empty answer');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= max) return bytes;
  const tail = Buffer.from('\n…[truncated]', 'utf8');
  if (max < tail.length) throw new Error('Result limit is too small');
  let end = max - tail.length;
  // If the next byte continues a code point, remove its leading byte too.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return Buffer.concat([bytes.subarray(0, end), tail]);
}

/** Submit a bounded answer in order. Cancellation must never become a paid final chunk. */
export async function submitAnswer(
  answer: string,
  submit: (chunk: Buffer, done: boolean) => Promise<void>,
  signal: AbortSignal,
  max = 2048,
  chunkSize = 700,
): Promise<number> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Invalid result chunk size');
  const bytes = resultBytes(answer, max);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    if (signal.aborted) throw new Error('The job deadline was reached before delivery');
    await submit(bytes.subarray(offset, offset + chunkSize), offset + chunkSize >= bytes.length);
  }
  return bytes.length;
}
