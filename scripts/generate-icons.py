#!/usr/bin/env python3
"""Genera los iconos PNG de la PWA a partir del mismo diseño que
android/app/src/main/res/drawable/ic_launcher_foreground.xml.

La marca se describe en coordenadas normalizadas de una caja de 34x34
(la misma que usa .brand__mark en src/styles/base.css) y se escala al
tamaño de cada icono.

Uso:  python3 scripts/generate-icons.py
"""

import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")

BG = (20, 20, 22, 255)  # --bg, #141416
GREEN = (57, 255, 20, 255)  # --green, #39ff14
BAR_W = 4
BAR_TOPS = 8
BAR_LEFTS = (8, 15, 22)
BAR_HEIGHTS = (17, 12, 7)
MARK = 34.0
STROKE = 1.0
RADIUS = 9.0

# Se dibuja a 4x y se reduce; Pillow no antialiasa las formas-vectoriales.
SS = 4


def draw_icon(size: int, mark_ratio: float, bleed: bool) -> Image.Image:
    side = size * SS
    base = Image.new("RGBA", (side, side), BG if bleed else (0, 0, 0, 0))
    mark_side = side * mark_ratio
    offset = (side - mark_side) / 2
    scale = mark_side / MARK
    stroke = max(1, int(size / 64 * SS))

    def px(value: float) -> float:
        return offset + value * scale

    def u(value: float) -> float:
        return value * side / MARK

    # ImageDraw writes raw pixel values instead of blending, so a translucent
    # fill has to live on its own layer and be composited afterwards.
    plate = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    plate_draw = ImageDraw.Draw(plate)
    plate_draw.rounded_rectangle(
        [offset + stroke / 2, offset + stroke / 2,
         offset + mark_side - stroke / 2, offset + mark_side - stroke / 2],
        radius=u(RADIUS),
        fill=GREEN[:3] + (int(0.08 * 255),),
        outline=GREEN[:3] + (int(0.35 * 255),),
        width=stroke,
    )
    image = Image.alpha_composite(base, plate)

    draw = ImageDraw.Draw(image)
    for left, height in zip(BAR_LEFTS, BAR_HEIGHTS):
        draw.rounded_rectangle(
            [px(left), px(BAR_TOPS), px(left + BAR_W), px(BAR_TOPS + height)],
            radius=u(BAR_W / 2),
            fill=GREEN,
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    # (nombre, tamaño, ratio del logo, fondo opaco)
    targets = [
        ("icon-192.png", 192, 0.62, True),
        ("icon-512.png", 512, 0.62, True),
        # Maskable: el sistema recorta hasta un 20% por lado, asi que el
        # logo se reduce para caber con holgura dentro de la zona segura.
        ("icon-maskable-192.png", 192, 0.50, True),
        ("icon-maskable-512.png", 512, 0.50, True),
        # iOS aplica su propio redondeo, asi que va a sangre completa.
        ("apple-touch-icon.png", 180, 0.55, True),
    ]

    for name, size, ratio, bleed in targets:
        path = os.path.normpath(os.path.join(OUT, name))
        draw_icon(size, ratio, bleed).save(path, "PNG", optimize=True)
        print(f"{name:28} {size}x{size}")


if __name__ == "__main__":
    main()
