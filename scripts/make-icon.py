#!/usr/bin/env python3
"""Generate the macOS app icon (.icns) from scratch.

Renders a 1024x1024 master PNG, builds the full iconset, then calls
`iconutil -c icns` to produce build/icon.icns and assets/icon.icns.

The icon depicts rendered Markdown content inside a document — a heading
bar, body text lines, a bullet point, and a code-fence accent — to convey
"Markdown rendered for viewing" rather than just "a Markdown file."

Run: python3 scripts/make-icon.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
ASSETS_DIR = ROOT / "assets"
ICONSET_DIR = BUILD_DIR / "icon.iconset"

# Palette — matches the in-app accent (#0969da)
ACCENT = (9, 105, 218, 255)
ACCENT_DARK = (4, 78, 167, 255)
ACCENT_SOFT = (165, 195, 235, 255)
PAGE = (255, 255, 255, 255)
PAGE_FOLD = (215, 225, 240, 255)
SHADOW = (0, 0, 0, 60)
HEADING = (9, 105, 218, 255)  # blue heading bar
BODY = (140, 152, 168, 255)   # muted gray for body lines
BULLET = (9, 105, 218, 255)


def _load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _rounded_rect(size: int, radius: int, fill) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=fill)
    return img


def render_icon(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # ── Background: macOS-style squircle (~22.5% corner radius) ──
    bg_radius = int(size * 0.225)
    bg = _rounded_rect(size, bg_radius, ACCENT)
    img.alpha_composite(bg)

    # Subtle vertical depth gradient
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    for y in range(size):
        gdraw.line([(0, y), (size, y)], fill=(0, 0, 0, int(40 * (y / size))))
    shape_mask = _rounded_rect(size, bg_radius, (255, 255, 255, 255)).split()[-1]
    grad_alpha = ImageChops.multiply(grad.split()[-1], shape_mask)
    grad.putalpha(grad_alpha)
    img.alpha_composite(grad)

    # Top-edge highlight (gives a glassy, lit-from-above feel)
    hl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hldraw = ImageDraw.Draw(hl)
    for y in range(int(size * 0.30)):
        a = int(45 * (1 - y / (size * 0.30)))
        hldraw.line([(0, y), (size, y)], fill=(255, 255, 255, a))
    hl_alpha = ImageChops.multiply(hl.split()[-1], shape_mask)
    hl.putalpha(hl_alpha)
    img.alpha_composite(hl)

    # ── Document with folded top-right corner ──
    doc_w = int(size * 0.62)
    doc_h = int(size * 0.74)
    doc_x = (size - doc_w) // 2
    doc_y = int(size * 0.13)
    fold = int(size * 0.14)
    page_radius = int(size * 0.035)

    # Drop shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        (doc_x + 4, doc_y + 14, doc_x + doc_w + 4, doc_y + doc_h + 14),
        radius=page_radius,
        fill=SHADOW,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.014))
    img.alpha_composite(shadow)

    # Page body, with folded corner punched out
    page = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(page)
    pdraw.rounded_rectangle(
        (doc_x, doc_y, doc_x + doc_w, doc_y + doc_h),
        radius=page_radius,
        fill=PAGE,
    )
    fold_poly = [
        (doc_x + doc_w - fold, doc_y),
        (doc_x + doc_w, doc_y),
        (doc_x + doc_w, doc_y + fold),
    ]
    pdraw.polygon(fold_poly, fill=(0, 0, 0, 0))
    img.alpha_composite(page)

    # Re-fill the cut region with the background so the fold sits on the blue
    bg_under_fold = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bg_under_fold)
    bdraw.polygon(fold_poly, fill=ACCENT)
    img.alpha_composite(bg_under_fold)

    # The folded triangle (looks like the underside of the page)
    fold_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(fold_img)
    fold_triangle = [
        (doc_x + doc_w - fold, doc_y),
        (doc_x + doc_w, doc_y + fold),
        (doc_x + doc_w - fold, doc_y + fold),
    ]
    fdraw.polygon(fold_triangle, fill=PAGE_FOLD)
    fdraw.line(
        [(doc_x + doc_w - fold, doc_y), (doc_x + doc_w, doc_y + fold)],
        fill=(0, 0, 0, 30),
        width=max(2, size // 256),
    )
    img.alpha_composite(fold_img)

    # ── Rendered Markdown content inside the page ──
    # Visual layout (top-to-bottom):
    #   ▌# Heading        (thick blue bar)
    #   ────────          (separator hint via thinner heading underline)
    #   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬   (paragraph text line)
    #   ▬▬▬▬▬▬▬▬▬▬        (shorter text line)
    #   • ▬▬▬▬▬▬▬▬▬▬      (bullet item)
    #   • ▬▬▬▬▬▬▬         (bullet item)
    #   ┌──────────┐      (code-fence box)
    #   │ ▬▬▬▬▬▬▬ │
    #   │ ▬▬▬▬    │
    #   └──────────┘
    pad_x = int(doc_w * 0.12)
    inner_x = doc_x + pad_x
    inner_w = doc_w - 2 * pad_x
    line_h = int(size * 0.018)
    radius = max(2, line_h // 2)

    cdraw = ImageDraw.Draw(img)
    y = doc_y + int(doc_h * 0.18)  # leave room below the folded corner

    # H1 heading — taller, accent-colored bar (avoids the folded-corner area)
    heading_h = int(size * 0.045)
    heading_w = int(inner_w * 0.62)
    cdraw.rounded_rectangle(
        (inner_x, y, inner_x + heading_w, y + heading_h),
        radius=heading_h // 2,
        fill=HEADING,
    )
    y += heading_h + int(size * 0.035)

    # Two paragraph-like body lines (full + 70% width)
    for frac in (1.0, 0.78):
        w = int(inner_w * frac)
        cdraw.rounded_rectangle(
            (inner_x, y, inner_x + w, y + line_h),
            radius=radius,
            fill=BODY,
        )
        y += line_h + int(size * 0.022)

    y += int(size * 0.010)

    # Bullet list — two items (• + text)
    bullet_r = int(size * 0.011)
    bullet_indent = int(size * 0.030)
    for frac in (0.74, 0.58):
        bx = inner_x + bullet_r + 2
        by = y + line_h // 2
        cdraw.ellipse(
            (bx - bullet_r, by - bullet_r, bx + bullet_r, by + bullet_r),
            fill=BULLET,
        )
        text_x = inner_x + bullet_indent + bullet_r * 2
        text_w = int(inner_w * frac)
        cdraw.rounded_rectangle(
            (text_x, y, text_x + text_w, y + line_h),
            radius=radius,
            fill=BODY,
        )
        y += line_h + int(size * 0.022)

    y += int(size * 0.010)

    # Code-fence-style rounded box, soft-blue tinted
    code_h = int(size * 0.075)
    code_pad = int(size * 0.012)
    cdraw.rounded_rectangle(
        (inner_x, y, inner_x + inner_w, y + code_h),
        radius=int(size * 0.012),
        fill=(232, 240, 250, 255),  # very light blue
        outline=ACCENT_SOFT,
        width=max(1, size // 512),
    )
    # Two code "lines" inside
    code_line_h = int(size * 0.014)
    cdraw.rounded_rectangle(
        (
            inner_x + code_pad,
            y + code_pad,
            inner_x + code_pad + int(inner_w * 0.62),
            y + code_pad + code_line_h,
        ),
        radius=code_line_h // 2,
        fill=ACCENT,
    )
    cdraw.rounded_rectangle(
        (
            inner_x + code_pad,
            y + code_pad * 2 + code_line_h,
            inner_x + code_pad + int(inner_w * 0.38),
            y + code_pad * 2 + code_line_h * 2,
        ),
        radius=code_line_h // 2,
        fill=ACCENT_DARK,
    )

    return img


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    master = render_icon(1024)
    master_path = BUILD_DIR / "icon.png"
    master.save(master_path, "PNG")
    master.save(ASSETS_DIR / "icon.png", "PNG")
    print(f"wrote {master_path}")

    if ICONSET_DIR.exists():
        shutil.rmtree(ICONSET_DIR)
    ICONSET_DIR.mkdir(parents=True)

    specs = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
    for size, name in specs:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(ICONSET_DIR / name, "PNG")

    icns_path = BUILD_DIR / "icon.icns"
    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET_DIR), "-o", str(icns_path)],
        check=True,
    )
    # Mirror the .icns into assets/ so electron-builder fileAssociations resolves
    shutil.copyfile(icns_path, ASSETS_DIR / "icon.icns")
    print(f"wrote {icns_path}")

    shutil.rmtree(ICONSET_DIR)


if __name__ == "__main__":
    main()
