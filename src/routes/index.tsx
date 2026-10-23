import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Game } from "../game/Game";
import { HUD } from "../game/HUD";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Zen Drive — an endless calm road" },
      { name: "description", content: "A relaxing endless driving game. Cruise winding roads with gentle traffic, by day or by night." },
      { property: "og:title", content: "Zen Drive — an endless calm road" },
      { property: "og:description", content: "A relaxing endless driving game. Cruise winding roads with gentle traffic, by day or by night." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [night, setNight] = useState(false);
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <Game night={night} />
      <HUD night={night} setNight={setNight} />
    </div>
  );
}
