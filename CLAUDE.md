# CLAUDE.md - Angry Tirds Project Guidelines

## Build Commands
- `npm run dev` - Start Vite development server (http://localhost:5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- IMPORTANT: Do NOT restart the server automatically - let the user do this manually

## Code Style Guidelines
- Use ES Modules syntax (import/export)
- Indentation: 2 spaces
- Strings: Prefer single quotes
- Variable naming:
  - camelCase for variables and functions
  - PascalCase for classes
  - UPPER_SNAKE_CASE for constants
- Use arrow functions for callbacks
- Use async/await for asynchronous operations
- Add JSDoc-style comments for utility functions
- Error handling: Use try/catch blocks around async operations
- Keep functions small and focused on a single responsibility
- Implement proper cleanup/disconnection for resources (audio, etc.)

## Technology Stack
- Vite for build tooling
- Box2D for physics (via box2d3-wasm)
- Canvas API for rendering
- Web Audio API for sound
- Gamepad API for controller support

## Project Structure
- `src/` - JavaScript source files
  - `angryTirds.js` - Main game implementation
  - `gameRenderer.js` - Canvas rendering
  - `utils.js` - Helper functions
- `public/` - Static assets (images, sounds, Box2D WASM)

## Box2D Entity Handling
- Always use uniqueIds stored in userData.id for identifying Box2D bodies
- DO NOT use Box2D pointers or internal IDs for entity tracking
- Always access entities using the userData.id value to look up in Maps
- Entity lifecycle: 
  1. Create Box2D body
  2. Assign userData.id to body
  3. Register in tracking map using uniqueId as key
  4. Register with renderer using same uniqueId
- Use a consistent approach for all entity types (bird, pig, wood)

## Physics Settings
- World settings: 10 velocity iterations, 8 position iterations
- Use 4 substeps per frame for more accurate collision
- Physics objects use compound shapes for better collision
- Enable bullet mode for fast-moving objects (birds)
- Position tracking uses direct position/angle reads from Box2D