/**
 * @fileoverview Flow speed tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { durationForPower, FlowAnimator } from "../src/flow-engine.js";

let frameId;

beforeEach(() => {
  frameId = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => {
    frameId += 1;
    return frameId;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("durationForPower", () => {
  it("keeps animation duration bounded and faster for larger power", () => {
    expect(durationForPower(0)).toBe(3600);
    expect(durationForPower(12000)).toBe(1000);
    expect(durationForPower(6000)).toBeLessThan(durationForPower(500));
    expect(durationForPower(-12000)).toBe(1000);
  });
});

describe("FlowAnimator", () => {
  /**
   * Creates a DOM-independent animator fixture.
   * @returns {{animator: FlowAnimator; path: Object; particles: Array<{style: Object}>}} Fixture.
   */
  function fixture() {
    const path = {
      dataset: {},
      getTotalLength: () => 100,
      getPointAtLength: (distance) => ({ x: distance, y: 25 }),
    };
    const particles = [{ style: {} }, { style: {} }];
    return { animator: new FlowAnimator(path, particles), path, particles };
  }

  it("starts a forward transform-only flow and draws a frame", () => {
    const { animator, path, particles } = fixture();
    animator.setFlow("forward", 500);
    expect(path.dataset.direction).toBe("forward");
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    animator.frame = 0;
    animator.startedAt = 0;
    animator.duration = 1000;
    animator.tick(500);
    expect(particles[0].style.transform).toBe("translate3d(50px, 25px, 0) rotate(0deg)");
    expect(particles[0].style.opacity).toBe("1");
  });
  it("preserves the chevron phase when telemetry changes its speed", () => {
    const { animator } = fixture();
    animator.direction = "forward"; animator.startedAt = 0; animator.duration = 1000;
    vi.spyOn(performance, "now").mockReturnValue(750);
    animator.setFlow("forward",500);
    expect((750 - animator.startedAt) / animator.duration).toBeCloseTo(0.75);
  });

  it("reverses point progression", () => {
    const { animator, particles } = fixture();
    animator.direction = "reverse";
    animator.duration = 1000;
    animator.startedAt = 0;
    animator.tick(250);
    expect(particles[0].style.transform).toBe("translate3d(75px, 25px, 0) rotate(180deg)");
  });

  it("orients chevrons along vertical flow segments and reverses their heading", () => {
    const { animator, path, particles } = fixture();
    path.getPointAtLength = distance => ({ x: 20, y: distance });
    animator.duration = 1000;
    animator.startedAt = 0;
    animator.direction = "forward";
    animator.tick(250);
    expect(particles[0].style.transform).toBe("translate3d(20px, 25px, 0) rotate(90deg)");
    animator.direction = "reverse";
    animator.tick(250);
    expect(particles[0].style.transform).toBe("translate3d(20px, 75px, 0) rotate(270deg)");
  });

  it("stops for stale, hidden, and reduced-motion states", () => {
    const { animator, particles } = fixture();
    animator.setFlow("forward", 500);
    animator.setVisible(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(particles.every((particle) => particle.style.opacity === "0")).toBe(true);
    animator.setVisible(true);
    animator.setReducedMotion(true);
    expect(animator.frame).toBe(0);
    animator.setFlow("stopped", 0);
    expect(animator.frame).toBe(0);
  });

  it("restarts when visibility and motion allow it and cleans up", () => {
    const { animator } = fixture();
    animator.direction = "forward";
    animator.setVisible(false);
    animator.setVisible(true);
    expect(animator.frame).not.toBe(0);
    animator.setReducedMotion(true);
    animator.setReducedMotion(false);
    expect(animator.frame).not.toBe(0);
    animator.destroy();
    expect(animator.particles).toEqual([]);
  });
});
