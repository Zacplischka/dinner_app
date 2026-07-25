/**
 * Run an Apify actor synchronously and return its dataset items. The URL's
 * timeout, maxItems, and maxTotalChargeUsd are the spend guards on a paid run.
 */
export async function runApifyActor(
  token: string,
  actorId: string,
  input: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<unknown[]> {
  const actorPath = actorId.replace('/', '~');
  const response = await fetchImpl(
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?timeout=280&maxItems=5&maxTotalChargeUsd=0.10`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(`Apify actor failed with status ${response.status}`);
  }

  const output: unknown = await response.json();
  if (!Array.isArray(output)) {
    throw new Error('Apify actor returned a non-array response');
  }

  return output as unknown[];
}
