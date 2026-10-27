import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CHUNK, ROAD_HALF, WATER_DROP, biomeWeights, groundY, hash, lakeAmount, roadX, roadY } from "./road";
import { game } from "./store";
import { weatherAt, worldMood } from "./worlds";

function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4b4d52";
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4000; i++) {
    const v = 60 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  }
  g.fillStyle = "#e9e4d8";
  g.fillRect(10, 0, 6, 512);
  g.fillRect(240, 0, 6, 512);
  g.fillStyle = "#f0d38a";
  g.fillRect(124, 0, 8, 260);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const US = [-150, -110, -80, -60, -45, -34, -26, -20, -15, -11, -8, -6.5, -5.6, 0, 5.6, 6.5, 8, 11, 15, 20, 26, 34, 45, 60, 80, 110, 150];
const grassA = new THREE.Color("#93ad74");
const grassB = new THREE.Color("#6f9467");
const grassC = new THREE.Color("#b6b77c");
const gravel = new THREE.Color("#b9a98c");
const forestG = new THREE.Color("#4f7a52");
const sandA = new THREE.Color("#dcc58e");
const sandB = new THREE.Color("#c9a26a");
const rockC = new THREE.Color("#8d8a83");
const snow = new THREE.Color("#f3f2ee");
const shore = new THREE.Color("#cdbd93");
const tundraG = new THREE.Color("#e8eef0");
const neonG = new THREE.Color("#2a2638");
const ashG = new THREE.Color("#2e2724");
const lavaG = new THREE.Color("#d2481c");
const tropicG = new THREE.Color("#5fbf5a");
const tmp = new THREE.Color();

function buildChunk(k: number) {
  // Road ribbon
  const rows = 50;
  const rp: number[] = [];
  const ruv: number[] = [];
  const ri: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const s = k * CHUNK + (i * CHUNK) / rows;
    const z = -s;
    const cx = roadX(z);
    const y = roadY(z) + 0.02;
    rp.push(cx - ROAD_HALF, y, z, cx + ROAD_HALF, y, z);
    ruv.push(0, s / 16, 1, s / 16);
    if (i < rows) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      ri.push(a, b, c, b, d, c);
    }
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
  road.setAttribute("uv", new THREE.Float32BufferAttribute(ruv, 2));
  road.setIndex(ri);
  road.computeVertexNormals();

  // Terrain
  const grows = 25;
  const gp: number[] = [];
  const gc: number[] = [];
  const gi: number[] = [];
  const col = new THREE.Color();
  const n = US.length;
  for (let i = 0; i <= grows; i++) {
    const z = -(k * CHUNK + (i * CHUNK) / grows);
    const cx = roadX(z);
    for (let j = 0; j < n; j++) {
      const u = US[j]!;
      gp.push(cx + u, groundY(z, u), z);
      if (Math.abs(u) < 7.5) col.copy(gravel);
      else {
        const t = 0.5 + 0.5 * Math.sin(z * 0.02 + u * 0.05);
        col.copy(grassA).lerp(grassB, t).lerp(grassC, hash(i * 31 + j * 7 + k * 101) * 0.35);
        const w = biomeWeights(z);
        col.lerp(forestG, w.forest * 0.8);
        col.lerp(tmp.copy(sandA).lerp(sandB, t), w.desert);
        const h = groundY(z, u) - roadY(z);
        if (w.alpine > 0) col.lerp(h > 22 ? snow : rockC, w.alpine * Math.min(1, Math.max(0, (h - 6) / 8)));
        col.lerp(tundraG, w.tundra * 0.9);
        col.lerp(neonG, w.neon);
        col.lerp(hash(i * 13 + j * 5 + k * 7) > 0.88 ? lavaG : ashG, w.volcanic);
        col.lerp(Math.abs(u) < 14 ? sandA : tropicG, w.tropical);
        if (lakeAmount(z, u) > 0.2 && h < 0) col.lerp(shore, 0.7);
      }
      gc.push(col.r, col.g, col.b);
      if (i < grows && j < n - 1) {
        const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
        gi.push(a, b, c, b, d, c);
      }
    }
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
  ground.setAttribute("color", new THREE.Float32BufferAttribute(gc, 3));
  ground.setIndex(gi);
  ground.computeVertexNormals();

  // Water strip on both sides; it sinks out of sight wherever there is no lake.
  const wp: number[] = [], wi: number[] = [];
  const WU = [-160, -12, 12, 160];
  for (let i = 0; i <= grows; i++) {
    const z = -(k * CHUNK + (i * CHUNK) / grows);
    const cx = roadX(z);
    for (let j = 0; j < 4; j++) {
      const u = WU[j]!;
      wp.push(cx + u, roadY(z) - WATER_DROP - (1 - lakeAmount(z, u)) * 30, z);
      if (i < grows && j !== 1 && j < 3) { const a = i * 4 + j, b = a + 1, c = a + 4, d = c + 1; wi.push(a, b, c, b, d, c); }
    }
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
  water.setIndex(wi);
  water.computeVertexNormals();
  return { road, ground, water };
}

function Chunk({ k, roadMat, groundMat, waterMat }: { k: number; roadMat: THREE.Material; groundMat: THREE.Material; waterMat: THREE.Material }) {
  const g = useMemo(() => buildChunk(k), [k]);
  useEffect(() => () => { g.road.dispose(); g.ground.dispose(); g.water.dispose(); }, [g]);
  return (
    <>
      <mesh geometry={g.ground} material={groundMat} receiveShadow />
      <mesh geometry={g.road} material={roadMat} receiveShadow />
      <mesh geometry={g.water} material={waterMat} />
    </>
  );
}

export const lampHeadMat = new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd89a", emissiveIntensity: 0, toneMapped: false });
export const lampGlowMat = new THREE.MeshBasicMaterial({ color: "#ffcf87", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

const TREE_STEP = 7;
const ROCK_STEP = 11;
const LAMP_STEP = 50;
const MAXT = 200;
const dryFoliage = ["#a8a66a", "#8f9a5a", "#c4b27a"].map((c) => new THREE.Color(c));
const pineFoliage = ["#3f6b4c", "#4c7a57", "#2f5a44"].map((c) => new THREE.Color(c));
const frostFoliage = ["#dfe8e6", "#b9cdc6", "#9fb5ad"].map((c) => new THREE.Color(c));
const palmFoliage = ["#2fae5a", "#4cc46a", "#7bd36a"].map((c) => new THREE.Color(c));
const neonFoliage = ["#ff4fa3", "#3fe0ff", "#b36bff"].map((c) => new THREE.Color(c));
const deadFoliage = new THREE.Color("#3a302b");
const TOWER_STEP = 13;
const MAXB = 70;
const signColors = ["#ff3fa0", "#2fe6ff", "#c86bff", "#ffd23f"].map((c) => new THREE.Color(c));
const towerColors = ["#1d1a2b", "#28233a", "#151321"].map((c) => new THREE.Color(c));
const MOUNT_STEP = 90;
const MAXM = 24;
const foliage = ["#7fa67a", "#9bbf7a", "#5f8f6a", "#d9a86c", "#c98a6b", "#a8bf86"].map((c) => new THREE.Color(c));

function Scenery() {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leafA = useRef<THREE.InstancedMesh>(null);
  const leafB = useRef<THREE.InstancedMesh>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const glows = useRef<THREE.InstancedMesh>(null);
  const mounts = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const towers = useRef<THREE.InstancedMesh>(null);
  const signs = useRef<THREE.InstancedMesh>(null);
  const last = useRef(-9999);
  const d = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const s0 = -game.z;
    const key = Math.floor(s0 / TREE_STEP);
    if (key === last.current) return;
    last.current = key;
    const from = s0 - 60, to = s0 + 460;
    // trees
    let t = 0;
    for (let i = Math.floor(from / TREE_STEP); i < to / TREE_STEP && t < MAXT; i++) {
      for (const side of [-1, 1]) {
        const z = -i * TREE_STEP - hash(i + side * 3) * 4;
        const w = biomeWeights(z);
        const skip = 0.3 - 0.28 * w.forest + 0.62 * w.desert + 0.3 * w.alpine + 0.75 * w.neon + 0.5 * w.volcanic - 0.1 * w.tundra;
        if (hash(i * 2 + side) < skip) continue;
        const u = side * (10 + hash(i * 3 + side * 7) * (55 - 30 * w.forest));
        if (lakeAmount(z, u) > 0.3 && Math.abs(u) > 12) continue;
        const x = roadX(z) + u;
        const y = groundY(z, u);
        const sc = 0.8 + hash(i * 5 + side) * 1.3;
        d.rotation.set(0, hash(i) * 6, 0);
        d.scale.setScalar(sc);
        d.position.set(x, y + 0.8 * sc, z); d.updateMatrix(); trunk.current!.setMatrixAt(t, d.matrix);
        d.position.set(x, y + 2.6 * sc, z); d.updateMatrix(); leafA.current!.setMatrixAt(t, d.matrix);
        d.position.set(x, y + 3.9 * sc, z); d.scale.setScalar(sc * 0.7); d.updateMatrix(); leafB.current!.setMatrixAt(t, d.matrix);
        const pick = hash(i * 7 + side);
        const c = w.volcanic > 0.5 ? deadFoliage : w.tundra > 0.5 ? frostFoliage[Math.floor(pick * frostFoliage.length)]! : w.tropical > 0.5 ? palmFoliage[Math.floor(pick * palmFoliage.length)]! : w.neon > 0.5 ? neonFoliage[Math.floor(pick * neonFoliage.length)]! : w.desert > 0.5 ? dryFoliage[Math.floor(pick * dryFoliage.length)]! : w.alpine > 0.5 || w.forest > 0.5 ? pineFoliage[Math.floor(pick * pineFoliage.length)]! : foliage[Math.floor(pick * foliage.length)]!;
        leafA.current!.setColorAt(t, c); leafB.current!.setColorAt(t, c);
        t++;
        if (t >= MAXT) break;
      }
    }
    for (const m of [trunk, leafA, leafB]) {
      m.current!.count = t;
      m.current!.instanceMatrix.needsUpdate = true;
      if (m.current!.instanceColor) m.current!.instanceColor.needsUpdate = true;
    }
    // rocks
    let r = 0;
    for (let i = Math.floor(from / ROCK_STEP); i < to / ROCK_STEP && r < 100; i++) {
      const side = hash(i * 9) > 0.5 ? 1 : -1;
      const z = -i * ROCK_STEP;
      const rw = biomeWeights(z);
      if (hash(i * 13) < 0.4 - 0.3 * (rw.desert + rw.alpine)) continue;
      const u = side * (7.5 + hash(i * 17) * 30);
      if (lakeAmount(z, u) > 0.3 && Math.abs(u) > 12) continue;
      const sc = 0.3 + hash(i * 19) * 1.1;
      d.position.set(roadX(z) + u, groundY(z, u) + sc * 0.2, z);
      d.rotation.set(hash(i) * 3, hash(i * 2) * 3, 0);
      d.scale.set(sc * 1.3, sc, sc);
      d.updateMatrix();
      rocks.current!.setMatrixAt(r++, d.matrix);
    }
    rocks.current!.count = r;
    rocks.current!.instanceMatrix.needsUpdate = true;
    // distant mountain range, tall and snowy in alpine stretches
    let mc = 0;
    for (let i = Math.floor((s0 - 100) / MOUNT_STEP); i < (s0 + 900) / MOUNT_STEP && mc < MAXM; i++) {
      const z = -i * MOUNT_STEP;
      const w = biomeWeights(z);
      const side = hash(i * 23) > 0.5 ? 1 : -1;
      const u = side * (170 + hash(i * 29) * 90);
      const h = (25 + hash(i * 31) * 35) * (0.5 + 1.8 * w.alpine) * (1 - 0.5 * w.desert);
      const y = roadY(z) - 4;
      d.rotation.set(0, hash(i) * 6, 0);
      const r = Math.min(h * 0.9, Math.abs(u) - 90);
      d.scale.set(r, h, r);
      d.position.set(roadX(z) + u, y + h / 2, z); d.updateMatrix(); mounts.current!.setMatrixAt(mc, d.matrix);
      mounts.current!.setColorAt(mc, tmp.copy(rockC).lerp(sandB, w.desert).lerp(forestG, w.forest * 0.6));
      const capped = h > 45;
      d.scale.set(capped ? r * 0.36 : 0.001, capped ? h * 0.36 : 0.001, capped ? r * 0.36 : 0.001);
      d.position.set(roadX(z) + u, y + h * 0.82, z); d.updateMatrix(); caps.current!.setMatrixAt(mc, d.matrix);
      mc++;
    }
    for (const m of [mounts, caps]) { m.current!.count = mc; m.current!.instanceMatrix.needsUpdate = true; }
    if (mounts.current!.instanceColor) mounts.current!.instanceColor.needsUpdate = true;
    // neon city towers with glowing sign strips
    let b = 0;
    for (let i = Math.floor(from / TOWER_STEP); i < to / TOWER_STEP && b < MAXB; i++) {
      for (const side of [-1, 1]) {
        const z = -i * TOWER_STEP;
        const w = biomeWeights(z);
        if (w.neon < 0.4 || hash(i * 41 + side) > 0.85 * w.neon || b >= MAXB) continue;
        const u = side * (16 + hash(i * 43 + side) * 40);
        const h = 12 + hash(i * 47 + side) * 45;
        const wd = 6 + hash(i * 53 + side) * 6;
        const x = roadX(z) + u, y = groundY(z, u);
        d.rotation.set(0, 0, 0);
        d.scale.set(wd, h, wd); d.position.set(x, y + h / 2, z); d.updateMatrix();
        towers.current!.setMatrixAt(b, d.matrix);
        towers.current!.setColorAt(b, towerColors[Math.floor(hash(i * 59) * 3)]!);
        d.scale.set(wd * 1.02, 0.6, wd * 1.02); d.position.set(x, y + h * (0.4 + hash(i * 61) * 0.5), z); d.updateMatrix();
        signs.current!.setMatrixAt(b, d.matrix);
        signs.current!.setColorAt(b, signColors[Math.floor(hash(i * 67 + side) * 4)]!);
        b++;
      }
    }
    for (const m of [towers, signs]) { m.current!.count = b; m.current!.instanceMatrix.needsUpdate = true; if (m.current!.instanceColor) m.current!.instanceColor.needsUpdate = true; }
    // lamps
    let l = 0;
    for (let i = Math.floor(from / LAMP_STEP); i < to / LAMP_STEP && l < 14; i++) {
      const z = -i * LAMP_STEP;
      const cx = roadX(z);
      const y = roadY(z);
      d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      d.position.set(cx + 6.8, y + 2.8, z); d.updateMatrix(); poles.current!.setMatrixAt(l, d.matrix);
      d.position.set(cx + 5.4, y + 5.55, z); d.updateMatrix(); heads.current!.setMatrixAt(l, d.matrix);
      d.position.set(cx + 4, y + 0.06, z); d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix(); glows.current!.setMatrixAt(l, d.matrix);
      l++;
    }
    for (const m of [poles, heads, glows]) {
      m.current!.count = l;
      m.current!.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, MAXT]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.18, 0.28, 1.6, 6]} />
        <meshStandardMaterial color="#7a5b45" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leafA} args={[undefined, undefined, MAXT]} castShadow frustumCulled={false}>
        <coneGeometry args={[1.6, 3, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={leafB} args={[undefined, undefined, MAXT]} castShadow frustumCulled={false}>
        <coneGeometry args={[1.4, 2.4, 7]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[undefined, undefined, 100]} castShadow receiveShadow frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#a39d92" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={mounts} args={[undefined, undefined, MAXM]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, MAXM]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#f3f2ee" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={towers} args={[undefined, undefined, MAXB]} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={signs} args={[undefined, undefined, MAXB]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={poles} args={[undefined, undefined, 14]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.18, 5.6, 0.18]} />
        <meshStandardMaterial color="#3d4248" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, 14]} material={lampHeadMat} frustumCulled={false}>
        <boxGeometry args={[2.8, 0.16, 0.4]} />
      </instancedMesh>
      <instancedMesh ref={glows} args={[undefined, undefined, 14]} material={lampGlowMat} frustumCulled={false}>
        <circleGeometry args={[5, 24]} />
      </instancedMesh>
    </>
  );
}

const DROPS = 1200, BOX = 40, HIGH = 26;
const WEATHER = {
  snow: { color: new THREE.Color("#ffffff"), size: 0.22, fall: 2.5, drift: 1.2 },
  rain: { color: new THREE.Color("#9fc8ff"), size: 0.1, fall: 22, drift: 0.2 },
  ash: { color: new THREE.Color("#ff8a5a"), size: 0.16, fall: 1.2, drift: 1.8 },
};
/** Falling snow, rain or glowing ash around the camera, faded in by world. */
function Weather() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) { p[i * 3] = (Math.random() - 0.5) * BOX * 2; p[i * 3 + 1] = Math.random() * HIGH; p[i * 3 + 2] = (Math.random() - 0.5) * BOX * 2; }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 0.2, transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
  const pts = useRef<THREE.Points>(null);
  useFrame(({ camera, clock }, dt) => {
    const w = weatherAt(-game.z);
    const kind = (Object.keys(w) as (keyof typeof w)[]).reduce((a, k) => (w[k] > w[a] ? k : a), "snow");
    const amt = w[kind];
    mat.opacity = amt * 0.85;
    pts.current!.visible = amt > 0.02;
    if (!pts.current!.visible) return;
    const look = WEATHER[kind];
    mat.color.copy(look.color); mat.size = look.size;
    pts.current!.position.set(camera.position.x, camera.position.y - 8, camera.position.z);
    const a = geo.attributes.position!.array as Float32Array, t = clock.elapsedTime, step = Math.min(dt, 0.05);
    for (let i = 0; i < DROPS; i++) {
      let y = a[i * 3 + 1]! - look.fall * step;
      if (y < 0) y += HIGH;
      a[i * 3 + 1] = y;
      a[i * 3] = ((a[i * 3]! + Math.sin(t + i) * look.drift * step + BOX) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX;
    }
    geo.attributes.position!.needsUpdate = true;
  });
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />;
}

const lakeBlue = new THREE.Color("#5d93a8"), seaBlue = new THREE.Color("#2fc2c8");
export function World() {
  const [base, setBase] = useState(0);
  const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.92 }), []);
  const waterMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5d93a8", roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88, side: THREE.DoubleSide }), []);
  const groundMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), []);
  useFrame(() => {
    const b = Math.floor(-game.z / CHUNK);
    if (b !== base) setBase(b);
    const sea = worldMood(-game.z).find(([k]) => k === "tropical")?.[1] ?? 0;
    (waterMat as THREE.MeshStandardMaterial).color.copy(lakeBlue).lerp(seaBlue, sea);
  });
  const ks = [];
  for (let k = base - 1; k <= base + 5; k++) ks.push(k);
  return (
    <>
      {ks.map((k) => <Chunk key={k} k={k} roadMat={roadMat} groundMat={groundMat} waterMat={waterMat} />)}
      <Scenery />
      <Weather />
    </>
  );
}
