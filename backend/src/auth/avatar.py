"""Efecto CRT / terminal sobre la foto de perfil de Google.

Port de portfolio/tlacuilo/image_processing.py con la paleta de classm8:
pixelado + dithering + duotono ámbar (fondo #0d0902 -> ámbar #ffb000) +
grano + scanlines. El resultado se sirve como PNG desde /auth/me/avatar y
el front lo cachea.
"""

from __future__ import annotations

import io

import httpx
import numpy as np
from PIL import Image, ImageEnhance, ImageOps

# Paleta de classm8 (ver frontend/src/styles.scss)
_DARK = (13, 9, 2)  # --bg  #0d0902
_LIGHT = (255, 176, 0)  # --amber #ffb000

_SIZE = 96  # lado del avatar en px
_PIXEL = 4  # bloque de pixelado
_SCANLINE_STRENGTH = 0.22
_NOISE = 8


def _crt(img: Image.Image) -> Image.Image:
    img = img.convert("RGB").resize((_SIZE, _SIZE), Image.BILINEAR)
    w, h = img.size

    # 1. pixelado: bajar y subir resolución sin suavizado
    small = img.resize((w // _PIXEL, h // _PIXEL), Image.BILINEAR)
    pix = small.resize((w, h), Image.NEAREST)

    # 2. gris + contraste
    gray = ImageEnhance.Contrast(ImageOps.grayscale(pix)).enhance(1.3)

    # 3. dithering Floyd-Steinberg mezclado al 50% para no perder detalle
    dithered = gray.convert("1", dither=Image.FLOYDSTEINBERG).convert("L")
    gray = Image.blend(gray, dithered, alpha=0.5)

    # 4. duotono: negro -> _DARK, blanco -> _LIGHT
    g = np.asarray(gray, dtype=np.float32) / 255.0
    dark = np.array(_DARK, dtype=np.float32)
    light = np.array(_LIGHT, dtype=np.float32)
    duo = dark + (light - dark) * g[..., None]

    # 5. grano tipo estática
    if _NOISE:
        noise = np.random.randint(-_NOISE, _NOISE + 1, duo.shape[:2])
        duo = duo + noise[..., None]

    # 6. scanlines: oscurecer filas alternas
    duo = np.clip(duo, 0, 255).astype(np.uint8)
    duo[::2] = (duo[::2] * (1 - _SCANLINE_STRENGTH)).astype(np.uint8)

    return Image.fromarray(duo, mode="RGB")


def _placeholder() -> Image.Image:
    """Si el usuario no tiene foto de Google: cuadro liso ámbar apagado."""
    return Image.new("RGB", (_SIZE, _SIZE), _DARK)


def render_avatar_png(picture_url: str | None) -> bytes:
    if picture_url:
        try:
            resp = httpx.get(picture_url, timeout=5.0, follow_redirects=True)
            resp.raise_for_status()
            src = Image.open(io.BytesIO(resp.content))
        except Exception:  # noqa: BLE001 - red caída, url muerta, formato raro
            src = _placeholder()
    else:
        src = _placeholder()

    out = io.BytesIO()
    _crt(src).save(out, format="PNG")
    return out.getvalue()
