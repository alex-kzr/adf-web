/** Allow the complete supported DAG to fit before the user zooms into individual nodes. */
export const graphFitOptions = { minZoom: 0.005, maxZoom: 1, padding: 0.15 } as const;

/** Resize fitting stops once a user pans, zooms, or focuses the graph. */
export class ResizeFitPolicy {
  private manual = false;
  private width = 0;
  private height = 0;
  get automatic(): boolean {
    return !this.manual;
  }
  preserve(): void {
    this.manual = true;
  }
  reset(): void {
    this.manual = false;
  }
  resize(width: number, height: number): boolean {
    if (width <= 0 || height <= 0) return false;
    const changed = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    return changed && !this.manual;
  }
}
