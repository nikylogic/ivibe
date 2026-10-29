// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ClipboardPaste, Copy, History, Image, Search, Trash2 } from "lucide-react";
import type { HistoryDetail, HistoryEntry, OutputMode } from "../../shared/ipc.ts";
import { PASTE_SHORTCUT, acceleratorKeys } from "../../shared/shortcuts.ts";
import { transition } from "./motion.ts";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
    width: "100%",
    maxWidth: 720,
    marginInline: "auto",
    paddingBlock: 24,
    paddingInline: 40,
  },
  hero: { display: "flex", flexDirection: "column", gap: 14 },
  display: { fontSize: 52, lineHeight: 1.02, letterSpacing: "-0.01em" },
  displaySoft: { fontStyle: "italic", color: "var(--color-text-secondary)" },
  toolbar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  search: { flex: 1, minWidth: 200 },
  day: { display: "flex", flexDirection: "column", gap: 8 },
  dayTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--color-text-secondary)",
    paddingInline: 4,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-background-surface)",
    overflow: "hidden",
  },
  itemOpen: { borderColor: "var(--color-border-emphasized)" },
  summary: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderWidth: 0,
    backgroundColor: { default: "transparent", ":hover": "var(--color-background-muted)" },
    color: "var(--color-text-primary)",
    fontFamily: "inherit",
    textAlign: "start",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": "2px solid var(--color-border-emphasized)" },
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--color-text-secondary)",
  },
  metaSpacer: { flex: 1 },
  chip: { display: "inline-flex", alignItems: "center", gap: 4 },
  preview: {
    fontSize: 14,
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
  detail: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    paddingInline: 16,
    paddingBottom: 16,
    animationName: "ivibe-rise",
    animationDuration: "var(--motion-small)",
    animationTimingFunction: "var(--motion-ease)",
  },
  text: {
    margin: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "var(--color-background-muted)",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    userSelect: "text",
    maxHeight: 360,
    overflowY: "auto",
  },
  proofGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
  },
  proofItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    textAlign: "start",
    cursor: "zoom-in",
  },
  proofImage: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--color-border)",
    display: "block",
  },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  notice: { flex: 1, minWidth: 0 },
  center: { paddingBlock: 48 },
});

const TABS: { mode: OutputMode; label: string; noun: string; empty: string }[] = [
  {
    mode: "fix",
    label: "Fix",
    noun: "fix prompts",
    empty: "Record a bug in Fix mode and its prompt, with the proof screenshots, is kept here.",
  },
  {
    mode: "prompt",
    label: "Prompt",
    noun: "prompts",
    empty: "Say what you want built in Prompt mode and the prompt is kept here.",
  },
  {
    mode: "dictate",
    label: "Dictate",
    noun: "dictations",
    empty: "Everything you dictate is kept here, cleaned up, so you can paste it again.",
  },
];

function useHistory(): HistoryEntry[] | null {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    void window.ivibe.history.list().then(setEntries);
    return window.ivibe.history.onChange(setEntries);
  }, []);
  return entries;
}

const dayLabel = (time: number) => {
  const date = new Date(time);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

const timeLabel = (time: number) =>
  new Date(time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Entries grouped by day, newest first (the store keeps them in that order). */
function byDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const label = dayLabel(entry.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return [...groups];
}

function Detail({ entry, isMac }: { entry: HistoryEntry; isMac: boolean }) {
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void window.ivibe.history.get(entry.id).then(setDetail);
  }, [entry.id]);

  const paste = acceleratorKeys(PASTE_SHORTCUT, isMac).join(isMac ? "" : "+");
  const previews = detail?.previews ?? [];
  return (
    <div {...stylex.props(styles.detail)}>
      {entry.proof.length > 0 && (
        <div {...stylex.props(styles.proofGrid)}>
          {entry.proof.map((shot, index) =>
            previews[index] ? (
              <button
                key={shot.file}
                type="button"
                title="Open full size"
                {...stylex.props(styles.proofItem)}
                onClick={() => void window.ivibe.history.openProof(entry.id, index)}
              >
                <img src={previews[index]} alt={shot.title} {...stylex.props(styles.proofImage)} />
                <Text color="secondary" size="sm">
                  {index + 1}. {shot.title}
                </Text>
              </button>
            ) : null,
          )}
        </div>
      )}
      <pre {...stylex.props(styles.text)} data-selectable>
        {entry.text}
      </pre>
      <div {...stylex.props(styles.actions)}>
        <Button
          label="Paste again"
          variant="primary"
          size="sm"
          icon={<ClipboardPaste size={14} strokeWidth={2} />}
          onClick={() =>
            void window.ivibe.history
              .reuse(entry.id)
              .then((ok) =>
                setNotice(
                  ok
                    ? `Ready. Click a text field in any app, or press ${paste}.`
                    : "Finish the current recording first.",
                ),
              )
          }
        />
        <Button
          label="Copy"
          variant="secondary"
          size="sm"
          icon={<Copy size={14} strokeWidth={2} />}
          onClick={() => void window.ivibe.history.copy(entry.id).then(() => setNotice("Copied."))}
        />
        <div {...stylex.props(styles.notice)}>
          <Text color="secondary" size="sm">
            {notice}
          </Text>
        </div>
        <Button
          label="Delete"
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} strokeWidth={2} />}
          onClick={() => void window.ivibe.history.remove(entry.id)}
        />
      </div>
    </div>
  );
}

function Item({
  entry,
  isOpen,
  onToggle,
  isMac,
}: {
  entry: HistoryEntry;
  isOpen: boolean;
  onToggle: () => void;
  isMac: boolean;
}) {
  const where = entry.delivery === "pasted" ? `Pasted into ${entry.targetName}` : "Copied";
  return (
    <div {...stylex.props(styles.item, isOpen && styles.itemOpen)}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        {...stylex.props(styles.summary)}
      >
        <span {...stylex.props(styles.meta)}>
          <span>{timeLabel(entry.createdAt)}</span>
          <span>·</span>
          <span>{where}</span>
          <span {...stylex.props(styles.metaSpacer)} />
          {entry.proof.length > 0 && (
            <span {...stylex.props(styles.chip)}>
              <Image size={13} strokeWidth={1.75} />
              {entry.proof.length}
            </span>
          )}
        </span>
        {!isOpen && <span {...stylex.props(styles.preview)}>{entry.text}</span>}
      </button>
      {isOpen && <Detail entry={entry} isMac={isMac} />}
    </div>
  );
}

/** Every result, by mode, kept on this device so it can be read, copied or pasted again. */
export function HistoryPage({
  initialMode,
  isMac,
  onRecord,
}: {
  initialMode: OutputMode;
  isMac: boolean;
  onRecord: () => void;
}) {
  const entries = useHistory();
  const [mode, setMode] = useState<OutputMode>(initialMode);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<OutputMode, number> = { fix: 0, prompt: 0, dictate: 0 };
    for (const entry of entries ?? []) result[entry.mode] += 1;
    return result;
  }, [entries]);

  const tab = TABS.find((candidate) => candidate.mode === mode) ?? TABS[0]!;
  const needle = query.trim().toLowerCase();
  const shown = (entries ?? []).filter(
    (entry) =>
      entry.mode === mode &&
      (!needle ||
        entry.text.toLowerCase().includes(needle) ||
        entry.targetName.toLowerCase().includes(needle)),
  );

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.hero)}>
        <Heading level={1} xstyle={styles.display}>
          History.
          <br />
          <span {...stylex.props(styles.displaySoft)}>Kept on this device.</span>
        </Heading>
      </div>

      <div {...stylex.props(styles.toolbar)}>
        <SegmentedControl
          label="Which results to show"
          value={mode}
          className="ivibe-segments"
          onChange={(value) =>
            transition("mode", () => {
              setMode(value as OutputMode);
              setOpenId(null);
            })
          }
        >
          {TABS.map((entry) => (
            <SegmentedControlItem
              key={entry.mode}
              value={entry.mode}
              label={counts[entry.mode] ? `${entry.label} ${counts[entry.mode]}` : entry.label}
            />
          ))}
        </SegmentedControl>
        {counts[mode] > 0 && (
          <div {...stylex.props(styles.search)}>
            <TextInput
              label="Search"
              isLabelHidden
              placeholder={`Search ${tab.noun}`}
              startIcon={<Search size={16} strokeWidth={1.75} />}
              value={query}
              onChange={setQuery}
              hasClear
              width="100%"
            />
          </div>
        )}
      </div>

      {entries && shown.length === 0 && (
        <div {...stylex.props(styles.center)}>
          <EmptyState
            icon={<History size={28} strokeWidth={1.5} />}
            title={needle ? "Nothing matches" : `No ${tab.noun} yet`}
            description={needle ? `No ${tab.noun} mention “${query.trim()}”.` : tab.empty}
            actions={
              needle ? undefined : (
                <Button label="Start recording" variant="primary" onClick={onRecord} />
              )
            }
          />
        </div>
      )}

      {byDay(shown).map(([day, items]) => (
        <section key={day} {...stylex.props(styles.day)}>
          <span {...stylex.props(styles.dayTitle)}>{day}</span>
          {items.map((entry) => (
            <Item
              key={entry.id}
              entry={entry}
              isMac={isMac}
              isOpen={openId === entry.id}
              onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
