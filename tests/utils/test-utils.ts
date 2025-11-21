/**
 * Shared test utilities for Verdex test suite
 *
 * Provides common helpers for:
 * - Memory tracking for leak detection
 * - Performance measurement
 * - Test HTML generation
 *
 * NOTE: This file does NOT include retry logic or manual wait helpers.
 * If tests are flaky, fix the underlying race conditions in the code.
 * Trust Playwright's built-in auto-waiting and test-level retries.
 */

/**
 * Track memory usage for leak detection
 */
export class MemoryTracker {
  private samples: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
  }> = [];

  /**
   * Record current memory usage
   */
  sample(): void {
    const usage = process.memoryUsage();
    this.samples.push({
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
    });
  }

  /**
   * Force garbage collection if available and record sample
   */
  sampleWithGC(): void {
    if (global.gc) {
      global.gc();
    }
    this.sample();
  }

  /**
   * Get memory growth in MB
   */
  getGrowthMB(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0].heapUsed;
    const last = this.samples[this.samples.length - 1].heapUsed;
    return (last - first) / 1024 / 1024;
  }

  /**
   * Get average memory usage in MB
   */
  getAverageMB(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, s) => acc + s.heapUsed, 0);
    return sum / this.samples.length / 1024 / 1024;
  }

  /**
   * Get peak memory usage in MB
   */
  getPeakMB(): number {
    if (this.samples.length === 0) return 0;
    const peak = Math.max(...this.samples.map((s) => s.heapUsed));
    return peak / 1024 / 1024;
  }

  /**
   * Print memory report
   */
  report(): void {
    if (this.samples.length === 0) {
      console.log("No memory samples recorded");
      return;
    }

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];

    console.log("\n=== MEMORY REPORT ===");
    console.log(`Samples:  ${this.samples.length}`);
    console.log(`Initial:  ${(first.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Final:    ${(last.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Growth:   ${this.getGrowthMB().toFixed(2)} MB`);
    console.log(`Peak:     ${this.getPeakMB().toFixed(2)} MB`);
    console.log(`Average:  ${this.getAverageMB().toFixed(2)} MB`);
    console.log(
      `Duration: ${((last.timestamp - first.timestamp) / 1000).toFixed(2)}s`
    );
    console.log("====================\n");
  }

  /**
   * Assert that memory growth is within acceptable bounds
   */
  assertGrowthWithinBounds(maxGrowthMB: number): void {
    const growth = this.getGrowthMB();
    if (growth > maxGrowthMB) {
      throw new Error(
        `Memory growth ${growth.toFixed(2)} MB exceeds limit ${maxGrowthMB} MB`
      );
    }
  }
}

/**
 * Performance measurement utility
 */
export class PerformanceTracker {
  private timings: Array<{ operation: string; duration: number }> = [];
  private startTime: number = Date.now();

  /**
   * Measure an operation and record its duration
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = Date.now() - start;
      this.timings.push({ operation, duration });
    }
  }

  /**
   * Get average duration for a specific operation type
   */
  getAverage(operation: string): number {
    const filtered = this.timings.filter((t) => t.operation === operation);
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, t) => sum + t.duration, 0) / filtered.length;
  }

  /**
   * Get min/max/avg for all operations
   */
  getStats(operation?: string): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } {
    const filtered = operation
      ? this.timings.filter((t) => t.operation === operation)
      : this.timings;

    if (filtered.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const durations = filtered.map((t) => t.duration);
    return {
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      count: filtered.length,
    };
  }

  /**
   * Print performance report
   */
  report(): void {
    if (this.timings.length === 0) {
      console.log("No performance data recorded");
      return;
    }

    const totalDuration = Date.now() - this.startTime;
    const operationTypes = [...new Set(this.timings.map((t) => t.operation))];

    console.log("\n=== PERFORMANCE REPORT ===");
    console.log(`Total duration: ${totalDuration}ms`);
    console.log(`Total operations: ${this.timings.length}`);
    console.log();

    for (const op of operationTypes) {
      const stats = this.getStats(op);
      console.log(`${op}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(`  Avg:   ${stats.avg.toFixed(2)}ms`);
      console.log(`  Min:   ${stats.min}ms`);
      console.log(`  Max:   ${stats.max}ms`);
    }
    console.log("=========================\n");
  }

  /**
   * Assert that average duration is within bounds
   */
  assertAverageWithinBounds(operation: string, maxAvgMs: number): void {
    const avg = this.getAverage(operation);
    if (avg > maxAvgMs) {
      throw new Error(
        `Average ${operation} duration ${avg.toFixed(
          2
        )}ms exceeds limit ${maxAvgMs}ms`
      );
    }
  }
}

/**
 * Generate large HTML for load testing
 */
export function generateLargeDOM(
  elementCount: number,
  elementType: "button" | "div" | "span" = "button"
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><title>Large DOM Test</title></head>
      <body>
        ${Array.from(
          { length: elementCount },
          (_, i) =>
            `<${elementType} id="${elementType}-${i}">${elementType} ${i}</${elementType}>`
        ).join("\n")}
      </body>
    </html>
  `;
}

/**
 * Generate nested iframes for testing
 */
export function generateNestedIframes(depth: number): string {
  let html = `<button>Level ${depth}</button>`;

  for (let i = depth - 1; i >= 0; i--) {
    html = `
      <h1>Level ${i}</h1>
      <button>Button ${i}</button>
      <iframe srcdoc="${html.replace(/"/g, "&quot;")}"></iframe>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head><title>Nested Iframes</title></head>
      <body>${html}</body>
    </html>
  `;
}

/**
 * Generate sibling iframes for testing
 */
export function generateSiblingIframes(count: number): string {
  const iframes = Array.from(
    { length: count },
    (_, i) =>
      `<iframe id="frame-${i}" srcdoc="<button>Frame ${i}</button>"></iframe>`
  ).join("\n");

  return `
    <!DOCTYPE html>
    <html>
      <head><title>Sibling Iframes</title></head>
      <body>
        <h1>Sibling Iframes Test</h1>
        ${iframes}
      </body>
    </html>
  `;
}
