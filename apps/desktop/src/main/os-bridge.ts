// SPDX-License-Identifier: AGPL-3.0-only

import { execFile, spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { promisify } from "node:util";

/**
 * Finds the focused app and sends it a paste keystroke (docs/architecture.md D20), using tools
 * every OS ships instead of native modules (D15): user32 through PowerShell on Windows,
 * System Events through osascript on macOS, and xdotool on Linux X11. Every call fails soft:
 * without detection or paste, the result is copied for the user to paste.
 */

const run = promisify(execFile);

export interface FocusedWindow {
  process: string;
  title: string;
  /** An OS window or process handle, used to check focus again and to paste. */
  handle: string;
}

// ---------------------------------------------------------------------------------------------
// Windows: one long-lived PowerShell process that answers a line per command, so each call takes
// milliseconds instead of PowerShell's ~400 ms start-up.

const WINDOWS_HELPER = String.raw`
$ProgressPreference = 'SilentlyContinue'
Add-Type -Namespace IVibe -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
'@
$uia = $false
try { Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes; $uia = $true } catch {}
function Describe($h) {
  $p = 0
  [void][IVibe.Win32]::GetWindowThreadProcessId($h, [ref]$p)
  $sb = New-Object System.Text.StringBuilder 512
  [void][IVibe.Win32]::GetWindowText($h, $sb, 512)
  $name = ''
  try { $name = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}
  return @{ process = $name; title = $sb.ToString(); handle = [string][int64]$h }
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    if ($line -eq 'focused') {
      $out = Describe ([IVibe.Win32]::GetForegroundWindow())
    } elseif ($line -eq 'field') {
      # The focused window, whether the left button is down or was clicked since the last
      # call, and whether keyboard focus is in a text field (UI Automation).
      $out = Describe ([IVibe.Win32]::GetForegroundWindow())
      $state = [IVibe.Win32]::GetAsyncKeyState(1)
      $out.down = ($state -band 0x8000) -ne 0
      $out.clicked = ($state -band 1) -ne 0
      $out.editable = $false
      if ($uia) {
        try {
          $c = [System.Windows.Automation.AutomationElement]::FocusedElement.Current
          $type = $c.ControlType.ProgrammaticName
          $out.editable = ($type -eq 'ControlType.Edit' -or $type -eq 'ControlType.Document') -and -not $c.IsPassword -and $c.IsEnabled
        } catch {}
      }
    } elseif ($line -match '^paste (\d+) (ctrl|alt)$') {
      $target = [System.IntPtr][int64]$Matches[1]
      if ([IVibe.Win32]::GetForegroundWindow() -ne $target) {
        [void][IVibe.Win32]::SetForegroundWindow($target)
        Start-Sleep -Milliseconds 120
      }
      $focused = [IVibe.Win32]::GetForegroundWindow() -eq $target
      if ($focused) {
        # Release modifiers the shortcut may have left down, then Ctrl+V (Alt+V: image into Claude Code).
        foreach ($vk in 0x10, 0x11, 0x12, 0x5B) { [IVibe.Win32]::keybd_event($vk, 0, 2, [System.UIntPtr]::Zero) }
        $modifier = if ($Matches[2] -eq 'alt') { 0x12 } else { 0x11 }
        [IVibe.Win32]::keybd_event($modifier, 0, 0, [System.UIntPtr]::Zero)
        [IVibe.Win32]::keybd_event(0x56, 0, 0, [System.UIntPtr]::Zero)
        [IVibe.Win32]::keybd_event(0x56, 0, 2, [System.UIntPtr]::Zero)
        [IVibe.Win32]::keybd_event($modifier, 0, 2, [System.UIntPtr]::Zero)
      }
      $out = @{ pasted = $focused }
    } else {
      $out = @{ error = 'unknown command' }
    }
  } catch {
    $out = @{ error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

class WindowsHelper {
  #child: ChildProcessWithoutNullStreams | null = null;
  #buffer = "";
  #waiting: ((line: string | null) => void)[] = [];
  #queue: Promise<unknown> = Promise.resolve();

  #start(): ChildProcessWithoutNullStreams {
    if (this.#child && this.#child.exitCode === null) return this.#child;
    const encoded = Buffer.from(WINDOWS_HELPER, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { windowsHide: true },
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.#buffer += chunk;
      let newline: number;
      while ((newline = this.#buffer.indexOf("\n")) >= 0) {
        const line = this.#buffer.slice(0, newline).trim();
        this.#buffer = this.#buffer.slice(newline + 1);
        if (line.startsWith("{")) this.#waiting.shift()?.(line);
      }
    });
    child.on("exit", () => {
      for (const resolve of this.#waiting.splice(0)) resolve(null);
      this.#child = null;
    });
    this.#child = child;
    return child;
  }

  /** Sends one command and waits for its JSON line; commands run one at a time. */
  request<T>(command: string, timeoutMs = 4000): Promise<T | null> {
    const next = this.#queue.then(
      () =>
        new Promise<T | null>((resolve) => {
          const child = this.#start();
          const timer = setTimeout(() => {
            this.#waiting = this.#waiting.filter((waiter) => waiter !== done);
            resolve(null);
          }, timeoutMs);
          const done = (line: string | null) => {
            clearTimeout(timer);
            try {
              resolve(line ? (JSON.parse(line) as T) : null);
            } catch {
              resolve(null);
            }
          };
          this.#waiting.push(done);
          child.stdin.write(`${command}\n`);
        }),
    );
    this.#queue = next;
    return next;
  }

  /** Starts PowerShell ahead of the first recording, so detection is instant. */
  warmUp(): void {
    void this.request("focused", 10_000);
  }

  dispose(): void {
    this.#child?.kill();
  }
}

const windows = process.platform === "win32" ? new WindowsHelper() : null;

// ---------------------------------------------------------------------------------------------

async function macFocused(): Promise<FocusedWindow | null> {
  const script = [
    'tell application "System Events"',
    "set p to first application process whose frontmost is true",
    'set t to ""',
    "try",
    "set t to name of front window of p",
    "end try",
    'return (name of p) & "\\n" & (unix id of p) & "\\n" & t',
    "end tell",
  ];
  const { stdout } = await run(
    "osascript",
    script.flatMap((line) => ["-e", line]),
    {
      timeout: 3000,
    },
  );
  const [name = "", pid = "", title = ""] = stdout.trimEnd().split("\n");
  return { process: name, title, handle: pid };
}

async function linuxFocused(): Promise<FocusedWindow | null> {
  const { stdout: id } = await run("xdotool", ["getactivewindow"], { timeout: 2000 });
  const handle = id.trim();
  const [{ stdout: title }, { stdout: pid }] = await Promise.all([
    run("xdotool", ["getwindowname", handle], { timeout: 2000 }),
    run("xdotool", ["getwindowpid", handle], { timeout: 2000 }),
  ]);
  const comm = await readFile(`/proc/${pid.trim()}/comm`, "utf8").catch(() => "");
  return { process: comm.trim(), title: title.trim(), handle };
}

/** The window that has focus right now, or null when the OS can't tell us. */
export async function focusedWindow(): Promise<FocusedWindow | null> {
  try {
    if (windows) return await windows.request<FocusedWindow>("focused");
    if (process.platform === "darwin") return await macFocused();
    if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY) return await linuxFocused();
  } catch {
    // No accessibility permission, no xdotool, …: fall back to copying.
  }
  return null;
}

export interface FieldState extends FocusedWindow {
  /** The left mouse button is down now. */
  down: boolean;
  /** It was pressed since the previous call. */
  clicked: boolean;
  /** Keyboard focus is in a text field (not a password field). */
  editable: boolean;
}

/**
 * Where the user is typing, for click-to-paste. Windows only: it needs UI Automation, and
 * elsewhere the "paste last result" shortcut does the job.
 */
export async function fieldState(): Promise<FieldState | null> {
  if (!windows) return null;
  try {
    return await windows.request<FieldState>("field");
  } catch {
    return null;
  }
}

/**
 * What is being pasted where: text into an app, text into a terminal, or an image into Claude
 * Code, which reads the clipboard image on its own shortcut (Alt+V on Windows, Ctrl+V elsewhere).
 */
export type PasteKind = "text" | "terminal-text" | "terminal-image";

/**
 * Focuses the target window if needed and sends the platform's paste shortcut.
 * Returns false when the keystroke couldn't be delivered to that window.
 */
export async function pasteInto(target: FocusedWindow, kind: PasteKind): Promise<boolean> {
  try {
    if (windows) {
      const modifier = kind === "terminal-image" ? "alt" : "ctrl";
      const result = await windows.request<{ pasted?: boolean }>(
        `paste ${target.handle} ${modifier}`,
      );
      return result?.pasted === true;
    }
    if (process.platform === "darwin") {
      await run(
        "osascript",
        [
          "-e",
          `tell application "System Events" to set frontmost of (first process whose unix id is ${Number(target.handle)}) to true`,
          "-e",
          "delay 0.1",
          "-e",
          `tell application "System Events" to keystroke "v" using ${kind === "terminal-image" ? "control" : "command"} down`,
        ],
        { timeout: 4000 },
      );
      return true;
    }
    if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY) {
      await run(
        "xdotool",
        [
          "windowactivate",
          "--sync",
          target.handle,
          "key",
          "--clearmodifiers",
          // Linux terminals paste text with Ctrl+Shift+V; Ctrl+V goes to the app (Claude Code's
          // image paste).
          kind === "terminal-text" ? "ctrl+shift+v" : "ctrl+v",
        ],
        { timeout: 4000 },
      );
      return true;
    }
  } catch {
    // Fall through to copy.
  }
  return false;
}

/** Whether a focused window belongs to iVibe itself (its HUD or main window). */
export function isOwnWindow(window: FocusedWindow): boolean {
  const ours = basename(process.execPath, extname(process.execPath)).toLowerCase();
  return window.process.toLowerCase() === ours;
}

export function warmUpOsBridge(): void {
  windows?.warmUp();
}

export function disposeOsBridge(): void {
  windows?.dispose();
}
