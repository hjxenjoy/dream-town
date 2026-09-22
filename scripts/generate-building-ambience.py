"""Deterministic, original synthesized building ambience (not field recordings).

Eight-second seamless mono PCM loops. Run with .venv/bin/python.
"""
from pathlib import Path
import json
import wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/expansion-2026-09/audio'
OUT.mkdir(parents=True,exist_ok=True)
RATE=22050
SECONDS=8
N=RATE*SECONDS
T=np.arange(N)/RATE
TAU=2*np.pi

SPECS=[
 ('sugar-mill','糖厂 · 木轮与滚轴','machine',72,8),
 ('tavern','酒馆 · 杯盏与壁炉','glass',620,6),
 ('herb-garden','药草园 · 风与鸟鸣','birds',1800,5),
 ('pig-farm','猪场 · 低哼与草垫','animal',115,5),
 ('butcher','肉铺 · 木案与工具','wood',260,7),
 ('hunter-lodge','猎人屋 · 林风与木响','birds',1400,4),
 ('barracks','兵营 · 操练脚步','wood',170,12),
 ('guard-post','岗哨 · 旗帜与远钟','bell',480,3),
 ('castle','城堡 · 风与钟声','bell',220,2),
 ('mine','矿井 · 镐击与洞穴低鸣','metal',920,7),
 ('rail-station','车站 · 车轮与蒸汽','machine',95,16),
 ('airfield','机场 · 螺旋桨低鸣','engine',85,16),
 ('harbor','港口 · 水波与木船','water',160,7),
 ('zoo','动物园 · 鸟鸣与栖地','birds',2200,7),
 ('windmill','风车 · 木轮旋转','machine',58,6),
 ('smithy','铁匠铺 · 锤击与炉火','metal',1350,9),
 ('bakery','面包房 · 炉火与木案','wood',360,4),
 ('pasture','牧场 · 草风与铃声','bell',780,5),
 ('rain','雨天 · 细雨','rain',140,9),
 ('snow-wind','雪天 · 轻风','wind',70,2),
]

manifest=[]
for index,(name,label,kind,freq,count) in enumerate(SPECS):
    rng=np.random.default_rng(20260921+index)
    noise=rng.normal(size=N)
    bins=np.fft.rfftfreq(N,1/RATE)
    cutoff=1800 if kind=='rain' else 450
    bed=np.fft.irfft(np.fft.rfft(noise)/(1+(bins/cutoff)**2),n=N)
    bed/=max(float(np.std(bed)),1e-9)
    signal=bed*(.04 if kind in ['rain','wind','water'] else .012)
    if kind in ['machine','engine']:
        f=round(freq*SECONDS)/SECONDS
        signal+=.045*np.sin(TAU*f*T)*(1+.35*np.sin(TAU*count/SECONDS*T))
        signal+=.016*np.sin(TAU*2*f*T)
    for event in range(count):
        duration={'bell':1.8,'birds':.48,'animal':.55,'water':.45}.get(kind,.22)
        t=np.arange(round(duration*RATE))/RATE
        envelope=(1-np.exp(-t*80))*np.exp(-t*({'bell':3,'birds':6}.get(kind,12)))
        f=freq*rng.uniform(.88,1.12)
        if kind=='birds':
            sound=np.sin(TAU*(f*t+700*t*t))*np.sin(np.pi*np.minimum(t/duration,1))**2
        elif kind=='animal':
            sound=np.sin(TAU*(f*t-25*t*t))+.35*np.sin(TAU*2*f*t)
        elif kind in ['metal','bell','glass']:
            sound=np.sin(TAU*f*t)+.45*np.sin(TAU*f*2.71*t)+.18*np.sin(TAU*f*4.13*t)
        elif kind=='water':
            sound=np.sin(TAU*(f*t+180*t*t))+.15*rng.normal(size=len(t))
        else:
            sound=.6*rng.normal(size=len(t))+.4*np.sin(TAU*f*t)
        sound*=envelope*.12
        start=round((event+.3+rng.uniform(-.15,.15))*N/count)
        np.add.at(signal,(start+np.arange(len(sound)))%N,sound)
    # Short periodic blend prevents a discontinuity at the loop seam.
    fade=round(.04*RATE)
    boundary=(signal[0]+signal[-1])/2
    signal[:fade]=boundary+(signal[:fade]-boundary)*np.linspace(0,1,fade)
    signal[-fade:]=boundary+(signal[-fade:]-boundary)*np.linspace(1,0,fade)
    signal*=.38/max(float(np.max(np.abs(signal))),1e-9)
    pcm=np.round(signal*32767).astype('<i2')
    assert pcm[0]==pcm[-1]
    path=OUT/f'{name}.wav'
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(RATE);wav.writeframes(pcm.tobytes())
    manifest.append({'name':name,'label':label,'url':f'/assets/expansion-2026-09/audio/{name}.wav','seconds':SECONDS,'sampleRate':RATE,'channels':1,'loop':True,'runtimeIntegrated':False,'generator':'original deterministic procedural synthesis','qa':{'peakDbFS':round(float(20*np.log10(np.abs(signal).max())),2),'rmsDbFS':round(float(20*np.log10(np.sqrt(np.mean(signal**2)))),2),'clippedSamples':int((np.abs(pcm.astype(int))>=32767).sum()),'seamDelta':int(pcm[-1])-int(pcm[0])}})
(OUT/'manifest.json').write_text(json.dumps({'created':'2026-09-21','note':'程序合成的风格化环境音，非录音；尚未接入建筑距离混音。','tracks':manifest},ensure_ascii=False,indent=2)+'\n')
print(f'Generated {len(manifest)} ambience loops, {SECONDS}s each; no clipping, equal seam samples.')
