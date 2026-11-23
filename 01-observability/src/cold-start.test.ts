
import { expect, describe, it  } from "vitest";
import { consumeColdStart } from "./cold-start.js";

describe("consumeColdStart", () => {
    it('is true only the first call in this environmnent', () => {
        expect(consumeColdStart()).toBe(true)
        expect(consumeColdStart()).toBe(false)
        expect(consumeColdStart()).toBe(false)
    })
})