import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { CarModel } from "./Cars";
import { roadYd } from "./road";
import { CARS, game, net } from "./store";
import type { CarId } from "./store";
import { interpolatePose, INTERPOLATION_MS, STALE_MS } from "./multiplayer-math";
import type { Sample } from "./multiplayer-math";
import { playHorn } from "./signals";

type NetState = { id: string; car: CarId; x: number; y: number; z: number; yaw: number; warp?: number; seq?: number };
const NET_TICK = 1 / 6; // keeps message volume low with up to ~6 drivers per room
const tmp = new THREE.Vector3();

export function Multiplayer({ room, name, car }: { room: string; name: string; car: CarId }) {
  const [peers, setPeers] = useState<{ id: string; car: CarId }[]>([]);
  const roster = useRef(new Set<string>());
  const states = useRef(new Map<string, { car: CarId; samples: Sample[]; seq: number }>());
  const meshes = useRef(new Map<string, THREE.Group>());
  const chan = useRef<RealtimeChannel | null>(null);
  const acc = useRef(0);
  const last = useRef({ x: 0, z: 0, yaw: 0, at: -1, car: "", warp: -1 });
  const seq = useRef(0);
  const currentCar = useRef(car);
  currentCar.current = car;

  useEffect(() => {
    const channel = supabase.channel(`zen:${room}`, { config: { broadcast: { self: false }, presence: { key: net.id } } });
    channel
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const s = payload as NetState;
        if (s.id === net.id || !roster.current.has(s.id)) return;
        if (![s.x, s.y, s.z, s.yaw].every(Number.isFinite) || !CARS.some((c) => c.id === s.car)) return;
        const prev = states.current.get(s.id);
        if (typeof s.seq === "number" && prev && s.seq <= prev.seq) return;
        const sample = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, warp: s.warp ?? 0, at: performance.now() };
        const samples = prev?.samples ?? [];
        const latest = samples.at(-1);
        if (latest && (latest.warp !== sample.warp || Math.hypot(latest.x - sample.x, latest.z - sample.z) > 25)) samples.length = 0;
        samples.push(sample);
        if (samples.length > 8) samples.shift();
        states.current.set(s.id, { car: s.car, samples, seq: s.seq ?? (prev?.seq ?? 0) + 1 });
        if (!prev || prev.car !== s.car) setPeers((p) => p.map((x) => (x.id === s.id ? { ...x, car: s.car } : x)));
      })
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (!payload || !roster.current.has(payload.id)) return;
        const peer = net.positions.get(payload.id);
        if (!peer || performance.now() - peer.at > STALE_MS) return;
        if (payload.kind === "flash") net.flashes.set(payload.id, performance.now() + 650);
        if (payload.kind === "horn") {
          const distance = Math.hypot(peer.x - game.x, peer.z - game.z);
          if (distance < 90) playHorn(Math.max(0, 1 - distance / 90));
        }
      })
      .on("presence", { event: "sync" }, () => {
        const list = Object.entries(channel.presenceState<{ name: string; car: CarId }>()).map(([id, m]) => ({ id, name: m[0]?.name ?? "driver", car: m[0]?.car ?? "sedan" }));
        net.roster = list.map((p) => ({ id: p.id, name: p.name }));
        net.onRoster?.();
        const others = list.filter((p) => p.id !== net.id);
        roster.current = new Set(others.map((p) => p.id));
        for (const id of [...states.current.keys()]) if (!roster.current.has(id)) { states.current.delete(id); net.positions.delete(id); net.ready.delete(id); }
        setPeers(others.map((p) => ({ id: p.id, car: states.current.get(p.id)?.car ?? p.car })));
      })
      .subscribe((status) => {
        console.log("[net] channel:", status);
        net.status = status === "SUBSCRIBED" ? "online" : status === "CLOSED" ? "offline" : "connecting";
        net.onRoster?.();
        if (status === "SUBSCRIBED") { last.current.at = -1; void channel.track({ name, car: currentCar.current }); }
      });
    chan.current = channel;
    net.signal = (kind) => { if (net.status === "online") void channel.send({ type: "broadcast", event: "signal", payload: { id: net.id, kind } }); };
    return () => { chan.current = null; net.signal = null; net.flashes.clear(); states.current.clear(); net.positions.clear(); net.ready.clear(); net.teleportTo = null; net.roster = []; net.status = "offline"; net.onRoster?.(); void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, name]);

  useEffect(() => { if (net.status === "online") void chan.current?.track({ name, car }); }, [car, name]);

  useFrame((_, raw) => {
    const now = performance.now();
    const renderAt = now - (roster.current.size >= 6 ? 300 : INTERPOLATION_MS);
    let changed = false;
    for (const [id, remote] of states.current) {
      const g = meshes.current.get(id);
      const samples = remote.samples;
      const latest = samples.at(-1);
      if (!latest) continue;
      const fresh = now - latest.at < STALE_MS;
      if (g) g.visible = fresh;
      if (!fresh) { net.positions.delete(id); if (net.ready.delete(id)) changed = true; continue; }
      if (!net.ready.has(id)) { net.ready.add(id); changed = true; }
      while (samples.length > 2 && (samples[1]?.at ?? Infinity) <= renderAt) samples.shift();
      const first = samples[0];
      if (!first) continue;
      const s = interpolatePose(first, samples[1] ?? first, renderAt);
      net.positions.set(id, { ...s, at: latest.at });
      if (!g) continue;
      tmp.set(s.x, s.y, s.z);
      g.position.copy(tmp);
      g.rotation.set(Math.atan(-roadYd(s.z)), s.yaw, 0, "YXZ");
    }
    if (changed) net.onRoster?.();
    acc.current += raw;
    const tick = roster.current.size >= 6 ? 1 / 4 : NET_TICK;
    if (acc.current < tick && last.current.warp === game.warp) return;
    acc.current = 0;
    const c = chan.current;
    if (!c || net.status !== "online" || document.hidden || !game.started) return;
    const x = Math.round(game.x * 100) / 100, z = Math.round(game.z * 100) / 100, yaw = Math.round(game.yaw * 100) / 100;
    const l = last.current;
    const moved = Math.abs(x - l.x) + Math.abs(z - l.z) + Math.abs(yaw - l.yaw) > 0.02 || l.car !== car || l.warp !== game.warp;
    if (!moved && now - l.at < 1000) return;
    last.current = { x, z, yaw, at: now, car, warp: game.warp };
    void c.send({ type: "broadcast", event: "state", payload: { id: net.id, car, x, y: Math.round(game.y * 100) / 100, z, yaw, warp: game.warp, seq: ++seq.current } });
  }, -1);

  return (
    <>
      {peers.map((p) => (
        <group key={p.id} visible={false} ref={(g) => { if (g) meshes.current.set(p.id, g); else meshes.current.delete(p.id); }}>
          <Suspense fallback={null}>
            <CarModel key={p.car} driverId={p.id} url={`/models/${CARS.some((c) => c.id === p.car) ? p.car : "sedan"}.glb`} />
          </Suspense>
        </group>
      ))}
    </>
  );
}
