import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { CarModel } from "./Cars";
import { roadYd } from "./road";
import { CARS, game, net } from "./store";
import type { CarId } from "./store";

type NetState = { id: string; car: CarId; x: number; y: number; z: number; yaw: number };
const NET_TICK = 1 / 6; // keeps message volume low with up to ~6 drivers per room
const tmp = new THREE.Vector3();

export function Multiplayer({ room, name, car }: { room: string; name: string; car: CarId }) {
  const [peers, setPeers] = useState<{ id: string; car: CarId }[]>([]);
  const roster = useRef(new Set<string>());
  const states = useRef(new Map<string, NetState>());
  const meshes = useRef(new Map<string, THREE.Group>());
  const chan = useRef<RealtimeChannel | null>(null);
  const acc = useRef(0);
  const last = useRef({ x: 0, z: 0, yaw: 0, at: -1, car: "" });

  useEffect(() => {
    const channel = supabase.channel(`zen:${room}`, { config: { broadcast: { self: false }, presence: { key: net.id } } });
    channel
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const s = payload as NetState;
        if (s.id === net.id || !roster.current.has(s.id)) return;
        const prev = states.current.get(s.id);
        states.current.set(s.id, s);
        if (!prev || prev.car !== s.car) setPeers((p) => p.map((x) => (x.id === s.id ? { ...x, car: s.car } : x)));
      })
      .on("presence", { event: "sync" }, () => {
        const list = Object.entries(channel.presenceState<{ name: string; car: CarId }>()).map(([id, m]) => ({ id, name: m[0]?.name ?? "driver", car: m[0]?.car ?? "sedan" }));
        net.roster = list.map((p) => p.name);
        net.onRoster?.();
        const others = list.filter((p) => p.id !== net.id);
        roster.current = new Set(others.map((p) => p.id));
        for (const id of [...states.current.keys()]) if (!roster.current.has(id)) states.current.delete(id);
        setPeers(others.map((p) => ({ id: p.id, car: states.current.get(p.id)?.car ?? p.car })));
      })
      .subscribe((status) => {
        console.log("[net] channel:", status);
        net.status = status === "SUBSCRIBED" ? "online" : status === "CLOSED" ? "offline" : "connecting";
        net.onRoster?.();
        if (status === "SUBSCRIBED") void channel.track({ name, car });
      });
    chan.current = channel;
    return () => { chan.current = null; net.roster = []; net.status = "offline"; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, name]);

  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = 1 - Math.exp(-10 * dt);
    for (const [id, s] of states.current) {
      const g = meshes.current.get(id);
      if (!g) continue;
      g.visible = true;
      tmp.set(s.x, s.y, s.z);
      if (g.position.distanceTo(tmp) > 25) g.position.copy(tmp); else g.position.lerp(tmp, t);
      const dy = s.yaw - g.rotation.y;
      g.rotation.set(Math.atan(-roadYd(g.position.z)), g.rotation.y + Math.atan2(Math.sin(dy), Math.cos(dy)) * t, 0, "YXZ");
    }
    acc.current += dt;
    if (acc.current < NET_TICK) return;
    acc.current = 0;
    const c = chan.current;
    if (!c || document.hidden || !game.started) return;
    const x = Math.round(game.x * 100) / 100, z = Math.round(game.z * 100) / 100, yaw = Math.round(game.yaw * 100) / 100;
    const l = last.current;
    const moved = Math.abs(x - l.x) + Math.abs(z - l.z) + Math.abs(yaw - l.yaw) > 0.02 || l.car !== car;
    if (!moved && clock.elapsedTime - l.at < 1) return;
    last.current = { x, z, yaw, at: clock.elapsedTime, car };
    void c.send({ type: "broadcast", event: "state", payload: { id: net.id, car, x, y: Math.round(game.y * 100) / 100, z, yaw } });
  });

  return (
    <>
      {peers.map((p) => (
        <group key={p.id} visible={false} ref={(g) => { if (g) meshes.current.set(p.id, g); else meshes.current.delete(p.id); }}>
          <Suspense fallback={null}>
            <CarModel key={p.car} url={`/models/${CARS.some((c) => c.id === p.car) ? p.car : "sedan"}.glb`} />
          </Suspense>
        </group>
      ))}
    </>
  );
}
