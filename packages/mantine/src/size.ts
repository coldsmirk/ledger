import type { MantineSize } from "@mantine/core";

/**
 * The table's `size` scale (docs/styling.md#size). One Mantine size names the type, the cell
 * padding, a row's natural height and the size of every control drawn in a cell — the way
 * `size` sizes an input. Rows land on Mantine's input heights (30 / 36 / 42 / 50 / 60), so a
 * row reads level with an input of the same size beside it; the type is the font size of the
 * same name and the vertical padding what that leaves; `sm`, the default, is Mantine's own
 * `Table` (7px over 14px type). Controls inside a cell take the size one step down from `sm`
 * up, as Mantine's own composites do (a `MultiSelect`'s pills under its input).
 */
export interface SizeScale {
  /**
   * Cell padding in px, block and inline — the `Table` spacing props' values unless the
   * consumer sets one.
   */
  verticalSpacing: number;
  horizontalSpacing: number;
  /**
   * A one-line row's height with its separator, in px — the virtualizer's estimate.
   */
  rowHeight: number;
  /**
   * The Mantine size of the controls drawn in a cell and on the pagination bar: the
   * selection checkbox, the expander and drag handle, the filter button, an editor.
   */
  control: MantineSize;
  /**
   * The glyphs in the header and the handle cells, in px.
   */
  glyph: number;
  /**
   * The injected columns' width (docs/sizing.md): the control at its size, the cell's inline
   * padding either side, and a pixel of air each side.
   */
  injectedWidth: number;
}

/**
 * The size a table is drawn at unless said: Mantine's own `Table`.
 */
export const DEFAULT_SIZE: MantineSize = "sm";

export const SIZES: Record<MantineSize, SizeScale> = {
  xs: {
    verticalSpacing: 5,
    horizontalSpacing: 8,
    rowHeight: 31,
    control: "xs",
    glyph: 12,
    injectedWidth: 36
  },
  sm: {
    verticalSpacing: 7,
    horizontalSpacing: 10,
    rowHeight: 37,
    control: "xs",
    glyph: 14,
    injectedWidth: 40
  },
  md: {
    verticalSpacing: 8,
    horizontalSpacing: 12,
    rowHeight: 43,
    control: "sm",
    glyph: 16,
    injectedWidth: 48
  },
  lg: {
    verticalSpacing: 10,
    horizontalSpacing: 16,
    rowHeight: 51,
    control: "md",
    glyph: 18,
    injectedWidth: 62
  },
  xl: {
    verticalSpacing: 14,
    horizontalSpacing: 20,
    rowHeight: 61,
    control: "lg",
    glyph: 20,
    injectedWidth: 76
  }
};
