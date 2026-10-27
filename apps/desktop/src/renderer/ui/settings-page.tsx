// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { AppInfo } from "../../shared/ipc.ts";
import { signal } from "../shared/theme.tsx";
import { Shortcut } from "../shared/shortcut.tsx";
import { ipcMessage } from "./state.ts";
import type { ByokState } from "./state.ts";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    maxWidth: 640,
    marginInline: "auto",
    paddingBlock: 24,
    paddingInline: 40,
  },
  title: { fontSize: 40, lineHeight: 1.1, marginBottom: 16 },
  row: {
    display: "grid",
    gridTemplateColumns: "200px 1fr",
    gap: 24,
    paddingBlock: 24,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--color-border)",
  },
  label: { display: "flex", flexDirection: "column", gap: 4 },
  labelTitle: { fontSize: 14, fontWeight: 600 },
  body: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
  inline: { display: "flex", alignItems: "flex-end", gap: 8 },
  connected: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  list: { margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 6 },
});

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.label)}>
        <Text xstyle={styles.labelTitle}>{title}</Text>
        {note && (
          <Text color="secondary" size="sm">
            {note}
          </Text>
        )}
      </div>
      <div {...stylex.props(styles.body)}>{children}</div>
    </div>
  );
}

function MetaKey({ byok }: { byok: ByokState }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await byok.save(key);
      setKey("");
    } catch (err) {
      setError(ipcMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const { status } = byok;
  return (
    <>
      {status?.hasKey ? (
        <div {...stylex.props(styles.connected)}>
          <span {...stylex.props(styles.dot)} style={{ backgroundColor: signal.ok }} />
          <Text>Connected · key ending in {status.hint}</Text>
        </div>
      ) : (
        <Text color="secondary">
          Free forever with your own key. Get one at{" "}
          <Link href="https://dev.meta.ai" target="_blank">
            dev.meta.ai
          </Link>
          .
        </Text>
      )}
      <div {...stylex.props(styles.inline)}>
        <TextInput
          type="password"
          label={status?.hasKey ? "Replace key" : "Meta Model API key"}
          placeholder="LLM_…"
          value={key}
          onChange={setKey}
          onEnter={() => void save()}
          status={error ? { type: "error", message: error } : undefined}
          width="100%"
        />
        <Button
          label="Save"
          variant="primary"
          isDisabled={!key}
          isLoading={isSaving}
          onClick={() => void save()}
        />
      </div>
      {status?.hasKey && (
        <div>
          <Button label="Remove key" variant="ghost" onClick={() => void byok.clear()} />
        </div>
      )}
      {status && !status.encryptionAvailable && (
        <Text color="secondary" size="sm">
          No system keychain was found, so the key would be stored unencrypted.
        </Text>
      )}
    </>
  );
}

export function SettingsPage({ info, byok }: { info: AppInfo | null; byok: ByokState }) {
  return (
    <div {...stylex.props(styles.page)}>
      <Heading level={1} xstyle={styles.title}>
        Settings
      </Heading>

      <Row
        title="Meta API key"
        note="Encrypted with your system keychain. Calls go from this device straight to Meta."
      >
        <MetaKey byok={byok} />
      </Row>

      <Row title="Shortcut" note="Starts and stops a recording from any app.">
        <div {...stylex.props(styles.connected)}>
          <Shortcut isMac={info?.platform === "darwin"} />
          <Text color="secondary" size="sm">
            {info?.hotkeyRegistered === false ? "Taken by another app" : "Active"}
          </Text>
        </div>
      </Row>

      <Row title="Privacy" note="What happens to a recording.">
        <ul {...stylex.props(styles.list)}>
          <li>
            <Text size="sm">Frames and audio stay in memory on this device while you record.</Text>
          </li>
          <li>
            <Text size="sm">
              Every frame is read on-device, and keys, tokens and passwords are painted over.
            </Text>
          </li>
          <li>
            <Text size="sm">Only redacted frames and your narration are sent for analysis.</Text>
          </li>
        </ul>
      </Row>

      <Row title="About">
        <Text color="secondary" size="sm">
          iVibe {info ? `v${info.version}` : ""} · open source under AGPL-3.0 ·{" "}
          <Link href="https://github.com/nikylogic/ivibe" target="_blank">
            GitHub
          </Link>
        </Text>
      </Row>
    </div>
  );
}
