import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CHUNK, ROAD_HALF, groundY, hash, roadX, roadY } from "./road";
import { game } from "./store";

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
  return { road, ground };
}

function Chunk({ k, roadMat, groundMat }: { k: number; roadMat: THREE.Material; groundMat: THREE.Material }) {
  const g = useMemo(() => buildChunk(k), [k]);
  useEffect(() => () => { g.road.dispose(); g.ground.dispose(); }, [g]);
  return (
    <>
      <mesh geometry={g.ground} material={groundMat} receiveShadow />
      <mesh geometry={g.road} material={roadMat} receiveShadow />
    </>
  );
}

export const lampHeadMat = new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd89a", emissiveIntensity: 0, toneMapped: false });
export const lampGlowMat = new THREE.MeshBasicMaterial({ color: "#ffcf87", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

const TREE_STEP = 7;
const ROCK_STEP = 11;
const LAMP_STEP = 50;
const MAXT = 200;
const foliage = ["#7fa67a", "#9bbf7a", "#5f8f6a", "#d9a86c", "#c98a6b", "#a8bf86"].map((c) => new THREE.Color(c));

function Scenery() {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leafA = useRef<THREE.InstancedMesh>(null);
  const leafB = useRef<THREE.InstancedMesh>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const glows = useRef<THREE.InstancedMesh>(null);
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
        if (hash(i * 2 + side) < 0.3) continue;
        const z = -i * TREE_STEP - hash(i + side * 3) * 4;
        const u = side * (10 + hash(i * 3 + side * 7) * 55);
        const x = roadX(z) + u;
        const y = groundY(z, u);
        const sc = 0.8 + hash(i * 5 + side) * 1.3;
        d.rotation.set(0, hash(i) * 6, 0);
        d.scale.setScalar(sc);
        d.position.set(x, y + 0.8 * sc, z); d.updateMatrix(); trunk.current!.setMatrixAt(t, d.matrix);
        d.position.set(x, y + 2.6 * sc, z); d.updateMatrix(); leafA.current!.setMatrixAt(t, d.matrix);
        d.position.set(x, y + 3.9 * sc, z); d.scale.setScalar(sc * 0.7); d.updateMatrix(); leafB.current!.setMatrixAt(t, d.matrix);
        const c = foliage[Math.floor(hash(i * 7 + side) * foliage.length)]!;
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
      if (hash(i * 13) < 0.4) continue;
      const z = -i * ROCK_STEP;
      const u = side * (7.5 + hash(i * 17) * 30);
      const sc = 0.3 + hash(i * 19) * 1.1;
      d.position.set(roadX(z) + u, groundY(z, u) + sc * 0.2, z);
      d.rotation.set(hash(i) * 3, hash(i * 2) * 3, 0);
      d.scale.set(sc * 1.3, sc, sc);
      d.updateMatrix();
      rocks.current!.setMatrixAt(r++, d.matrix);
    }
    rocks.current!.count = r;
    rocks.current!.instanceMatrix.needsUpdate = true;
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

export function World() {
  const [base, setBase] = useState(0);
  const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.92 }), []);
  const groundMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), []);
  useFrame(() => {
    const b = Math.floor(-game.z / CHUNK);
    if (b !== base) setBase(b);
  });
  const ks = [];
  for (let k = base - 1; k <= base + 5; k++) ks.push(k);
  return (
    <>
      {ks.map((k) => <Chunk key={k} k={k} roadMat={roadMat} groundMat={groundMat} />)}
      <Scenery />
    </>
  );
}
