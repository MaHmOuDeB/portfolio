// A row of words (tools) that slides sideways with the scroll, done in CSS. Each item appears once,
// never duplicated for a seamless loop, so assistive technology reads the list a single time. The
// role keeps the list semantics in Safari, which drops them under list-style: none.
import type { DataAttributes } from './data-attributes';

export function Ribbon({ items, label, ...rest }: DataAttributes & { items: string[]; label: string }) {
  return (
    <div data-depth-ribbon="" {...rest}>
      <ul role="list" aria-label={label}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
