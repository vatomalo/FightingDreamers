# Fighting Dreamers

Quick Three.js prototype for a KOF/Tekken-inspired 2.5D fighting game loop with a playable character, autonomous CPU opponent, hit detection, blocking, health, rounds, and a browser playability check.

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
- `I`: roundhouse
- `U`: heavy attack
- `R`: reset round

## Test

Start the dev server, then run:

```bash
npm run test:playability
```

The test drives Chromium at desktop and mobile sizes and checks rendering, approach behavior, blocking, reset, player attacks, CPU attacks, hit/block events, health changes, spacing, bounds, timer progress, and browser errors.

## Code Map

- `src/animationStateMachine.js`: animation/combat states and attack timing windows
- `src/aiController.js`: deterministic autonomous CPU decision loop
- `src/combat.js`: health, movement, spacing, hit/block resolution, rounds
- `src/fighterFactory.js`: procedural Three.js fighters and arena
- `src/main.js`: scene setup, pose driver, camera, HUD
