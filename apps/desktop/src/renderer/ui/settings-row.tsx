// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "@astryxdesign/core/Text";

/** One group on a Settings page: a short title and note, then its controls. */

const styles = stylex.create({
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingBlock: 20,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: "var(--color-border)",
  },
  label: { display: "flex", flexDirection: "column", gap: 2 },
  labelTitle: { fontSize: 14, fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
});

export function Row({
  title,
  note,
  children,
}: {
  title?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      {(title || note) && (
        <div {...stylex.props(styles.label)}>
          {title && <Text xstyle={styles.labelTitle}>{title}</Text>}
          {note && (
            <Text color="secondary" size="sm">
              {note}
            </Text>
          )}
        </div>
      )}
      <div {...stylex.props(styles.body)}>{children}</div>
    </div>
  );
}
