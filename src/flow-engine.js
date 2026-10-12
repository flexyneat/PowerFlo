/**
 * @fileoverview Transform-only particle animation for SVG topology connectors.
 */

/**
 * Maps watts to a bounded particle duration using logarithmic scaling.
 * @param {number | null} watts Absolute live power.
 * @returns {number} Animation cycle duration in milliseconds.
 */
export function durationForPower(watts) {
  const magnitude = Math.max(0, Math.abs(watts ?? 0));
  const normalized = Math.min(1, Math.log10(1 + magnitude) / Math.log10(12001));
  return Math.round(3600 - normalized * 2600);
}

/**
 * Controls particles on one SVG path using transform and opacity only.
 */
export class FlowAnimator {
  /**
   * Creates an animator.
   * @param {SVGPathElement} path Geometry source.
   * @param {SVGGraphicsElement[]} particles Particle elements.
   */
  constructor(path, particles) {
    this.path = path;
    this.particles = particles;
    this.direction = "stopped";
    this.duration = 2400;
    this.startedAt = 0;
    this.frame = 0;
    this.visible = true;
    this.reducedMotion = false;
  }

  /**
   * Applies current direction and speed.
   * @param {"forward" | "reverse" | "stopped"} direction Flow direction.
   * @param {number | null} watts Absolute live power.
   */
  setFlow(direction, watts) {
    const changed = direction !== this.direction;
    this.direction = direction;
    this.duration = durationForPower(watts);
    if (changed) this.startedAt = performance.now();
    this.path.dataset.direction = direction;
    if (direction === "stopped" || this.reducedMotion || !this.visible) {
      this.stop();
      return;
    }
    this.start();
  }

  /**
   * Sets viewport visibility and pauses hidden work.
   * @param {boolean} visible Whether the card is visible.
   */
  setVisible(visible) {
    this.visible = visible;
    if (!visible) this.stop();
    else if (this.direction !== "stopped" && !this.reducedMotion) this.start();
  }

  /**
   * Enables or disables the reduced-motion path.
   * @param {boolean} reduced Whether motion should be reduced.
   */
  setReducedMotion(reduced) {
    this.reducedMotion = reduced;
    if (reduced) this.stop();
    else if (this.direction !== "stopped" && this.visible) this.start();
  }

  /** Starts the animation loop when not already running. */
  start() {
    if (this.frame) return;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  /** Stops the animation loop and hides particles. */
  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const particle of this.particles) particle.style.opacity = "0";
  }

  /**
   * Draws one animation frame.
   * @param {number} time requestAnimationFrame timestamp.
   */
  tick(time) {
    const length = this.path.getTotalLength();
    const elapsed = (time - this.startedAt) % this.duration;
    const base = elapsed / this.duration;
    for (const [index, particle] of this.particles.entries()) {
      const phase = (base + index / this.particles.length) % 1;
      const progress = this.direction === "reverse" ? 1 - phase : phase;
      const point = this.path.getPointAtLength(length * progress);
      particle.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
      particle.style.opacity = "1";
    }
    this.frame = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  /** Releases animation resources. */
  destroy() {
    this.stop();
    this.particles = [];
  }
}
