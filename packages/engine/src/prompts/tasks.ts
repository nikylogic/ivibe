// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Layer 2 of the prompt stack (docs/vibes-and-prompts.md §4.2): the instructions for each
 * built-in mode. With Vibes these become the built-in vibes' bodies.
 */

import { languageRule } from "../languages.ts";
import type { OutputLanguage } from "../languages.ts";

export function dictateTask(language: OutputLanguage): string {
  return `Task: clean up dictated speech so it can be pasted as the user's own writing.
- Remove filler words (um, uh, like, you know, basically, so yeah), false starts, stutters and repeated words.
- Fix punctuation, capitalization and obvious transcription mistakes, especially names and technical terms.
- When the speaker corrects themselves ("no wait, I mean…", "actually, make that…"), keep only the correction.
- When they list things, format a short list. When they cover several topics, use paragraphs.
- Keep their wording, tone and meaning. Do not summarize, formalize, answer or add anything.
- ${languageRule(language)}`;
}

/**
 * Dictate with text selected in the app in front: the speech is either an instruction about the
 * selection or new words to put in its place.
 */
export function editTask(language: OutputLanguage): string {
  return `Task: the user selected text in another app and then spoke. Your answer replaces the selection.

First decide, without writing it down, what they want:
- An instruction about the selected text ("make this more formal", "fix the grammar", "shorten it", "turn this into bullets", "translate to Hindi"): apply it to the text in <selection> and return the changed text.
- New words meant to replace the selection (they simply dictated): return their words, cleaned up as dictation: no filler words, false starts or stutters, and only the final version of anything they corrected.

How to write it:
- Change only what the instruction asks for. Keep the meaning, facts, names, numbers, links, code and formatting (line breaks, lists, markdown) of everything else.
- Keep the language of the selected text unless they ask for another one. For new words: ${languageRule(language).replace(/^./, (c) => c.toLowerCase())}
- Placeholders such as [[secret-1]] stand for hidden values. Keep each one exactly as written, where it belongs.
- Return only the replacement text.`;
}

export function promptTask(targetName: string, language: OutputLanguage): string {
  return `Task: turn what a developer said into a prompt they will paste into ${targetName}, so an AI agent can act on it without asking follow-up questions.

First decide, without writing it down, what they want:
- A bug (something is broken). Write: one line saying what is broken. "What happens:" the steps and the observed behavior as they described it. "Expected:" what should happen, if they said it. Then ask the agent to find the root cause, fix it and say how it verified the fix.
- A feature or change. Write: the goal as one imperative sentence, then each requirement as a short "-" bullet (one idea per bullet, never repeating the goal), then any constraints they mentioned (libraries, files, things not to touch).
- A question. Write the question clearly, with the context they gave.
- A mix. Lead with the main intent and fold the rest in.

How to write it:
- Write as the user talking to the agent. Their observations stay observations in the first person ("When I click Save, nothing happens"); only what they ask for becomes an instruction. Never turn a description of what they did into a command ("- Place me on the settings page" is wrong).
- Apply their self-corrections and keep only the final decision. Drop filler and chatter.
- Keep every concrete detail: names, values, file names, error text, and what they already tried.
- Never invent requirements, files or causes. If they guessed a cause, keep it as their guess.
- ${languageRule(language)}
- Plain text with "-" bullets. No headings and no bold. Do not label the intent.

Example. They said: "okay so on the settings page uh when I toggle dark mode it like flashes white for a second before going dark, it should just switch, I think it's the theme provider"
You write:
Dark mode flashes white before switching on the settings page.

What happens:
- When I toggle dark mode on the settings page, the page flashes white for about a second before it turns dark.

Expected:
- The theme switches straight away, with no flash.

I suspect the theme provider. Find the root cause, fix it and tell me how you verified the fix.

Example. They said: "add a export button to the reports table, CSV, no wait, both CSV and excel, and put it next to the filter dropdown, use the existing button component"
You write:
Add an export button to the reports table.
- Export to CSV and Excel.
- Place it next to the filter dropdown.
- Use the existing Button component.`;
}

export function fixTask(targetName: string, proof: boolean, language: OutputLanguage): string {
  return `Task: you watch a short screen recording of a bug, with the developer's narration, and write the prompt they will paste into ${targetName} so the agent can fix it.
You get redacted keyframes in time order (secrets are painted black), each with its size and its OCR lines (id: text), and the narration with timestamps.

Write "prompt":
1. One line: what is broken, in the user's terms.
2. "What happens:" the steps and what the screen shows, in the first person as the user ("When I click Save, nothing happens"). Quote each error message once, in full, on its own line. Cite URLs, status codes, file names and line numbers only if they are visible in a frame.
3. "Expected:" what should happen, from the narration.
4. "Likely cause:" your best hypothesis and why, labelled as a hypothesis, with where to look first and how sure you are.
5. A closing line asking the agent to find the root cause, fix it and say how it verified the fix.
Plain text, short sections, "-" bullets. Do not mention screenshots; they are added after the prompt.
${languageRule(language)}
${
  proof
    ? `Then choose "proof": 1 to 3 frames, in time order, that together prove the bug to someone who did not see the recording (typically the action, then the failure or error). For each frame:
- "frame_id" and a "title" of at most 10 words saying what this screenshot proves.
- 1 or 2 "marks" pointing at the evidence, each with a "caption" of at most 6 words ("Clicked Save", "TypeError in saveProfile"). Mark text by listing its OCR "line_ids" (consecutive lines of one message together) and set "box" to [0,0,0,0]. Mark a UI element without text (an icon, a spinner, an empty area) with "line_ids": [] and a "box" [x1,y1,x2,y2] in that frame's pixels, a little larger than the element.`
    : `Set "proof" to [].`
}`;
}
