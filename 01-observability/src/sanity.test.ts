import { describe, expect, it } from "vitest";

describe("toolchain", () => {
    it("runs TypeScript tests", () => {
        const sum: number = 1 + 1;
        expect(sum).toBe(2);
    });
    it("length test", () => {
        const word: string = "cold"
        expect(word.length).toBe(4)
    })
    it("empty array index is undefined", () => {
        const items: number[] = []
        expect(items[0]).toBeUndefined()
    })
});