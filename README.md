# Angry Tirds

A physics-based game inspired by Angry Birds, built with JavaScript and the Box2D physics engine.

## Features

- Box2D physics engine integration via WebAssembly
- Responsive canvas rendering
- Gamepad and keyboard controls
- Sound effects
- Modular codebase architecture

## Getting Started

1. Install dependencies
```bash
npm install
```

2. Start development server
```bash
npm run dev
```

3. Build for production
```bash
npm run build
```

## Game Controls

- **Arrow Keys / D-Pad**: Move bird during aiming
- **Z / A Button**: Hold to aim and pull back the slingshot, release to fire
- **Enter / Start Button**: Restart the game when game over
- **Shift / Select Button**: Toggle debug mode

## Code Structure

The game is built with a modular architecture:

- `src/` - JavaScript source files
  - `main.js` - Main entry point and game initialization
  - `physics.js` - Box2D physics setup and utilities
  - `entities.js` - Entity creation and management
  - `gameController.js` - Game state and input handling
  - `gameRenderer.js` - Canvas rendering
  - `levels.js` - Level creation and configuration
  - `sound.js` - Sound management
  - `utils.js` - Helper functions
  - `angryTirds.js` - Original monolithic implementation (kept for reference)

## URL Parameters

- `?new=true` - Use the refactored modular implementation
- `?game=debug` - Run in Box2D debug visualization mode (not a full game)

## Technical Details

- Box2D 3 for WebAssembly is used for physics simulation
- Canvas API for rendering
- Web Audio API for sound effects
- Gamepad API for controller support
- Entity tracking system using unique IDs
- 4 substeps per frame for accurate physics collision
- Continuous collision detection for fast-moving objects

## License

Copyright 2025 Luis Montes. Licensed under the MIT License.