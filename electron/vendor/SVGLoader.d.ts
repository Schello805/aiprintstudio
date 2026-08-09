import { Loader, Shape, ShapePath } from "three";

export class SVGLoader extends Loader {
  defaultDPI: number;
  defaultUnit: string;
  parse(text: string): {
    paths: Array<ShapePath & { userData?: { style?: Record<string, unknown> } }>;
    xml: XMLDocument;
  };
  static createShapes(shapePath: ShapePath): Shape[];
}
