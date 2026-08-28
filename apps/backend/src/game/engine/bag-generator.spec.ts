import { BagGenerator } from './bag-generator';

describe('BagGenerator', () => {
  it('keeps every seven-piece bag intact when NEXT is peeked every turn', () => {
    const bag = new BagGenerator(42);
    const pieces = Array.from({ length: 70 }, () => {
      expect(bag.peek(5)).toHaveLength(5);
      return bag.next();
    });

    for (let offset = 0; offset < pieces.length; offset += 7) {
      expect(new Set(pieces.slice(offset, offset + 7)).size).toBe(7);
    }
  });

  it('does not consume or replace remaining pieces when peeking across a boundary', () => {
    const peeked = new BagGenerator(123456);
    const untouched = new BagGenerator(123456);

    for (let index = 0; index < 4; index++) {
      expect(peeked.next()).toBe(untouched.next());
    }

    const preview = peeked.peek(5);
    const actual = Array.from({ length: 5 }, () => peeked.next());
    const expected = Array.from({ length: 5 }, () => untouched.next());

    expect(preview).toEqual(expected);
    expect(actual).toEqual(expected);
  });
});
