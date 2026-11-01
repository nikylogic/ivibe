// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import type { ThemeMode } from "@astryxdesign/core/theme";
import { ArrowLeft } from "lucide-react";
import { TONES } from "./demo/voice.ts";
import { Footer } from "./finale.tsx";
import { TopBar } from "./home.tsx";
import { Nav } from "./nav.tsx";
import { REPO } from "./release.ts";
import { ivibeTheme } from "./theme.ts";

/**
 * The blog: a few posts, each worth reading. No tags, share buttons or pop-ups. A post's cover is
 * the hero's waveform written in that post's own title, so nothing here is a stock picture.
 */

/** StyleX can only read constants defined in this file. */
const MONO = '"Cascadia Code", "SF Mono", Menlo, Consolas, monospace';
const SERIF = '"Instrument Serif", Georgia, serif';
const FAINT_LINE = "color-mix(in srgb, var(--color-text-primary) 10%, transparent)";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--color-background-surface)",
    color: "var(--color-text-primary)",
  },
  list: {
    maxWidth: 1040,
    marginInline: "auto",
    paddingInline: { default: 32, "@media (max-width: 640px)": 16 },
    paddingTop: { default: 136, "@media (max-width: 760px)": 104 },
    paddingBottom: 96,
  },
  listTitle: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: "clamp(44px, 6vw, 72px)",
    lineHeight: 1,
    letterSpacing: "-0.015em",
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 760px)": "minmax(0, 1fr)",
    },
    gap: 40,
    marginTop: 56,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "inherit",
    textDecoration: "none",
    opacity: { default: 1, ":hover": 0.82 },
    transitionProperty: "opacity",
    transitionDuration: "180ms",
  },
  cardTitle: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: 30,
    lineHeight: 1.12,
    letterSpacing: "-0.005em",
    margin: 0,
    marginTop: 10,
  },
  cover: {
    display: "block",
    width: "100%",
    aspectRatio: "16 / 8",
    borderRadius: 17,
    backgroundColor: "#0f0e0d",
  },
  article: {
    maxWidth: 680,
    marginInline: "auto",
    paddingInline: { default: 24, "@media (max-width: 640px)": 16 },
    paddingTop: { default: 112, "@media (max-width: 760px)": 92 },
    paddingBottom: 88,
  },
  back: { marginInlineStart: -8, marginBottom: 28 },
  title: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: "clamp(38px, 5.4vw, 56px)",
    lineHeight: 1.04,
    letterSpacing: "-0.015em",
    margin: 0,
    marginTop: 10,
  },
  lead: { display: "block", fontSize: 19, lineHeight: 1.5, marginTop: 16, marginBottom: 32 },
  body: { display: "flex", flexDirection: "column", gap: 18, marginTop: 36 },
  p: { display: "block", fontSize: 17, lineHeight: 1.7 },
  h2: {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: 31,
    lineHeight: 1.15,
    margin: 0,
    marginTop: 22,
  },
  figure: { margin: 0, marginBlock: 8, display: "flex", flexDirection: "column", gap: 10 },
  // Dark in both themes, like the app's own pill.
  screen: {
    borderRadius: 14,
    backgroundColor: "#0f0e0d",
    color: "#f4f1ea",
    padding: { default: 22, "@media (max-width: 640px)": 14 },
    fontFamily: MONO,
    fontSize: { default: 13.5, "@media (max-width: 640px)": 11.5 },
    lineHeight: 2,
    overflowX: "auto",
  },
  dim: { opacity: 0.55 },
  painted: {
    display: "inline-block",
    verticalAlign: "-0.15em",
    height: "1.15em",
    width: "15ch",
    backgroundColor: "#000",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.16)",
  },
  proof: {
    position: "relative",
    aspectRatio: "16 / 8",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#16110f",
    color: "#f4f1ea",
    fontFamily: "system-ui, sans-serif",
  },
  proofHeader: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingBlock: 5,
    paddingInline: 10,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: "#ff4f2e",
  },
  proofForm: {
    position: "absolute",
    left: "24%",
    right: "24%",
    top: "26%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    opacity: 0.32,
  },
  proofField: { height: 26, borderRadius: 6, backgroundColor: "rgba(255, 255, 255, 0.24)" },
  proofButton: {
    position: "absolute",
    left: "24%",
    top: "64%",
    height: 34,
    width: "20%",
    minWidth: 76,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    color: "#101010",
    backgroundColor: "#f4f1ea",
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: "#ff4f2e",
    outlineOffset: 3,
  },
  proofCaption: {
    position: "absolute",
    left: "calc(24% + max(20%, 76px) + 14px)",
    top: "65%",
    paddingBlock: 5,
    paddingInline: 9,
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    backgroundColor: "#ff4f2e",
  },
  steps: {
    margin: 0,
    paddingInlineStart: 22,
    listStyleType: "decimal",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontSize: 17,
    lineHeight: 1.7,
  },
  end: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    marginTop: 44,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: FAINT_LINE,
  },
  code: { fontFamily: MONO, fontSize: "0.9em" },
});

function P({ children }: { children: ReactNode }) {
  return <Text xstyle={styles.p}>{children}</Text>;
}

function H2({ children }: { children: ReactNode }) {
  return (
    <Heading level={2} xstyle={styles.h2}>
      {children}
    </Heading>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code {...stylex.props(styles.code)}>{children}</code>;
}

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure {...stylex.props(styles.figure)}>
      {children}
      <figcaption>
        <Text size="sm" color="secondary">
          {caption}
        </Text>
      </figcaption>
    </figure>
  );
}

const GH = `https://github.com/${REPO}`;

const REDACTED_TYPE = `/** The only frame type that encoders, the bundle writer and uploaders accept. */
export interface RedactedFrame {
  readonly image: ImageBitmap;
  readonly boxes: readonly Redaction[];
  readonly [brand]: true;
}

/** Encoders call this too, so a type cast can't smuggle in a raw frame. */
export function assertRedacted(frame: object): asserts frame is RedactedFrame {
  if (!issued.has(frame)) throw new Error("unredacted frame");
}`;

type Post = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  tone: keyof typeof TONES;
  source: string;
  body: ReactNode;
};

const POSTS: Post[] = [
  {
    slug: "how-ivibe-hides-your-secrets",
    title: "How iVibe hides your secrets before anything leaves your computer",
    summary:
      "A developer's screen is full of keys. Here's how they get painted over first, and how the code makes skipping that step hard.",
    date: "November 1, 2026",
    tone: "Dictate",
    source: `${GH}/tree/main/packages/redact`,
    body: (
      <>
        <P>
          Fix records your screen, and a developer&apos;s screen is a dangerous thing to record.
          There&apos;s a token in the terminal, a <C>.env</C> file in the next tab, and a password
          manager one click away. If iVibe sent those frames to a model as they are, your secrets
          would leave with them.
        </P>
        <P>So every frame is cleaned on your computer first. Here&apos;s how.</P>

        <H2>Read the screen on your device</H2>
        <P>
          Each frame iVibe keeps goes through OCR that runs locally, using PP-OCRv5. This turns the
          pixels into lines of text with positions, so iVibe knows what is on screen and where,
          without sending anything anywhere.
        </P>

        <H2>Look for the shape of a secret</H2>
        <P>
          OCR makes mistakes. It reads <C>l</C> as <C>1</C>, <C>O</C> as <C>0</C>, and sometimes{" "}
          <C>_</C> as a space. So the rules describe what a secret looks like, not its exact
          characters, and they run in layers:
        </P>
        <ol {...stylex.props(styles.steps)}>
          <li>
            <strong>Known formats:</strong> Meta, Anthropic, OpenAI, AWS, GitHub, Google, Stripe and
            Slack keys, JWTs and private keys.
          </li>
          <li>
            <strong>Assignments:</strong> anything like <C>password=</C> or <C>api_key:</C>. The
            value is hidden and the name stays, so the prompt still makes sense.
          </li>
          <li>
            <strong>
              Lines from a <C>.env</C> file
            </strong>{" "}
            and connection strings.
          </li>
          <li>
            <strong>Random-looking text:</strong> some keys have no fixed prefix, so long strings
            with high entropy are hidden too.
          </li>
          <li>
            <strong>Password managers:</strong> if one is on screen, the whole frame is blacked out.
          </li>
        </ol>

        <H2>Paint, don&apos;t blur</H2>
        <P>
          Blur keeps some of the original information, and blurred text can sometimes be recovered.
          iVibe paints a solid black box onto a copy of the image, so those pixels are gone from
          anything that gets sent.
        </P>
        <Figure caption="An illustration: the name stays, the value is gone.">
          <div {...stylex.props(styles.screen)}>
            <div>
              <span {...stylex.props(styles.dim)}>$</span> npm run deploy
            </div>
            <div>
              <span {...stylex.props(styles.dim)}>$</span> export GITHUB_TOKEN=
              <span {...stylex.props(styles.painted)} />
            </div>
            <div>
              <span {...stylex.props(styles.dim)}>Error:</span> deploy failed at step 3
            </div>
          </div>
        </Figure>
        <P>
          The text gets the same treatment. Each secret character in the OCR lines becomes a dot, so
          the words sent alongside the image are safe too. When you edit selected text by voice, a
          secret becomes a placeholder like <C>[[secret-1]]</C>, and the original is put back on
          your computer afterwards.
        </P>

        <H2>Make forgetting hard</H2>
        <P>
          A rule like “always redact first” only holds until someone forgets, so iVibe&apos;s code
          enforces it in two ways. Encoders and uploaders only accept a <C>RedactedFrame</C>, and
          only the redaction package can create one, so passing a raw frame fails to compile. A type
          cast could still get around that, so the frames that package creates are also recorded at
          runtime, and encoders check that record before touching a frame.
        </P>
        <CodeBlock code={REDACTED_TYPE} language="typescript" hasCopyButton isWrapped />
        <P>
          Raw frames also stay in memory and are never written to disk. And the app&apos;s self-test
          plants a GitHub token on screen and fails if it isn&apos;t painted over.
        </P>

        <H2>What it can&apos;t promise</H2>
        <P>
          This is automatic, and it can miss things. It looks for secrets, so a private message or a
          customer&apos;s name on screen isn&apos;t hidden. Keep anything you&apos;d never share off
          screen while you record.
        </P>
      </>
    ),
  },
  {
    slug: "from-its-broken-to-proof",
    title: "From “it's broken” to proof",
    summary:
      "How a voice note and a screen recording become a prompt your coding agent can act on, with screenshots marked up to show the bug.",
    date: "November 1, 2026",
    tone: "Fix",
    source: `${GH}/blob/main/apps/desktop/src/main/compose.ts`,
    body: (
      <>
        <P>
          “It&apos;s broken” is the most honest bug report there is, and the least useful. Your
          coding agent can&apos;t see your screen, so you end up typing out what you can already
          see. Fix mode turns showing and telling into a prompt. Here&apos;s what happens between
          the two presses of the shortcut.
        </P>

        <H2>Listen and watch</H2>
        <P>
          While you talk, Muse Voice Transcribe writes the captions and the transcript. At the same
          time, iVibe picks out the moments on screen worth keeping. It sends a small set of
          keyframes rather than the whole video, and each one is{" "}
          <Link hasUnderline href="/blog/how-ivibe-hides-your-secrets">
            redacted on your computer
          </Link>{" "}
          first.
        </P>

        <H2>Write the prompt and pick the proof</H2>
        <P>
          One call to Muse Spark 1.3 reads your narration, the redacted frames and their text. It
          returns two things: the prompt, and which frames prove the bug, with a rough box around
          what matters in each.
        </P>
        <P>
          That prompt is built from layers: fixed rules, the mode, the app you&apos;re pasting into,
          and what you&apos;ve told iVibe about yourself.
        </P>

        <H2>Snap to the real element</H2>
        <P>
          A language model&apos;s boxes are approximate, and a highlight that&apos;s slightly off
          looks wrong. So each box goes to SAM 3.1, which fits it to the actual button or error
          message. If SAM doesn&apos;t answer in time, iVibe keeps the original box, because a rough
          highlight is better than no result.
        </P>

        <H2>Mark up the screenshot</H2>
        <P>
          The final image is drawn on your computer. Everything outside the highlight is dimmed,
          each highlight gets an outline and a numbered caption, and a header says when it happened
          and what it proves.
        </P>
        <Figure caption="An illustration of the style: what matters stands out, and the rest steps back.">
          <div {...stylex.props(styles.proof)} aria-hidden="true">
            <div {...stylex.props(styles.proofHeader)}>0:07 · Save does nothing</div>
            <div {...stylex.props(styles.proofForm)}>
              <div {...stylex.props(styles.proofField)} />
              <div {...stylex.props(styles.proofField)} />
            </div>
            <div {...stylex.props(styles.proofButton)}>Save</div>
            <div {...stylex.props(styles.proofCaption)}>1 No response on click</div>
          </div>
        </Figure>

        <H2>Paste it where you were</H2>
        <P>
          The result goes back into the app you started in, with each screenshot right after the
          sentence about it. Chat apps and Claude Code get real images, and other terminal agents
          get file paths. If you switched apps while it worked, the result waits on your clipboard
          rather than landing in the wrong window.
        </P>
        <P>
          In our tests the whole trip took about 13 seconds with the standard model, and about 23 to
          32 seconds on free credits. iVibe doesn&apos;t fix the bug. It gets your agent to the
          right place with evidence, so the fix can start from what happened and not from a guess.
        </P>
      </>
    ),
  },
];

/** The waveform in a post's own title, drawn once: dense in the middle, gone by the corners. */
function Cover({ post }: { post: Post }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const letters = post.title.toLowerCase().replace(/[^a-z]/g, "");
    const paint = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const cellW = 8;
      const cellH = 13;
      context.font = `500 10px ${MONO}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const columns = Math.floor(width / cellW);
      for (let column = 0; column < columns; column++) {
        if (column % 4 === 3) continue;
        const fine = Math.floor(column / 4);
        const across = (column / (columns - 1)) * 2 - 1;
        const lens = (1 - across * across) ** 0.9;
        const voiced =
          0.52 +
          0.26 * Math.sin(fine * 0.42 + letters.length) +
          0.22 * (0.5 + 0.5 * Math.sin(fine * 12.9898));
        const rows = Math.floor(((height / 2) * 0.86 * lens * voiced) / cellH);
        for (let row = -rows; row <= rows; row++) {
          const along = rows ? Math.abs(row) / rows : 1;
          const glyph =
            along > 0.88
              ? "."
              : along > 0.72
                ? ":"
                : letters[Math.abs(column * 29 + row * 7) % letters.length]!;
          const band = Math.sin(fine * 0.3 - row * 0.05 + letters.length) > 0.8;
          context.fillStyle = band ? `rgb(${TONES[post.tone]})` : "#f4f1ea";
          context.globalAlpha = band ? 0.75 : 0.5 * (1 - along * along * 0.65);
          context.fillText(
            glyph,
            column * cellW + cellW / 2 + (width - columns * cellW) / 2,
            height / 2 + row * cellH,
          );
        }
      }
      context.globalAlpha = 1;
    };
    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(element);
    void document.fonts.ready.then(paint);
    return () => watch.disconnect();
  }, [post]);
  return <canvas ref={canvas} aria-hidden="true" {...stylex.props(styles.cover)} />;
}

function PostList() {
  useEffect(() => {
    document.title = "Blog · iVibe";
  }, []);
  return (
    <main {...stylex.props(styles.list)}>
      <Heading level={1} xstyle={styles.listTitle}>
        Blog
      </Heading>
      <div {...stylex.props(styles.grid)}>
        {POSTS.map((post) => (
          <article key={post.slug}>
            <a href={`/blog/${post.slug}`} {...stylex.props(styles.card)}>
              <Cover post={post} />
              <Heading level={2} xstyle={styles.cardTitle}>
                {post.title}
              </Heading>
              <Text color="secondary">{post.summary}</Text>
              <Text size="sm" color="secondary">
                {post.date}
              </Text>
            </a>
          </article>
        ))}
      </div>
    </main>
  );
}

function PostPage({ post }: { post: Post }) {
  useEffect(() => {
    document.title = `${post.title} · iVibe`;
    window.scrollTo(0, 0);
  }, [post]);
  return (
    <main {...stylex.props(styles.article)}>
      <div {...stylex.props(styles.back)}>
        <Button
          label="Blog"
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />}
          href="/blog"
        />
      </div>
      <Text size="sm" color="secondary">
        {post.date}
      </Text>
      <Heading level={1} xstyle={styles.title}>
        {post.title}
      </Heading>
      <Text color="secondary" xstyle={styles.lead}>
        {post.summary}
      </Text>
      <Cover post={post} />
      <div {...stylex.props(styles.body)}>{post.body}</div>
      <div {...stylex.props(styles.end)}>
        <Button label="Download iVibe" variant="primary" href="/download" />
        <Link href={post.source}>Read the code</Link>
      </div>
    </main>
  );
}

export function BlogPage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}) {
  const slug = window.location.pathname.replace(/\/+$/, "").replace(/^\/blog\/?/, "");
  const post = POSTS.find((item) => item.slug === slug);
  return (
    <div {...stylex.props(styles.page)}>
      <Theme theme={ivibeTheme} mode={mode}>
        <TopBar mode={mode} onModeChange={onModeChange} />
      </Theme>
      <Nav page="blog" />
      {post ? <PostPage post={post} /> : <PostList />}
      <Footer mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
