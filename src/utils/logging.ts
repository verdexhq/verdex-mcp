/**
 * Logging utilities for error handling
 */

/**
 * Log an error and continue execution.
 * Use for non-critical errors during cleanup or graceful degradation.
 *
 * @param error - Error to log
 * @param context - Optional context string for debugging
 */
export function logAndContinue(error: unknown, context?: string): void {
  const prefix = context ? `[${context}] ` : "";
  console.warn(`${prefix}Non-critical error (continuing):`, error);
}

/**
 * Log a debug message (only shown when debugging enabled)
 *
 * @param message - Debug message
 * @param data - Optional data to include
 */
export function debugLog(message: string, data?: any): void {
  if (process.env.DEBUG === "verdex" || process.env.DEBUG === "*") {
    console.debug(`[verdex] ${message}`, data !== undefined ? data : "");
  }
}
