#!/usr/bin/env python3
"""Generate the macOS app icon (.icns) from scratch.

Renders a 1024x1024 master PNG, builds the full iconset, then calls
`iconutil -c icns` to produce build/icon.icns and assets/icon.png.

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

# Color palette — matches the in-app accent (#0969da)
ACCENT = (9, 105, 218, 255)
ACCENT_DARK = (4, 78, 167, 255)
PAGE = (255, 255, 255, 255)
PAGE_FOLD = (215, 225, 240, 255)
SHADOW = (0, 0, 0, 60)
TEXT = (9, 105, 218, 255)


def _load_font(size: int) -> ImageFont.ImageFont:
    """Try to find a bold sans-serif system font for the 'MD' wordmark."""
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _rounded_rect(size: int, radius: int, fill) -> Image.Image:
    """Return an RGBA image with a rounded rectangle filling the canvas."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=fill)
    return img


def render_icon(size: int = 1024) -> Image.Image:
    """Draw the master icon at the requested size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── Background: rounded square in the macOS app-icon "squircle" style ──
    # macOS Big Sur+ icons use a corner radius of ~22.5% of icon size.
    bg_radius = int(size * 0.225)
    bg = _rounded_rect(size, bg_radius, ACCENT)
    img.alpha_composite(bg)

    # ── Subtle vertical gradient overlay for depth ──
    # Draw black-with-varying-alpha lines on a transparent canvas, then
    # *multiply* the existing alpha by the rounded-rect mask (don't replace it).
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    for y in range(size):
        alpha = int(40 * (y / size))  # darker at bottom
        gdraw.line([(0, y), (size, y)], fill=(0, 0, 0, alpha))
    shape_mask = _rounded_rect(size, bg_radius, (255, 255, 255, 255)).split()[-1]
    grad_alpha = ImageChops.multiply(grad.split()[-1], shape_mask)
    grad.putalpha(grad_alpha)
    img.alpha_composite(grad)

    # ── Document shape (page with a folded corner) ──
    doc_w = int(size * 0.58)
    doc_h = int(size * 0.70)
    doc_x = (size - doc_w) // 2
    doc_y = int(size * 0.16)
    fold = int(size * 0.14)  # size of the folded corner

    # Drop shadow under the page
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        (doc_x + 4, doc_y + 12, doc_x + doc_w + 4, doc_y + doc_h + 12),
        radius=int(size * 0.03),
        fill=SHADOW,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.012))
    img.alpha_composite(shadow)

    # Page body (with folded top-right corner cut out)
    page = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(page)
    page_radius = int(size * 0.03)
    pdraw.rounded_rectangle(
        (doc_x, doc_y, doc_x + doc_w, doc_y + doc_h),
        radius=page_radius,
        fill=PAGE,
    )
    # Cut out the folded corner with a polygon mask
    fold_poly = [
        (doc_x + doc_w - fold, doc_y),
        (doc_x + doc_w, doc_y),
        (doc_x + doc_w, doc_y + fold),
    ]
    pdraw.polygon(fold_poly, fill=(0, 0, 0, 0))
    img.alpha_composite(page)

    # Re-fill the cut area with the background color so we can draw the fold on top
    bg_under_fold = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bgdraw = ImageDraw.Draw(bg_under_fold)
    bgdraw.polygon(fold_poly, fill=ACCENT)
    img.alpha_composite(bg_under_fold)

    # The folded triangle (lighter shade, looks like the underside of the page)
    fold_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(fold_img)
    fold_triangle = [
        (doc_x + doc_w - fold, doc_y),
        (doc_x + doc_w, doc_y + fold),
        (doc_x + doc_w - fold, doc_y + fold),
    ]
    fdraw.polygon(fold_triangle, fill=PAGE_FOLD)
    # Diagonal crease shadow
    fdraw.line(
        [(doc_x + doc_w - fold, doc_y), (doc_x + doc_w, doc_y + fold)],
        fill=(0, 0, 0, 25),
        width=max(2, size // 256),
    )
    img.alpha_composite(fold_img)

    # ── "MD" wordmark centered on the page ──
    label = "MD"
    font_size = int(doc_h * 0.42)
    font = _load_font(font_size)

    # Measure
    bbox = draw.textbbox((0, 0), label, font=font, stroke_width=0)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    tx = doc_x + (doc_w - text_w) // 2 - bbox[0]
    ty = doc_y + (doc_h - text_h) // 2 - bbox[1] - int(size * 0.02)
    draw.text((tx, ty), label, font=font, fill=TEXT)

    # ── Down-arrow / chevron hint below "MD" (suggests "view / read") ──
    cx = doc_x + doc_w // 2
    cy = doc_y + doc_h - int(size * 0.10)
    arrow_w = int(size * 0.10)
    arrow_h = int(size * 0.04)
    thickness = max(3, size // 128)
    draw.line(
        [(cx - arrow_w // 2, cy), (cx, cy + arrow_h), (cx + arrow_w // 2, cy)],
        fill=ACCENT_DARK,
        width=thickness,
        joint="curve",
    )

    return img


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    master = render_icon(1024)
    master_path = BUILD_DIR / "icon.png"
    master.save(master_path, "PNG")
    # Also save a copy to assets/icon.png for use in fileAssociations
    master.save(ASSETS_DIR / "icon.png", "PNG")
    print(f"wrote {master_path}")

    # Build the .iconset (macOS expects very specific filenames + sizes)
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
    print(f"wrote {icns_path}")

    # Clean up the intermediate iconset folder
    shutil.rmtree(ICONSET_DIR)


if __name__ == "__main__":
    main()
