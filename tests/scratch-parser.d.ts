declare module "scratch-parser" {
  function parse(input: Buffer | string, isSprite: boolean, callback: (err: unknown, result: unknown) => void): void;
  export default parse;
}
