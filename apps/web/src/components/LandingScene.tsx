'use client';

import { useEffect, useState } from 'react';

// Positions and dimensions use the original 1920 × 1080 Figma canvas.
type Cloud = [number, number, number, number, number, string];
const far: Cloud[] = [
  [150,115,370.3,100.141,.66,'cd937'], [760,345,187.52,80.799,.69,'93887'],
  [1300,65,246.24,149.236,.73,'9c7d7'], [1510,445,149.06,108.46,.76,'96d99'],
  [1990,410,327.98,88.697,.66,'cd937'], [2570,105,210.96,90.898,.69,'93887'],
  [3080,260,205.2,124.364,.73,'9c7d7'], [3480,120,174.76,127.16,.76,'96d99'],
  [4100,205,359.72,97.28,.66,'cd937'], [4730,475,169.94,73.224,.69,'93887'],
  [5110,20,259.92,157.527,.73,'9c7d7'], [5440,305,154.2,112.2,.76,'96d99'],
];
const near: Cloud[] = [
  [0,226,529,143.059,.90,'9b510'], [572,402,293,126.248,.76,'f4510'],
  [1473,0,342,207.273,.94,'64eea'], [1418,293,257,187,.82,'641c1'],
  [2040,118,529,143.059,.84,'dc6b4'], [2635,470,293,126.248,.70,'f9c02'],
  [3070,55,342,207.273,.90,'2ec8a'], [3385,335,257,187,.78,'66121'],
  [4090,315,449.65,121.6,.74,'d5a16'], [4690,165,322.3,138.873,.86,'4ba4c'],
  [5210,26,280.44,169.964,.80,'6c413'], [5440,450,277.56,201.96,.72,'3c70f'],
];
const lights = [
  [3,82,790],[22,155,755],[41,325,675],[57,344,720],[76,410,805],[92,535,785],
  [108,552,825],[124,768,635],[140,790,675],[159,812,720],[178,850,790],
  [194,1045,645],[210,1068,690],[226,1120,785],[245,1215,790],[264,1300,770],
  [280,1410,625],[299,1434,670],[315,1510,720],[331,1598,625],[350,1622,680],
  [366,1780,675],[385,1804,720],[401,1870,800],[417,620,810],[433,255,815],
  [449,930,820],[468,1340,815],[487,72,835],[503,470,840],[522,1185,840],[538,1715,825],
];
function Clouds({ clouds, repeats }: { clouds: Cloud[]; repeats: number }) {
  return Array.from({ length: repeats }, (_, repeat) => clouds.map(([x,y,width,height,opacity,asset], index) => (
    <img key={`${repeat}-${index}`} src={`/landing/${asset}.png`} alt="" style={{ left: x + repeat * 5760, top: y, width, height, opacity }} />
  )));
}
export default function LandingScene() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = () => setScale(Math.max(window.innerWidth / 1920, window.innerHeight / 1080));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return <div className="landing-scenery" aria-hidden="true">
    <div className="landing-canvas" style={{ transform: `translateX(-50%) scale(${scale})` }}>
      <img className="landing-city" src="/landing/city.png" alt="" />
      {lights.map(([id,x,y], index) => <span key={id} className="landing-light" data-node-id={`15:${id}`} style={{ left:x, top:y, width:3 + index % 3 * 1.5, height:6 + index % 4 * 1.5, borderRadius:index % 3 === 0 ? 1 : 1.5, background:['#ff9e1f','#ffc759','#ffe09e','#c7e0ff'][index % 4] }} />)}
      <div className="landing-clouds landing-clouds-far" data-node-id="14:2"><Clouds clouds={far} repeats={1} /><Clouds clouds={far.slice(0,4).map(([x,...rest]) => [x+5760,...rest] as Cloud)} repeats={1} /></div>
      <div className="landing-clouds landing-clouds-near" data-node-id="9:4"><Clouds clouds={near} repeats={2} /><Clouds clouds={near.slice(0,4).map(([x,...rest]) => [x+11520,...rest] as Cloud)} repeats={1} /></div>
    </div>
  </div>;
}
