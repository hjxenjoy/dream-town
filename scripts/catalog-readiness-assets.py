"""Package September additions without changing generated pixels.

Run with .venv/bin/python scripts/catalog-readiness-assets.py.
Only lossless encoding and frame metadata: pristine PNGs remain in output/.
"""
from pathlib import Path
import json
import shutil
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/readiness-assets-2026-09-21'
PUBLIC = ROOT / 'public/assets/readiness-2026-09'
PUBLIC.mkdir(parents=True, exist_ok=True)

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def split(profile, nominal, radius):
    candidates = range(max(1, nominal-radius), min(len(profile)-1, nominal+radius+1))
    return min(candidates, key=lambda p: (int(profile[p-1:p+2].sum()), abs(p-nominal)))

catalogs = []
for spec in json.loads((SOURCE / 'prompts.json').read_text()):
    name = spec['name']
    raw = SOURCE / 'raw' / f'{name}.png'
    if not raw.exists():
        sources = json.loads((SOURCE / 'sources.json').read_text())
        shutil.copy2(next(s['path'] for s in sources if s['name'] == name), raw)
    im = Image.open(raw).convert('RGBA')
    a = np.array(im.getchannel('A'))
    assert (a == 0).mean() > .25, f'{name}: background not transparent'
    w, h = im.size
    cols, rows = spec['cols'], spec['rows']
    # Generated rows are not always equally spaced. Find actual transparent gutters.
    ys = [0] + [split((a > 32).sum(axis=1), round(h*r/rows), round(h/rows*.2)) for r in range(1,rows)] + [h]
    frames, edge_warnings = {}, []
    for row in range(rows):
        y0, y1 = ys[row:row+2]
        xp = (a[y0:y1] > 32).sum(axis=0)
        nominals = [round(w*c/cols) for c in range(1,cols)]
        xs = [0] + [split(xp, n, round(w/cols*.17)) for n in nominals] + [w]
        for col in range(cols):
            frame_id = spec['frames'][row*cols+col]
            x0, x1 = xs[col:col+2]
            cell = a[y0:y1,x0:x1]
            yy, xx = np.nonzero(cell > 32)
            assert len(xx) > 30, frame_id
            # Keep original pixels intact and use a tight rectangle plus padding.
            left, top = max(x0,x0+int(xx.min())-4), max(y0,y0+int(yy.min())-4)
            right, bottom = min(x1,x0+int(xx.max())+5), min(y1,y0+int(yy.max())+5)
            if ('sequenceNames' in spec or name == 'plague-animation'):
                left, right, top, bottom = x0, x1, y0, y1
            fw, fh = right-left, bottom-top
            edge = int((cell[0]>32).sum()+(cell[-1]>32).sum()+(cell[:,0]>32).sum()+(cell[:,-1]>32).sum())
            if edge: edge_warnings.append({'frame':frame_id,'boundaryPixels':edge})
            origin = [.5,.95]
            if ('sequenceNames' in spec or name == 'plague-animation'):
                foot_y = int(yy.max())
                feet = np.nonzero(cell[max(0,foot_y-12):foot_y+1] > 128)[1]
                foot_x = float(np.median(feet)) if len(feet) else fw/2
                origin = [round(foot_x/fw,5), round(foot_y/fh,5)]
                if name.startswith('animal-walk'): origin[0] = .5
                if name == 'plague-animation': origin = [.5,.5]
            if name == 'island-products' or frame_id.startswith('thought-bubble') or frame_id == 'pelt': origin=[.5,.5]
            if name in ['weather-expansion','ai-assistant-expansion','interface-resources-expansion']: origin=[.5,.5]
            if frame_id.startswith('cursor-'): origin=[.15,.15]
            frames[frame_id] = {'x':left,'y':top,'w':fw,'h':fh,'row':row,'column':col,'pivot':[round(fw*origin[0],2),round(fh*origin[1],2)],'origin':origin}
    dest=PUBLIC/f'{name}.webp'
    im.save(dest, 'WEBP', lossless=True, exact=True, method=6)
    decoded=np.array(Image.open(dest).convert('RGBA'))
    assert np.array_equal(a,decoded[:,:,3]), name
    visible=a>0
    assert np.array_equal(np.array(im)[visible],decoded[visible]), name
    cat={'name':name,'label':spec['label'],'image':f'/assets/readiness-2026-09/{name}.webp','width':w,'height':h,'columns':cols,'rows':rows,'activeFrames':len(frames),'frames':frames,'alphaPercent':round(float((a==0).mean()*100),2),'webpBytes':dest.stat().st_size,'runtimeIntegrated':False,'animation':'static sprites; no animation sequences','pivotStatus':'suggested anchors; calibrate when integrating','qa':{'alphaPreserved':True,'visiblePixelsLossless':True,'edgeWarnings':edge_warnings}}
    assert not edge_warnings, (name, edge_warnings)
    if 'sequenceNames' in spec or name == 'plague-animation':
        cat['animation'] = 'ordered sequences with ground anchors'
        keys = spec.get('sequenceNames', ['plague-pulse'])
        count = 2 if name == 'plague-animation' else 4
        cat['sequences'] = {key:{'frames':spec['frames'][i*count:(i+1)*count], 'frameRate':1 if name.startswith('crop') else 4, 'loop':not name.startswith('crop')} for i,key in enumerate(keys)}
    write(PUBLIC/f'{name}-frames.json',cat)
    write(PUBLIC/f'{name}-prompts.json',{'generator':'built-in image_gen','finalPrompt':spec['prompt'],'source':str(raw.relative_to(ROOT))})
    catalogs.append(cat)
    print(name, len(frames), 'frames; boundary warnings:',edge_warnings)

write(PUBLIC/'manifest.json',{'created':'2026-09-21','generator':'built-in image_gen; native SVG appended by generate-geometric-assets.mjs','runtimeIntegrated':False,'activeFrames':sum(a['activeFrames'] for a in catalogs),'webpBytes':sum(a['webpBytes'] for a in catalogs),'atlases':catalogs})
