export { mapWithConcurrency };

async function mapWithConcurrency<T, R> (
    items: readonly T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    async function worker (): Promise<void> {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index]!, index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

    return results;
}
