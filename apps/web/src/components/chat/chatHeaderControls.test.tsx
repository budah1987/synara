// FILE: chatHeaderControls.test.tsx
// Purpose: Covers shared tab-chip markup for stable rename and close hit targets.
// Layer: Component unit tests
// Depends on: React server rendering and SurfaceTabChip.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SurfaceTabChip } from "./chatHeaderControls";

describe("SurfaceTabChip", () => {
  it("keeps the identity glyph separate from a trailing close control", () => {
    const markup = renderToStaticMarkup(
      <SurfaceTabChip
        icon={<span data-testid="identity">AI</span>}
        label="Seller Catalog"
        closeLabel="Close Seller Catalog"
        closePlacement="trailing"
        onSelect={() => undefined}
        onClose={() => undefined}
        onDoubleClick={() => undefined}
      />,
    );

    expect(markup).toContain('<span data-testid="identity">AI</span>');
    expect(markup).toContain('aria-label="Close Seller Catalog"');
    expect(markup.indexOf('data-testid="identity"')).toBeLessThan(
      markup.indexOf('aria-label="Close Seller Catalog"'),
    );
    expect(markup.match(/<button/g)).toHaveLength(2);
  });
});
