# Fighting Dreamers

Quick Three.js prototype for a 3D fighting game animation state machine.

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
- `U`: heavy attack
- `H`: hitstun
- `K`: knockdown

The state machine lives in `src/animationStateMachine.js`; the Three.js pose driver is in `src/main.js`.
