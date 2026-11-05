"""Solar farm world: rows of PV modules over dry ground, with judge-placed
cracked cells (defects) and soiling (benign).

Same contract as World: a pure function of (seed, profile geometry, defects in
order), so a replay renders byte-identical camera crops. The detector compares
against the clean rendered field, not a flat colour, so busbars and frames are
never flagged on their own.
"""
from __future__ import annotations

import math
import random
from typing import List, Optional, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from .world import BLOCK_PX, PX_PER_M, Defect, World, _walk

KINDS = ("cracked_cell", "soiling")
N_VARIANTS = {"cracked_cell": 3, "soiling": 2}

GROUND_RGB = (128, 120, 92)
CELL_RGB = (22, 32, 62)
BACKSHEET_RGB = (176, 182, 190)
FRAME_RGB = (168, 172, 178)
BUSBAR_RGB = (92, 104, 126)
GLASS_CRACK_RGB = (222, 230, 238)


class SolarWorld(World):
    def __init__(self, deck_w_mm: int, deck_h_mm: int, seed: int, texture_dir: Optional[str] = None,
                 geometry: Optional[dict] = None):
        g = dict(rows=4, row_pitch_mm=4000, row_depth_mm=2000, module_mm=[1000, 2000], margin_mm=1000)
        g.update(geometry or {})
        self.geometry = g
        super().__init__(deck_w_mm, deck_h_mm, seed, texture_dir)
        self._ref = self.img.copy()
        self._update_anomaly(0, 0, self.bx, self.by)

    # ------------------------------------------------------------------ layout
    def rows_mm(self) -> List[Tuple[int, int, int, int, int]]:
        """(x0, y0, x1, y1, modules) per row, in mm."""
        g = self.geometry
        mw, _ = g["module_mm"]
        n = max(1, (self.deck_w_mm - 2 * g["margin_mm"]) // mw)
        x0 = (self.deck_w_mm - n * mw) // 2
        out = []
        for r in range(g["rows"]):
            cy = g["row_pitch_mm"] * r + g["row_pitch_mm"] // 2
            y0 = cy - g["row_depth_mm"] // 2
            out.append((x0, y0, x0 + n * mw, y0 + g["row_depth_mm"], n))
        return out

    def meta(self) -> dict:
        return {"rows_mm": [list(r) for r in self.rows_mm()], "module_mm": list(self.geometry["module_mm"])}

    # ------------------------------------------------------------------ render
    def _render_concrete(self) -> Image.Image:  # the base class's background hook
        rng = random.Random(f"solar:{self.seed}")
        img = _ground(rng, self.w_px, self.h_px)
        tiles = [_module_tile(self.geometry["module_mm"], v) for v in range(4)]
        shadow = Image.new("L", img.size, 0)
        sd = ImageDraw.Draw(shadow)
        for x0, y0, x1, y1, n in self.rows_mm():
            px = lambda mm: mm * PX_PER_M // 1000  # noqa: E731
            sd.rectangle([px(x0) + 4, px(y1), px(x1) + 4, px(y1) + int(0.45 * PX_PER_M)], fill=120)
        shadow = shadow.filter(ImageFilter.GaussianBlur(6))
        img = Image.composite(Image.new("RGB", img.size, (44, 42, 34)), img, shadow)
        mw = self.geometry["module_mm"][0]
        for x0, y0, _x1, _y1, n in self.rows_mm():
            for i in range(n):
                tile = tiles[rng.randrange(len(tiles))]
                img.paste(tile, ((x0 + i * mw) * PX_PER_M // 1000, y0 * PX_PER_M // 1000))
        return img

    # ----------------------------------------------------------------- defects
    def add_defect(self, kind: str, x_mm: int, y_mm: int, variant: int) -> Defect:
        if kind not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}")
        d = Defect(id=len(self.defects), kind=kind, x_mm=int(x_mm), y_mm=int(y_mm),
                   variant=int(variant) % N_VARIANTS[kind])
        self.defects.append(d)
        cx, cy = d.x_mm * PX_PER_M / 1000.0, d.y_mm * PX_PER_M / 1000.0
        if not self._paste_texture(d, cx, cy):
            if kind == "cracked_cell":
                for target in (self.img, self.marks):
                    rng = random.Random(f"defect:{self.seed}:{d.id}:{d.kind}:{d.variant}")
                    _draw_glass_crack(ImageDraw.Draw(target), rng, cx, cy, d.variant)
            else:
                rng = random.Random(f"defect:{self.seed}:{d.id}:{d.kind}:{d.variant}")
                half = int(0.55 * PX_PER_M)
                ox, oy = int(cx) - half, int(cy) - half
                color, mask = _soiling(rng, cx - ox, cy - oy, d.variant, (2 * half, 2 * half))
                self.img.paste(Image.new("RGB", mask.size, color), (ox, oy), mask)
                self.marks.paste(Image.new("RGBA", mask.size, color + (255,)), (ox, oy), mask)
        r = int(0.6 * PX_PER_M)
        self._update_anomaly(int((cx - r) // BLOCK_PX), int((cy - r) // BLOCK_PX),
                             int((cx + r) // BLOCK_PX) + 1, int((cy + r) // BLOCK_PX) + 1)
        return d


# ---------------------------------------------------------------------- drawing
def _ground(rng: random.Random, w: int, h: int) -> Image.Image:
    cw, ch = w // 24 + 2, h // 24 + 2
    coarse = Image.frombytes("L", (cw, ch), bytes(rng.randrange(256) for _ in range(cw * ch)))
    coarse = coarse.resize((w, h), Image.BICUBIC).point(lambda v: int(128 + (v - 128) * 0.22))
    fine = Image.frombytes("L", (w, h), rng.randbytes(w * h)).point(lambda v: int(128 + (v - 128) * 0.12))
    lum = ImageChops.add(coarse, fine, scale=1.0, offset=GROUND_RGB[1] - 256)
    r = lum.point(lambda v: min(255, v + GROUND_RGB[0] - GROUND_RGB[1]))
    b = lum.point(lambda v: max(0, v + GROUND_RGB[2] - GROUND_RGB[1]))
    return Image.merge("RGB", (r, lum, b))


def _module_tile(module_mm, variant: int) -> Image.Image:
    """One module seen from above: aluminium frame, 6x12 mono cells, busbars."""
    w, h = module_mm[0] * PX_PER_M // 1000, module_mm[1] * PX_PER_M // 1000
    shade = (-3, 0, 2, 4)[variant % 4]
    tile = Image.new("RGB", (w, h), FRAME_RGB)
    d = ImageDraw.Draw(tile)
    f = 3
    d.rectangle([f, f, w - f - 1, h - f - 1], fill=BACKSHEET_RGB)
    cols, rows = 6, 12
    cw, chh = (w - 2 * f) / cols, (h - 2 * f) / rows
    cell = tuple(max(0, c + shade) for c in CELL_RGB)
    for j in range(rows):
        for i in range(cols):
            x0, y0 = f + i * cw + 1, f + j * chh + 1
            x1, y1 = f + (i + 1) * cw - 1, f + (j + 1) * chh - 1
            c = 2  # chamfered mono-cell corners
            d.polygon([(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1),
                       (x0, y1 - c), (x0, y0 + c)], fill=cell)
            for k in (1, 2, 3):
                bx = x0 + (x1 - x0) * k / 4
                d.line([(bx, y0), (bx, y1)], fill=BUSBAR_RGB, width=1)
    d.rectangle([0, 0, w - 1, h - 1], outline=(120, 124, 130))
    return tile


def _draw_glass_crack(draw: ImageDraw.ImageDraw, rng: random.Random, cx: float, cy: float, variant: int) -> None:
    if variant == 0:  # impact point: radial fractures plus broken rings
        n = rng.randrange(7, 11)
        for i in range(n):
            a = 2 * math.pi * i / n + rng.uniform(-0.2, 0.2)
            pts = _walk(rng, cx, cy, a, rng.uniform(0.18, 0.34) * PX_PER_M, 0.06)
            draw.line(pts, fill=GLASS_CRACK_RGB, width=2)
        for rad in (0.07, 0.15):
            r = rad * PX_PER_M
            a0 = rng.uniform(0, 360)
            draw.arc([cx - r, cy - r, cx + r, cy + r], a0, a0 + rng.uniform(140, 260), fill=GLASS_CRACK_RGB, width=2)
    elif variant == 1:  # a long crack running across cells, with branches
        h = rng.uniform(0, 2 * math.pi)
        half = 0.4 * PX_PER_M
        main = list(reversed(_walk(rng, cx, cy, h + math.pi, half, 0.3))) + _walk(rng, cx, cy, h, half, 0.3)[1:]
        draw.line(main, fill=GLASS_CRACK_RGB, width=2)
        for _ in range(3):
            sx, sy = main[rng.randrange(len(main) // 4, 3 * len(main) // 4)]
            br = _walk(rng, sx, sy, h + rng.choice((-1, 1)) * rng.uniform(0.6, 1.3), half * 0.45, 0.35)
            draw.line(br, fill=GLASS_CRACK_RGB, width=2)
    else:  # shattered patch: a dense web of short fractures
        for _ in range(rng.randrange(16, 24)):
            sx, sy = cx + rng.gauss(0, 0.1 * PX_PER_M), cy + rng.gauss(0, 0.1 * PX_PER_M)
            pts = _walk(rng, sx, sy, rng.uniform(0, 2 * math.pi), rng.uniform(0.05, 0.14) * PX_PER_M, 0.5)
            draw.line(pts, fill=GLASS_CRACK_RGB, width=2)


def _soiling(rng: random.Random, cx: float, cy: float, variant: int, size) -> Tuple[Tuple[int, int, int], Image.Image]:
    """Returns (colour, soft mask) for a dust patch or bird droppings."""
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    if variant == 0:  # dust / sand drift
        color = (168, 142, 100)
        for _ in range(rng.randrange(9, 14)):
            r = rng.uniform(0.07, 0.17) * PX_PER_M
            x, y = cx + rng.gauss(0, 0.12 * PX_PER_M), cy + rng.gauss(0, 0.07 * PX_PER_M)
            d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=rng.randrange(170, 230))
        blur = 7
    else:  # bird droppings
        color = (226, 222, 206)
        for _ in range(rng.randrange(3, 6)):
            r = rng.uniform(0.03, 0.07) * PX_PER_M
            x, y = cx + rng.gauss(0, 0.12 * PX_PER_M), cy + rng.gauss(0, 0.12 * PX_PER_M)
            d.ellipse([x - r, y - r, x + r, y + r], fill=245)
            for _ in range(rng.randrange(2, 5)):
                a = rng.uniform(0, 2 * math.pi)
                s = r * rng.uniform(0.3, 0.6)
                ex, ey = x + math.cos(a) * r * 1.3, y + math.sin(a) * r * 1.3
                d.ellipse([ex - s, ey - s, ex + s, ey + s], fill=230)
        blur = 2
    return color, mask.filter(ImageFilter.GaussianBlur(blur))
