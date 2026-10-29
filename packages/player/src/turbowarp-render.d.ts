// Minimal typings for the parts of TurboWarp's scratch-render (installed from GitHub as
// `turbowarp-render`) and its SVG renderer that the renderer backend and the browser oracle use.
declare module "@turbowarp/scratch-svg-renderer" {
  export class BitmapAdapter {}
}

declare module "turbowarp-render" {
  interface Rectangle {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
  interface DrawableProperties {
    position?: [number, number];
    direction?: number;
    scale?: [number, number];
    visible?: boolean;
    skinId?: number;
  }
  interface Drawable {
    getAABB(result?: Rectangle): Rectangle;
    _position: [number, number];
  }
  export default class RenderWebGL {
    constructor(canvas: HTMLCanvasElement, xLeft?: number, xRight?: number, yBottom?: number, yTop?: number);
    static isSupported(canvas?: HTMLCanvasElement): boolean;
    readonly _gl: WebGLRenderingContext;
    _allDrawables: Drawable[];
    setLayerGroupOrdering(groups: string[]): void;
    setBackgroundColor(red: number, green: number, blue: number, alpha?: number): void;
    resize(pixelsWide: number, pixelsTall: number): void;
    createDrawable(group: string): number;
    destroyDrawable(drawableID: number, group: string): void;
    createSVGSkin(svg: string, rotationCenter?: [number, number]): number;
    createBitmapSkin(bitmap: CanvasImageSource | ImageData, costumeResolution?: number, rotationCenter?: [number, number]): number;
    createTextSkin(type: string, text: string, pointsLeft: boolean): number;
    updateTextSkin(skinID: number, type: string, text: string, pointsLeft: boolean): void;
    destroySkin(skinID: number): void;
    updateDrawableProperties(drawableID: number, properties: DrawableProperties): void;
    updateDrawablePosition(drawableID: number, position: [number, number]): void;
    setDrawableOrder(drawableID: number, order: number, group: string, optIsRelative?: boolean, optMin?: number): number;
    getDrawableOrder(drawableID: number): number;
    getBounds(drawableID: number): Rectangle;
    getBoundsForBubble(drawableID: number): Rectangle;
    getCurrentSkinSize(drawableID: number): [number, number];
    getNativeSize(): [number, number];
    getFencedPositionOfDrawable(drawableID: number, position: [number, number]): [number, number];
    isTouchingDrawables(drawableID: number, candidateIDs?: number[]): boolean;
    isTouchingColor(drawableID: number, color3b: readonly [number, number, number], mask3b?: readonly [number, number, number]): boolean;
    drawableTouching(drawableID: number, centerX: number, centerY: number, touchWidth?: number, touchHeight?: number): boolean;
    pick(centerX: number, centerY: number, touchWidth?: number, touchHeight?: number, candidateIDs?: number[]): number;
    draw(): void;
  }
}
