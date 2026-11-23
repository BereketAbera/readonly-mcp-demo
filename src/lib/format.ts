const audWhole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const audCents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

export const money = (value: number) => audWhole.format(value);
export const moneyCents = (value: number) => audCents.format(value);
export const hours = (value: number) => oneDecimal.format(value);
export const percent = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)}%`);
