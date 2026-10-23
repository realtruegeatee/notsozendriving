<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Game logic lives in src/game: per-frame state is a mutable store (store.ts), road shape is pure math in road.ts; React state only for UI toggles. Why: avoids re-renders every frame.
- Offline: vite-plugin-pwa generateSW writes sw.js into dist/client; register only via src/lib/register-sw.ts (refuses dev/preview/iframe, ?sw=off). Why: avoids stale caches in preview.
