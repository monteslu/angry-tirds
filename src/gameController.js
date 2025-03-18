/**
 * Game Controller - Manages game state and input handling
 */
import { getInput, debugPhysicsBody, getIdFromBody, loadSound, playSound } from './utils.js';

export class GameController {
  constructor(physics, entityManager, renderer, worldDimensions) {
    this.physics = physics;
    this.entityManager = entityManager;
    this.renderer = renderer;
    this.worldDimensions = worldDimensions;
    
    // Load sounds once
    this.sounds = {};
    loadSound('/sounds/laser.mp3').then(sound => {
      this.sounds.laser = sound;
    }).catch(e => console.log("Failed to load sound:", e));
    
    // Game state
    this.state = {
      isLoading: false,
      isAiming: false,
      isFiring: false,
      birdsRemaining: 3,
      pigsRemaining: 0,
      score: 0,
      worldDimensions: worldDimensions,
      slingPosition: { 
        x: worldDimensions.left + (worldDimensions.width * 0.15), 
        y: worldDimensions.groundY // Exactly at ground level
      },
      birdPosition: { 
        x: worldDimensions.left + (worldDimensions.width * 0.15), 
        y: worldDimensions.groundY + 2.5 // Positioned at the top of the slingshot
      },
      aimPosition: {
        x: worldDimensions.left + (worldDimensions.width * 0.15), 
        y: worldDimensions.groundY + 2.5
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
      startButtonPressed: false, // Track if Start button was pressed
      initTime: Date.now()
    };
  }
  
  // Process input and update game state
  handleInput() {
    const input = getInput();
    const player = input[0]; // Get first player (keyboard or gamepad)
    
    // Check if the player object and button properties exist
    if (!player) return;
    
    // Extract pressed state more safely
    const isAButtonPressed = player.BUTTON_SOUTH && player.BUTTON_SOUTH.pressed === true;
    
    // Check for aiming input with safer property access
    if (isAButtonPressed && !this.state.isAiming && !this.state.isFiring && this.state.currentBird) {
      // Start aiming
      this.state.isAiming = true;
      this.state.aimDirection = { x: 0, y: 0 };
      this.state.aimPower = 0;
      this.state.aimPosition = { ...this.state.slingPosition }; // Track current position during aiming
    } else if (this.state.isAiming) {
      this.handleAiming(player);
    }
    
    // Check for restart game with Start button - use safer property checks
    const isStartPressed = player.START && player.START.pressed === true;
    if (isStartPressed && !this.state.startButtonPressed && this.state.gameOver) {
      this.resetGame();
      this.state.startButtonPressed = true;
    } else if (!isStartPressed && this.state.startButtonPressed) {
      // Reset the flag when button is released
      this.state.startButtonPressed = false;
    }
    
    // Reset the select button pressed state if needed
    const isSelectPressed = player.SELECT && player.SELECT.pressed === true;
    if (!isSelectPressed && this.state.selectButtonPressed) {
      this.state.selectButtonPressed = false;
    }
  }
  
  // Handle when the aim button is first pressed
  handleAimButtonPressed(player) {
    if (!this.state.isAiming && !this.state.isFiring && this.state.currentBird) {
      // Start aiming
      this.state.isAiming = true;
      this.state.aimDirection = { x: 0, y: 0 };
      this.state.aimPower = 0;
      this.state.aimPosition = { ...this.state.slingPosition }; // Track current position during aiming
    }
  }
  
  // Handle the aiming process
  handleAiming(player) {
    // Get directional input from left stick or d-pad
    const leftStickX = player.LEFT_STICK_X || 0;
    const leftStickY = player.LEFT_STICK_Y || 0;
    
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
      // Safely check if the button exists and has the pressed property
      const isLeftPressed = player.DPAD_LEFT && player.DPAD_LEFT.pressed === true;
      const isRightPressed = player.DPAD_RIGHT && player.DPAD_RIGHT.pressed === true;
      
      if (isLeftPressed) dirX = -0.2;
      else if (isRightPressed) dirX = 0.2;
    }
    
    if (Math.abs(dirY) < 0.05) {
      // Safely check if the button exists and has the pressed property
      const isDownPressed = player.DPAD_DOWN && player.DPAD_DOWN.pressed === true;
      const isUpPressed = player.DPAD_UP && player.DPAD_UP.pressed === true;
      
      if (isDownPressed) dirY = -0.2;
      else if (isUpPressed) dirY = 0.2;
    }
    
    // Apply incremental position changes for smooth aiming
    if (Math.abs(dirX) > 0.05 || Math.abs(dirY) > 0.05) {
      const sensitivity = 0.15; // Controls how quickly the bird moves when aiming
      
      // Update aim position incrementally for smooth movement
      this.state.aimPosition = {
        x: this.state.aimPosition.x + dirX * sensitivity,
        y: this.state.aimPosition.y + dirY * sensitivity // Y should move in the same direction as input
      };
      
      // Prevent pulling the bird below ground level
      // Use bird radius (0.5 is default) to keep the entire bird above ground
      const birdRadius = 0.5; // This is the standard bird radius used in createBird
      if (this.state.aimPosition.y - birdRadius < this.state.worldDimensions.groundY) {
        this.state.aimPosition.y = this.state.worldDimensions.groundY + birdRadius;
      }
      
      // Calculate the vector from slingshot to current position
      const sling = this.state.slingPosition;
      const dx = this.state.aimPosition.x - sling.x;
      const dy = this.state.aimPosition.y - sling.y;
      
      // Calculate distance from slingshot
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Limit maximum stretch distance
      const maxStretch = 5.0;
      if (distance > maxStretch) {
        // Normalize the direction and scale to max stretch
        const norm = maxStretch / distance;
        this.state.aimPosition = {
          x: sling.x + dx * norm,
          y: sling.y + dy * norm
        };
      }
      
      // Calculate normalized direction vector
      if (distance > 0.1) { // Avoid division by very small numbers
        this.state.aimDirection = {
          x: dx / distance,
          y: dy / distance
        };
      } else {
        this.state.aimDirection = { x: 0, y: 0 };
      }
      
      // Calculate power based on stretch distance (normalize to 0-1 range, then scale)
      this.state.aimPower = Math.min(distance / maxStretch, 1.0) * 5; 
      
      // Update bird position
      if (this.state.currentBird) {
        // Set transform with correct arguments (body, position, rotation)
        const { b2Vec2, b2Rot, b2Body_SetTransform } = this.physics;
        const newPos = new b2Vec2(this.state.aimPosition.x, this.state.aimPosition.y);
        const rot = new b2Rot();
        rot.SetAngle(0);
        b2Body_SetTransform(this.state.currentBird, newPos, rot);
        
        // Update bird position for rendering
        this.state.birdPosition = { ...this.state.aimPosition };
      }
    }
    
    // Check if aiming is finished (button released)
    const isButtonPressed = player.BUTTON_SOUTH && player.BUTTON_SOUTH.pressed === true;
    if (!isButtonPressed) {
      this.fireBird();
    }
  }
  
  // Fire the bird when player releases the button
  fireBird() {
    // Calculate distance for launch check
    const sling = this.state.slingPosition;
    const dx = this.state.aimPosition.x - sling.x;
    const dy = this.state.aimPosition.y - sling.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Fire the bird if we have a valid aim
    if (this.state.currentBird && distance > 0.5) { // Require minimum stretch for launch
      // Calculate impulse based on aim and distance
      const launchPower = this.state.aimPower * 50; // Reduced power for better control
      
      // Apply impulse in the opposite direction of aiming (slingshot effect)
      // This directly uses the vector from bird to slingshot for most realistic behavior
      const impulseX = (sling.x - this.state.aimPosition.x) * launchPower;
      const impulseY = (sling.y - this.state.aimPosition.y) * launchPower;
      
      // Apply impulse to bird
      const { b2Vec2, b2Body_ApplyLinearImpulse } = this.physics;
      const impulse = new b2Vec2(impulseX, impulseY);
      const worldPoint = new b2Vec2(this.state.birdPosition.x, this.state.birdPosition.y);
      
      b2Body_ApplyLinearImpulse(
        this.state.currentBird,
        impulse,
        worldPoint,
        true // wake the body
      );
      
      // Update game state after firing
      this.state.isAiming = false;
      this.state.isFiring = true;
      this.state.isGameStarted = true;
      this.state.birdsRemaining--;
      
      // Setup slingshot animation
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      const recoilDistance = Math.min(distance, 3);
      
      this.state.strapAnimation = {
        active: true,
        startTime: Date.now(),
        duration: 2000,
        initialPosition: { ...this.state.birdPosition },
        snapPosition: {
          x: sling.x - normalizedDx * recoilDistance,
          y: sling.y - normalizedDy * recoilDistance
        },
        targetPosition: {
          x: this.state.slingPosition.x,
          y: this.state.slingPosition.y + 2.5
        }
      };
      
      // Play sound using pre-loaded sound buffer
      if (this.sounds.laser) {
        playSound(this.sounds.laser);
      }
    } else {
      // Not enough pull, cancel aiming
      this.state.isAiming = false;
      
      // Reset bird position to slingshot
      if (this.state.currentBird) {
        const { b2Vec2, b2Rot, b2Body_SetTransform } = this.physics;
        const resetPos = new b2Vec2(this.state.slingPosition.x, this.state.slingPosition.y);
        const rot = new b2Rot();
        rot.SetAngle(0);
        b2Body_SetTransform(
          this.state.currentBird, 
          resetPos,
          rot
        );
        this.state.birdPosition = { ...this.state.slingPosition };
      }
    }
  }
  
  // Check for bodies to remove (objects off-screen or pigs hit)
  cleanupBodies() {
    const { b2Body_GetPosition, b2Body_GetLinearVelocity, b2DestroyBody } = this.physics;
    const { groundY, left: worldLeft, right: worldRight } = this.worldDimensions;
    const trackedBodies = this.entityManager.trackedBodies;
    
    // Update physics state for each tracked pig
    for (const [uniqueId, pigInfo] of trackedBodies.pigs.entries()) {
      try {
        // Skip if no entity data
        const entityId = pigInfo.entityId;
        const entity = this.entityManager.entities[entityId];
        
        if (!entity || !entity.bodyId) {
          continue;
        }
        
        // Now use the actual Box2D body for physics
        const bodyId = entity.bodyId;
        const pos = b2Body_GetPosition(bodyId);
        const vel = b2Body_GetLinearVelocity(bodyId);
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        
        // Get rotation angle via transforms
        let angle = 0;
        try {
          if (typeof this.physics.b2Body_GetRotation === 'function') {
            const rotation = this.physics.b2Body_GetRotation(bodyId);
            if (rotation) {
              angle = Math.atan2(rotation.s, rotation.c);
            }
          } else if (typeof this.physics.b2Body_GetAngle === 'function') {
            angle = this.physics.b2Body_GetAngle(bodyId);
          }
        } catch (e) {
          console.warn("Error getting pig rotation:", e);
        }
        
        // Always update position and rotation for ALL pigs (active and inactive)
        const newPos = { x: pos.x, y: pos.y };
        this.renderer.updateGameObject(uniqueId, newPos, angle);
        
        // Pig destruction conditions: fell off screen or hit with moderate force
        // Only kill pig if it's still active
        // Also mark pigs as dead if they go offscreen horizontally
        if (pigInfo.active && (pos.y < -45 || pos.x < worldLeft - 10 || pos.x > worldRight + 10 || speed > 15.0)) {
          // Add to score
          this.state.score += 500;
          
          // Mark as inactive but NEVER destroy the body - keep for physics and positioning
          pigInfo.active = false;
          
          // Mark this pig as dead in the renderer
          if (this.renderer.gameObjects.has(uniqueId)) {
            const pigObj = this.renderer.gameObjects.get(uniqueId);
            pigObj.dead = true;
          }
        }
      } catch (e) {
        console.error("Error updating pig:", e);
      }
    }
    
    // Update physics state for current bird
    if (this.state.currentBird) {
      // Get the userData.id from the current bird
      const currentBirdId = getIdFromBody(this.state.currentBird);
      // Look up bird info by userData.id
      const birdInfo = currentBirdId ? trackedBodies.birds.get(currentBirdId) : null;
      
      try {
        const pos = b2Body_GetPosition(this.state.currentBird);
        const vel = b2Body_GetLinearVelocity(this.state.currentBird);
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        
        // Remove bird if it falls off screen or goes off screen horizontally
        if (pos.y < -50 || pos.x < worldLeft - 10 || pos.x > worldRight + 10) {
          // Delete from renderer using ONLY uniqueId
          if (birdInfo && birdInfo.uniqueId) {
            // Remove from renderer by uniqueId
            this.renderer.gameObjects.delete(birdInfo.uniqueId);
          }
          
          // Get entity info and remove from entity system
          const entityId = birdInfo ? birdInfo.entityId : null;
          if (entityId) {
            this.entityManager.removeEntity(entityId);
          }
          
          // Mark as inactive in tracking list
          if (birdInfo) {
            birdInfo.active = false;
          }
          
          try {
            b2DestroyBody(this.state.currentBird);
          } catch (e) {
            console.error("Error destroying bird body:", e);
          }
          
          // Clear current bird
          this.state.currentBird = null;
          this.state.isFiring = false;
          
          // Prepare next bird with a delay if there are birds remaining
          if (this.state.birdsRemaining > 0) {
            setTimeout(() => {
              this.prepareBird();
            }, 1000);
          }
        }
        // Check if bird has come to rest
        else if (this.state.isFiring && speed < 0.2) {
          // Bird has almost stopped - allow for next bird
          this.state.currentBird = null;
          this.state.isFiring = false;
          
          // Prepare next bird with a delay
          setTimeout(() => {
            this.prepareBird();
          }, 1000);
        }
      } catch (e) {
        // Body might have been already destroyed
        if (birdInfo) {
          birdInfo.active = false;
        }
        this.state.currentBird = null;
        this.state.isFiring = false;
      }
    }
    
    // Check for game over/victory conditions
    // Count active pigs to determine game status
    const activePigs = Array.from(trackedBodies.pigs.values())
      .filter(info => info && info.active).length;
    
    if (activePigs === 0 && !this.state.victory && this.state.isGameStarted) {
      // Victory!
      this.state.victory = true;
      this.state.gameOver = true;
    } else if (this.state.birdsRemaining <= 0 && !this.state.currentBird && !this.state.isFiring && !this.state.gameOver) {
      // Game over - no birds left and pigs remain
      this.state.gameOver = true;
    }
    
    // Store number of active pigs
    this.state.pigsRemaining = activePigs;
  }
  
  // Prepare a new bird on the slingshot
  prepareBird() {
    if (this.state.birdsRemaining <= 0) return;
    
    // Position the bird at the top of the slingshot, not at the slingshot base
    const birdPosition = {
      x: this.state.slingPosition.x,
      y: this.state.slingPosition.y + 2.5 // Position at the top of the slingshot
    };
    
    const birdId = this.entityManager.createBird(
      birdPosition.x,
      birdPosition.y
    );
    
    this.state.currentBird = birdId;
    this.state.birdPosition = { ...birdPosition };
  }
  
  // Reset the game
  resetGame() {
    console.log("Resetting game - destroying all physics objects");
    const { b2DestroyBody } = this.physics;
    const trackedBodies = this.entityManager.trackedBodies;
    
    // First, save any existing bodies to destroy
    const bodiesToDestroy = [];
    
    // Get all existing body IDs from trackedBodies
    for (const [uniqueId, info] of trackedBodies.birds.entries()) {
      if (info && info.active && info.entityId) {
        const entity = this.entityManager.entities[info.entityId];
        if (entity && entity.bodyId) {
          bodiesToDestroy.push(entity.bodyId);
        }
      }
    }
    
    for (const [uniqueId, info] of trackedBodies.pigs.entries()) {
      if (info && info.active && info.entityId) {
        const entity = this.entityManager.entities[info.entityId];
        if (entity && entity.bodyId) {
          bodiesToDestroy.push(entity.bodyId);
        }
      }
    }
    
    for (const [uniqueId, info] of trackedBodies.blocks.entries()) {
      if (info && info.active && info.entityId) {
        const entity = this.entityManager.entities[info.entityId];
        if (entity && entity.bodyId) {
          bodiesToDestroy.push(entity.bodyId);
        }
      }
    }
    
    // Destroy all bodies we gathered
    for (const bodyId of bodiesToDestroy) {
      try {
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
    this.state.isAiming = false;
    this.state.isFiring = false;
    this.state.score = 0;
    this.state.gameOver = false;
    this.state.victory = false;
    this.state.isGameStarted = false;
    this.state.currentBird = null;
    this.state.startButtonPressed = false;
    this.state.birdPosition = { ...this.state.slingPosition };
    
    // Reset entity system
    this.entityManager.entities = {};
    this.entityManager.bodyToEntity.clear();
    this.entityManager.nextEntityId = 1;
    
    // Clear renderer object registry
    this.renderer.gameObjects.clear();
    
    console.log("Game reset complete - all physics objects destroyed");
  }
}