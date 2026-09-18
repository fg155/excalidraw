import { isNearlyStraight } from "../straightInk";

describe("straight ink recognition", () => {
  it("accepts an imperfect straight stroke", () => {
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [30, 2],
          [60, -1],
          [100, 0],
        ],
        1,
      ),
    ).toBe(true);
  });
  it("rejects curves, backtracking and short strokes", () => {
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [40, 40],
          [100, 0],
        ],
        1,
      ),
    ).toBe(false);
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [100, 0],
          [10, 0],
          [100, 0],
        ],
        1,
      ),
    ).toBe(false);
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [5, 0],
        ],
        1,
      ),
    ).toBe(false);
  });
  it("uses displayed length rather than scene units", () => {
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [10, 0],
        ],
        3,
      ),
    ).toBe(true);
    expect(
      isNearlyStraight(
        [
          [0, 0],
          [40, 0],
        ],
        0.5,
      ),
    ).toBe(false);
  });
});
