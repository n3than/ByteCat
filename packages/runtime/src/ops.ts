// Scratch value semantics used by generated code. These follow scratch-vm's Cast and
// operator implementations closely, since getting them wrong changes program results.

export type Value = string | number | boolean;

export function toNum(v: Value): number {
  if (typeof v === "number") return Number.isNaN(v) ? 0 : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function toStr(v: Value): string {
  return String(v);
}

export function toBool(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return !(v === "" || v === "0" || v.toLowerCase() === "false");
  return v !== 0 && !Number.isNaN(v);
}

function isWhitespace(v: Value): boolean {
  return typeof v === "string" && v.trim().length === 0;
}

/** Scratch comparison: numeric when both sides look like numbers, else case-insensitive text. */
export function compare(a: Value, b: Value): number {
  if (typeof a === "number" && typeof b === "number" && !Number.isNaN(a) && !Number.isNaN(b)) {
    return a === b ? 0 : a - b;
  }
  let n1 = Number(a);
  let n2 = Number(b);
  if (n1 === 0 && isWhitespace(a)) n1 = NaN;
  if (n2 === 0 && isWhitespace(b)) n2 = NaN;
  if (Number.isNaN(n1) || Number.isNaN(n2)) {
    const s1 = String(a).toLowerCase();
    const s2 = String(b).toLowerCase();
    return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
  }
  if (n1 === Infinity && n2 === Infinity) return 0;
  if (n1 === -Infinity && n2 === -Infinity) return 0;
  return n1 - n2;
}

export const eq = (a: Value, b: Value): boolean => compare(a, b) === 0;
export const lt = (a: Value, b: Value): boolean => compare(a, b) < 0;
export const gt = (a: Value, b: Value): boolean => compare(a, b) > 0;

export function mod(n: number, m: number): number {
  let r = n % m;
  if (r / m < 0) r += m;
  return r;
}

function isIntLike(v: Value): boolean {
  if (typeof v === "number") return Number.isInteger(v);
  if (typeof v === "boolean") return true;
  return !v.includes(".");
}

export function random(from: Value, to: Value): number {
  const a = toNum(from);
  const b = toNum(to);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  if (isIntLike(from) && isIntLike(to)) return low + Math.floor(Math.random() * (high - low + 1));
  return Math.random() * (high - low) + low;
}

export function letterOf(index: Value, s: Value): string {
  const str = toStr(s);
  const i = toNum(index) - 1;
  if (i < 0 || i >= str.length) return "";
  return str.charAt(i);
}

export function contains(a: Value, b: Value): boolean {
  return toStr(a).toLowerCase().includes(toStr(b).toLowerCase());
}

const DEG = Math.PI / 180;

export function mathop(op: string, x: number): number {
  switch (op) {
    case "abs": return Math.abs(x);
    case "floor": return Math.floor(x);
    case "ceiling": return Math.ceil(x);
    case "sqrt": return Math.sqrt(x);
    case "sin": return Math.round(Math.sin(x * DEG) * 1e10) / 1e10;
    case "cos": return Math.round(Math.cos(x * DEG) * 1e10) / 1e10;
    case "tan": return tan(x);
    case "asin": return Math.asin(x) / DEG;
    case "acos": return Math.acos(x) / DEG;
    case "atan": return Math.atan(x) / DEG;
    case "ln": return Math.log(x);
    case "log": return Math.log(x) / Math.LN10;
    case "e ^": return Math.exp(x);
    case "10 ^": return Math.pow(10, x);
    default: return 0;
  }
}

function tan(x: number): number {
  const a = mod(x, 360);
  if (a === 90) return Infinity;
  if (a === 270) return -Infinity;
  return Math.round(Math.tan(x * DEG) * 1e10) / 1e10;
}

// ---- lists ----

/** Resolves a Scratch list index ("last", "random", 1-based numbers). Returns 0 when out of range. */
export function listIndex(index: Value, length: number): number {
  if (typeof index === "string") {
    const s = index.toLowerCase();
    if (s === "last") return length;
    if (s === "random" || s === "any") return length > 0 ? 1 + Math.floor(Math.random() * length) : 0;
  }
  const i = Math.floor(toNum(index));
  return i < 1 || i > length ? 0 : i;
}

export function itemOf(list: Value[], index: Value): Value {
  const i = listIndex(index, list.length);
  return i === 0 ? "" : list[i - 1]!;
}

export function deleteOf(list: Value[], index: Value): void {
  if (typeof index === "string" && index.toLowerCase() === "all") {
    list.length = 0;
    return;
  }
  const i = listIndex(index, list.length);
  if (i !== 0) list.splice(i - 1, 1);
}

export function insertAt(list: Value[], index: Value, item: Value): void {
  const i = listIndex(index, list.length + 1);
  if (i === 0) return;
  list.splice(i - 1, 0, item);
  // Like scratch-vm: inserting into a full list drops the last item to stay at the limit.
  if (list.length > 200000) list.pop();
}

export function replaceAt(list: Value[], index: Value, item: Value): void {
  const i = listIndex(index, list.length);
  if (i !== 0) list[i - 1] = item;
}

export function indexOf(list: Value[], item: Value): number {
  for (let i = 0; i < list.length; i++) if (eq(list[i]!, item)) return i + 1;
  return 0;
}

export function listContains(list: Value[], item: Value): boolean {
  return indexOf(list, item) !== 0;
}

/** The "contents of list" reporter: joined with spaces unless every item is a single character. */
export function listContents(list: Value[]): string {
  const single = list.every((x) => typeof x === "string" && x.length === 1);
  return list.join(single ? "" : " ");
}
