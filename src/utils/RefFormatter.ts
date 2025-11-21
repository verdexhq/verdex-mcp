/**
 * Utility for formatting and parsing element references across frames.
 *
 * Ref format:
 * - Main frame: "e1", "e2", "e3" (local refs only)
 * - Child frames: "f1_e1", "f2_e5" (frame ordinal + local ref)
 */
export class RefFormatter {
  /**
   * Convert frame ordinal and local ref to global ref
   * @param frameOrdinal - Frame number (0 = main frame)
   * @param localRef - Local element ref (e1, e2, etc.)
   * @returns Global ref string
   */
  static toGlobal(frameOrdinal: number, localRef: string): string {
    if (frameOrdinal === 0) {
      return localRef; // Main frame refs are not prefixed
    }
    return `f${frameOrdinal}_${localRef}`;
  }

  /**
   * Parse global ref into frame ordinal and local ref
   * @param globalRef - Global reference string
   * @returns Object with frameOrdinal and localRef
   * @throws Error if ref format is invalid
   */
  static parse(globalRef: string): { frameOrdinal: number; localRef: string } {
    // Match: "e1" or "f1_e1"
    const match = globalRef.match(/^(?:f(\d+)_)?(e\d+)$/);

    if (!match) {
      throw new Error(
        `Invalid ref format: ${globalRef}. Expected "e1" or "f1_e1" format.`
      );
    }

    return {
      frameOrdinal: match[1] ? parseInt(match[1], 10) : 0,
      localRef: match[2],
    };
  }

  /**
   * Check if a ref is a local ref (not frame-prefixed)
   * @param ref - Reference string
   * @returns True if ref is local (e.g. "e1"), false if global (e.g. "f1_e1")
   */
  static isLocal(ref: string): boolean {
    return /^e\d+$/.test(ref);
  }

  /**
   * Extract local ref from global ref
   * @param globalRef - Global reference string
   * @returns Local ref portion (e.g. "e1")
   */
  static getLocalRef(globalRef: string): string {
    const parsed = this.parse(globalRef);
    return parsed.localRef;
  }
}
