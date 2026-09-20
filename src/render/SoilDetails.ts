import type Phaser from 'phaser';

/** Small ground details stay inside the plot and never cover the crop body. */
export function drawSoilDetails(g: Phaser.GameObjects.Graphics, level: number) {
  g.clear();
  if (level < 2) return;
  g.lineStyle(3, 0x92734e, .8);
  g.beginPath(); g.moveTo(-49, 2); g.lineTo(0, 26); g.lineTo(49, 2); g.strokePath();
  if (level >= 3) {
    const posts = [[-44, 5], [-24, 15], [-4, 25]];
    g.lineStyle(2, 0xd8bd84, 1);
    g.lineBetween(-44, -1, -4, 19);
    for (const [x, y] of posts) {
      g.lineStyle(3, 0x987047, 1); g.lineBetween(x, y, x, y - 11);
      g.fillStyle(0xe9d49e, 1); g.fillCircle(x, y - 11, 1.8);
    }
  }
  if (level >= 4) {
    for (const [x, y] of [[16, 19], [26, 14], [37, 9]]) {
      g.lineStyle(2, 0x6f924e, 1); g.lineBetween(x, y, x, y - 5);
      g.fillStyle(0x86a55b, 1); g.fillEllipse(x + 2, y - 2, 5, 3);
      g.fillStyle(0xf1c976, 1); g.fillCircle(x, y - 6, 2.5);
    }
  }
  if (level >= 5) {
    for (const [x, y] of [[-47, 7], [-35, 13], [44, 5]]) {
      g.fillStyle(0x739657, 1); g.fillEllipse(x, y, 8, 4);
      g.fillStyle(0xf1b8b5, 1); g.fillCircle(x - 1, y - 3, 3);
      g.fillStyle(0xffefd1, 1); g.fillCircle(x - 1, y - 3, 1);
    }
  }
}

export function drawHomeDetails(g: Phaser.GameObjects.Graphics, style: string, width=150, height=150) {
  g.clear();
  if (style === 'original') return;
  const mint=style==='mint',rose=style==='rose',harvest=style==='harvest';
  if(mint)style='courtyard';
  if(rose||harvest)style='flowers';
  if(style==='flowers'&&!harvest){
    // Attach flower boxes to the lower facade; size follows the current house frame.
    for(const [x,y,slope] of [[-width*.12,-height*.32,.35],[width*.20,-height*.24,-.35]]){
      const box=width*.11;
      g.fillStyle(rose?0xa76570:0x946a44);g.beginPath();
      g.moveTo(x-box/2,y);g.lineTo(x+box/2,y+slope*box);g.lineTo(x+box/2,y+slope*box+5);g.lineTo(x-box/2,y+5);g.closePath();g.fillPath();
      g.lineStyle(1,0xe4c995);g.lineBetween(x-box/2,y,x+box/2,y+slope*box);
      for(const offset of [-.35,0,.35]){
        const fx=x+box*offset,fy=y+slope*box*(offset+.5)-2;
        g.fillStyle(0x66874a);g.fillEllipse(fx,fy,7,5);
        g.fillStyle(rose?0xda7395:0xf2c582);g.fillCircle(fx,fy-2,2.7);
        g.fillStyle(0xffedd2);g.fillCircle(fx,fy-2,.9);
      }
    }
  }
  if (style === 'flowers' || style === 'courtyard') {
    for (const x of [-39, 32]) {
      g.fillStyle(mint?0x7caa98:rose?0xba7b83:0x916641); g.fillRoundedRect(x - 7, 0, 14, 7, 2);
      g.fillStyle(0x739850); g.fillEllipse(x, -1, 18, 9);
      for (const offset of [-5, 0, 5]) {g.fillStyle(rose?0xd8718a:mint?0xf0edcc:offset===0?0xffdfa0:0xeaa8ad);g.fillCircle(x+offset,-4,2.5);}
    }
  }
  if (style === 'courtyard') {
    g.lineStyle(3,0xc6ac76);g.lineBetween(-33,13,0,27);g.lineBetween(0,27,31,13);
    for(const [x,y] of [[-33,13],[-16,20],[0,27],[16,20],[31,13]])g.lineBetween(x,y,x,y-8);
  }
  if(harvest){for(const x of [-20,0,20]){g.fillStyle(0xcf913d);g.fillEllipse(x,17,13,10);g.lineStyle(2,0x6c8550);g.lineBetween(x,12,x+1,9);}}
  if (style === 'laundry') {
    g.lineStyle(3,0x93714e);g.lineBetween(-39,8,-39,-12);g.lineBetween(3,28,3,8);
    g.lineStyle(1,0xe7d9b0);g.lineBetween(-39,-10,3,10);
    for(const [x,y,color] of [[-31,-6,0xf7ebc9],[-19,0,0x9bbac1],[-7,6,0xe7b1a6]]) {
      g.fillStyle(color);g.beginPath();g.moveTo(x,y);g.lineTo(x+8,y+4);g.lineTo(x+8,y+13);g.lineTo(x,y+9);g.closePath();g.fillPath();
    }
  }
}
