/**
 * Host half of the screenshot bundle.
 *
 * Serves two exact Fetch routes under `/api` that the composer button calls:
 * `capture` grabs the whole virtual screen (optionally minimizing the Harness
 * window first) and returns the PNG as a data URL; `settings` reads and writes
 * the persisted minimize preference.
 *
 * The grab runs in a tiny .NET helper compiled once from `HELPER_SOURCE` with
 * the framework's own `csc.exe` and cached under the Harness home. Launching
 * that helper costs a few hundred milliseconds instead of the seconds a fresh
 * `powershell.exe` startup costs. When no compiler is available the old
 * PowerShell path remains as a slow but working fallback.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Package-private API surface used by the Client half. */
const ROUTE_ROOT = '/api/dsh-screenshot'
/** Persisted preference and compiled-helper cache live here. */
const STATE_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'screenshot-plugin')
const SETTINGS_PATH = join(STATE_DIR, 'settings.json')
/** Bump when `HELPER_SOURCE` changes so a stale executable is rebuilt. */
const HELPER_VERSION = 5
const HELPER_PATH = join(STATE_DIR, 'bin', `dsh-shot-v${HELPER_VERSION}.exe`)
/** Refuse responses larger than this so a pathological screen cannot wedge the page. */
const MAX_IMAGE_BYTES = 24 * 1024 * 1024
/** Wall-clock budget for one capture, including the interactive selection. */
const CAPTURE_TIMEOUT_MS = 120_000
/** Extra pause after the window reports minimized, covering the minimize animation. */
const SETTLE_MS = 120

/** .NET console helper: minimize, grab, restore, report one JSON result. */
const HELPER_SOURCE = String.raw`
﻿using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class DshShot
{
    private const int WM_SYSCOMMAND = 0x0112;
    private const int SC_MINIMIZE = 0xF020;
    private const int SC_RESTORE = 0xF120;
    private const int SW_RESTORE = 9;

    private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassNameW(IntPtr hWnd, StringBuilder name, int length);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    private static extern bool PostMessageW(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    internal static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    private static List<IntPtr> FindHarnessWindows()
    {
        var found = new List<IntPtr>();
        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            var cls = new StringBuilder(256);
            GetClassNameW(hWnd, cls, 256);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;
            var title = new StringBuilder(1024);
            GetWindowTextW(hWnd, title, 1024);
            if (!title.ToString().EndsWith("DeepSeek Harness", StringComparison.Ordinal)) return true;
            found.Add(hWnd);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool WaitUntil(Func<bool> condition, int timeoutMs)
    {
        var started = Environment.TickCount;
        while (Environment.TickCount - started < timeoutMs)
        {
            if (condition()) return true;
            Thread.Sleep(15);
        }
        return condition();
    }

    private static void RestoreWindows(List<IntPtr> windows)
    {
        foreach (var hWnd in windows)
        {
            PostMessageW(hWnd, WM_SYSCOMMAND, (IntPtr)SC_RESTORE, IntPtr.Zero);
            if (!WaitUntil(() => !IsIconic(hWnd), 400)) ShowWindow(hWnd, SW_RESTORE);
            BringWindowToTop(hWnd);
            SetForegroundWindow(hWnd);
            SwitchToThisWindow(hWnd, true);
        }
    }

    private static string Escape(string value)
    {
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
    }

    private static void WriteResult(string path, string json)
    {
        try
        {
            File.WriteAllText(path, json, new UTF8Encoding(false));
        }
        catch
        {
            // Nothing else can be reported.
        }
    }

    private static Bitmap CaptureScreen()
    {
        var screen = SystemInformation.VirtualScreen;
        var bitmap = new Bitmap(screen.Width, screen.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(screen.X, screen.Y, 0, 0, bitmap.Size, CopyPixelOperation.SourceCopy);
        }
        return bitmap;
    }

    [STAThread]
    private static int Main(string[] args)
    {
        // Mark the process DPI-aware before any metric, DC, or window is created:
        // otherwise Windows virtualizes the desktop and the frozen image appears magnified.
        try
        {
            SetProcessDPIAware();
        }
        catch
        {
            // Older systems keep the virtualized behavior.
        }

        // args: <mode> <pngPath> <resultPath> [settleMs] [lang]
        var mode = args.Length > 0 ? args[0] : "minimize";
        var pngPath = args.Length > 1 ? args[1] : Path.Combine(Path.GetTempPath(), "dsh-shot.png");
        var resultPath = args.Length > 2 ? args[2] : pngPath + ".json";
        var settle = 120;
        if (args.Length > 3) int.TryParse(args[3], out settle);
        var lang = args.Length > 4 && args[4] == "en" ? "en" : "zh";

        var minimized = new List<IntPtr>();
        Bitmap keep = null;
        Bitmap clear = null;
        try
        {
            var handles = FindHarnessWindows();
            var visible = false;
            foreach (var hWnd in handles)
            {
                if (!IsIconic(hWnd)) visible = true;
            }
            // Both variants are captured in one session: the window as it stands,
            // and the window minimized. The picker switches between them, so the
            // Harness UI itself can be selected as well as anything behind it.
            keep = CaptureScreen();
            if (visible)
            {
                foreach (var hWnd in handles)
                {
                    if (IsIconic(hWnd)) continue;
                    PostMessageW(hWnd, WM_SYSCOMMAND, (IntPtr)SC_MINIMIZE, IntPtr.Zero);
                    if (WaitUntil(() => IsIconic(hWnd), 400)) minimized.Add(hWnd);
                }
                if (minimized.Count > 0) Thread.Sleep(settle);
                clear = CaptureScreen();
                RestoreWindows(minimized);
                minimized.Clear();
            }
            else
            {
                clear = keep;
            }

            var both = !ReferenceEquals(keep, clear);
            var defaultVariant = mode == "minimize" && both ? "clear" : "keep";

            Application.EnableVisualStyles();
            Rectangle selection;
            string variant;
            using (var form = new ShotForm(keep, clear, both, defaultVariant, lang))
            {
                Application.Run(form);
                selection = form.Selection;
                variant = form.Variant;
            }
            if (selection.Width <= 0 || selection.Height <= 0)
            {
                WriteResult(resultPath, "{\"ok\":false,\"cancelled\":true}");
                return 0;
            }
            var chosen = variant == "clear" ? clear : keep;
            using (var cropped = chosen.Clone(selection, PixelFormat.Format32bppArgb))
            {
                cropped.Save(pngPath, ImageFormat.Png);
                WriteResult(resultPath, "{\"ok\":true,\"width\":" + cropped.Width + ",\"height\":" + cropped.Height
                    + ",\"x\":" + selection.X + ",\"y\":" + selection.Y
                    + ",\"variant\":\"" + variant + "\",\"cancelled\":false}");
            }
        }
        catch (Exception error)
        {
            WriteResult(resultPath, "{\"ok\":false,\"error\":\"" + Escape(error.Message) + "\"}");
        }
        finally
        {
            RestoreWindows(minimized);
            if (keep != null) keep.Dispose();
            if (clear != null && !ReferenceEquals(clear, keep)) clear.Dispose();
        }
        return 0;
    }
}

internal sealed class ShotForm : Form
{
    private readonly Bitmap keepShot;
    private readonly Bitmap clearShot;
    private readonly bool both;
    private readonly bool english;
    private readonly Font font;
    private float dpiScale = 1f;
    private Point origin;
    private bool dragging;
    private Rectangle selection;
    private int hover = -1;
    private string variant;

    public ShotForm(Bitmap keepShot, Bitmap clearShot, bool both, string defaultVariant, string lang)
    {
        this.keepShot = keepShot;
        this.clearShot = clearShot;
        this.both = both;
        variant = defaultVariant == "clear" ? "clear" : "keep";
        english = lang == "en";
        font = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = SystemInformation.VirtualScreen;
        TopMost = true;
        ShowInTaskbar = false;
        KeyPreview = true;
        DoubleBuffered = true;
        BackColor = Color.Black;
        Cursor = Cursors.Cross;
    }

    public Rectangle Selection
    {
        get { return selection; }
    }

    public string Variant
    {
        get { return variant; }
    }

    private Bitmap Source
    {
        get { return variant == "clear" ? clearShot : keepShot; }
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        using (var graphics = CreateGraphics())
        {
            dpiScale = graphics.DpiX / 96f;
        }
        Activate();
        BringToFront();
        Focus();
        DshShot.SetForegroundWindow(Handle);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) font.Dispose();
        base.Dispose(disposing);
    }

    private int S(int value)
    {
        return (int)Math.Round(value * dpiScale);
    }

    private string VariantLabel()
    {
        return english ? "Minimize Harness" : "最小化 Harness";
    }

    private Rectangle VariantRect()
    {
        var width = S(english ? 208 : 176);
        var height = S(34);
        var margin = S(24);
        return new Rectangle(margin, ClientSize.Height - margin - height, width, height);
    }

    private string[] ButtonLabels()
    {
        return english ? new[] { "Full screen", "Confirm", "Cancel" } : new[] { "整屏", "完成", "取消" };
    }

    private Rectangle[] ButtonRects()
    {
        var width = S(english ? 122 : 92);
        var height = S(36);
        var gap = S(10);
        var margin = S(24);
        var labels = ButtonLabels();
        var rects = new Rectangle[labels.Length];
        var total = width * labels.Length + gap * (labels.Length - 1);
        var left = ClientSize.Width - margin - total;
        var top = ClientSize.Height - margin - height;
        for (var index = 0; index < labels.Length; index++)
        {
            rects[index] = new Rectangle(left + index * (width + gap), top, width, height);
        }
        return rects;
    }

    private static GraphicsPath Rounded(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var diameter = radius * 2;
        path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private void DrawBadge(Graphics graphics, Rectangle bounds, string text, Color background, Color foreground)
    {
        using (var path = Rounded(bounds, S(6)))
        using (var brush = new SolidBrush(background))
        {
            graphics.FillPath(brush, path);
        }
        TextRenderer.DrawText(graphics, text, font, bounds, foreground,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    private void DrawToggleBadge(Graphics graphics, Rectangle bounds, string text, bool on, bool hovered)
    {
        var background = hovered ? Color.FromArgb(240, 56, 56, 62) : Color.FromArgb(224, 32, 32, 36);
        using (var path = Rounded(bounds, S(6)))
        using (var brush = new SolidBrush(background))
        {
            graphics.FillPath(brush, path);
        }
        var trackWidth = S(30);
        var trackHeight = S(16);
        var pad = S(10);
        var track = new Rectangle(bounds.X + pad, bounds.Y + (bounds.Height - trackHeight) / 2, trackWidth, trackHeight);
        using (var path = Rounded(track, trackHeight / 2))
        using (var brush = new SolidBrush(on ? Color.FromArgb(0, 174, 236) : Color.FromArgb(120, 120, 130)))
        {
            graphics.FillPath(brush, path);
        }
        var knobSize = trackHeight - S(4);
        var knob = new Rectangle(on ? track.Right - knobSize - S(2) : track.X + S(2), track.Y + S(2), knobSize, knobSize);
        using (var brush = new SolidBrush(Color.White))
        {
            graphics.FillEllipse(brush, knob);
        }
        var textRect = new Rectangle(track.Right + S(8), bounds.Y, bounds.Right - track.Right - S(10), bounds.Height);
        TextRenderer.DrawText(graphics, text, font, textRect, Color.White,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var graphics = e.Graphics;
        graphics.DrawImage(Source, 0, 0, ClientSize.Width, ClientSize.Height);

        var current = selection;
        if (current.Width > 0 && current.Height > 0)
        {
            using (var dim = new SolidBrush(Color.FromArgb(110, 0, 0, 0)))
            {
                graphics.FillRectangle(dim, 0, 0, ClientSize.Width, current.Top);
                graphics.FillRectangle(dim, 0, current.Bottom, ClientSize.Width, ClientSize.Height - current.Bottom);
                graphics.FillRectangle(dim, 0, current.Top, current.Left, current.Height);
                graphics.FillRectangle(dim, current.Right, current.Top, ClientSize.Width - current.Right, current.Height);
            }
            using (var pen = new Pen(Color.FromArgb(0, 174, 236), Math.Max(1f, 1.6f * dpiScale)))
            {
                graphics.DrawRectangle(pen, current);
            }
            var label = current.Width + " × " + current.Height;
            var size = TextRenderer.MeasureText(label, font);
            var width = size.Width + S(16);
            var height = size.Height + S(6);
            var left = current.X;
            var top = current.Y - height - S(8);
            if (top < S(4)) top = current.Y + S(8);
            if (left + width > ClientSize.Width) left = ClientSize.Width - width - S(4);
            DrawBadge(graphics, new Rectangle(left, top, width, height), label,
                Color.FromArgb(214, 0, 0, 0), Color.White);
        }

        var hint = english
            ? "Drag to select  ·  Enter to confirm  ·  Esc to cancel"
            : "拖动鼠标框选截图区域  ·  回车完成  ·  Esc 取消";
        var hintSize = TextRenderer.MeasureText(hint, font);
        var hintBounds = new Rectangle(
            Math.Max(S(12), (ClientSize.Width - hintSize.Width - S(28)) / 2),
            S(18),
            hintSize.Width + S(28),
            hintSize.Height + S(12));
        DrawBadge(graphics, hintBounds, hint, Color.FromArgb(200, 0, 0, 0), Color.FromArgb(240, 255, 255, 255));

        if (both)
        {
            DrawToggleBadge(graphics, VariantRect(), VariantLabel(), variant == "clear", hover == 100);
        }

        var labels2 = ButtonLabels();
        var buttonRects = ButtonRects();
        for (var index = 0; index < buttonRects.Length; index++)
        {
            var disabled = index == 1 && current.Width <= 0;
            var hovered = index == hover && !disabled;
            var background = hovered ? Color.FromArgb(240, 56, 56, 62) : Color.FromArgb(224, 32, 32, 36);
            if (index == 0) background = hovered ? Color.FromArgb(240, 0, 122, 204) : Color.FromArgb(232, 0, 104, 178);
            var textColor = disabled ? Color.FromArgb(130, 255, 255, 255) : Color.White;
            DrawBadge(graphics, buttonRects[index], labels2[index], background, textColor);
        }
    }

    private void PressButton(int index)
    {
        if (index == 0)
        {
            selection = new Rectangle(0, 0, ClientSize.Width, ClientSize.Height);
            Close();
            return;
        }
        if (index == 1)
        {
            if (selection.Width > 0 && selection.Height > 0) Close();
            return;
        }
        Cancel();
    }

    private void Cancel()
    {
        selection = Rectangle.Empty;
        Close();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Right)
        {
            Cancel();
            return;
        }
        if (e.Button != MouseButtons.Left) return;

        if (both)
        {
            if (VariantRect().Contains(e.Location))
            {
                variant = variant == "clear" ? "keep" : "clear";
                Invalidate();
                return;
            }
        }

        var rects = ButtonRects();
        for (var index = 0; index < rects.Length; index++)
        {
            if (!rects[index].Contains(e.Location)) continue;
            PressButton(index);
            return;
        }
        dragging = true;
        origin = e.Location;
        selection = Rectangle.Empty;
        Invalidate();
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (dragging)
        {
            var left = Math.Min(origin.X, e.X);
            var top = Math.Min(origin.Y, e.Y);
            var width = Math.Abs(e.X - origin.X);
            var height = Math.Abs(e.Y - origin.Y);
            selection = new Rectangle(left, top, width, height);
            Invalidate();
            return;
        }
        var next = -1;
        if (both && VariantRect().Contains(e.Location)) next = 100;
        if (next < 0)
        {
            var rects = ButtonRects();
            for (var index = 0; index < rects.Length; index++)
            {
                if (rects[index].Contains(e.Location)) next = index;
            }
        }
        Cursor = next >= 0 ? Cursors.Hand : Cursors.Cross;
        if (next != hover)
        {
            hover = next;
            Invalidate();
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!dragging) return;
        dragging = false;
        if (selection.Width < S(6) || selection.Height < S(6)) selection = Rectangle.Empty;
        Invalidate();
    }

    protected override void OnDoubleClick(EventArgs e)
    {
        base.OnDoubleClick(e);
        if (selection.Width > 0 && selection.Height > 0) Close();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode == Keys.Escape)
        {
            Cancel();
            return;
        }
        if (e.KeyCode == Keys.Enter && selection.Width > 0 && selection.Height > 0)
        {
            Close();
        }
    }
}
`

/** Slow but dependency-free fallback used when no C# compiler is available. */
const FALLBACK_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$resultPath = $env:DSH_SCREENSHOT_RESULT
$pngPath = $env:DSH_SCREENSHOT_PNG
$mode = $env:DSH_SCREENSHOT_MODE
function Write-Result($data) {
  $json = $data | ConvertTo-Json -Compress
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($resultPath, $json, $utf8)
}
try {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class DshShots {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  public static List<long> Find() {
    var found = new List<long>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(256); GetClassNameW(h, cls, 256);
      if (cls.ToString() != "Chrome_WidgetWin_1") return true;
      var title = new StringBuilder(1024); GetWindowTextW(h, title, 1024);
      if (!title.ToString().EndsWith("DeepSeek Harness")) return true;
      found.Add(h.ToInt64());
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
  $handles = [DshShots]::Find()
  $minimized = New-Object System.Collections.ArrayList
  if ($mode -eq 'minimize') {
    foreach ($h in $handles) {
      $p = [IntPtr]$h
      if ([DshShots]::IsIconic($p)) { continue }
      [void][DshShots]::PostMessageW($p, 0x0112, [IntPtr]0xF020, [IntPtr]::Zero)
      $deadline = [DateTime]::UtcNow.AddMilliseconds(400)
      while (-not [DshShots]::IsIconic($p) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 15 }
      if ([DshShots]::IsIconic($p)) { [void]$minimized.Add($h) }
    }
    if ($minimized.Count -gt 0) { Start-Sleep -Milliseconds 150 }
  }
  $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $vs.Width, $vs.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $bmp.Size)
  $g.Dispose()
  $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $width = $bmp.Width
  $height = $bmp.Height
  $bmp.Dispose()
  foreach ($h in $minimized) {
    $p = [IntPtr]$h
    [void][DshShots]::PostMessageW($p, 0x0112, [IntPtr]0xF120, [IntPtr]::Zero)
    [void][DshShots]::BringWindowToTop($p)
    [void][DshShots]::SetForegroundWindow($p)
    [void][DshShots]::SwitchToThisWindow($p, $true)
  }
  Start-Sleep -Milliseconds 120
  Write-Result -data @{ ok = $true; width = $width; height = $height; minimized = $minimized.Count; windows = $handles.Count }
}
catch {
  Write-Result -data @{ ok = $false; error = $_.Exception.Message }
  exit 1
}
`

/** Serialized reader plus writer for the persisted preference. */
async function loadSettings() {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'))
    return { minimize: parsed?.minimize !== false }
  } catch {
    return { minimize: true }
  }
}

/**
 * Merge one patch into the stored preference.
 * @param patch - fields to persist.
 * @returns the complete stored preference.
 */
async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch }
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  await writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/** JSON response helper for the exact Fetch routes. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Run a child process to completion with ignored stdio and a timeout. */
function runProcess(command, args, options = {}) {
  const { timeoutMs = CAPTURE_TIMEOUT_MS, env } = options
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', env: { ...process.env, ...(env ?? {}) } })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('截图超时'))
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`截图进程退出码 ${String(code)}`))
    })
  })
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Locate the framework C# compiler that ships with every Windows install. */
async function findCompiler() {
  const root = process.env.WINDIR ?? 'C:\\Windows'
  const candidates = [
    join(root, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(root, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate
  }
  return undefined
}

/**
 * Compile the helper once and cache the executable. Resolves to the executable
 * path, or null when no compiler is available. Never rejects.
 */
let helperReady
function ensureHelper() {
  helperReady ??= (async () => {
    try {
      await mkdir(dirname(HELPER_PATH), { recursive: true })
      if (await exists(HELPER_PATH)) return HELPER_PATH
      const compiler = await findCompiler()
      if (compiler === undefined) return null
      const sourcePath = `${HELPER_PATH}.cs`
      await writeFile(sourcePath, HELPER_SOURCE, 'utf8')
      await runProcess(
        compiler,
        [
          '/nologo',
          '/optimize+',
          '/target:winexe',
          `/out:${HELPER_PATH}`,
          '/r:System.dll',
          '/r:System.Drawing.dll',
          '/r:System.Windows.Forms.dll',
          sourcePath,
        ],
        { timeoutMs: 60_000 },
      )
      return (await exists(HELPER_PATH)) ? HELPER_PATH : null
    } catch {
      return null
    }
  })()
  return helperReady
}

/**
 * Run one capture into a private temp directory. The helper grabs the screen and
 * then hosts the full-screen selection window; the returned PNG is the region the
 * user picked, or `{ cancelled: true }` when the selection was dismissed.
 * @param mode - `minimize` hides the Harness window for the grab, `keep` captures it as is.
 * @param lang - `zh` or `en`; selects the selection window's hint and button labels.
 */
async function capture(mode, lang) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-screenshot-'))
  const pngPath = join(dir, 'shot.png')
  const resultPath = join(dir, 'result.json')
  try {
    let result = null
    let lastError = null
    const helper = await ensureHelper()
    if (helper !== null) {
      try {
        await runProcess(helper, [mode, pngPath, resultPath, String(SETTLE_MS), lang])
        result = JSON.parse(await readFile(resultPath, 'utf8'))
      } catch (error) {
        lastError = error
      }
    }
    // The PowerShell fallback has no selection window; it is a last resort only.
    if (result?.ok !== true && result?.cancelled !== true) {
      try {
        const encoded = Buffer.from(FALLBACK_SCRIPT, 'utf16le').toString('base64')
        await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
          timeoutMs: 45_000,
          env: { DSH_SCREENSHOT_MODE: mode, DSH_SCREENSHOT_PNG: pngPath, DSH_SCREENSHOT_RESULT: resultPath },
        })
        result = JSON.parse(await readFile(resultPath, 'utf8'))
      } catch (error) {
        lastError = lastError ?? error
      }
    }
    if (result?.cancelled === true) return { cancelled: true }
    if (result?.ok !== true) {
      throw new Error(result?.error ?? (lastError instanceof Error ? lastError.message : '截图失败'))
    }
    const bytes = await readFile(pngPath)
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('截图文件过大（超过 24 MB）')
    return {
      cancelled: false,
      dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
      width: result.width,
      height: result.height,
      bytes: bytes.byteLength,
      minimizedWindows: result.minimized,
      harnessWindows: result.windows,
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** One capture at a time; a second request reports busy instead of racing the desktop. */
let captureInFlight = false

export const name = 'dsh-screenshot'

/** Required Host service: the authenticated Fetch route registry. */
export const inject = ['connection']

/**
 * Register the package-private capture and settings endpoints.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  // Build the helper in the background so the first click is already fast.
  void ensureHelper()

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: `${ROUTE_ROOT}/capture`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          if (captureInFlight) return json({ ok: false, error: '正在截图，请稍候' })
          let body = {}
          try {
            body = await request.json()
          } catch {
            body = {}
          }
          const stored = await loadSettings()
          const mode = body?.mode === 'keep' || body?.mode === 'minimize' ? body.mode : stored.minimize ? 'minimize' : 'keep'
          const lang = body?.lang === 'en' ? 'en' : 'zh'
          captureInFlight = true
          try {
            const shot = await capture(mode, lang)
            return json({ ok: true, mode, ...shot })
          } catch (error) {
            return json({ ok: false, mode, error: error instanceof Error ? error.message : String(error) })
          } finally {
            captureInFlight = false
          }
        },
      }),
    'dsh-screenshot: capture route',
  )

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: `${ROUTE_ROOT}/settings`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body = {}
          try {
            body = await request.json()
          } catch {
            body = {}
          }
          try {
            if (typeof body?.minimize === 'boolean') {
              const saved = await saveSettings({ minimize: body.minimize })
              return json({ ok: true, ...saved })
            }
            return json({ ok: true, ...(await loadSettings()) })
          } catch (error) {
            return json({ ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      }),
    'dsh-screenshot: settings route',
  )
}
