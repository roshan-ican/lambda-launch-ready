import { afterEach, describe, expect, it, vi } from "vitest";
import { startTimer } from "./timing.js";

describe("startTimer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns whole milliseconds since it was started", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(1000);
    const elapsed = startTimer();

    now.mockReturnValueOnce(1250.6);
    expect(elapsed()).toBe(251);
  });

  it("measures from the same start every time it is read", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(1000);
    const elapsed = startTimer();

    now.mockReturnValueOnce(1100);
    expect(elapsed()).toBe(100);

    now.mockReturnValueOnce(1300);
    expect(elapsed()).toBe(300);
  });

  it("measures real time passing", async () => {
    const elapsed = startTimer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(elapsed()).toBeGreaterThanOrEqual(45);
  });
});