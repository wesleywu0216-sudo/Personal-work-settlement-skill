const tenPow = (places) => 10n ** BigInt(places);

function parseDecimal(value) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new TypeError(`非法十进制数：${text}`);
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const denominator = tenPow(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  return { numerator: negative ? -numerator : numerator, denominator };
}

function roundDivideHalfAwayFromZero(numerator, denominator) {
  if (denominator <= 0n) {
    throw new RangeError("分母必须大于 0");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export function toCents(value) {
  const { numerator, denominator } = parseDecimal(value);
  return roundDivideHalfAwayFromZero(numerator * 100n, denominator);
}

export function centsTimesDecimal(cents, decimal) {
  const { numerator, denominator } = parseDecimal(decimal);
  return roundDivideHalfAwayFromZero(cents * numerator, denominator);
}

export function centsToNumber(cents) {
  return Number(cents) / 100;
}

