import clsx from "clsx";

/**
 * React's HTML attribute types enumerate every `aria-*` attribute but no `data-*` one: JSX
 * accepts them through a compiler special case that an object literal does not get. The escape
 * hatch therefore admits them explicitly — `data-*` is half the point of it.
 */
export type DataAttributes = Record<`data-${string}`, string | number | boolean | null | undefined>;

/**
 * The DOM escape hatch (docs/styling.md#dom-props): every rendered row, cell, and header cell
 * accepts consumer props — attributes, `data-*`, `aria-*`, inline styles, extra handlers —
 * either as a static object or as a function of the element's subject.
 *
 * `ref` is deliberately excluded from every one of these types: they are declarative prop hooks
 * resolved per render (per virtual item, for rows), not component instances, and ledger already
 * owns the row ref for virtualization measurement.
 */
export type DataTableElementProps<TProps, TSubject>
  = | (TProps & DataAttributes)
    | ((subject: TSubject) => (TProps & DataAttributes) | undefined);

export function resolveElementProps<TProps, TSubject>(
  props: DataTableElementProps<TProps, TSubject> | undefined,
  subject: TSubject
): (TProps & DataAttributes) | undefined {
  return typeof props === "function"
    ? (props as (subject: TSubject) => (TProps & DataAttributes) | undefined)(subject)
    : props;
}

/**
 * Compose consumer props with ledger's own, with four rules:
 *
 * - ledger's structural props win — `role`, the `data-*` state contract, ARIA indices and the
 * sticky offsets of a pinned cell are the styling and semantic contract, not suggestions;
 * - but only where ledger actually sets one: an owned key holding `undefined` means "ledger has
 * no opinion here" and must not erase the consumer's value;
 * - `className` and `style` compose, consumer last so an equal-specificity rule of theirs wins;
 * - a handler present on both sides chains, ledger's first (its stop-propagation covenant and
 * active-row bookkeeping run before the consumer sees the event).
 */
export function mergeElementProps<TOwned extends Record<string, any>>(
  consumer: Record<string, any> | undefined,
  owned: TOwned
): TOwned {
  if (!consumer) {
    return owned;
  }

  const merged: Record<string, any> = { ...consumer };

  for (const [key, ownedValue] of Object.entries(owned)) {
    const consumerValue = consumer[key];

    if (
      key.startsWith("on")
      && typeof ownedValue === "function"
      && typeof consumerValue === "function"
    ) {
      merged[key] = (...args: unknown[]) => {
        ownedValue(...args);
        consumerValue(...args);
      };
    } else if (ownedValue !== undefined) {
      // An owned key holding `undefined` is "no opinion", and React reads a missing prop and an
      // undefined one alike — so skipping the write leaves the consumer's value standing.
      merged[key] = ownedValue;
    }
  }

  const className = clsx(owned.className, consumer.className);

  merged.className = className === "" ? undefined : className;

  if (consumer.style || owned.style) {
    merged.style = { ...owned.style, ...consumer.style };
  }

  return merged as TOwned;
}
