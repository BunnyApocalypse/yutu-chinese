// A few characters whose second accepted stroke order is listed by hand.
//
// The mainland standard (GF 0023-2020), as the table of it by zispace/data-strokes
// lists it (not checked in the ministry's own document), writes these in another
// order than the big set does. The owner went through each one's picture on
// 2026-11-16 and called the difference real. They are not found by shape because
// no shape rule narrow enough was found: the one tried for 衮's 八 (the right
// stroke written before the left) also found 犀, 霉, 雾 and 飛, which have nothing to
// do with it. A list is short and says exactly what it covers.
//
// Each order is the stroke numbers of the data in the order the standard writes
// them (strokes are numbered from 0). It is used only for data with that many
// strokes, in case the data is ever replaced by another with other strokes.
//
// Not listed, so that nobody wonders: the 冉 of 冉, 苒, 髯, 聃 and the rest is found
// by shape (`ransOf` in src/shortcuts.js); the other differences the audit found
// (兜, 宾, 宦, 瀚, 艅, 融, 裒, 赘, 镣, 饽, 誓, 藤 and what has them in it) were
// judged by the owner to be mistakes of the audit's sorting, not different orders.

const STANDARD_ORDERS = {
  衮: [0, 1, 3, 2, 4, 5, 6, 7, 8, 9],
  滚: [0, 1, 2, 3, 4, 6, 5, 7, 8, 9, 10, 11, 12],
  磙: [0, 1, 2, 3, 4, 5, 6, 8, 7, 9, 10, 11, 12, 13, 14],
  虐: [0, 1, 2, 3, 4, 5, 6, 8, 7],
  谑: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 9],
  盖: [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10],
  芈: [1, 0, 2, 3, 4, 5, 6],
  陧: [0, 1, 2, 3, 4, 5, 7, 6, 8],
  尨: [0, 1, 2, 4, 5, 6, 3],
};

// The characters listed, for the tests.
export const LISTED_CHARS = Object.keys(STANDARD_ORDERS);

// A copy of `charData` (the data of `char`) whose second accepted order
// (`altOrder`) is the standard's; `charData` itself if the character is not
// listed, its strokes are not as many as the listed order's, or it has a second
// order already (none of these have). Marked `altOrderIsFang` (a review says
// 'other'), as the other orders added by shape are.
export function withListedOrder(char, charData) {
  const order = STANDARD_ORDERS[char];
  if (!order || charData.altOrder || charData.strokes.length !== order.length) {
    return charData;
  }
  return { ...charData, altOrder: [...order], altOrderIsFang: true };
}
