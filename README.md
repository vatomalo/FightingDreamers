# Fighting Dreamers

Quick Three.js prototype for a KOF/Tekken-inspired 2.5D fighting game loop with a playable character, autonomous CPU opponent, hit detection, blocking, health, rounds, and a browser playability check.

Matches are first to 3 round wins. Press `R` to start a fresh match.

The fighters auto-discover every top-level FBX character model in `Models/`, randomly choose their own playable animation style, randomly choose a ready stance from that style, and use root-motion-authored action clips for attacks. `Models/Anim/default/` is now shared support only: hit reactions, death clips, victory clips, and base stances. The old default attack kit lives in `Models/Anim/martial/`, while `Models/Anim/boxing/`, `Models/Anim/hooligan/`, and `Models/Anim/capoeira/` only use attacks present directly in their own style folders. No style inherits attacks from `default`; they only inherit shared reactions and victories. Use `?style=martial`, `?p1style=boxing&p2style=hooligan`, `?style=capoeira`, or any other discovered style name to force a set while testing. Extra motion-library clips can live in style subfolders until they get dedicated states. Only the sumo stance holds on its final frame; the other stances loop.

Animation playback is style-tuned: hooligan is slower and heavier, martial is faster, and boxing is the fastest.

Background PNGs in `Backgrounds/` are auto-discovered and randomly selected with the same cylindrical placement formula. If a PLY has the same basename as the PNG, it is paired for later point-cloud use. A matching `sky-{name}.png` replaces the upper cylinder while `{name}.png` stays on the lower stage/ground section.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Controls

- `A` / `D` or arrow keys: walk
- `S`: crouch
- `L`: block
- `J`: jab
- `K`: kick
- `W` / `Space` / up arrow: jump
- `W` + `K`: jump kick
- `I`: roundhouse
- `U`: heavy attack
- `O`: grab / throw break
- Hold and release attack buttons: slower charged attack with more damage and launch
- `R`: reset round

## Test

Start the dev server, then run:

```bash
npm run test:playability
```

The test drives Chromium at desktop and mobile sizes and checks rendering, approach behavior, blocking, reset, player attacks, CPU attacks, grab root motion, hit/block/throw events, health changes, spacing, bounds, timer progress, and browser errors.

## Code Map

- `src/animationStateMachine.js`: animation/combat states and attack timing windows
- `src/aiController.js`: deterministic autonomous CPU decision loop
- `src/combat.js`: health, movement, spacing, hit/block/throw resolution, rounds
- `src/fighterFactory.js`: FBX fighter loading, stance/action animation setup, and arena
- `src/main.js`: scene setup, pose driver, camera, HUD
