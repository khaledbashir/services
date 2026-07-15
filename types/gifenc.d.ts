declare module 'gifenc' {
  export type GifPalette = number[][]

  export type GifEncoderInstance = {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: GifPalette; delay?: number; repeat?: number; transparent?: boolean }
    ): void
    finish(): void
    bytes(): Uint8Array
  }

  export function GIFEncoder(): GifEncoderInstance
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): GifPalette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette): Uint8Array

  const gifencDefault: unknown
  export default gifencDefault
}
