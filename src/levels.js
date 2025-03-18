/**
 * Levels module - Handles level creation and structure
 */

// Create a level with birds, pigs, and blocks
export function createLevel(entityManager, worldDimensions) {
  // Create ground
  const groundBody = entityManager.createGround();
  
  // Get world dimensions
  const worldLeft = worldDimensions.left;
  const worldRight = worldDimensions.right;
  const worldBottom = worldDimensions.bottom;
  const worldWidth = worldDimensions.width;
  
  // Set bird count
  entityManager.birdsRemaining = 3;
  
  // Create standard slingshot position
  const slingshotX = worldLeft + (worldWidth * 0.15);
  const slingshotY = worldBottom;
  
  // First structure - simple stack
  // Bottom row - horizontal blocks
  const structure1X = slingshotX + 15; // Position to the right of slingshot
  
  // Create initial blocks
  // Bottom row
  entityManager.createWoodBlock(structure1X, worldBottom + 0.75, 5, 1.5);
  entityManager.createWoodBlock(structure1X + 5, worldBottom + 0.75, 5, 1.5);
  
  // Second row - two vertical blocks supporting a platform
  entityManager.createWoodBlock(structure1X - 2, worldBottom + 3, 1, 4);
  entityManager.createWoodBlock(structure1X + 7, worldBottom + 3, 1, 4);
  entityManager.createWoodBlock(structure1X + 2.5, worldBottom + 5.5, 7, 1.5);
  
  // Place a pig in the structure
  entityManager.createPig(structure1X + 2.5, worldBottom + 7.5, 1.0);
  
  // Third row - some small blocks for cover
  entityManager.createWoodBlock(structure1X, worldBottom + 8, 1, 2);
  entityManager.createWoodBlock(structure1X + 5, worldBottom + 8, 1, 2);
  
  // Second structure - tower on the right
  const structure2X = structure1X + 12;
  
  // Bottom platform
  entityManager.createWoodBlock(structure2X, worldBottom + 0.75, 6, 1.5);
  
  // Middle layer
  entityManager.createWoodBlock(structure2X - 2, worldBottom + 3, 1, 4);
  entityManager.createWoodBlock(structure2X + 2, worldBottom + 3, 1, 4);
  entityManager.createWoodBlock(structure2X, worldBottom + 5.5, 5, 1.5);
  
  // Place a pig in the middle
  entityManager.createPig(structure2X, worldBottom + 7.5, 1.0);
  
  // Top layer
  entityManager.createWoodBlock(structure2X - 1, worldBottom + 8, 1, 4);
  entityManager.createWoodBlock(structure2X + 1, worldBottom + 8, 1, 4);
  entityManager.createWoodBlock(structure2X, worldBottom + 10.5, 3, 1);
  
  // Top pig
  entityManager.createPig(structure2X, worldBottom + 12, 1.0);
  
  // Return initial configuration
  return {
    slingshotPosition: { x: slingshotX, y: slingshotY },
    initialBirdPosition: { x: slingshotX, y: slingshotY + 2.5 }
  };
}