# Fighting Dreamers

Quick Three.js prototype for a KOF/Tekken-inspired 2.5D fighting game loop with a playable character, autonomous CPU opponent, hit detection, blocking, health, rounds, and a browser playability check.

Matches are first to 3 round wins. Press `R` to start a fresh match.

The fighters auto-discover every top-level FBX character model in `Models/`, randomly choose a ready stance from the active animation style, and use root-motion-authored action clips for attacks. Current clips live in `Models/Anim/default/`; add future style folders beside `default` with the same clip names. Only the sumo stance holds on its final frame; the other stances loop.

Background PNGs in `Backgrounds/` are auto-discovered and randomly selected with the same cylindrical placement formula. If a PLY has the same basename as the PNG, it is paired for later point-cloud use.

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
