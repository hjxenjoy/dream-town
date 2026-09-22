"""Complete the current BuildingKind sound catalog; preserve the first 20 tracks.

Run with .venv/bin/python. Original synthesized sound design, not recordings.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/accessories-2026-09/audio'
OUT.mkdir(parents=True,exist_ok=True)
buildings=json.loads(subprocess.check_output(['node','--experimental-strip-types','--input-type=module','-e',"import {BUILDINGS} from './src/sim/data.ts'; console.log(JSON.stringify(Object.entries(BUILDINGS).map(([id,b])=>({id,name:b.name,category:b.category}))))"],cwd=ROOT,text=True))
old=json.loads((ROOT/'public/assets/expansion-2026-09/audio/manifest.json').read_text())
existing={t['name']:t for t in old['tracks']}
REUSE={'mine','windmill','smithy','bakery','pasture'}
# Explicit assignments: adding a BuildingKind without a sound is a hard failure.
GROUPS={
 'leaves':'flowernursery orchardhouse garden oak cherry pine maple flowerarch flowerbox trellis willow vineyard flowercart harvestpile',
 'home':'homestead cottage farmhouse rowhouse apartment',
 'chicken':'chickencoop', 'bubbles':'jamkitchen dairy winery cellar',
 'crowd':'market teahouse school theatre townhall picniccorner parasol tavern',
 'fire':'kiln smelter brickworks', 'wood':'lumber forester warehouse crates barrels',
 'machine':'feedmill weaver tailor sawmill sugarmill',
 'water':'fishpond fishery well watertower fountain dock',
 'quiet':'clinic', 'bell':'chapel firestation firetower',
 'footsteps':'boardwalk bench gazebo', 'cloth':'railing archlights signflags',
 'metal':'anvil quarry', 'cow':'cowbarn', 'bees':'apiary', 'field':'farm canefield hopsfield',
 # Defence: a post is a flag and a distant bell, the barracks adds drill steps, and a wall
 # is masonry in the wind. Assigned on the profile that fits rather than inventing kinds.
 'bell':'chapel firestation firetower guardpost',
 'footsteps':'boardwalk bench gazebo barracks',
 'cloth':'railing archlights signflags wall',
}
assigned={name:group for group,names in GROUPS.items() for name in names.split()}
assert set(assigned)|REUSE=={b['id'] for b in buildings}
assert not set(assigned)&REUSE
RATE=22050;SECONDS=8;N=RATE*SECONDS;T=np.arange(N)/RATE;TAU=2*np.pi
DESCRIPTIONS={'leaves':'枝叶轻风与短鸟鸣','home':'轻脚步与门木响','chicken':'鸡鸣与啄食','bubbles':'液体翻动与器皿','crowd':'无词人群低语、脚步与杯盏','fire':'炉火噼啪与低鸣','wood':'木料搬运与敲击','machine':'机械转动与节律敲击','water':'水波、滴水与水流','quiet':'安静室内与轻脚步','bell':'远钟与轻风','footsteps':'木板脚步与微风','cloth':'织物与风','metal':'金属轻击','cow':'低哞与草垫','bees':'蜂群轻嗡与微风','field':'田野微风与鸟鸣'}
tracks=[];mapping={}
for building in buildings:
    name=building['id']
    if name in REUSE:
        mapping[name]={'url':existing[name]['url'],'source':'existing','profile':existing[name]['name'],'runtimeIntegrated':False}
        continue
    kind=assigned[name]
    seed=int.from_bytes(hashlib.sha256(name.encode()).digest()[:4],'little')
    rng=np.random.default_rng(seed)
    bins=np.fft.rfftfreq(N,1/RATE)
    noise=rng.normal(size=N)
    cutoff={'water':1600,'fire':2300,'leaves':900,'cloth':650}.get(kind,400)
    bed=np.fft.irfft(np.fft.rfft(noise)/(1+(bins/cutoff)**2),n=N)
    bed/=np.std(bed)
    signal=bed*(.014 if kind in ['quiet','home'] else .025)
    signal*=.7+.3*np.sin(TAU*T/SECONDS+rng.uniform(0,TAU))**2
    def add(start, sound):
        np.add.at(signal,(int(start*RATE)+np.arange(len(sound)))%N,sound)
    if kind=='crowd':
        # Independent pitched/formant voices: unintelligible chatter, no spoken text.
        for voice in range(9 if name=='market' else 5):
            for utterance in range(3):
                duration=rng.uniform(.55,1.3);t=np.arange(int(duration*RATE))/RATE
                fundamental=rng.uniform(95,230)
                source=sum(np.sin(TAU*fundamental*k*t+rng.uniform(0,TAU))/k for k in range(1,14))
                spectrum=np.fft.rfft(source);f=np.fft.rfftfreq(len(t),1/RATE)
                spectrum*=sum(np.exp(-.5*((f-center)/width)**2) for center,width in [(500,100),(1400,180),(2400,250)])
                voice_sound=np.fft.irfft(spectrum,n=len(t))
                voice_sound/=max(np.max(np.abs(voice_sound)),1e-9)
                env=np.sin(np.pi*t/duration)**2*(.35+.65*np.sin(TAU*rng.uniform(3,5)*t)**2)
                add(rng.uniform(0,SECONDS),voice_sound*env*.04)
    if kind in ['machine','bees','fire']:
        frequency={'machine':65,'bees':175,'fire':40}[kind]+(seed%40)
        frequency=round(frequency*SECONDS)/SECONDS
        signal+=.025*np.sin(TAU*frequency*T)*(1+.3*np.sin(TAU*8*T/SECONDS))
        signal+=.012*np.sin(TAU*frequency*2*T)
    count={'crowd':14,'machine':16,'water':13,'fire':30,'quiet':3,'bell':2}.get(kind,7)
    for i in range(count):
        dur={'bell':2.1,'cow':.8,'chicken':.3}.get(kind,.25)
        t=np.arange(int(dur*RATE))/RATE
        env=(1-np.exp(-t*90))*np.exp(-t*(2.8 if kind=='bell' else 12))
        freq=rng.uniform(170,340)
        if kind in ['bell','metal','crowd','bubbles']:
            freq=rng.uniform(430,1100)
            sound=np.sin(TAU*freq*t)+.35*np.sin(TAU*freq*2.73*t)
        elif kind=='water':
            sound=np.sin(TAU*(650*t-350*t*t))+.2*rng.normal(size=len(t))
        elif kind in ['leaves','field']:
            sound=np.sin(TAU*(rng.uniform(1600,2600)*t+1000*t*t))*.4
        elif kind in ['cow','chicken']:
            freq=100 if kind=='cow' else 620
            sound=np.sin(TAU*(freq*t+60*t*t))+.3*np.sin(TAU*freq*2*t)
        elif kind in ['cloth','fire','bees']:
            sound=rng.normal(size=len(t))*.35
        else:
            sound=np.sin(TAU*freq*t)*.65+rng.normal(size=len(t))*.3
        gain=.018 if kind=='quiet' else .045 if kind=='crowd' else .07
        add((i+rng.uniform(.1,.9))*SECONDS/count,sound*env*gain)
    # Continuous endpoints and matched short fades at the seam.
    fade=int(.04*RATE);boundary=(signal[0]+signal[-1])/2
    signal[:fade]=boundary+(signal[:fade]-boundary)*np.linspace(0,1,fade)
    signal[-fade:]=boundary+(signal[-fade:]-boundary)*np.linspace(1,0,fade)
    signal*=min(.40/max(np.max(np.abs(signal)),1e-9),.07/max(np.sqrt(np.mean(signal**2)),1e-9))
    pcm=np.round(signal*32767).astype('<i2')
    with wave.open(str(OUT/f'{name}.wav'),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(RATE);wav.writeframes(pcm.tobytes())
    url=f'/assets/accessories-2026-09/audio/{name}.wav'
    track={'name':name,'label':building['name']+' · '+DESCRIPTIONS[kind],'url':url,'profile':kind,'seconds':SECONDS,'sampleRate':RATE,'channels':1,'loop':True,'runtimeIntegrated':False,'generator':'original deterministic procedural synthesis','qa':{'clippedSamples':int((np.abs(pcm.astype(int))>=32767).sum()),'seamDelta':int(pcm[-1])-int(pcm[0]),'peakDbFS':round(float(20*np.log10(np.abs(signal).max())),2)}}
    tracks.append(track)
    mapping[name]={'url':url,'source':'new','profile':kind,'runtimeIntegrated':False}
    assert track['qa']['clippedSamples']==0 and track['qa']['seamDelta']==0
manifest={'created':'2026-09-21','note':'原创程序合成，非实录；同类声源共享合成配方，各建筑独立文件与随机种子，未接入游戏。','tracks':tracks,'buildingCoverage':mapping,'buildingCount':len(buildings),'existingReused':len(REUSE),'newTracks':len(tracks)}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'{len(tracks)} new loops + {len(REUSE)} existing = {len(mapping)}/{len(buildings)} building mappings')
