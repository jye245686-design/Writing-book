const MAX_RETRIES = 3

/**
 * 带重试的 fetch：网络错误或 5xx 时最多重试 MAX_RETRIES 次，间隔 1s / 2s / 3s
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retriesLeft = MAX_RETRIES
): Promise<Response> {
  try {
    const res = await fetch(input, init)
    if (res.ok || res.status < 500) return res
    if (retriesLeft <= 0) return res
  } catch {
    if (retriesLeft <= 0) throw new Error('网络请求失败，请检查网络后重试')
  }
  const delayMs = 1000 * (MAX_RETRIES - retriesLeft + 1)
  await new Promise((r) => setTimeout(r, delayMs))
  return fetchWithRetry(input, init, retriesLeft - 1)
}
