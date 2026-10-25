import { afterEach, describe, expect, it, vi } from "vitest";
import { ops, type Value } from "../src/index.js";

describe("toNum", () => {
  it("casts like Scratch", () => {
    expect(ops.toNum("")).toBe(0);
    expect(ops.toNum("abc")).toBe(0);
    expect(ops.toNum("3.5")).toBe(3.5);
    expect(ops.toNum(true)).toBe(1);
    expect(ops.toNum(false)).toBe(0);
  });
});

describe("toBool", () => {
  it("treats false, 0 and empty as false", () => {
    expect(ops.toBool("false")).toBe(false);
    expect(ops.toBool("0")).toBe(false);
    expect(ops.toBool("")).toBe(false);
    expect(ops.toBool("abc")).toBe(true);
  });
});

describe("compare", () => {
  it("is numeric when both sides are numbers", () => {
    expect(ops.compare("10", "9")).toBeGreaterThan(0);
    expect(ops.eq("1.0", 1)).toBe(true);
  });
  it("is case-insensitive text otherwise", () => {
    expect(ops.eq("ABC", "abc")).toBe(true);
    expect(ops.lt("apple", "Banana")).toBe(true);
  });
  it("does not treat whitespace as zero", () => {
    expect(ops.eq(" ", 0)).toBe(false);
  });
});

describe("mod", () => {
  it("takes the sign of the divisor", () => {
    expect(ops.mod(-1, 5)).toBe(4);
    expect(ops.mod(7, 5)).toBe(2);
    expect(ops.mod(7, -5)).toBe(-3);
  });
});

describe("lists", () => {
  it("resolves indexes", () => {
    expect(ops.listIndex("last", 3)).toBe(3);
    expect(ops.listIndex(4, 3)).toBe(0);
    expect(ops.listIndex(0, 3)).toBe(0);
    expect(ops.listIndex(2, 3)).toBe(2);
  });
  it("inserts at length + 1", () => {
    const list: Value[] = ["a", "b"];
    ops.insertAt(list, 3, "c");
    expect(list).toEqual(["a", "b", "c"]);
    ops.insertAt(list, 5, "x");
    expect(list).toEqual(["a", "b", "c"]);
  });
  it("joins contents", () => {
    expect(ops.listContents(["a", "b"])).toBe("ab");
    expect(ops.listContents([1, 2])).toBe("1 2");
    expect(ops.listContents(["ab", "c"])).toBe("ab c");
  });
});

describe("strings and math", () => {
  it("returns empty for letters out of range", () => {
    expect(ops.letterOf(0, "abc")).toBe("");
    expect(ops.letterOf(4, "abc")).toBe("");
    expect(ops.letterOf(2, "abc")).toBe("b");
  });
  it("handles trig edge cases", () => {
    expect(ops.mathop("sin", 90)).toBe(1);
    expect(ops.mathop("tan", 90)).toBe(Infinity);
  });
});

// ---- list fast paths vs the original implementation ----

// A copy of the list helpers as they were before the fast paths, kept here as the reference.
// Keywords are case-sensitive, like scratch-vm's Cast.toListIndex and TurboWarp.
const slow = {
  listIndex(index: Value, length: number): number {
    if (typeof index === "string") {
      if (index === "last") return length;
      if (index === "random" || index === "any") return length > 0 ? 1 + Math.floor(Math.random() * length) : 0;
    }
    const i = Math.floor(ops.toNum(index));
    return i < 1 || i > length ? 0 : i;
  },
  itemOf(list: Value[], index: Value): Value {
    const i = slow.listIndex(index, list.length);
    return i === 0 ? "" : list[i - 1]!;
  },
  deleteOf(list: Value[], index: Value): void {
    if (index === "all") {
      list.length = 0;
      return;
    }
    const i = slow.listIndex(index, list.length);
    if (i !== 0) list.splice(i - 1, 1);
  },
  insertAt(list: Value[], index: Value, item: Value): void {
    const i = slow.listIndex(index, list.length + 1);
    if (i !== 0) list.splice(i - 1, 0, item);
  },
  replaceAt(list: Value[], index: Value, item: Value): void {
    const i = slow.listIndex(index, list.length);
    if (i !== 0) list[i - 1] = item;
  },
  indexOf(list: Value[], item: Value): number {
    for (let i = 0; i < list.length; i++) if (ops.eq(list[i]!, item)) return i + 1;
    return 0;
  },
};

const INDEXES: Value[] = [
  // numbers
  NaN, Infinity, -Infinity, -0, 0, -1, -3, 0.5, 0.999, 1, 1.5, 2, 2.5, 3, 3.9999, 4, 4.5, 5, 1e308,
  Number.MIN_VALUE,
  // strings
  "1", "1.0", " 2 ", "3", "4", "last", "LAST", "Last", "random", "RANDOM", "any", "all", "ALL", "",
  " ", "abc", "0", "-1", "1e0", "0x2", "Infinity", "NaN",
  // booleans
  true, false,
];

const LISTS: Value[][] = [[], ["a"], ["a", "b", "c"], [10, "x", 3.5, true]];

describe("list helpers match the original implementation", () => {
  afterEach(() => vi.restoreAllMocks());

  // "random" and "any" draw from Math.random; pin it so both implementations see the same value.
  for (const rand of [0, 0.5, 0.999]) {
    describe(`Math.random() = ${rand}`, () => {
      for (const list of LISTS) {
        for (const index of INDEXES) {
          const name = `length ${list.length}, index ${typeof index === "string" ? JSON.stringify(index) : Object.is(index, -0) ? "-0" : String(index)} (${typeof index})`;
          it(`listIndex: ${name}`, () => {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            for (const len of [0, 1, 3, 4]) expect(ops.listIndex(index, len)).toBe(slow.listIndex(index, len));
          });
          it(`itemOf: ${name}`, () => {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            const a = [...list];
            const b = [...list];
            expect(ops.itemOf(a, index)).toStrictEqual(slow.itemOf(b, index));
            expect(a).toStrictEqual(b);
          });
          it(`replaceAt: ${name}`, () => {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            const a = [...list];
            const b = [...list];
            ops.replaceAt(a, index, "NEW");
            slow.replaceAt(b, index, "NEW");
            expect(a).toStrictEqual(b);
          });
          it(`deleteOf: ${name}`, () => {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            const a = [...list];
            const b = [...list];
            ops.deleteOf(a, index);
            slow.deleteOf(b, index);
            expect(a).toStrictEqual(b);
          });
          it(`insertAt: ${name}`, () => {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            const a = [...list];
            const b = [...list];
            ops.insertAt(a, index, "NEW");
            slow.insertAt(b, index, "NEW");
            expect(a).toStrictEqual(b);
          });
        }
      }
    });
  }

  it("list keywords are case-sensitive", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    for (const word of ["LAST", "Last", "RANDOM", "Random", "ANY", "Any"]) expect(ops.listIndex(word, 3)).toBe(0);
    expect(ops.listIndex("last", 3)).toBe(3);
    expect(ops.listIndex("random", 3)).toBe(1);
    expect(ops.listIndex("any", 3)).toBe(1);
    const list: Value[] = [1, 2, 3];
    ops.deleteOf(list, "ALL");
    ops.deleteOf(list, "All");
    expect(list).toEqual([1, 2, 3]);
    ops.deleteOf(list, "all");
    expect(list).toEqual([]);
    expect(ops.itemOf([1, 2, 3], "LAST")).toBe("");
  });

  it("deleteOf removes the last item with pop and the first with shift", () => {
    const list: Value[] = [1, 2, 3, 4];
    ops.deleteOf(list, 4);
    expect(list).toEqual([1, 2, 3]);
    ops.deleteOf(list, "last");
    expect(list).toEqual([1, 2]);
    ops.deleteOf(list, 1);
    expect(list).toEqual([2]);
    ops.deleteOf(list, 1);
    expect(list).toEqual([]);
    ops.deleteOf(list, "last");
    ops.deleteOf(list, 1);
    expect(list).toEqual([]);
  });

  it("insertAt appends at length + 1 and prepends at 1", () => {
    const list: Value[] = [];
    ops.insertAt(list, 1, "a");
    ops.insertAt(list, 2, "c");
    ops.insertAt(list, "last", "d");
    ops.insertAt(list, 1, "z");
    ops.insertAt(list, 3, "b");
    expect(list).toEqual(["z", "a", "b", "c", "d"]);
  });

  describe("indexOf", () => {
    const ITEMS: Value[] = [
      1, 2, 3.5, 0, -0, NaN, Infinity, -Infinity, "1", "1.0", " 1 ", "a", "A", "", " ", "NaN", "nan", "Infinity", true, false,
    ];
    const HAYSTACKS: Value[][] = [
      [],
      [1, 2, 3.5],
      ["1", "1.0", "a", "A", "", " ", "0", "-0"],
      [NaN, Infinity, -Infinity, 0, -0, "nan", "NaN", "Infinity"],
      [true, false, 1, 0, "true", "false"],
      ["x", 7, "7.0", 7.5, " 7 ", 0.1 + 0.2, 0.3],
    ];
    for (const list of HAYSTACKS) {
      for (const item of ITEMS) {
        it(`${JSON.stringify(list)} for ${String(item)} (${typeof item})`, () => {
          expect(ops.indexOf(list, item)).toBe(slow.indexOf(list, item));
          expect(ops.listContains(list, item)).toBe(slow.indexOf(list, item) !== 0);
        });
      }
    }
  });
});
