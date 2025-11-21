/**
 * ManualPromise - A promise that can be resolved/rejected externally.
 *
 * Usage:
 *   const promise = new ManualPromise<string>();
 *   promise.resolve("done");
 *   await promise;  // Awaits the resolved value (no .promise needed)
 *
 * Debugging:
 *   ManualPromise.DEBUG = true;  // Enable warnings for double-settlement
 */
export class ManualPromise<T = void> extends Promise<T> {
  private _resolve!: (value: T) => void;
  private _reject!: (error: Error) => void;
  private _isDone = false;

  /**
   * Enable to log warnings when resolve/reject is called multiple times.
   * Useful for debugging potential logic errors in development.
   */
  static DEBUG = false;

  constructor() {
    let resolve: (value: T) => void;
    let reject: (error: Error) => void;
    super((f, r) => {
      resolve = f;
      reject = r;
    });
    this._resolve = resolve!;
    this._reject = reject!;
  }

  resolve(value: T): void {
    if (this._isDone) {
      if (ManualPromise.DEBUG) {
        console.warn(
          "ManualPromise.resolve() called after already settled",
          "\nStack trace:",
          new Error().stack
        );
      }
      return;
    }
    this._isDone = true;
    this._resolve(value);
  }

  reject(error: Error): void {
    if (this._isDone) {
      if (ManualPromise.DEBUG) {
        console.warn(
          "ManualPromise.reject() called after already settled",
          "\nStack trace:",
          new Error().stack
        );
      }
      return;
    }
    this._isDone = true;
    this._reject(error);
  }

  isDone(): boolean {
    return this._isDone;
  }

  static override get [Symbol.species]() {
    return Promise;
  }

  override get [Symbol.toStringTag]() {
    return "ManualPromise";
  }
}
