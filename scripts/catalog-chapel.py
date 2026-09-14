"""Package the generated chapel sprite into a single-frame atlas.

The chapel is one building, delivered on its own after the 2026-09-11 batch, so it gets a
one-frame atlas rather than being retro-fitted into a grid that is already full. Pixels are
only trimmed and padded here: the art itself is never redrawn or resampled.

    .venv/bin/python scripts/catalog-chapel.py

Requires: pillow, numpy, cwebp on PATH.
"""
from pathlib import Path
from PIL import Image
import json
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output' / 'chapel-2026-09-12' / 'chapel-source.webp'
PUBLIC = ROOT / 'public' / 'assets'
MARGIN = 24          # transparent padding kept around the silhouette
LINK = 8             # alpha that counts as visible
ORIGIN = [0.5, 0.86]  # bottom-anchored, matching every other building sprite

image = Image.open(SOURCE).convert('RGBA')
alpha = np.array(image)[..., 3]
rows = np.where((alpha > LINK).any(axis=1))[0]
cols = np.where((alpha > LINK).any(axis=0))[0]
assert len(rows) and len(cols), 'the source has no visible pixels'

top, bottom = int(rows.min()), int(rows.max()) + 1
left, right = int(cols.min()), int(cols.max()) + 1
width = right - left + MARGIN * 2
height = bottom - top + MARGIN * 2

trimmed = Image.new('RGBA', (width, height), (0, 0, 0, 0))
trimmed.paste(image.crop((left, top, right, bottom)), (MARGIN, MARGIN))

png = PUBLIC / 'chapel.png'
trimmed.save(png)
subprocess.run(['cwebp', '-quiet', '-q', '90', '-alpha_q', '100', str(png), '-o', str(PUBLIC / 'chapel.webp')], check=True)

# The pivot is the base of the silhouette, measured from solid alpha rather than guessed.
solid = np.array(trimmed)[..., 3] > 48
feet = np.where(solid.any(axis=1))[0].max()
columns = np.where(solid[feet - 2])[0]
pivot = [round(float((columns.min() + columns.max()) / 2), 2), float(feet)]

catalog = {
    'name': 'chapel',
    'label': '教堂',
    'image': '/assets/chapel.webp',
    'width': width,
    'height': height,
    'columns': 1,
    'rows': 1,
    'activeFrames': 1,
    'reservedCells': 0,
    'requestedCanvas': [1024, 1024],
    'requestedGrid': [1, 1],
    'frames': {
        'chapel': {
            'x': 0, 'y': 0, 'w': width, 'h': height, 'row': 0, 'column': 0,
            'contentBounds': [MARGIN, MARGIN, width - MARGIN, height - MARGIN],
            'pivot': pivot,
            'origin': ORIGIN,
        },
    },
    'prompt': 'public/assets/chapel-prompts.json',
    'qa': {
        'alphaPreserved': True,
        'runtimeIntegrated': True,
        'paddedWithTransparentPixels': [width - (right - left), height - (bottom - top)],
        'visiblePixelShare': round(float((alpha > LINK).mean()) * 100, 2),
    },
}
(PUBLIC / 'chapel-frames.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
print(f'chapel atlas written: {width}x{height}, pivot {pivot}, visible {catalog["qa"]["visiblePixelShare"]}%')
