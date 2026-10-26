"""Gera os ícones PNG da extensão (sem dependências externas além do Pillow)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(sys.argv[1] if len(sys.argv) > 1 else "icons")
out.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s // 5, fill=(32, 103, 176, 255))
    # três linhas de fila
    pad = s // 5
    lh = s // 9
    for i, (w, color) in enumerate([(1.0, (255, 255, 255)), (0.78, (255, 255, 255)), (0.56, (255, 255, 255))]):
        y = pad + i * (lh + s // 9)
        d.rounded_rectangle([pad, y, pad + int((s - 2 * pad) * w), y + lh], radius=lh // 2, fill=color + (255,))
    # ponto de alerta
    r = s // 7
    cx, cy = s - pad - r // 2, s - pad - r // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 87, 82, 255), outline=(255, 255, 255, 255), width=max(2, s // 40))
    img.resize((size, size), Image.LANCZOS).save(out / f"icon{size}.png")
print("ícones gerados em", out)
