# Fighting Dreamers

Quick Three.js prototype for a KOF/Tekken-inspired 2.5D fighting game loop with a playable character, autonomous CPU opponent, hit detection, blocking, health, rounds, and a browser playability check.

The fighters use the FBX character models in `Models/`, randomly choose a ready stance from `Models/Anim`, and use root-motion-authored action clips for attacks. Only the sumo stance holds on its final frame; the other stances loop.

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
