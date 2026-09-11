"""Read generated alpha atlases and write frame/QA metadata.

Art is never redrawn and colours are never resampled. Pixels are only relocated:
the generator drew figures larger than the cell pitch it was asked for, so a grid
cut sliced sprites and let a neighbour bleed into a frame. Atlases listed in
REPAIR are rebuilt by exclusive-ownership relocation -- every connected sprite is
assigned to one frame, moved whole into its own cell (tight frame box, transparent
gutter) and parenthetically verified. The untouched generator output of a repaired
atlas is kept under `raw/` so the transform stays reproducible.

Requires: pillow, numpy, and the cwebp encoder on PATH.
    python3 -m venv .venv && .venv/bin/pip install pillow numpy
    .venv/bin/python scripts/catalog-generated-assets.py
"""
from pathlib import Path
from PIL import Image
import json
import shutil
import subprocess
import zipfile
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output' / 'game-assets-2026-09-11'
PUBLIC = ROOT / 'public' / 'assets'

SOLID = 48    # alpha that reads as solid art
LINK = 8      # alpha that keeps a sprite joined to its anti-aliased rim
FRINGE = 6    # radius of the soft sub-LINK fringe carried with each sprite
GUTTER = 20   # transparent padding inside each repaired cell
WEBP = ['-quiet', '-q', '90', '-alpha_q', '100']

names = {
 'disasters': ['fire-0', 'fire-1', 'fire-2', 'fire-3', 'flood-0', 'flood-1', 'drought-0', 'drought-1', 'hail-0', 'hail-1', 'insects-0', 'insects-1', 'scaffold-0', 'scaffold-1', 'bell-0', 'bell-1'],
 'caravan': [f'{state}-{pose}' for state in ['empty', 'loaded', 'unloading'] for pose in ['travel-0', 'travel-1', 'park-0', 'park-1']],
 'citizens-actions': [f'{person}-{pose}' for person in ['gardener', 'carpenter', 'herbalist', 'farmer', 'merchant', 'fisher'] for pose in ['carry-front-0', 'carry-front-1', 'carry-back-0', 'carry-back-1', 'work-front-0', 'work-front-1', 'work-back-0', 'work-back-1']],
 'story-portraits': ['gardener', 'carpenter', 'herbalist', 'farmer', 'merchant', 'fisher', 'baker', 'blacksmith', 'teacher', 'doctor', 'beekeeper', 'winemaker'],
 'street-decor': ['flower-box', 'flower-trellis', 'flower-arch-lights', 'boardwalk', 'railing', 'parasol', 'willow', 'floating-dock', 'crates', 'barrels', 'anvil', 'sign-flags'],
 'season-props': ['spring-flower-cart', 'spring-picnic', 'summer-fruit-stall', 'summer-ribbons', 'autumn-harvest', 'autumn-pumpkins', 'winter-market', 'winter-tree'],
 'industry2': ['cow-barn', 'dairy', 'vineyard', 'winery', 'wine-cellar', 'apiary'],
 'housing-levels': ['cottage-1', 'cottage-2', 'cottage-3', 'farmhouse-1', 'farmhouse-2', 'farmhouse-3'],
 'pets': [f'{animal}-{pose}' for animal in ['cat', 'dog'] for pose in ['front-0', 'front-1', 'back-0', 'back-1']],
 'machine-layers': ['windmill-rotor', 'waterwheel', 'saw-blade', 'fishing-rod', 'minecart', 'hammer']}
pivots = {'windmill-rotor': [.53, .53], 'waterwheel': [.42, .55], 'saw-blade': [.59, .53], 'fishing-rod': [.17, .87], 'minecart': [.51, .84], 'hammer': [.52, .83]}
labels = ['灾害与修缮', '居民搬运与劳作', '商队', '邻居立绘', '街区装饰', '季节摆件', '乳品与酿酒产业', '住宅成长', '宠物', '机械分层']
REPAIR = {'citizens-actions', 'disasters'}


def grow(mask, radius):
    """Dilate a boolean mask by `radius` pixels (Chebyshev)."""
    out = mask.copy()
    for _ in range(radius):
        stepped = out.copy()
        stepped[1:, :] |= out[:-1, :]; stepped[:-1, :] |= out[1:, :]
        stepped[:, 1:] |= out[:, :-1]; stepped[:, :-1] |= out[:, 1:]
        out = stepped
    return out


def label_components(alpha, threshold):
    """4-connected components; ids start at 1 because 0 is the empty sentinel."""
    mask = alpha > threshold
    height, width = mask.shape
    lab = np.zeros((height, width), np.int32)
    parent, nid, previous = {}, 1, []
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for y in range(height):
        xs = np.nonzero(mask[y])[0]
        current = []
        if len(xs):
            starts = xs[np.r_[True, np.diff(xs) > 1]]
            ends = xs[np.r_[np.diff(xs) > 1, True]]
            for x0, x1 in zip(starts, ends):
                rid = nid; parent[rid] = rid; nid += 1
                for (p0, p1, pid) in previous:
                    if p0 <= x1 and x0 <= p1:
                        ra, rb = find(pid), find(rid)
                        if ra != rb:
                            parent[rb] = ra
                lab[y, x0:x1 + 1] = rid
                current.append((x0, x1, rid))
        previous = current
    lut = np.zeros(nid, np.int32)
    for r in range(1, nid):
        lut[r] = find(r)
    lab = lut[lab]
    areas = {int(r): int((lab == r).sum()) for r in np.unique(lab) if r}
    return lab, areas


def nominal_cells(frame_names, cols, rows, width, height):
    cells = {}
    for i, name in enumerate(frame_names):
        row, col = divmod(i, cols)
        cells[name] = (round(col * width / cols), round(row * height / rows),
                       round((col + 1) * width / cols), round((row + 1) * height / rows))
    return cells


def repair_atlas(image, frame_names, cols, rows):
    """Relocate every sprite whole into its own cell. Pure translation of source pixels.

    Ownership is decided on alpha above LINK, where sprites are still separate. Every
    pixel above LINK survives exactly once; the local soft fringe below LINK travels
    with its sprite, and only the wide sub-3%-opacity haze is left behind.
    """
    array = np.asarray(image.convert('RGBA')).copy()
    alpha = array[:, :, 3].astype(np.int16)
    height, width = alpha.shape
    lab, areas = label_components(alpha, LINK)
    cells = nominal_cells(frame_names, cols, rows, width, height)

    ys_all, xs_all = np.nonzero(lab)
    labels = lab[ys_all, xs_all]
    x0 = np.full(lab.max() + 1, width + 1, np.int64)
    y0 = np.full(lab.max() + 1, height + 1, np.int64)
    x1 = np.full(lab.max() + 1, -1, np.int64)
    y1 = np.full(lab.max() + 1, -1, np.int64)
    np.minimum.at(x0, labels, xs_all); np.minimum.at(y0, labels, ys_all)
    np.maximum.at(x1, labels, xs_all); np.maximum.at(y1, labels, ys_all)

    owned = {name: [] for name in frame_names}
    for r, area in areas.items():
        ys, xs = np.nonzero(lab == r)
        best, best_n = None, 0
        for name, (cx0, cy0, cx1, cy1) in cells.items():
            n = int(((ys >= cy0) & (ys < cy1) & (xs >= cx0) & (xs < cx1)).sum())
            if n > best_n:
                best, best_n = name, n
        owned[best].append(r)
    for name, ids in owned.items():
        if not ids:
            raise AssertionError(f'no sprite assigned to {name}')

    index = {name: i + 1 for i, name in enumerate(frame_names)}
    lut = np.zeros(lab.max() + 1, np.int16)
    for name, ids in owned.items():
        lut[ids] = index[name]
    owners = lut[lab]
    fringe = (alpha > 0) & (alpha <= LINK)
    masks = {}
    for name in frame_names:
        own = owners == index[name]
        masks[name] = own | (fringe & grow(own, FRINGE))

    claim = np.zeros((height, width), np.int16)
    for m in masks.values():
        claim += m
    shared = int((claim > 1).sum())
    for name in masks:
        masks[name] &= (claim == 1)
    kept = np.zeros((height, width), bool)
    for m in masks.values():
        kept |= m
    lost_visible = int(((alpha > LINK) & ~kept).sum())
    if lost_visible:
        raise AssertionError(f'{lost_visible} pixels above alpha {LINK} were lost')

    boxes = {}
    for name, m in masks.items():
        ys, xs = np.nonzero(m)
        boxes[name] = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    cell_w = max(bx1 - bx0 for bx0, by0, bx1, by1 in boxes.values()) + GUTTER * 2
    cell_h = max(by1 - by0 for bx0, by0, bx1, by1 in boxes.values()) + GUTTER * 2

    packed = Image.new('RGBA', (cell_w * cols, cell_h * rows), (0, 0, 0, 0))
    frames = {}
    for name in frame_names:
        row, col = divmod(frame_names.index(name), cols)
        bx0, by0, bx1, by1 = boxes[name]
        keep = masks[name][by0:by1, bx0:bx1]
        patch = array[by0:by1, bx0:bx1].copy()
        patch[:, :, 3] = np.where(keep, patch[:, :, 3], 0)
        w, h = bx1 - bx0, by1 - by0
        x = col * cell_w + (cell_w - w) // 2
        y = row * cell_h + cell_h - GUTTER - h
        packed.alpha_composite(Image.fromarray(patch, 'RGBA'), (x, y))
        solid_y, solid_x = np.nonzero(patch[:, :, 3] > SOLID)
        content = [int(solid_x.min()), int(solid_y.min()), int(solid_x.max()) + 1, int(solid_y.max()) + 1]
        foot_y = int(solid_y.max())
        band = solid_x[solid_y >= foot_y - 2]
        foot_x = int(round(float(band.mean())))
        frames[name] = {'x': x, 'y': y, 'w': w, 'h': h, 'row': row, 'column': col,
                        'contentBounds': content,
                        'pivot': [round(foot_x, 2), round(foot_y, 2)],
                        'origin': [round(foot_x / w, 4), round(foot_y / h, 4)]}
    repair = {'method': 'exclusive-ownership relocation',
              'gutter': GUTTER,
              'fringeRadius': FRINGE,
              'sourceCanvas': [width, height],
              'shippedCanvas': list(packed.size),
              'cell': [cell_w, cell_h],
              'spritesMoved': len(frame_names),
              'spritesRelocated': sum(min(1, len(owned[n])) for n in frame_names),
              'hazePixelsLeftBehind': int((fringe & ~kept).sum()),
              'fringePixelsSharedAndCleared': shared,
              'pixelsAboveLinkLost': lost_visible}
    return packed, frames, repair


def neighbour_gap(frames):
    """Smallest transparent distance between the content boxes of any two frames."""
    boxes = [(f['x'] + f['contentBounds'][0], f['y'] + f['contentBounds'][1],
              f['x'] + f['contentBounds'][2], f['y'] + f['contentBounds'][3]) for f in frames.values()]
    best = None
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            ax0, ay0, ax1, ay1 = boxes[i]
            bx0, by0, bx1, by1 = boxes[j]
            dx = max(0, bx0 - ax1, ax0 - bx1)
            dy = max(0, by0 - ay1, ay0 - by1)
            gap = max(dx, dy) if (dx and dy) else dx or dy
            if best is None or gap < best:
                best = gap
    return best


def verify_boxes(alpha, frames, threshold=SOLID, core=200, core_area=200):
    """Measure real misattribution, not mere connectivity.

    Soft-edged art can join neighbouring sprites into one component, which says
    nothing about whether a frame box holds the wrong picture. So: find each
    sprite's core (high-alpha blob), assign every visible pixel to its nearest
    core, then compare those owners against the frame boxes.
    """
    height, width = alpha.shape
    visible = alpha > LINK
    ys, xs = np.nonzero(visible)
    if not len(ys):
        return [], [], {'foreignPixels': 0, 'orphanPixels': 0}

    lab, areas = label_components(alpha, core)
    cores = {r for r, area in areas.items() if area >= core_area}
    if not cores:
        return [], [], {'foreignPixels': 0, 'orphanPixels': 0}

    # multi-source BFS: every visible pixel inherits its nearest core
    owner = np.zeros((height, width), np.int32)
    queue = []
    for r in cores:
        r_ys, r_xs = np.nonzero(lab == r)
        owner[r_ys, r_xs] = r
        queue.extend(zip(r_ys.tolist(), r_xs.tolist()))
    unclaimed = visible & (owner == 0)
    head = 0
    while head < len(queue):
        y, x = queue[head]; head += 1
        here = owner[y, x]
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and unclaimed[ny, nx]:
                unclaimed[ny, nx] = False
                owner[ny, nx] = here
                queue.append((ny, nx))

    # a core belongs to the box holding most of it
    home = {}
    for r in cores:
        cys, cxs = np.nonzero(lab == r)
        counts = {}
        for name, f in frames.items():
            n = int(((cys >= f['y']) & (cys < f['y'] + f['h']) & (cxs >= f['x']) & (cxs < f['x'] + f['w'])).sum())
            if n:
                counts[name] = n
        home[r] = max(counts, key=counts.get)

    foreign, orphan = 0, 0
    offenders = {}
    for name, f in frames.items():
        x0, y0 = f['x'], f['y']
        x1, y1 = x0 + f['w'], y0 + f['h']
        box_owner = owner[y0:y1, x0:x1]
        box_visible = visible[y0:y1, x0:x1] & (box_owner > 0)
        stray = box_visible & ~np.isin(box_owner, [r for r, h in home.items() if h == name])
        n = int(stray.sum())
        if n:
            foreign += n
            offenders[name] = n
    orphan = int((visible & (owner == 0)).sum())
    return [], [], {'foreignPixels': foreign, 'orphanPixels': orphan, 'byFrame': offenders}


def grid_frames(image, frame_names, cols, rows):
    """The generator's own cell pitch. Kept for atlases that did not need repair."""
    alpha = np.asarray(image.getchannel('A'))
    width, height = image.size
    frames, touch, margins = {}, [], []
    for i, frame_name in enumerate(frame_names):
        row, col = divmod(i, cols)
        x0, x1 = round(col * width / cols), round((col + 1) * width / cols)
        y0, y1 = round(row * height / rows), round((row + 1) * height / rows)
        if frame_name in names['story-portraits']:
            profile = (alpha[:, x0:x1] > 48).sum(axis=1)
            radius = round(height / rows * .19)
            if row:
                y0 = min(range(max(0, y0 - radius), min(height, y0 + radius + 1)), key=lambda p: (profile[p], abs(p - y0)))
            if row < rows - 1:
                y1 = min(range(max(0, y1 - radius), min(height, y1 + radius + 1)), key=lambda p: (profile[p], abs(p - y1)))
            xp = (alpha[y0:y1, :] > 48).sum(axis=0)
            rad = round(width / cols * .11)
            if col:
                x0 = min(range(x0 - rad, x0 + rad + 1), key=lambda p: (xp[p], abs(p - x0)))
            if col < cols - 1:
                x1 = min(range(x1 - rad, x1 + rad + 1), key=lambda p: (xp[p], abs(p - x1)))
        cell = alpha[y0:y1, x0:x1]
        yy, xx = np.nonzero(cell > 48)
        assert len(xx) > 20, (frame_name, 'empty cell')
        bounds = [int(xx.min()), int(yy.min()), int(xx.max() + 1), int(yy.max() + 1)]
        w, h = x1 - x0, y1 - y0
        minimum = min(bounds[0] / w, bounds[1] / h, (w - bounds[2]) / w, (h - bounds[3]) / h)
        edges = int((cell[0] > 48).sum() + (cell[-1] > 48).sum() + (cell[:, 0] > 48).sum() + (cell[:, -1] > 48).sum())
        if edges:
            touch.append({'frame': frame_name, 'edgePixels': edges})
        margins.append(round(minimum, 4))
        origin = pivots.get(frame_name, [.5, .88])
        frames[frame_name] = {'x': x0, 'y': y0, 'w': w, 'h': h, 'row': row, 'column': col,
                              'contentBounds': bounds,
                              'pivot': [round(origin[0] * w, 2), round(origin[1] * h, 2)],
                              'origin': origin}
    return frames, touch, margins


result = []
for spec, label in zip(json.loads((SOURCE / 'selected-atlases.json').read_text())['assets'], labels):
    name = spec['name']
    raw = SOURCE / 'raw' / f'{name}.png'
    if name in REPAIR:
        # raw/ holds the untouched generator output. It is the only valid input for a
        # repair: SOURCE/<name>.png is overwritten with the repaired atlas, so repairing
        # it again would compound the transform. Fail loudly instead of guessing.
        assert raw.exists(), (f'{raw} is missing. Restore the pristine generator output before '
                              f'repairing {name}: unzip output/dream-town-assets-2026-09-11.zip '
                              f'and copy game-assets-2026-09-11/{name}.png there.')
        image = Image.open(raw)
        assert image.mode == 'RGBA', name
        cols, rows = spec['actualColumns'], spec['actualRows']
        image, frames, repair = repair_atlas(image, names[name], cols, rows)
        image.save(SOURCE / f'{name}.png')
        subprocess.run(['cwebp', *WEBP, str(SOURCE / f'{name}.png'), '-o', str(PUBLIC / f'{name}.webp')], check=True)
        touch, margins = [], []
    else:
        image = Image.open(SOURCE / f'{name}.png')
        assert image.mode == 'RGBA', name
        cols, rows = spec['actualColumns'], spec['actualRows']
        frames, touch, margins = grid_frames(image, names[name], cols, rows)
        repair = None

    web = Image.open(PUBLIC / f'{name}.webp')
    alpha_src = np.asarray(image.getchannel('A'))
    alpha_web = np.asarray(web.getchannel('A'))
    assert np.array_equal(alpha_src, alpha_web), f'Alpha changed: {name}'
    plane = np.asarray(image.convert('RGB')).astype(np.int16)
    plane_web = np.asarray(web.convert('RGB')).astype(np.int16)
    visible = alpha_src > SOLID
    deviation = int(np.abs(plane[visible] - plane_web[visible]).max()) if visible.any() else 0

    _, _, ownership = verify_boxes(alpha_src, frames)
    if name in REPAIR:
        assert ownership['foreignPixels'] == 0, f'{name}: {ownership["foreignPixels"]} px of another sprite inside a frame: {ownership["byFrame"]}'
        # The repair may only drop sub-LINK haze, never content that is actually visible.
        with Image.open(raw) as pristine:
            visible_source = int((np.asarray(pristine.getchannel('A')) > LINK).sum())
        visible_shipped = int((alpha_src > LINK).sum())
        assert visible_shipped == visible_source, f'{name}: visible pixels {visible_shipped} != source {visible_source}'
        assert repair['pixelsAboveLinkLost'] == 0, f'{name}: lost visible pixels'

    width, height = image.size
    atlas = {
        'name': name, 'label': label, 'image': f'/assets/{name}.webp',
        'width': width, 'height': height, 'columns': cols, 'rows': rows,
        'activeFrames': len(frames), 'reservedCells': cols * rows - len(frames),
        'requestedCanvas': [spec['width'], spec['height']],
        'requestedGrid': [spec['cols'], spec['rows']],
        'frames': frames,
        'pivotStatus': ('measured from solid alpha, feet at the bottom-centre of each frame'
                        if name in REPAIR else
                        'suggested-local-anchors; building attachment must be calibrated' if name == 'machine-layers' else
                        'local sprite anchors'),
        'alphaPercent': round(float((alpha_src == 0).mean()) * 100, 2),
        'pngBytes': (SOURCE / f'{name}.png').stat().st_size,
        'webpBytes': (PUBLIC / f'{name}.webp').stat().st_size,
        'qa': {
            'alphaPreserved': True,
            'minOpaqueMargin': min(margins) if margins else 0,
            'requested12PercentPaddingMet': (min(margins) >= .12) if margins else False,
            'edgeFrames': touch,
            'exactRequestedCanvas': (width, height) == (spec['width'], spec['height']),
            'runtimeIntegrated': False,
            'verifyForeignPixelsInFrames': ownership['foreignPixels'],
            'verifyForeignByFrame': ownership['byFrame'],
            'verifyOrphanPixels': ownership['orphanPixels'],
            'minNeighbourGapPixels': neighbour_gap(frames),
            'maxVisibleRgbDeviationFromSource': deviation,
        },
    }
    if repair:
        atlas['qa']['pixelRepair'] = repair
    (PUBLIC / f'{name}-frames.json').write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + '\n')
    (PUBLIC / f'{name}-prompts.json').write_text(json.dumps({'generator': 'built-in image_gen', 'initialPrompt': spec['content'], 'finalPrompt': spec['selectedPrompt'], 'referencePaths': spec.get('refs', [spec['ref']] if spec.get('ref') else []), 'selectedSource': spec['source']}, ensure_ascii=False, indent=2) + '\n')
    result.append(atlas)

summary = {'created': '2026-09-11', 'generator': 'built-in image_gen',
           'encoding': 'cwebp quality90 alpha_quality100; source resolution retained',
           'pngBytes': sum(x['pngBytes'] for x in result),
           'webpBytes': sum(x['webpBytes'] for x in result),
           'activeFrames': sum(x['activeFrames'] for x in result),
           'atlases': result}
(SOURCE / 'manifest.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
(PUBLIC / 'expansion-assets.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')

runtime = SOURCE / 'runtime'
runtime.mkdir(exist_ok=True)
for name in names:
    shutil.copy(PUBLIC / f'{name}-frames.json', runtime / f'{name}-frames.json')
    shutil.copy(PUBLIC / f'{name}-prompts.json', runtime / f'{name}-prompts.json')
    shutil.copy(PUBLIC / f'{name}.webp', runtime / f'{name}.webp')
shutil.copy(PUBLIC / 'expansion-assets.json', runtime / 'expansion-assets.json')
with zipfile.ZipFile(ROOT / 'output' / 'dream-town-assets-2026-09-11.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(SOURCE.rglob('*')):
        if path.is_file():
            archive.write(path, Path(SOURCE.name) / path.relative_to(SOURCE))

print(json.dumps({k: v for k, v in summary.items() if k != 'atlases'}, ensure_ascii=False))
for atlas in result:
    qa = atlas['qa']
    print(f"{atlas['name']:17s} {atlas['width']}x{atlas['height']} {atlas['activeFrames']:3d} frames"
          f"  alpha {atlas['alphaPercent']:5.2f}%  foreignPX={qa['verifyForeignPixelsInFrames']:6d}"
          f"  gap={str(qa['minNeighbourGapPixels']):>4}  rgbdev={qa['maxVisibleRgbDeviationFromSource']:3d}"
          f"{'  REPAIRED' if 'pixelRepair' in qa else ''}")
for atlas in result:
    if 'pixelRepair' in atlas['qa']:
        print(atlas['name'], json.dumps(atlas['qa']['pixelRepair'], ensure_ascii=False))
