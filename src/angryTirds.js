/**
 * AngryTirds - Main game implementation for an Angry Tirds clone
 * using Box2D physics and custom rendering with canvas
 */
import { playSound, createResourceLoader, getInput, debugPhysicsBody, getIdFromBody, testIdExtraction, generateUniqueId } from './utils.js';
import GameRenderer from './gameRenderer.js';

export function startAngryTirds(Box2DFactory) {
  Box2DFactory().then((box2d) => {
    // Get canvas and setup context
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    
    // Set physics scale based on canvas dimensions
    // Using canvas height to determine scale ensures consistent physics regardless of aspect ratio
    const physicsHeight = 30; // World is 30 meters high
    const pixelsPerMeter = canvas.height / physicsHeight;
    // Global constant for pixel scale
    const PIXEL_SCALE = pixelsPerMeter;
    
    // Calculate world dimensions based on aspect ratio
    const aspectRatio = canvas.width / canvas.height;
    const physicsWidth = physicsHeight * aspectRatio;
    const worldLeft = -physicsWidth / 2;
    const worldRight = physicsWidth / 2;
    const worldBottom = -physicsHeight / 2;
    const worldTop = physicsHeight / 2;
    
    // Put ground exactly at the bottom of the canvas
    const groundY = worldBottom;

    // Game state
    const gameState = {
      isLoading: false,
      isAiming: false,
      isFiring: false,
      birdsRemaining: 3,
      pigsRemaining: 0,
      score: 0,
      worldDimensions: { 
        width: physicsWidth, 
        height: physicsHeight,
        left: worldLeft,
        right: worldRight,
        top: worldTop,
        bottom: worldBottom,
        groundY: groundY
      },
      // Position slingshot at left side, exactly at ground level
      slingPosition: { 
        x: worldLeft + (physicsWidth * 0.15), 
        y: groundY // Exactly at ground level
      },
      // Initial bird position at slingshot
      birdPosition: { 
        x: worldLeft + (physicsWidth * 0.15), 
        y: groundY + 2.5 // Positioned at the top of the slingshot
      },
      // Slingshot strap animation
      strapAnimation: {
        active: false,
        startTime: 0,
        duration: 2000, // 2 seconds for animation
        initialPosition: null,
        targetPosition: null
      },
      currentBird: null,
      aimDirection: { x: 0, y: 0 },
      aimPower: 0,
      gameOver: false,
      victory: false,
      isGameStarted: false, // Will be set to true when first bird is fired
      lastUpdateTime: 0,
      debugMode: false, // Set to true to enable debug logging
      startButtonPressed: false, // Track if Start button was pressed
      
      // Function to get a uniqueId from a body for consistent lookup
      getIdFromBody: function(body) {
        return getIdFromBody(body);
      },
      
      // Function to get the Box2D body from uniqueId
      getBodyByUniqueId: function(uniqueId) {
        // Debug logging
        if (this.debugMode) {
          console.log(`getBodyByUniqueId called with uniqueId: ${uniqueId}`);
        }
        
        // If it's our current bird, check its uniqueId
        if (this.currentBird && this.currentBird.userData && this.currentBird.userData.id === uniqueId) {
          if (this.debugMode) {
            console.log(`  - MATCH: Current bird uniqueId=${uniqueId}`);
            console.log(`  - Current bird userData:`, this.currentBird.userData);
          }
          return this.currentBird;
        }
        
        // Check if we have this uniqueId in our body to entity mapping
        const entityId = this.bodyToEntity.get(uniqueId);
        if (entityId !== undefined) {
          const entity = this.entities[entityId];
          if (entity && entity.bodyId) {
            if (this.debugMode) {
              console.log(`  - MATCH found: uniqueId=${uniqueId}, entityId=${entityId}`);
            }
            return entity.bodyId;
          }
        }
        
        // If not found through direct mapping, search tracked bodies
        const findInTracked = (map, mapName) => {
          if (this.debugMode) {
            console.log(`  - Searching in ${mapName} (${map.size} entries)`);
          }
          
          // The map is already keyed by uniqueId
          const info = map.get(uniqueId);
          if (info && info.active) {
            const entity = this.entities[info.entityId];
            if (entity && entity.bodyId) {
              if (this.debugMode) {
                console.log(`  - MATCH found in ${mapName}: uniqueId=${uniqueId}, entityId=${info.entityId}`);
              }
              return entity.bodyId;
            }
          }
          
          return null;
        };
        
        // Try to find in birds, pigs, and blocks
        const body = findInTracked(trackedBodies.birds, 'birds') || 
                     findInTracked(trackedBodies.pigs, 'pigs') || 
                     findInTracked(trackedBodies.blocks, 'blocks');
        
        if (!body && this.debugMode) {
          console.log(`  - NO MATCH FOUND for uniqueId=${uniqueId}`);
        }
        
        return body;
      },
      
      // THIS METHOD IS ONLY KEPT FOR BACKWARD COMPATIBILITY - SHOULD NOT USE POINTERS
      getBodyById: function(ptrValue) {
        console.warn("getBodyById called with pointer value - SHOULD NOT USE BOX2D POINTERS");
        
        // We can no longer handle pointer-based lookups, so just try to get the current bird
        // as it's the most commonly needed case
        return this.currentBird;
      },
      
      // Entity system - maps entity IDs to their game objects and Box2D bodies
      entities: {}, // Maps entityId -> { type, bodyId, properties }
      bodyToEntity: new Map(), // Maps bodyId -> entityId for fast lookups
      nextEntityId: 1, // For generating unique entity IDs
      
      // Create a new entity and get its ID
      createEntity(type, bodyId, properties = {}) {
        // Generate a unique ID for this entity
        const uniqueId = generateUniqueId();
        
        // Set the ID on the body's userData
        try {
          if (bodyId && typeof bodyId === 'object') {
            // Set userData with both id and type
            bodyId.userData = { id: uniqueId, type };
          }
        } catch (e) {
          console.error("Failed to set userData:", e);
        }
        
        // Store the entity in our entities map
        const entityId = this.nextEntityId++;
        this.entities[entityId] = {
          type,
          bodyId,
          uniqueId,
          properties
        };
        
        // Map the uniqueId to the entityId
        this.bodyToEntity.set(uniqueId, entityId);
        
        return entityId;
      },
      
      // Find entity by uniqueId
      findEntityByUniqueId(uniqueId) {
        if (!uniqueId) return null;
        
        // Get the entityId from the uniqueId
        const entityId = this.bodyToEntity.get(uniqueId);
        if (entityId) {
          const entity = this.entities[entityId];
          if (entity) {
            return { entityId, ...entity };
          }
        }
        
        return null;
      },
      
      // DEPRECATED - DO NOT USE - Kept for backward compatibility only
      findEntityByPtr(ptrValue) {
        console.warn("findEntityByPtr called - SHOULD NOT USE BOX2D POINTERS");
        return null;
      },
      
      // Get entity by its Box2D body ID
      getEntityByBodyId(bodyId) {
        // Get the ID from the userData - ONLY valid approach
        const id = getIdFromBody(bodyId);
        
        // If we have an ID, look up the entity
        if (id) {
          const entityId = this.bodyToEntity.get(id);
          if (entityId !== undefined) {
            const entity = this.entities[entityId];
            if (entity) {
              return { entityId, ...entity };
            }
          }
        }
        
        // We no longer have fallbacks - if we don't have userData.id, we can't find the entity
        return null;
      },
      
      // Get entity by its entity ID
      getEntity(entityId) {
        return this.entities[entityId] || null;
      },
      
      // Remove entity
      removeEntity(entityId) {
        if (this.entities[entityId]) {
          delete this.entities[entityId];
          return true;
        }
        return false;
      }
    };
    
    // Setup renderer - use the canvas as provided, no auto high DPI scaling
    const renderer = new GameRenderer(box2d, ctx, pixelsPerMeter, false);
    
    // Physics setup - extract needed Box2D functions
    const {
      b2DefaultWorldDef,
      b2CreateWorld,
      b2CreateBody,
      b2CreatePolygonShape,
      b2CreateCircleShape,
      b2CreateSegmentShape,
      b2World_Step,
      b2MakeBox,
      b2DefaultBodyDef,
      b2DefaultShapeDef,
      b2BodyType,
      b2Segment,
      b2Vec2,
      b2Rot,
      TaskSystem,
      b2CreateThreadedWorld,
      b2World_GetProfile,
      b2World_GetBodyList,
      b2Body_GetPosition,
      b2Body_GetAngle,
      b2Body_GetRotation, // Add the GetRotation function
      b2Body_GetLinearVelocity,
      b2Body_ApplyLinearImpulse,
      b2Body_SetTransform,
      b2Body_GetType,
      b2Body_GetNext,
      b2DestroyBody, // This is the correct name for the destroy function
      b2Body_GetUserData, // For debugging userData access
      b2Body_SetUserData,  // For debugging userData setting
      b2MakeCircle,
      b2Body_SetBullet, // For enabling continuous collision detection
      b2World_SetContinuousPhysics, // For global continuous physics
      b2Body_GetTransform  // Add the GetTransform function
    } = box2d;
    
    // Physics world setup
    const worldDef = b2DefaultWorldDef();
    worldDef.gravity.Set(0, -10); // Earth-like gravity
    
    // Set global physics settings for better collision detection
    if (worldDef.velocityIterations !== undefined) {
      worldDef.velocityIterations = 10; // Increase from default 6 for better stability
    }
    if (worldDef.positionIterations !== undefined) {
      worldDef.positionIterations = 8; // Increase from default 3 for better stability
    }
    
    // Enable continuous physics globally for the world if available
    const enableContinuousPhysics = typeof b2World_SetContinuousPhysics === 'function';
    
    // Enable multi-threading if available
    let worldId, taskSystem;
    if (navigator.hardwareConcurrency > 1) {
      taskSystem = new TaskSystem(navigator.hardwareConcurrency);
      worldId = b2CreateThreadedWorld(worldDef, taskSystem);
    } else {
      worldId = b2CreateWorld(worldDef);
    }
    
    // Enable continuous physics for the world if function is available
    if (enableContinuousPhysics) {
      try {
        b2World_SetContinuousPhysics(worldId, true);
        console.log("Enabled continuous physics for the world");
      } catch (e) {
        console.error("Failed to enable continuous physics:", e);
      }
    }
    
    // Setup game objects
    function createGround() {
      const bd_ground = new b2DefaultBodyDef();
      // Static bodies for ground
      bd_ground.type = b2BodyType.b2_staticBody;
      
      const groundId = b2CreateBody(worldId, bd_ground);
      
      const shapeDefSegment = new b2DefaultShapeDef();
      shapeDefSegment.density = 0.0; // Static
      shapeDefSegment.friction = 0.6;
      shapeDefSegment.restitution = 0.1;
      
      // Ground segments - positioned based on calculated ground level (bottom of canvas)
      {
        const segment = new b2Segment();
        segment.point1 = new b2Vec2(worldLeft * 2, worldBottom); // Extend past visible area
        segment.point2 = new b2Vec2(worldRight * 2, worldBottom); // Extend past visible area
        b2CreateSegmentShape(groundId, shapeDefSegment, segment);
      }
      
      // No left wall needed for AngryTirds style game
      
      // No right wall - removed per request
      
      // Create an entity for ground
      const groundX = 0; // Center horizontally
      const groundY = worldBottom;
      const properties = { 
        isGround: true, 
        width: physicsWidth * 4, 
        height: 0.1,
        x: groundX,
        y: groundY,
        angle: 0,
        vertices: [
          { x: worldLeft * 2, y: worldBottom },
          { x: worldRight * 2, y: worldBottom }
        ]
      };
      const entityId = gameState.createEntity('ground', groundId, properties);
      
      // Get the entity to access the uniqueId
      const entity = gameState.getEntity(entityId);
      
      // Register with renderer with correct position information
      renderer.registerGameObject(groundId, 'ground', {
        ...properties,
        uniqueId: entity.uniqueId,
        x: groundX,
        y: groundY
      });
      
      if (gameState.debugMode) {
        console.log(`Created ground at y=${groundY}: entityId=${entityId}`);
      }
      
      return groundId;
    }
    
    function createWoodBlock(x, y, width, height, angle = 0) {
      const bd = new b2DefaultBodyDef();
      bd.type = b2BodyType.b2_dynamicBody;
      bd.position = new b2Vec2(x, y);
      bd.angle = angle;
      
      const bodyId = b2CreateBody(worldId, bd);
      
      const shapeDef = new b2DefaultShapeDef();
      shapeDef.density = 1.0;      // Reduced density to allow movement
      shapeDef.friction = 0.5;     // Moderate friction
      shapeDef.restitution = 0.1;  // Small bounce for better interaction
      
      // Make the blocks slightly larger to ensure collisions
      width = width * 1.2;  // Make blocks 20% wider
      height = height * 1.2; // Make blocks 20% taller
      
      const box = b2MakeBox(width/2, height/2);
      b2CreatePolygonShape(bodyId, shapeDef, box);
      
      // Create an entity for this block
      const properties = { width, height, x, y, angle };
      const entityId = gameState.createEntity('wood', bodyId, properties);
      
      // Get the entity to access the uniqueId
      const entity = gameState.getEntity(entityId);
      
      // Register with renderer using ONLY userData.id and including position
      renderer.registerGameObject(bodyId, 'wood', {
        ...properties,
        uniqueId: entity.uniqueId,
        x, y, angle
      });
      trackBody(bodyId, 'wood', entityId);
      
      if (gameState.debugMode) {
        console.log(`Created wood block at (${x}, ${y}): entityId=${entityId}`);
      }
      
      return bodyId;
    }
    
    function createPig(x, y, radius = 1.0) { // Use consistent size for pigs
      const bd = new b2DefaultBodyDef();
      bd.type = b2BodyType.b2_dynamicBody;
      bd.position = new b2Vec2(x, y);
      
      const bodyId = b2CreateBody(worldId, bd);
      
      const shapeDef = new b2DefaultShapeDef();
      shapeDef.density = 0.6;      // Lighter for better movement
      shapeDef.friction = 0.3;
      shapeDef.restitution = 0.3;  // Good bounce for pigs
      
      // Create a circle shape for better collisions if available
      try {
        if (typeof b2CreateCircleShape === 'function' && typeof b2MakeCircle === 'function') {
          const circle = b2MakeCircle(radius);
          b2CreateCircleShape(bodyId, shapeDef, circle);
        } else {
          // Fallback to box shape if circle is not available
          const shape = b2MakeBox(radius, radius);
          b2CreatePolygonShape(bodyId, shapeDef, shape);
        }
        
        // Add another shape to increase collision area for better physics
        const extraBox = b2MakeBox(radius * 0.7, radius * 0.7);
        b2CreatePolygonShape(bodyId, shapeDef, extraBox);
      } catch (e) {
        console.log("Error creating circle shape for pig, using box", e);
        const shape = b2MakeBox(radius, radius);
        b2CreatePolygonShape(bodyId, shapeDef, shape);
      }
      
      // Create an entity for this pig
      const properties = { radius, x, y, angle: 0 };
      const entityId = gameState.createEntity('pig', bodyId, properties);
      
      // Get the entity to access the uniqueId
      const entity = gameState.getEntity(entityId);
      
      // Register with renderer using ONLY userData.id
      renderer.registerGameObject(bodyId, 'pig', {
        ...properties,
        uniqueId: entity.uniqueId,
        x, y
      });
      trackBody(bodyId, 'pig', entityId);
      // No need to increment a counter - we'll count active pigs directly
      
      if (gameState.debugMode) {
        console.log(`Created pig at (${x}, ${y}): entityId=${entityId}`);
      }
      
      
      return bodyId;
    }
    
    function createBird(x, y, radius = 0.5) { // Use consistent size for birds
      const bd = new b2DefaultBodyDef();
      bd.type = b2BodyType.b2_dynamicBody;
      bd.position = new b2Vec2(x, y);
      bd.bullet = true; // Enable continuous collision detection for fast-moving objects
      bd.fixedRotation = false; // Allow rotation for more realistic physics
      
      // Create the Box2D body
      const bodyId = b2CreateBody(worldId, bd);
      
      // Explicitly enable bullet mode for continuous collision detection
      try {
        if (typeof b2Body_SetBullet === 'function') {
          b2Body_SetBullet(bodyId, true);
        }
      } catch (e) {
        console.error("Failed to enable bullet mode:", e);
      }
      
      // Create the shape
      const shapeDef = new b2DefaultShapeDef();
      shapeDef.density = 5.0;      // Heavy enough for impact but not too much
      shapeDef.friction = 0.5;     // Moderate friction
      shapeDef.restitution = 0.2;  // Small amount of bounce for better physics response
      
      // Create a much larger object for the bird to ensure collision
      try {
        // Use a larger box shape for better collision detection
        const boxRadius = radius * 1.5; // Make bird 50% larger for collision detection
        const boxShape = b2MakeBox(boxRadius, boxRadius);
        b2CreatePolygonShape(bodyId, shapeDef, boxShape);
        
        // Add a circle shape if available - this works better for rounded collisions
        try {
          if (typeof b2CreateCircleShape === 'function' && typeof b2MakeCircle === 'function') {
            const circle = b2MakeCircle(radius * 1.2);
            b2CreateCircleShape(bodyId, shapeDef, circle);
          }
        } catch (e) {
          // Silently handle error
        }
      } catch (e) {
        // Fallback if shape creation fails
        console.log("Error creating complex shapes for bird, using simple large box", e);
        const shape = b2MakeBox(radius * 2, radius * 2);
        b2CreatePolygonShape(bodyId, shapeDef, shape);
      }
      
      // Create entity with properties
      const properties = { radius, x, y, angle: 0 };
      const entityId = gameState.createEntity('bird', bodyId, properties);
      
      // Get the entity to access the uniqueId
      const entity = gameState.getEntity(entityId);
      
      // Set userData on the Box2D body directly
      try {
        // Create userData with id and type
        const userData = { id: entity.uniqueId, type: 'bird' };
        
        // Set the userData directly on the body
        bodyId.userData = userData;
      } catch (e) {
        console.error("Failed to set bird userData:", e);
      }
      
      // Get the ID from the body
      const extractedId = getIdFromBody(bodyId);
      
      // Register with renderer using ONLY userData.id
      renderer.registerGameObject(bodyId, 'bird', {
        ...properties,
        uniqueId: entity.uniqueId,
        x, y
      });
      
      // Track the body
      trackBody(bodyId, 'bird', entityId);
      
      if (gameState.debugMode) {
        console.log(`Created bird at (${x}, ${y}): entityId=${entityId}`);
      }
      
      return bodyId;
    }
    
    // Create level structure
    function createLevel() {
      // Create ground
      createGround();
      
      // Calculate structure position based on world dimensions
      // Position at 80% of the world width (further to the right)
      const structureX = worldLeft + (physicsWidth * 0.8);
      
      // Wood block dimensions based on world size
      const blockWidth = physicsWidth * 0.03; // 3% of world width
      const verticalHeight = physicsHeight * 0.15; // 15% of world height
      const horizontalHeight = physicsHeight * 0.03; // 3% of world height
      const blockSpacing = blockWidth * 1.5; // Space between blocks
      
      // First row - foundation blocks sitting exactly on ground
      const baseY = groundY + (verticalHeight/2); // Position blocks half height above ground
      createWoodBlock(structureX - blockSpacing*1.5, baseY, blockWidth, verticalHeight);
      createWoodBlock(structureX - blockSpacing*0.5, baseY, blockWidth, verticalHeight);
      createWoodBlock(structureX + blockSpacing*0.5, baseY, blockWidth, verticalHeight);
      createWoodBlock(structureX + blockSpacing*1.5, baseY, blockWidth, verticalHeight);
      
      // Second row - horizontal blocks
      const secondRowY = baseY + verticalHeight/2 + horizontalHeight/2;
      
      // Create two blocks with different densities - left one heavier, right one lighter
      // This is for testing movement physics and collisions
      
      // Create left block with body definition overrides
      const leftBlockDef = new b2DefaultBodyDef();
      leftBlockDef.type = b2BodyType.b2_dynamicBody;
      leftBlockDef.position = new b2Vec2(structureX - blockSpacing, secondRowY);
      
      const leftBlockId = b2CreateBody(worldId, leftBlockDef);
      
      // Give left block extra weight
      const leftShapeDef = new b2DefaultShapeDef();
      leftShapeDef.density = 1.8;      // Heavier block
      leftShapeDef.friction = 0.6;
      leftShapeDef.restitution = 0.1;
      
      // Size adjustment is handled in createPolygonShape
      const leftWidth = blockWidth * 2.5 * 1.2; // Apply same 1.2x scaling from createWoodBlock
      const leftHeight = horizontalHeight * 1.2;
      const leftBox = b2MakeBox(leftWidth/2, leftHeight/2);
      b2CreatePolygonShape(leftBlockId, leftShapeDef, leftBox);
      
      // Create entity and register with renderer
      const leftProps = { width: leftWidth, height: leftHeight, x: structureX - blockSpacing, y: secondRowY, angle: 0 };
      const leftEntityId = gameState.createEntity('wood', leftBlockId, leftProps);
      const leftEntity = gameState.getEntity(leftEntityId);
      
      renderer.registerGameObject(leftBlockId, 'wood', {
        ...leftProps,
        uniqueId: leftEntity.uniqueId,
        x: structureX - blockSpacing,
        y: secondRowY
      });
      
      trackBody(leftBlockId, 'wood', leftEntityId);
      
      if (gameState.debugMode) {
        console.log(`Created heavy wood block at (${structureX - blockSpacing}, ${secondRowY}): entityId=${leftEntityId}`);
      }
      
      // Create right block with lighter properties
      const rightBlockDef = new b2DefaultBodyDef();
      rightBlockDef.type = b2BodyType.b2_dynamicBody;
      rightBlockDef.position = new b2Vec2(structureX + blockSpacing, secondRowY);
      
      const rightBlockId = b2CreateBody(worldId, rightBlockDef);
      
      // Give right block less weight
      const rightShapeDef = new b2DefaultShapeDef();
      rightShapeDef.density = 0.4;     // Much lighter for more movement
      rightShapeDef.friction = 0.3;    // Less friction
      rightShapeDef.restitution = 0.2; // More bounce
      
      // Size adjustment
      const rightWidth = blockWidth * 2.5 * 1.2;
      const rightHeight = horizontalHeight * 1.2;
      const rightBox = b2MakeBox(rightWidth/2, rightHeight/2);
      b2CreatePolygonShape(rightBlockId, rightShapeDef, rightBox);
      
      // Create entity and register
      const rightProps = { width: rightWidth, height: rightHeight, x: structureX + blockSpacing, y: secondRowY, angle: 0 };
      const rightEntityId = gameState.createEntity('wood', rightBlockId, rightProps);
      const rightEntity = gameState.getEntity(rightEntityId);
      
      renderer.registerGameObject(rightBlockId, 'wood', {
        ...rightProps,
        uniqueId: rightEntity.uniqueId,
        x: structureX + blockSpacing,
        y: secondRowY
      });
      
      trackBody(rightBlockId, 'wood', rightEntityId);
      
      if (gameState.debugMode) {
        console.log(`Created light wood block at (${structureX + blockSpacing}, ${secondRowY}): entityId=${rightEntityId}`);
      }
      
      // Put a pig directly on the first row of horizontal blocks - raised significantly above block
      createPig(structureX, secondRowY + horizontalHeight + 3.0);
      
      // Third row - more vertical blocks
      const thirdRowY = secondRowY + horizontalHeight/2 + verticalHeight/2;
      createWoodBlock(structureX - blockSpacing, thirdRowY, blockWidth, verticalHeight);
      createWoodBlock(structureX + blockSpacing, thirdRowY, blockWidth, verticalHeight);
      
      // Fourth row - top horizontal block
      const fourthRowY = thirdRowY + verticalHeight/2 + horizontalHeight/2;
      createWoodBlock(structureX, fourthRowY, blockWidth*4, horizontalHeight);
      
      // Add a pig on top of the structure - raised much higher above the block
      createPig(structureX, fourthRowY + horizontalHeight + 5.0);
      
      // Initialize birds remaining
      gameState.birdsRemaining = 3;
    }
    
    // Calculate power and direction for bird launch
    function calculateAimFromInput(input) {
      const player = input[0]; // Use the first player's input
      
      // Check if aiming mode is active using A button (BUTTON_SOUTH)
      const isAButtonPressed = player.BUTTON_SOUTH.pressed;
      
      if (!gameState.isAiming && isAButtonPressed && !gameState.isFiring && gameState.currentBird) {
        // Start aiming
        gameState.isAiming = true;
        gameState.aimDirection = { x: 0, y: 0 };
        gameState.aimPower = 0;
        gameState.aimPosition = { ...gameState.slingPosition }; // Track current position during aiming
      } 
      else if (gameState.isAiming) {
        // Continue aiming - get directional input from left stick or d-pad
        const leftStickX = player.LEFT_STICK_X;
        const leftStickY = player.LEFT_STICK_Y;
        
        // Get directional input with small dead zone for precision
        let dirX = 0;
        let dirY = 0;
        
        // Use analog stick with small dead zone for precision
        if (Math.abs(leftStickX) > 0.05) {
          dirX = leftStickX;
        }
        if (Math.abs(leftStickY) > 0.05) {
          dirY = leftStickY;
        }
        
        // If analog stick isn't providing input, use d-pad with small incremental movement
        if (Math.abs(dirX) < 0.05) {
          if (player.DPAD_LEFT.pressed) dirX = -0.2;
          else if (player.DPAD_RIGHT.pressed) dirX = 0.2;
        }
        
        if (Math.abs(dirY) < 0.05) {
          if (player.DPAD_DOWN.pressed) dirY = -0.2;
          else if (player.DPAD_UP.pressed) dirY = 0.2;
        }
        
        // Apply incremental position changes for smooth aiming
        if (Math.abs(dirX) > 0.05 || Math.abs(dirY) > 0.05) {
          const sensitivity = 0.15; // Controls how quickly the bird moves when aiming
          
          // Update aim position incrementally for smooth movement
          gameState.aimPosition = {
            x: gameState.aimPosition.x + dirX * sensitivity,
            y: gameState.aimPosition.y + dirY * sensitivity // Y should move in the same direction as input
          };
          
          // Prevent pulling the bird below ground level
          // Use bird radius (0.5 is default) to keep the entire bird above ground
          const birdRadius = 0.5; // This is the standard bird radius used in createBird
          if (gameState.aimPosition.y - birdRadius < gameState.worldDimensions.groundY) {
            gameState.aimPosition.y = gameState.worldDimensions.groundY + birdRadius;
          }
          
          // Calculate the vector from slingshot to current position
          const sling = gameState.slingPosition;
          const dx = gameState.aimPosition.x - sling.x;
          const dy = gameState.aimPosition.y - sling.y;
          
          // Calculate distance from slingshot
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Limit maximum stretch distance
          const maxStretch = 5.0;
          if (distance > maxStretch) {
            // Normalize the direction and scale to max stretch
            const norm = maxStretch / distance;
            gameState.aimPosition = {
              x: sling.x + dx * norm,
              y: sling.y + dy * norm
            };
          }
          
          // Calculate normalized direction vector
          if (distance > 0.1) { // Avoid division by very small numbers
            gameState.aimDirection = {
              x: dx / distance,
              y: dy / distance
            };
          } else {
            gameState.aimDirection = { x: 0, y: 0 };
          }
          
          // Calculate power based on stretch distance (normalize to 0-1 range, then scale)
          gameState.aimPower = Math.min(distance / maxStretch, 1.0) * 5; 
          
          // Update bird position
          if (gameState.currentBird) {
            // Set transform with correct arguments (body, position, rotation)
            const newPos = new b2Vec2(gameState.aimPosition.x, gameState.aimPosition.y);
            const rot = new b2Rot();
            rot.SetAngle(0);
            b2Body_SetTransform(gameState.currentBird, newPos, rot);
            
            // Update bird position for rendering
            gameState.birdPosition = { ...gameState.aimPosition };
          }
        }
        
        // Check if aiming is finished (button released)
        if (!isAButtonPressed) {
          // Calculate distance for launch check
          const sling = gameState.slingPosition;
          const dx = gameState.aimPosition.x - sling.x;
          const dy = gameState.aimPosition.y - sling.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Fire the bird if we have a valid aim
          if (gameState.currentBird && distance > 0.5) { // Require minimum stretch for launch
            // Calculate impulse based on aim and distance
            const launchPower = gameState.aimPower * 50; // Reduced power for better control
            
            // Apply impulse in the opposite direction of aiming (slingshot effect)
            // This directly uses the vector from bird to slingshot for most realistic behavior
            const impulseX = (sling.x - gameState.aimPosition.x) * launchPower;
            const impulseY = (sling.y - gameState.aimPosition.y) * launchPower;
            
            // Apply impulse to launch the bird
            const impulse = new b2Vec2(impulseX, impulseY);
            const worldPoint = new b2Vec2(gameState.birdPosition.x, gameState.birdPosition.y);
            b2Body_ApplyLinearImpulse(
              gameState.currentBird,
              impulse,
              worldPoint,
              true  // wake the body
            );
            
            // Update game state
            gameState.isAiming = false;
            gameState.isFiring = true;
            gameState.isGameStarted = true; // Mark game as started when first bird is fired
            gameState.birdsRemaining--;
            
            // Calculate the trajectory for the straps - move in opposite direction of impulse
            // This creates the snap/recoil effect of a slingshot
            const dx = gameState.birdPosition.x - sling.x;
            const dy = gameState.birdPosition.y - sling.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            
            // Movement is in the opposite direction of the pull, limited by the initial pull distance
            const recoilDistance = Math.min(distance, 3); // Limit maximum recoil
            
            // Initialize strap animation - straps snap back in opposite direction then return
            gameState.strapAnimation = {
              active: true,
              startTime: Date.now(),
              duration: 2000, // 2 seconds for animation
              initialPosition: { ...gameState.birdPosition },
              snapPosition: {
                // Move in the opposite direction of the pull
                x: sling.x - normalizedDx * recoilDistance,
                y: sling.y - normalizedDy * recoilDistance
              },
              targetPosition: {
                x: gameState.slingPosition.x,
                y: gameState.slingPosition.y + 2.5 // Final resting position
              }
            };
            
            // Play launch sound
            try {
              const laserSound = document.getElementById('laserSound');
              if (laserSound) {
                laserSound.currentTime = 0;
                laserSound.play().catch(e => console.log("Sound play failed:", e));
              }
            } catch (e) {
              console.log("Sound error:", e);
            }
          } else {
            // If not enough power, just reset aim
            gameState.isAiming = false;
            
            // Reset bird position to slingshot
            if (gameState.currentBird) {
              const resetPos = new b2Vec2(gameState.slingPosition.x, gameState.slingPosition.y);
              const rot = new b2Rot();
              rot.SetAngle(0);
              b2Body_SetTransform(
                gameState.currentBird, 
                resetPos,
                rot
              );
              gameState.birdPosition = { ...gameState.slingPosition };
            }
          }
        }
      }
      
      // Check for restart game with Start button - only trigger once per press and only at game over
      if (player.START.pressed && !gameState.startButtonPressed && gameState.gameOver) {
        resetGame();
        gameState.startButtonPressed = true;
      } else if (!player.START.pressed && gameState.startButtonPressed) {
        // Reset the flag when button is released
        gameState.startButtonPressed = false;
      }
    }
    
    // Track bodies for cleanup without using GetBodyList
    const trackedBodies = {
      birds: new Map(),  // Maps uniqueId -> { entityId, active }
      pigs: new Map(),   // Maps uniqueId -> { entityId, active }
      blocks: new Map(),  // Maps uniqueId -> { entityId, active }
      
      // Convenience method to get all tracked unique IDs
      getAllTrackedIds() {
        const allIds = [];
        this.birds.forEach((_, id) => allIds.push(id));
        this.pigs.forEach((_, id) => allIds.push(id));
        this.blocks.forEach((_, id) => allIds.push(id));
        return allIds;
      }
    };
    
    // Debug utility to log all tracked bodies
    function logTrackedBodies() {
      console.log("Current tracked bodies (using uniqueId as keys):");
      
      const activeBirds = Array.from(trackedBodies.birds.entries())
        .filter(([_, info]) => info.active)
        .map(([uniqueId, info]) => ({uniqueId, entityId: info.entityId}));
      
      const activePigs = Array.from(trackedBodies.pigs.entries())
        .filter(([_, info]) => info.active)
        .map(([uniqueId, info]) => ({uniqueId, entityId: info.entityId}));
      
      const activeBlocks = Array.from(trackedBodies.blocks.entries())
        .filter(([_, info]) => info.active)
        .map(([uniqueId, info]) => ({uniqueId, entityId: info.entityId}));
      
      console.log("Birds:", activeBirds);
      console.log("Pigs:", activePigs);
      console.log("Blocks:", activeBlocks);
      
      console.log("\nFull entity list:", Object.entries(gameState.entities).map(
        ([entityId, entity]) => ({entityId: Number(entityId), type: entity.type, uniqueId: entity.uniqueId})
      ));
    }
    
    // We're now using the getIdFromBody function imported from utils.js
    
    // Custom function to track a body with its entity ID
    function trackBody(bodyId, type, entityId) {
      // Get the entity info
      const entity = gameState.getEntity(entityId);
      if (!entity) {
        console.error(`Cannot track body - entity ${entityId} not found`);
        return;
      }
      
      // Ensure we have a uniqueId
      const uniqueId = entity.uniqueId;
      if (!uniqueId) {
        console.error(`Cannot track body - entity ${entityId} has no uniqueId`);
        return;
      }
      
      // Debug log the body ID information
      if (gameState.debugMode) {
        console.log(`Body tracking debug - bodyId details:`, {
          type: typeof bodyId,
          ptr: bodyId.ptr,
          userData: bodyId.userData,
          uniqueId
        });
      }
      
      // Create tracking info
      const trackInfo = {
        entityId,
        uniqueId,
        active: true
      };
      
      // Add to the appropriate collection using ONLY the unique ID
      if (type === 'bird') {
        trackedBodies.birds.set(uniqueId, trackInfo);
        console.log(`Tracked bird with uniqueId: ${uniqueId}, entityId: ${entityId}, ptr: ${bodyId.ptr}`);
      } else if (type === 'pig') {
        trackedBodies.pigs.set(uniqueId, trackInfo);
        console.log(`Tracked pig with uniqueId: ${uniqueId}, entityId: ${entityId}, ptr: ${bodyId.ptr}`);
      } else { // blocks or wood - all go in blocks collection
        trackedBodies.blocks.set(uniqueId, trackInfo);
        console.log(`Tracked ${type} with uniqueId: ${uniqueId}, entityId: ${entityId}, ptr: ${bodyId.ptr}`);
      }
    }
    
    // Check for bodies to remove (objects off-screen or pigs hit)
    function cleanupBodies() {
      // ALWAYS make trackedBodies available to renderer to check for dead pigs
      gameState.trackedBodies = trackedBodies;
      
      // Update physics state for each tracked pig
      for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
        try {
          // Skip if no entity data
          const entityId = pigInfo.entityId;
          const entity = gameState.entities[entityId];
          
          if (!entity || !entity.bodyId) {
            continue;
          }
          
          // Now use the actual Box2D body for physics
          const bodyId = entity.bodyId;
          const pos = b2Body_GetPosition(bodyId);
          const vel = b2Body_GetLinearVelocity(bodyId);
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          
          // Calculate rotation angle for ALL pigs using Box2D_GetRotation
          let angle = 0;
          try {
            if (typeof b2Body_GetRotation === 'function') {
              const rotation = b2Body_GetRotation(bodyId);
              if (rotation) {
                angle = Math.atan2(rotation.s, rotation.c);
                if (gameState.debugMode && Math.random() < 0.1) {
                  console.log(`Pig ${uniqueId} angle from rotation: ${angle}`);
                }
              }
            } else if (typeof b2Body_GetAngle === 'function') {
              angle = b2Body_GetAngle(bodyId);
            }
          } catch (e) {
            console.warn("Error getting pig rotation:", e);
          }
          
          // Log the raw Box2D body object
          if (gameState.debugMode && Math.random() < 0.2) {
            console.log('Raw Box2D pig body (in cleanupBodies):', bodyId);
          }
          
          // Debug logging
          if (gameState.debugMode) {
            console.log(`Pig ${uniqueId.substring(0,6)} at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) angle: ${angle.toFixed(2)} - speed ${speed.toFixed(2)}`);
          }
          
          // Always update position and rotation for ALL pigs (active and inactive)
          const newPos = { x: pos.x, y: pos.y };
          renderer.updateGameObject(uniqueId, newPos, angle);
          
          // Pig destruction conditions: fell off screen or hit with moderate force
          // Use a VERY high speed threshold so pigs don't die instantly
          // Only kill pig if it's still active
          // Also mark pigs as dead if they go offscreen horizontally
          if (pigInfo.active && (pos.y < -45 || pos.x < worldLeft - 10 || pos.x > worldRight + 10 || speed > 15.0)) {
            // Add to score
            gameState.score += 500;
            
            // Mark as inactive but NEVER destroy the body - keep for physics and positioning
            pigInfo.active = false;
            
            // Just log that the pig was killed, we already updated its position and angle above
            console.log(`Pig ${uniqueId.substring(0,6)} killed`);
            
            // Mark this pig as dead in the renderer (already has position and angle)
            if (renderer.gameObjects.has(uniqueId)) {
              const pigObj = renderer.gameObjects.get(uniqueId);
              pigObj.dead = true;
            }
            
            // Ensure the renderer knows about this pig (backup registration)
            if (!renderer.gameObjects.has(uniqueId)) {
              renderer.registerGameObject(bodyId, 'pig', {
                uniqueId: uniqueId,
                radius: 1.0, 
                x: pos.x,
                y: pos.y
              });
            }
            
            console.log(`Pig ${uniqueId.substring(0,6)} marked as DEAD at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
          }
        } catch (e) {
          // Silently handle errors
          console.error("Error updating pig:", e);
        }
      }
      
      // Update physics state for current bird
      if (gameState.currentBird) {
        // Get the userData.id from the current bird
        const currentBirdId = getIdFromBody(gameState.currentBird);
        // Look up bird info by userData.id
        const birdInfo = currentBirdId ? trackedBodies.birds.get(currentBirdId) : null;
        
        try {
          const pos = b2Body_GetPosition(gameState.currentBird);
          const vel = b2Body_GetLinearVelocity(gameState.currentBird);
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          
          // Remove bird if it falls off screen or goes off screen horizontally
          if (pos.y < -50 || pos.x < worldLeft - 10 || pos.x > worldRight + 10) {
            // Delete from renderer using ONLY uniqueId
            if (birdInfo && birdInfo.uniqueId) {
              // Remove from renderer by uniqueId
              renderer.gameObjects.delete(birdInfo.uniqueId);
            }
            
            // Get entity info and remove from entity system
            const entityId = birdInfo ? birdInfo.entityId : null;
            if (entityId) {
              gameState.removeEntity(entityId);
            }
            
            // Mark as inactive in tracking list
            if (birdInfo) {
              birdInfo.active = false;
            }
            
            try {
              b2DestroyBody(gameState.currentBird);
            } catch (e) {
              console.error("Error destroying bird body:", e);
            }
            
            if (gameState.debugMode) {
              const currentBirdId = gameState.currentBird;
              console.log(`Bird destroyed: bodyId=${currentBirdId}, entityId=${entityId}`);
            }
            
            gameState.currentBird = null;
            gameState.isFiring = false;
            
            // Prepare next bird with a delay if there are birds remaining
            if (gameState.birdsRemaining > 0) {
              setTimeout(() => {
                prepareBird();
              }, 1000);
            }
          }
          // Check if bird has come to rest
          else if (gameState.isFiring && speed < 0.2) {
            // Bird has almost stopped - allow for next bird
            gameState.currentBird = null;
            gameState.isFiring = false;
            
            // Prepare next bird with a delay
            setTimeout(() => {
              prepareBird();
            }, 1000);
          }
        } catch (e) {
          // Body might have been already destroyed
          if (birdInfo) {
            birdInfo.active = false;
          }
          gameState.currentBird = null;
          gameState.isFiring = false;
        }
      }
      
      // Update physics for other tracked bodies (blocks)
      for (const [uniqueId, blockInfo] of trackedBodies.blocks.entries()) {
        if (!blockInfo || !blockInfo.active) continue;
        
        try {
          // Get the entity to find the Box2D body
          const entityId = blockInfo.entityId;
          const entity = gameState.entities[entityId];
          
          if (!entity || !entity.bodyId) {
            blockInfo.active = false;
            continue;
          }
          
          // Now use the actual Box2D body for physics
          const bodyId = entity.bodyId;
          const pos = b2Body_GetPosition(bodyId);
          
          // Remove blocks that have fallen off the screen
          if (pos.y < -50) {
            // Delete from renderer by uniqueId ONLY
            renderer.gameObjects.delete(uniqueId);
            
            // Get entity info and remove from entity system
            if (entityId) {
              gameState.removeEntity(entityId);
            }
            
            // Mark as inactive in tracking list
            blockInfo.active = false;
            
            try {
              b2DestroyBody(bodyId);
            } catch (e) {
              // Silently handle error
            }
          }
        } catch (e) {
          // Body might have been already destroyed
          blockInfo.active = false;
        }
      }
    
      // Count active pigs to determine game status (rather than rely on counter)
      const activePigs = Array.from(trackedBodies.pigs.values())
                        .filter(info => info && info.active).length;
      
      // Check for game over/victory conditions
      if (activePigs === 0 && !gameState.victory && gameState.isGameStarted) {
        // Victory!
        gameState.victory = true;
        gameState.gameOver = true;
      } else if (gameState.birdsRemaining <= 0 && !gameState.currentBird && !gameState.isFiring && !gameState.gameOver) {
        // Game over - no birds left and pigs remain
        gameState.gameOver = true;
      }
      
      // If debug mode is enabled, update debug information
      if (gameState.debugMode) {
        // Get current bird physics data for debug display
        if (gameState.currentBird) {
          gameState.debugBirdData = debugPhysicsBody(box2d, gameState.currentBird);
        }
        
        // Get count of active objects by type
        gameState.debugCounts = {
          birds: Array.from(trackedBodies.birds.values()).filter(info => info && info.active).length,
          pigs: Array.from(trackedBodies.pigs.values()).filter(info => info && info.active).length,
          blocks: Array.from(trackedBodies.blocks.values()).filter(info => info && info.active).length,
          trackedObjects: renderer.gameObjects.size,
          entities: Object.keys(gameState.entities).length
        };
        
        // Get entity ID for current bird if any
        if (gameState.currentBird) {
          const birdInfo = trackedBodies.birds.get(Number(gameState.currentBird));
          if (birdInfo) {
            gameState.currentBirdEntityId = birdInfo.entityId;
            
            // Get entity type for verification
            const entity = gameState.getEntity(birdInfo.entityId);
            if (entity) {
              gameState.currentBirdType = entity.type;
            }
          }
        }
      }
    }
    
    // Reset the game
    function resetGame() {
      console.log("Resetting game - destroying all physics objects");

      // First, save any existing bodies to destroy
      const bodiesToDestroy = [];
      
      // Get all existing body IDs from trackedBodies
      for (const [uniqueId, info] of trackedBodies.birds.entries()) {
        if (info && info.active && info.entityId) {
          const entity = gameState.entities[info.entityId];
          if (entity && entity.bodyId) {
            bodiesToDestroy.push(entity.bodyId);
          }
        }
      }
      
      for (const [uniqueId, info] of trackedBodies.pigs.entries()) {
        if (info && info.active && info.entityId) {
          const entity = gameState.entities[info.entityId];
          if (entity && entity.bodyId) {
            bodiesToDestroy.push(entity.bodyId);
          }
        }
      }
      
      for (const [uniqueId, info] of trackedBodies.blocks.entries()) {
        if (info && info.active && info.entityId) {
          const entity = gameState.entities[info.entityId];
          if (entity && entity.bodyId) {
            bodiesToDestroy.push(entity.bodyId);
          }
        }
      }
      
      // Destroy all bodies we gathered
      for (const bodyId of bodiesToDestroy) {
        try {
          console.log(`Destroying body: ${bodyId}`);
          b2DestroyBody(bodyId);
        } catch (e) {
          console.error("Error destroying body during reset:", e);
        }
      }
      
      // Reset tracked bodies objects
      trackedBodies.birds.clear();
      trackedBodies.pigs.clear();
      trackedBodies.blocks.clear();
      
      // Reset game state
      gameState.isAiming = false;
      gameState.isFiring = false;
      gameState.score = 0;
      gameState.gameOver = false;
      gameState.victory = false;
      gameState.isGameStarted = false; // Reset game start flag
      gameState.currentBird = null;
      gameState.startButtonPressed = false; // Reset start button flag
      gameState.birdPosition = { ...gameState.slingPosition }; // Reset bird position
      
      // Reset entity system
      gameState.entities = {};
      gameState.bodyToEntity.clear();
      gameState.nextEntityId = 1;
      
      // Clear renderer object registry
      renderer.gameObjects.clear();
      
      // Clear the trackedBodies reference
      delete gameState.trackedBodies;
      
      console.log("Game reset complete - all physics objects destroyed");
      
      // Create new level
      createLevel();
      
      // Add a new bird ready to fire
      prepareBird();
      
      if (gameState.debugMode) {
        console.log("Game reset. New entities:", gameState.entities);
      }
    }
    
    // Prepare a new bird on the slingshot
    function prepareBird() {
      if (gameState.birdsRemaining <= 0) return;
      
      // Position the bird at the top of the slingshot, not at the slingshot base
      const birdPosition = {
        x: gameState.slingPosition.x,
        y: gameState.slingPosition.y + 2.5 // Position at the top of the slingshot
      };
      
      const birdId = createBird(
        birdPosition.x,
        birdPosition.y
      );
      
      gameState.currentBird = birdId;
      gameState.birdPosition = { ...birdPosition };
    }
    
    /**
     * Finds all pig bodies in the world
     * @param {Object} world - The Box2D world
     * @returns {Array} - Array of pig bodies
     */
    function findPigBodies(world) {
      // We can directly use our tracked pig bodies
      const pigBodies = [];
      
      // Go through all tracked pigs and get their Box2D bodies
      for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
        try {
          // Skip if no entity data
          const entityId = pigInfo.entityId;
          const entity = gameState.entities[entityId];
          
          if (!entity || !entity.bodyId) {
            continue;
          }
          
          // Add the Box2D body to our result array
          pigBodies.push(entity.bodyId);
          
          // Log the entire pig body for inspection in dev tools
          if (gameState.debugMode && Math.random() < 0.1) {
            console.log('pigBody from findPigBodies():', entity.bodyId);
          }
        } catch (e) {
          console.error("Error finding pig body:", e);
        }
      }
      
      return pigBodies;
    }
    
    // Update all game objects' positions and angles from physics bodies
    function updateGameObjectPositions() {
      try {
        let updatedCount = 0;
        const startTime = Date.now();

        // Just log the raw Box2D body objects for inspection in Chrome dev tools
        if (gameState.debugMode) {
          for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
            try {
              const entityId = pigInfo.entityId;
              const entity = gameState.entities[entityId];
              
              if (entity && entity.bodyId) {
                // Log the raw Box2D body object
                console.log('Raw Box2D pig body:', entity.bodyId);
                
                // Try using the Box2D_GetRotation function
                if (typeof b2Body_GetRotation === 'function') {
                  try {
                    const rotation = b2Body_GetRotation(entity.bodyId);
                    console.log('Rotation from b2Body_GetRotation:', rotation);
                    
                    // Calculate angle
                    if (rotation) {
                      const calculatedAngle = Math.atan2(rotation.s, rotation.c);
                      console.log('Calculated angle from rotation:', calculatedAngle);
                    }
                  } catch (e) {
                    console.error('Error calling b2Body_GetRotation:', e);
                  }
                }
              }
            } catch (e) {
              console.error("Error logging pig body:", e);
            }
          }
        }
        
        // A helper function to update any type of object consistently
        const updateObjectPosition = (uniqueId, info, typeName) => {
          if (!info || !info.active) return false;
          
          const entityId = info.entityId;
          if (!entityId) return false;
          
          const entity = gameState.entities[entityId];
          if (!entity || !entity.bodyId) return false;
          
          try {
            // Get position from Box2D - this includes both position and angle
            const pos = b2Body_GetPosition(entity.bodyId);
            
            // Log the ENTIRE body object for inspection in Chrome dev tools
            if (gameState.debugMode) {
              // Just log the full objects for Chrome dev tools inspection
              console.log('pigBody:', entity.bodyId);
              console.log('position:', pos);
            }
            
            if (!pos) return false;
            
            // Try to get angle from multiple possible sources
            let angle = 0;
            
            // Log the raw body and use b2Body_GetRotation
            if (gameState.debugMode && Math.random() < 0.01) {
              console.log(`Raw ${typeName} body:`, entity.bodyId);
              
              // Try using Box2D_GetRotation from the docs
              try {
                if (typeof b2Body_GetRotation === 'function') {
                  const rotation = b2Body_GetRotation(entity.bodyId);
                  console.log(`Rotation from b2Body_GetRotation:`, rotation);
                  
                  // Calculate angle from rotation
                  if (rotation) {
                    const calculatedAngle = Math.atan2(rotation.s, rotation.c);
                    console.log(`Calculated angle from rotation: ${calculatedAngle}`);
                  }
                }
              } catch (e) {
                console.error("b2Body_GetRotation failed:", e);
              }
              
              // Also try GetTransform
              try {
                if (typeof b2Body_GetTransform === 'function') {
                  const transform = b2Body_GetTransform(entity.bodyId);
                  console.log(`Transform from b2Body_GetTransform:`, transform);
                  
                  if (transform && transform.q) {
                    console.log(`Transform rotation: q.s = ${transform.q.s}, q.c = ${transform.q.c}`);
                    console.log(`Transform angle = ${Math.atan2(transform.q.s, transform.q.c)}`);
                  }
                }
              } catch (e) {
                console.error("b2Body_GetTransform failed:", e);
              }
            }
            
            // Try using the documented Box2D_GetRotation function
            try {
              // Try b2Body_GetRotation (from docs) first
              if (typeof b2Body_GetRotation === 'function') {
                try {
                  const rotation = b2Body_GetRotation(entity.bodyId);
                  if (rotation) {
                    angle = Math.atan2(rotation.s, rotation.c);
                  }
                } catch (rotErr) {
                  console.warn(`Error with b2Body_GetRotation: ${rotErr.message}`);
                }
              }
              
              // Fallback to b2Body_GetAngle
              if (angle === 0 && typeof b2Body_GetAngle === 'function') {
                try {
                  angle = b2Body_GetAngle(entity.bodyId);
                } catch (angleErr) {
                  console.warn(`Error with b2Body_GetAngle: ${angleErr.message}`);
                }
              }
              
              // Further fallbacks if needed
              if (angle === 0) {
                if (entity.bodyId.m_sweep && entity.bodyId.m_sweep.a !== undefined) {
                  angle = entity.bodyId.m_sweep.a;
                } else if (entity.bodyId.GetAngle && typeof entity.bodyId.GetAngle === 'function') {
                  try {
                    angle = entity.bodyId.GetAngle();
                  } catch (e) {
                    console.warn(`GetAngle failed: ${e.message}`);
                  }
                }
              }
              
              // Log which method worked
              if (gameState.debugMode && Math.random() < 0.05) {
                console.log(`${typeName} ANGLE: ${angle}`);
              }
            } catch (angleErr) {
              console.warn(`Error getting angle for ${typeName}: ${angleErr.message}`);
            }
            
            // Create a new position object to ensure updates are recognized
            const newPosition = { x: pos.x, y: pos.y };
            
            // Ensure the object exists in the renderer before updating
            if (!renderer.gameObjects.has(uniqueId)) {
              console.warn(`${typeName} ${uniqueId.substring(0,6)} not found in renderer - adding it`);
              // Add it to the renderer if not found
              renderer.registerGameObject(entity.bodyId, typeName, {
                uniqueId: uniqueId,
                radius: typeName === 'pig' ? 1.0 : 0.5,
                width: typeName === 'wood' ? 2.0 : undefined,
                height: typeName === 'wood' ? 2.0 : undefined,
                x: pos.x,
                y: pos.y,
                angle: angle
              });
              return true;
            }
            
            // Update in the renderer
            const updated = renderer.updateGameObject(uniqueId, newPosition, angle);
            
            // Always log updates in debug mode with sampling
            if (gameState.debugMode && Math.random() < 0.05) {
              console.log(`Updated ${typeName} ${uniqueId.substring(0,4)} position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}), angle: ${angle.toFixed(2)}`);
            }
            
            return updated;
          } catch (e) {
            console.error(`Error updating ${typeName}: ${e.message}`);
            return false;
          }
        };
        
        // 1. Update birds
        for (const [uniqueId, birdInfo] of trackedBodies.birds.entries()) {
          if (updateObjectPosition(uniqueId, birdInfo, 'bird')) {
            updatedCount++;
          }
        }
        
        // Special handling for pigs - ALWAYS update their positions
        for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
          // Always attempt to update the pig's position, regardless of active status
          const entityId = pigInfo ? pigInfo.entityId : null;
          if (!entityId) continue;
          
          const entity = gameState.entities[entityId];
          if (!entity || !entity.bodyId) continue;
          
          try {
            // Get current position from physics system
            const pos = b2Body_GetPosition(entity.bodyId);
            
            // Try to get angle from multiple possible sources
            let angle = 0;
            
            // Apply the same comprehensive angle detection logic
            try {
              if (entity.bodyId.m_sweep && entity.bodyId.m_sweep.a !== undefined) {
                angle = entity.bodyId.m_sweep.a;
              } else if (entity.bodyId.GetAngle && typeof entity.bodyId.GetAngle === 'function') {
                angle = entity.bodyId.GetAngle();
              } else if (entity.bodyId.getAngle && typeof entity.bodyId.getAngle === 'function') {
                angle = entity.bodyId.getAngle();
              } else if (entity.bodyId.GetTransform && typeof entity.bodyId.GetTransform === 'function') {
                const xf = entity.bodyId.GetTransform();
                if (xf && xf.q) {
                  angle = Math.atan2(xf.q.s, xf.q.c);
                }
              }
              
              // Add occasional detailed logging
              if (gameState.debugMode && Math.random() < 0.01) {
                console.log(`Pig rotation angle: ${angle}, body props available:`, Object.keys(entity.bodyId));
              }
            } catch (angleErr) {
              console.warn(`Error getting angle for pig: ${angleErr.message}`);
            }
            
            if (pos) {
              // Force direct update to renderer with new position
              const newPos = { x: pos.x, y: pos.y };
              renderer.updateGameObject(uniqueId, newPos, angle);
              
              // Update tracking
              if (!renderer.gameObjects.has(uniqueId)) {
                // If the renderer doesn't have this pig yet, register it
                renderer.registerGameObject(entity.bodyId, 'pig', {
                  uniqueId: uniqueId,
                  radius: 1.0,
                  x: pos.x,
                  y: pos.y,
                  angle: angle
                });
              }
              
              // Debug logging
              if (gameState.debugMode && Math.random() < 0.05) {
                console.log(`Updated pig ${uniqueId.substring(0,6)} to position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}), active: ${pigInfo.active}`);
              }
              
              updatedCount++;
            }
          } catch (e) {
            console.error(`Error updating pig ${uniqueId}: ${e.message}`);
          }
        }
        
        // 3. Update blocks with emphasis on logging
        for (const [uniqueId, blockInfo] of trackedBodies.blocks.entries()) {
          if (updateObjectPosition(uniqueId, blockInfo, 'wood')) {
            updatedCount++;
            
          }
        }
        
        // 4. Special handling for the current bird during aiming
        if (gameState.currentBird && gameState.isAiming) {
          // The bird's position is already updated in calculateAimFromInput
          // We just need to ensure the renderer has the current position
          try {
            const birdUniqueId = gameState.currentBird.userData?.id;
            if (birdUniqueId) {
              // Always create a new position object to ensure change detection
              const newPosition = { x: gameState.birdPosition.x, y: gameState.birdPosition.y };
              
              // Check if this bird exists in the renderer
              if (!renderer.gameObjects.has(birdUniqueId)) {
                console.warn(`Current bird ${birdUniqueId} not found in renderer - cannot update position`);
              } else {
                renderer.updateGameObject(birdUniqueId, newPosition, 0);
                updatedCount++;
                
                if (gameState.debugMode) {
                  console.log(`Updated current bird ${birdUniqueId.substring(0,4)} position: (${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)})`);
                }
              }
            } else {
              console.warn("Current bird has no userData.id - cannot update position");
            }
          } catch (e) {
            console.error("Error updating current bird:", e);
          }
        }
        
        // Store update count for UI display
        gameState.lastUpdateCount = updatedCount;
      } catch (e) {
        console.error("Error in updateGameObjectPositions:", e);
      }
    }
    
    // Game loop
    function gameLoop(timestamp) {
      // Calculate time delta
      const deltaTime = gameState.lastUpdateTime ? (timestamp - gameState.lastUpdateTime) / 1000 : 0.016;
      gameState.lastUpdateTime = timestamp;
      
      // Get input
      const input = getInput();
      
      // Handle input
      calculateAimFromInput(input);
      
      // Physics step with small substeps for better collision detection
      // Use multiple smaller steps for more accurate collision
      const timeStep = Math.min(deltaTime, 0.016); // Cap at 60fps time step
      const numSubSteps = 4; // Four steps per frame for smoother physics
      
      // Log physics stepping info
      if (gameState.debugMode) {
        console.log(`\n--- PHYSICS STEP START - Time: ${timeStep.toFixed(4)}s ---`);
      }
      
      for (let i = 0; i < numSubSteps; i++) {
        b2World_Step(worldId, timeStep / numSubSteps, 10);
      }
      
      if (gameState.debugMode) {
        console.log(`--- PHYSICS STEP COMPLETE ---\n`);
        
        // Log pig bodies for inspection
        for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
          if (pigInfo && pigInfo.entityId) {
            const entity = gameState.entities[pigInfo.entityId];
            if (entity && entity.bodyId) {
              console.log('Pig body object:', entity.bodyId);
            }
          }
        }
      }
      
      taskSystem?.ClearTasks();
      
      // Update all game object positions from physics bodies
      updateGameObjectPositions();
      
      // Force position printing in debug mode for first 10 seconds
      const startupTime = 10000; // 10 seconds
      if (Date.now() - gameState.initTime < startupTime) {
        // Every few frames, verify all objects are being tracked correctly
        if (Math.floor(timestamp) % 30 === 0) {
          console.log("FRAME UPDATE CHECK - Verifying positions being updated:");
          
          // Check tracked counts
          const trackedCounts = {
            pigs: trackedBodies.pigs.size,
            blocks: trackedBodies.blocks.size,
            birds: trackedBodies.birds.size,
            total: trackedBodies.pigs.size + trackedBodies.blocks.size + trackedBodies.birds.size,
            rendererCount: renderer.gameObjects.size
          };
          console.log(`Current tracked objects: ${JSON.stringify(trackedCounts)}`);
          
          // Print positions for one pig and one block to verify updates
          if (trackedBodies.pigs.size > 0) {
            const [pigId, pigInfo] = Array.from(trackedBodies.pigs.entries())[0];
            if (pigInfo && pigInfo.active) {
              const entityId = pigInfo.entityId;
              const entity = gameState.entities[entityId];
              if (entity && entity.bodyId) {
                const pos = b2Body_GetPosition(entity.bodyId);
                console.log(`PIG position: uniqueId=${pigId.substring(0,6)}, pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
                
                // Verify that the renderer has this object
                if (renderer.gameObjects.has(pigId)) {
                  const rendererPos = renderer.gameObjects.get(pigId).position;
                  console.log(`RENDERER PIG position: uniqueId=${pigId.substring(0,6)}, pos=(${rendererPos.x.toFixed(2)}, ${rendererPos.y.toFixed(2)})`);
                } else {
                  console.error(`PIG ${pigId} exists in physics but NOT in renderer!`);
                }
              }
            }
          }
          
          if (trackedBodies.blocks.size > 0) {
            const [blockId, blockInfo] = Array.from(trackedBodies.blocks.entries())[0];
            if (blockInfo && blockInfo.active) {
              const entityId = blockInfo.entityId;
              const entity = gameState.entities[entityId];
              if (entity && entity.bodyId) {
                const pos = b2Body_GetPosition(entity.bodyId);
                console.log(`BLOCK position: uniqueId=${blockId.substring(0,6)}, pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
                
                // Verify that the renderer has this object
                if (renderer.gameObjects.has(blockId)) {
                  const rendererPos = renderer.gameObjects.get(blockId).position;
                  console.log(`RENDERER BLOCK position: uniqueId=${blockId.substring(0,6)}, pos=(${rendererPos.x.toFixed(2)}, ${rendererPos.y.toFixed(2)})`);
                } else {
                  console.error(`BLOCK ${blockId} exists in physics but NOT in renderer!`);
                }
              }
            }
          }
        }
      }
      
      // Clean up physics bodies
      cleanupBodies();
      
      // Draw the scene with UI
      renderer.Draw(worldId, gameState);
      
      // Continue game loop
      requestAnimationFrame(gameLoop);
    }
    
    // Initialize game
    function init() {
      // Store initialization time for diagnostic logging
      gameState.initTime = Date.now();
      gameState.isGameStarted = false;
      
      // Setup renderer offset based on world dimensions
      // Center view horizontally with the bird/slingshot visible
      renderer.offset = {
        x: 0, // No horizontal offset needed
        y: 0  // No vertical offset needed
      };
      
      // Create audio element for laser sound
      const audio = document.createElement('audio');
      audio.id = 'laserSound';
      audio.src = '/public/sounds/laser.mp3';
      audio.preload = 'auto';
      document.body.appendChild(audio);
      
      // Add keyboard event listener for debug toggles
      window.addEventListener('keydown', (e) => {
        // Press 'D' to toggle debug mode
        if (e.key === 'd' || e.key === 'D') {
          gameState.debugMode = !gameState.debugMode;
          console.log("Debug mode:", gameState.debugMode ? "ON" : "OFF");
          
          if (gameState.debugMode) {
            logTrackedBodies();
            console.log("GameObjects map size:", renderer.gameObjects.size);
            console.log("GameObjects entries:", [...renderer.gameObjects.entries()]);
          }
        }
        
        // Press 'C' to dump debug info to console
        if (e.key === 'c' || e.key === 'C') {
          console.log("=== GAME STATE DEBUG ===");
          console.log("Current Bird - Body ID:", gameState.currentBird);
          console.log("Current Bird - Entity ID:", gameState.currentBirdEntityId);
          console.log("Current Bird - Type:", gameState.currentBirdType);
          console.log("Birds Remaining:", gameState.birdsRemaining);
          console.log("Pigs Remaining:", gameState.pigsRemaining);
          console.log("Is Aiming:", gameState.isAiming);
          console.log("Is Firing:", gameState.isFiring);
          console.log("Game Over:", gameState.gameOver);
          console.log("Victory:", gameState.victory);
          console.log("Bird Position:", gameState.birdPosition);
          
          console.log("\n=== ENTITY SYSTEM ===");
          console.log("Entity Count:", Object.keys(gameState.entities).length);
          console.log("BodyToEntity Map Size:", gameState.bodyToEntity.size);
          
          console.log("\nEntities by ID:");
          Object.entries(gameState.entities).forEach(([id, entity]) => {
            console.log(`Entity ID ${id}: type=${entity.type}, bodyId=${entity.bodyId} (${typeof entity.bodyId}), props=`, entity.properties);
          });
          
          console.log("\nBody→Entity Mappings:");
          Array.from(gameState.bodyToEntity.entries()).forEach(([bodyId, entityId]) => {
            const entity = gameState.entities[entityId];
            const type = entity ? entity.type : "MISSING";
            console.log(`Body ${bodyId} (${typeof bodyId}) → Entity ${entityId}: ${type}`);
          });
          
          console.log("\n=== TRACKED BODIES ===");
          logTrackedBodies();
          
          console.log("\n=== RENDERER OBJECTS ===");
          console.log("GameObjects Map Size:", renderer.gameObjects.size);
          
          // Always log the contents to diagnose bird rendering issues
          console.log("Renderer Registration Entries:");
          for (const [id, info] of renderer.gameObjects.entries()) {
            console.log(`Registered: uniqueId=${id}, type=${info.type}, properties:`, info.properties);
          }
        }
      });
      
      // Create level
      createLevel();
      
      // Add a new bird ready to fire
      prepareBird();
      
      // Log registered bodies after initialization
      setTimeout(() => {
        logTrackedBodies();
        console.log("GameObjects map size:", renderer.gameObjects.size);
        console.log("GameObjects entries:", [...renderer.gameObjects.entries()]);
      }, 1000);
      
      // Start game loop
      requestAnimationFrame(gameLoop);
    }
    
    // Start the game
    init();
  });
}