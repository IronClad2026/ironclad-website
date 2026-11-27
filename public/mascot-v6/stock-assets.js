export function createStockAssetLoader(base) {
  let loading;

  async function read(file, decode, cache) {
    const response = await fetch(new URL(file, base), {
      cache, signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) throw new Error(file + ' returned HTTP ' + response.status);
    return decode(response);
  }

  async function loadModel() {
    const decode = response => response.arrayBuffer();
    try {
      return await read('ironclad.glb', decode, 'default');
    } catch (error) {
      // Browsers can reject an otherwise valid response when the cache write fails.
      // Retry the public model without using the malfunctioning disk cache.
      if (!(error instanceof TypeError)) throw error;
      return read('ironclad.glb', decode, 'no-store');
    }
  }

  return () => {
    // The header and wardrobe share only the pending download. They own separate
    // scenes, and closing either viewer cannot abort the other's stock download.
    loading ??= Promise.all([read('interaction.json', response => response.json(), 'default'), loadModel()])
      .finally(() => { loading = undefined; });
    return loading;
  };
}
