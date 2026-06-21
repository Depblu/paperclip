export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function statusLabel(value: string | null | undefined) {
  if (!value) return "none";
  return value.replaceAll("_", " ");
}
