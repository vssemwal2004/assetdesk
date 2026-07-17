type CountableReturnItem =
  { trackingMode: 'QUANTITY'; quantity: number } | { trackingMode: 'SERIALIZED' };

export function returnedUnitCount(items: readonly CountableReturnItem[]): number {
  return items.reduce(
    (total, item) => total + (item.trackingMode === 'QUANTITY' ? item.quantity : 1),
    0,
  );
}
