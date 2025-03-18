/**
 * GameRenderer - A custom renderer for an Angry Birds-like game
 * Uses canvas drawing instead of images
 * 
 * IMPORTANT: This renderer does NOT use Box2D's debug drawing mechanism
 * or direct pointer values. It relies entirely on userData.id for entity tracking.
 */
import { getIdFromBody, generateUniqueId } from './utils.js';

export default class GameRenderer {
  constructor(Module, context, scale, autoHD = false) {
    this.Module = Module;
    this.ctx = context;
    this.baseScale = scale;
    this.offset = { x: 0, y: 0 };
    
    // Use the scale as provided - no DPI adjustment
    this.finalScale = this.baseScale;
    
    // Track world objects and their types - this is the primary entity storage
    // Maps uniqueId -> { type, properties, position, angle, etc. }
    this.gameObjects = new Map();
    
    // Color scheme
    this.colors = {
      background: '#87CEEB', // Sky blue
      ground: '#8B4513',     // Brown
      bird: '#FF0000',       // Bright red
      wood: '#DEB887',       // Burlywood
      pig: '#32CD32',        // Lime green  
      slingshot: '#8B4513',  // Brown
      rubber: '#FFD700',     // Yellow/gold for slingshot straps
      ui: {
        text: '#FFFFFF',     // White
        score: '#FFD700',    // Gold
        background: 'rgba(0, 0, 0, 0.5)'  // Semi-transparent black
      }
    };
  }
  
  // Register a physics body with a specific game object type
  registerGameObject(bodyId, type, properties = {}) {
    // Get the unique ID from properties or from the body's userData
    let uniqueId = properties.uniqueId;
    if (!uniqueId && bodyId && bodyId.userData && bodyId.userData.id) {
      uniqueId = bodyId.userData.id;
    }
    
    if (!uniqueId) {
      console.error("ERROR: Must provide a uniqueId in properties for registration");
      return;
    }
    
    // Get initial position and angle from body if available
    let position = { x: 0, y: 0 };
    let angle = 0;
    
    try {
      if (bodyId && this.Module.b2Body_GetPosition && this.Module.b2Body_GetAngle) {
        const pos = this.Module.b2Body_GetPosition(bodyId);
        position = { x: pos.x, y: pos.y };
        angle = this.Module.b2Body_GetAngle(bodyId);
      } else if (properties.x !== undefined && properties.y !== undefined) {
        // Use provided position if available (for initialization)
        position = { x: properties.x, y: properties.y };
        if (properties.angle !== undefined) {
          angle = properties.angle;
        }
      }
      
    } catch (e) {
      console.warn("Could not get initial position/angle:", e);
    }
    
    // Create the game object data with position and angle
    const gameObjectData = { 
      type, 
      uniqueId,
      properties,
      position,
      angle,
      lastUpdated: Date.now()
    };
    
    // ONLY store by uniqueId - NEVER use pointer values
    
    // Register the object
    this.gameObjects.set(uniqueId, gameObjectData);
    
    
    return uniqueId;
  }
  
  // Update a game object's position and angle - call this from the game loop
  updateGameObject(uniqueId, position, angle) {
    if (!this.gameObjects.has(uniqueId)) {
      // Log warning but don't return - add to tracking if it's missing
      console.warn(`Cannot update object with uniqueId ${uniqueId} - not found in gameObjects`);
      
      // Create a minimal object for tracking when missing 
      // (will be properly updated on next frame)
      this.gameObjects.set(uniqueId, {
        type: 'unknown',
        uniqueId: uniqueId,
        position: { x: position.x, y: position.y },
        angle: angle,
        lastUpdated: Date.now()
      });
      
      return true;
    }
    
    const gameObject = this.gameObjects.get(uniqueId);
    
    // Create a new position object to ensure change detection
    gameObject.position = { x: position.x, y: position.y };
    gameObject.angle = angle;
    gameObject.lastUpdated = Date.now();
    
    return true;
  }
  
  // Set up the canvas transform
  prepareCanvas() {
    this.ctx.save();
    // Scale and flip the y-axis (standard in physics simulations)
    this.ctx.scale(this.finalScale, -this.finalScale);
    
    // Get canvas dimensions in physics units
    const canvasWidth = this.ctx.canvas.width / this.finalScale;
    const canvasHeight = this.ctx.canvas.height / this.finalScale;
    
    // Translate to center horizontally, and put ground at bottom
    // Physics coordinates have (0,0) at center, and -y is bottom half
    this.ctx.translate(
      canvasWidth/2 + this.offset.x,       // Center horizontally with offset
      -canvasHeight/2 + this.offset.y      // Bottom of the canvas (negative in flipped y coords)
    );
    this.ctx.lineWidth = 1 / this.finalScale;
  }
  
  // Restore canvas transform
  restoreCanvas() {
    this.ctx.restore();
  }
  
  // Draw a bird (circular physics object)
  drawBird(x, y, radius, angle, gameState) {
    // Make display radius a bit smaller than physics radius (which was increased for collision)
    const birdRadius = radius * 0.8; // Bird looks 80% of physics size
    
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(-angle);
    
    // Shadow for depth
    this.ctx.beginPath();
    this.ctx.arc(0.1, 0.1, birdRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fill();
    
    // Main body (circle)
    this.ctx.beginPath();
    this.ctx.arc(0, 0, birdRadius, 0, Math.PI * 2);
    
    // Create a radial gradient for a more vibrant red
    const gradient = this.ctx.createRadialGradient(
      -birdRadius * 0.3, -birdRadius * 0.3, 0,
      0, 0, birdRadius * 1.2
    );
    gradient.addColorStop(0, '#FF6666'); // Lighter red highlight
    gradient.addColorStop(0.7, '#FF0000'); // Bright red
    gradient.addColorStop(1, '#CC0000'); // Darker red edge
    
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    
    // Subtle outline
    this.ctx.strokeStyle = '#CC0000';
    this.ctx.lineWidth = birdRadius * 0.05;
    this.ctx.stroke();
    
    // Eyes (white part) - make both eyes visible
    const eyeRadius = birdRadius * 0.25;
    const eyeXOffset = birdRadius * 0.3;
    const eyeYOffset = -birdRadius * 0.15;
    
    // Left eye
    this.ctx.beginPath();
    this.ctx.arc(-eyeXOffset, eyeYOffset, eyeRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fill();
    
    // Right eye
    this.ctx.beginPath();
    this.ctx.arc(eyeXOffset, eyeYOffset, eyeRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fill();
    
    // Pupils
    const pupilRadius = eyeRadius * 0.6;
    
    // Left pupil with angry look
    this.ctx.beginPath();
    this.ctx.arc(-eyeXOffset + eyeRadius * 0.2, eyeYOffset, pupilRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#000000';
    this.ctx.fill();
    
    // Right pupil with angry look
    this.ctx.beginPath();
    this.ctx.arc(eyeXOffset + eyeRadius * 0.2, eyeYOffset, pupilRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#000000';
    this.ctx.fill();
    
    // Eyebrows for angry look
    this.ctx.beginPath();
    this.ctx.moveTo(-eyeXOffset - eyeRadius * 0.8, eyeYOffset - eyeRadius * 0.8);
    this.ctx.lineTo(-eyeXOffset + eyeRadius * 0.4, eyeYOffset - eyeRadius * 0.3);
    this.ctx.lineWidth = birdRadius * 0.06;
    this.ctx.strokeStyle = '#CC0000';
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.moveTo(eyeXOffset + eyeRadius * 0.8, eyeYOffset - eyeRadius * 0.8);
    this.ctx.lineTo(eyeXOffset - eyeRadius * 0.4, eyeYOffset - eyeRadius * 0.3);
    this.ctx.lineWidth = birdRadius * 0.06;
    this.ctx.strokeStyle = '#CC0000';
    this.ctx.stroke();
    
    // Yellow/orange beak
    this.ctx.beginPath();
    this.ctx.moveTo(birdRadius * 0.7, 0);
    this.ctx.lineTo(birdRadius * 1.4, birdRadius * 0.2);
    this.ctx.lineTo(birdRadius * 1.4, -birdRadius * 0.2);
    this.ctx.closePath();
    
    // Gradient for beak
    const beakGradient = this.ctx.createLinearGradient(
      birdRadius * 0.7, 0, 
      birdRadius * 1.4, 0
    );
    beakGradient.addColorStop(0, '#FFCC00');
    beakGradient.addColorStop(1, '#FF9900');
    
    this.ctx.fillStyle = beakGradient;
    this.ctx.fill();
    this.ctx.strokeStyle = '#CC7700';
    this.ctx.lineWidth = birdRadius * 0.03;
    this.ctx.stroke();
    
    this.ctx.restore();
  }
  
  // Draw a wooden block (box physics object)
  drawWood(x, y, width, height, angle, gameState) {
    // Match display size with physics size to fix floating appearance
    const displayWidth = width;  // 100% of physics width
    const displayHeight = height; // 100% of physics height
    
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(-angle);
    
    // Main rectangle - use full physics size
    this.ctx.fillStyle = this.colors.wood;
    this.ctx.fillRect(-displayWidth/2, -displayHeight/2, displayWidth, displayHeight);
    
    // Border
    this.ctx.strokeStyle = '#5D4037';
    this.ctx.lineWidth = displayWidth * 0.05;
    this.ctx.strokeRect(-displayWidth/2, -displayHeight/2, displayWidth, displayHeight);
    
    // Wood grain (horizontal lines)
    const grainCount = Math.max(2, Math.floor(displayHeight / 0.7));
    const grainSpacing = displayHeight / grainCount;
    
    this.ctx.strokeStyle = '#A1887F';
    this.ctx.lineWidth = displayWidth * 0.02;
    
    for (let i = 1; i < grainCount; i++) {
      const y = -displayHeight/2 + i * grainSpacing;
      this.ctx.beginPath();
      this.ctx.moveTo(-displayWidth/2, y);
      this.ctx.lineTo(displayWidth/2, y);
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  // Draw a pig (enemy, circular physics object)
  drawPig(x, y, radius, angle, gameState) {
    // Make visual radius close to physics radius
    const pigRadius = radius * 0.9; // 90% of physics size for display
    
    // Check if this pig is marked as dead
    let isPigDead = false;
    
    // Direct dead status from the gameObject itself - simplest approach
    for (const [uniqueId, gameObject] of this.gameObjects.entries()) {
      if (gameObject.type === 'pig' && 
          Math.abs(gameObject.position.x - x) < 0.01 && 
          Math.abs(gameObject.position.y - y) < 0.01) {
        
        // Check for dead flag directly on the gameObject
        if (gameObject.dead === true) {
          isPigDead = true;
        }
        
        // Also check activity status from trackedBodies as backup
        if (!isPigDead && gameState && gameState.trackedBodies && gameState.trackedBodies.pigs) {
          const pigInfo = gameState.trackedBodies.pigs.get(uniqueId);
          if (pigInfo && pigInfo.active === false) {
            isPigDead = true;
            
            // If not already marked as dead, mark it now
            if (gameObject.dead !== true) {
              gameObject.dead = true;
            }
          }
        }
        
        break;
      }
    }
    
    this.ctx.save();
    this.ctx.translate(x, y);
    // Rotate 180 degrees (PI radians) more for proper pig orientation
    this.ctx.rotate(-angle + Math.PI);
    
    // Shadow for depth
    this.ctx.beginPath();
    this.ctx.arc(0.1, 0.1, pigRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fill();
    
    // Main body (circle) with appropriate gradient based on alive/dead state
    this.ctx.beginPath();
    this.ctx.arc(0, 0, pigRadius, 0, Math.PI * 2);
    
    // Create a radial gradient based on pig's state
    const gradient = this.ctx.createRadialGradient(
      -pigRadius * 0.3, -pigRadius * 0.3, 0,
      0, 0, pigRadius * 1.2
    );
    
    if (isPigDead) {
      // Grey gradient for dead pigs
      gradient.addColorStop(0, '#AAAAAA'); // Light grey highlight
      gradient.addColorStop(0.6, '#888888'); // Medium grey
      gradient.addColorStop(1, '#555555'); // Dark grey edge
    } else {
      // Green gradient for living pigs
      gradient.addColorStop(0, '#70FF70'); // Lighter green highlight
      gradient.addColorStop(0.6, '#32CD32'); // Bright green (LimeGreen)
      gradient.addColorStop(1, '#228B22'); // Darker green edge (ForestGreen)
    }
    
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    
    // Outline color based on alive/dead state
    this.ctx.strokeStyle = isPigDead ? '#555555' : '#228B22';
    this.ctx.lineWidth = pigRadius * 0.05;
    this.ctx.stroke();
    
    // Eyes - make slightly larger
    const eyeRadius = pigRadius * 0.18;
    const eyeXOffset = pigRadius * 0.35;
    const eyeYOffset = -pigRadius * 0.2;
    
    // Left eye with slight highlight
    this.ctx.beginPath();
    this.ctx.arc(-eyeXOffset, eyeYOffset, eyeRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fill();
    
    // Right eye with slight highlight
    this.ctx.beginPath();
    this.ctx.arc(eyeXOffset, eyeYOffset, eyeRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fill();
    
    if (!isPigDead) {
      // Regular eyes for live pigs
      
      // Eye highlights
      this.ctx.beginPath();
      this.ctx.arc(-eyeXOffset - eyeRadius * 0.3, eyeYOffset - eyeRadius * 0.3, eyeRadius * 0.3, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.fill();
      
      this.ctx.beginPath();
      this.ctx.arc(eyeXOffset - eyeRadius * 0.3, eyeYOffset - eyeRadius * 0.3, eyeRadius * 0.3, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.fill();
      
      // Regular pupils
      const pupilRadius = eyeRadius * 0.6;
      
      // Left pupil
      this.ctx.beginPath();
      this.ctx.arc(-eyeXOffset, eyeYOffset, pupilRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = '#000000';
      this.ctx.fill();
      
      // Right pupil
      this.ctx.beginPath();
      this.ctx.arc(eyeXOffset, eyeYOffset, pupilRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = '#000000';
      this.ctx.fill();
    } else {
      // X eyes for dead pigs
      const xSize = eyeRadius * 0.8;
      
      // Left X eye
      this.ctx.beginPath();
      this.ctx.moveTo(-eyeXOffset - xSize, eyeYOffset - xSize);
      this.ctx.lineTo(-eyeXOffset + xSize, eyeYOffset + xSize);
      this.ctx.moveTo(-eyeXOffset + xSize, eyeYOffset - xSize);
      this.ctx.lineTo(-eyeXOffset - xSize, eyeYOffset + xSize);
      this.ctx.lineWidth = pigRadius * 0.05;
      this.ctx.strokeStyle = '#000000';
      this.ctx.stroke();
      
      // Right X eye
      this.ctx.beginPath();
      this.ctx.moveTo(eyeXOffset - xSize, eyeYOffset - xSize);
      this.ctx.lineTo(eyeXOffset + xSize, eyeYOffset + xSize);
      this.ctx.moveTo(eyeXOffset + xSize, eyeYOffset - xSize);
      this.ctx.lineTo(eyeXOffset - xSize, eyeYOffset + xSize);
      this.ctx.lineWidth = pigRadius * 0.05;
      this.ctx.strokeStyle = '#000000';
      this.ctx.stroke();
    }
    
    // Snout - make it more prominent and pink
    const noseWidth = pigRadius * 0.7;
    const noseHeight = pigRadius * 0.4;
    const noseY = pigRadius * 0.15;
    
    // Snout background
    this.ctx.beginPath();
    this.ctx.ellipse(0, noseY, noseWidth/2, noseHeight/2, 0, 0, Math.PI * 2);
    
    // Create a gradient for the snout
    const snoutGradient = this.ctx.createRadialGradient(
      0, noseY, 0,
      0, noseY, noseWidth/2
    );
    
    if (isPigDead) {
      snoutGradient.addColorStop(0, '#CCAAAA'); // Lighter grayish-pink in center
      snoutGradient.addColorStop(1, '#AA7777'); // Darker grayish-pink at edge
    } else {
      snoutGradient.addColorStop(0, '#FFBBCC'); // Lighter pink in center
      snoutGradient.addColorStop(1, '#FF7799'); // Darker pink at edge
    }
    
    this.ctx.fillStyle = snoutGradient;
    this.ctx.fill();
    this.ctx.strokeStyle = isPigDead ? '#AA7777' : '#FF5577';
    this.ctx.lineWidth = pigRadius * 0.03;
    this.ctx.stroke();
    
    // Nostrils - make them darker and more prominent
    const nostrilRadius = noseWidth * 0.15;
    const nostrilOffset = noseWidth * 0.25;
    
    this.ctx.beginPath();
    this.ctx.arc(-nostrilOffset, noseY, nostrilRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = isPigDead ? '#AA4444' : '#CC3355';
    this.ctx.fill();
    
    this.ctx.beginPath();
    this.ctx.arc(nostrilOffset, noseY, nostrilRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = isPigDead ? '#AA4444' : '#CC3355';
    this.ctx.fill();
    
    // Optional: Add ears for more pig-like appearance
    this.ctx.beginPath();
    this.ctx.ellipse(-pigRadius * 0.6, -pigRadius * 0.6, pigRadius * 0.4, pigRadius * 0.3, Math.PI/4, 0, Math.PI * 2);
    this.ctx.fillStyle = isPigDead ? '#888888' : '#32CD32'; // Grey or green ears based on state
    this.ctx.fill();
    this.ctx.strokeStyle = isPigDead ? '#555555' : '#228B22';
    this.ctx.lineWidth = pigRadius * 0.03;
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.ellipse(pigRadius * 0.6, -pigRadius * 0.6, pigRadius * 0.4, pigRadius * 0.3, -Math.PI/4, 0, Math.PI * 2);
    this.ctx.fillStyle = isPigDead ? '#888888' : '#32CD32'; // Grey or green ears based on state
    this.ctx.fill();
    this.ctx.strokeStyle = isPigDead ? '#555555' : '#228B22';
    this.ctx.lineWidth = pigRadius * 0.03;
    this.ctx.stroke();
    
    this.ctx.restore();
  }
  
  // Draw ground (static physics objects)
  drawGround(vertices) {
    this.ctx.beginPath();
    
    for (let i = 0; i < vertices.length; i++) {
      const { x, y } = vertices[i];
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    // Fill with a gradient for a terrain-like appearance
    const gradient = this.ctx.createLinearGradient(0, -40, 0, -35);
    gradient.addColorStop(0, this.colors.ground);
    gradient.addColorStop(1, '#A0522D');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    this.ctx.strokeStyle = '#654321';
    this.ctx.lineWidth = 0.1;
    this.ctx.stroke();
  }
  
  // Draw slingshot
  drawSlingshot(x, y, width = 2, height = 3) {
    this.ctx.save();
    this.ctx.translate(x, y);
    
    // Base at ground level
    const groundLevel = 0;
    
    // Draw the Y-shape slingshot
    this.ctx.beginPath();
    
    // Stem (vertical part)
    this.ctx.moveTo(0, groundLevel);
    this.ctx.lineTo(0, height * 0.6);
    
    // Left fork
    this.ctx.moveTo(0, height * 0.6);
    this.ctx.lineTo(-width/2, height);
    
    // Right fork
    this.ctx.moveTo(0, height * 0.6);
    this.ctx.lineTo(width/2, height);
    
    // Set line properties
    this.ctx.lineWidth = width/3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.colors.slingshot;
    this.ctx.stroke();
    
    // Draw a small base at the bottom for stability
    this.ctx.beginPath();
    this.ctx.rect(-width/3, groundLevel, width/1.5, 0.2);
    this.ctx.fillStyle = this.colors.slingshot;
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  // Draw slingshot rubber band
  drawSlingshotBand(fromX, fromY, toX, toY, controlX, controlY) {
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.quadraticCurveTo(controlX, controlY, toX, toY);
    this.ctx.lineWidth = 0.15;
    this.ctx.strokeStyle = this.colors.rubber;
    this.ctx.stroke();
  }
  
  // Draw a simple background with blue sky and green hills
  drawBackground() {
    const canvas = this.ctx.canvas;
    
    // Save current transform
    this.ctx.save();
    
    // Reset transform to work in screen coordinates
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Draw sky - plain blue background
    this.ctx.fillStyle = '#87CEEB'; // Sky blue
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw ground / hills
    this.ctx.fillStyle = '#4CAF50'; // Green color
    
    // Calculate hill height - increased to 30% of canvas height
    const hillHeight = canvas.height * 0.3;
    
    // Draw hills using a smooth bezier curve approach with raised edges
    this.ctx.beginPath();
    
    // Start at left edge already elevated
    this.ctx.moveTo(0, canvas.height - hillHeight * 0.4); // 40% of max height at left edge
    
    // First hill (rising from left edge)
    this.ctx.bezierCurveTo(
      canvas.width * 0.1, canvas.height - hillHeight * 0.35, // control point 1
      canvas.width * 0.2, canvas.height - hillHeight * 0.3,  // control point 2
      canvas.width * 0.25, canvas.height - hillHeight * 0.45 // end point
    );
    
    // Valley between first and second hills
    this.ctx.bezierCurveTo(
      canvas.width * 0.3, canvas.height - hillHeight * 0.5,  // control point 1
      canvas.width * 0.35, canvas.height - hillHeight * 0.55, // control point 2
      canvas.width * 0.4, canvas.height - hillHeight * 0.6   // end point
    );
    
    // Second hill (medium)
    this.ctx.bezierCurveTo(
      canvas.width * 0.45, canvas.height - hillHeight * 0.7, // control point 1
      canvas.width * 0.5, canvas.height - hillHeight * 0.8,  // control point 2
      canvas.width * 0.6, canvas.height - hillHeight * 0.75  // end point
    );
    
    // Third hill (tallest)
    this.ctx.bezierCurveTo(
      canvas.width * 0.7, canvas.height - hillHeight * 0.9,  // control point 1
      canvas.width * 0.8, canvas.height - hillHeight,        // control point 2
      canvas.width * 0.9, canvas.height - hillHeight * 0.7   // end point
    );
    
    // End with elevated right edge
    this.ctx.bezierCurveTo(
      canvas.width * 0.95, canvas.height - hillHeight * 0.6, // control point 1
      canvas.width * 0.98, canvas.height - hillHeight * 0.5, // control point 2
      canvas.width, canvas.height - hillHeight * 0.5         // end at 50% height
    );
    
    // Close the shape
    this.ctx.lineTo(canvas.width, canvas.height);
    this.ctx.lineTo(0, canvas.height);
    this.ctx.closePath();
    
    // Fill the landscape
    this.ctx.fill();
    
    // Restore the transform
    this.ctx.restore();
  }
  
  // Render all game objects directly without using Box2D's debug drawing
  renderGameObjects(gameStateObj) {
    try {
      this.prepareCanvas();
      
      // Draw background first
      this.drawBackground();
      
      // Get canvas dimensions in physics units
      const canvas = this.ctx.canvas;
      const worldWidth = canvas.width / this.finalScale;
      const worldHeight = canvas.height / this.finalScale;
      
      // Calculate slingshot position from left, at bottom
      // Use gameState if provided, otherwise use default position
      let slingX = -worldWidth * 0.35; // 35% from left
      let slingY = -2; // Just above ground level (ground is at y=0)
      
      if (gameStateObj && gameStateObj.slingPosition) {
        slingX = gameStateObj.slingPosition.x;
        slingY = gameStateObj.slingPosition.y;
      }
      
      // Draw slingshot at the calculated position
      this.drawSlingshot(slingX, slingY);
      
      // Draw all registered game objects based on their current position and type
      for (const [uniqueId, gameObject] of this.gameObjects.entries()) {
        // If it's the current bird and we're in aiming mode, skip rendering here
        // (it will be rendered at the slingshot position)
        const isCurrentBird = gameStateObj && 
                          gameStateObj.currentBird && 
                          gameStateObj.currentBird.userData && 
                          gameStateObj.currentBird.userData.id === uniqueId;
        
        if (isCurrentBird && gameStateObj.isAiming) {
          continue; // Skip during aiming - will be handled by UI
        }
        
        // Get the position and angle from physics
        const position = gameObject.position || { x: 0, y: 0 };
        const angle = gameObject.angle || 0;
        
        // Render based on type
        switch (gameObject.type) {
          case 'bird':
            const birdRadius = gameObject.properties.radius || 0.5;
            this.drawBird(position.x, position.y, birdRadius, angle, gameStateObj);
            break;
            
          case 'pig':
            const pigRadius = gameObject.properties.radius || 1.0;
            this.drawPig(position.x, position.y, pigRadius, angle, gameStateObj);
            break;
            
          case 'wood':
            const blockWidth = gameObject.properties.width || 2.0;
            const blockHeight = gameObject.properties.height || 2.0;
            this.drawWood(position.x, position.y, blockWidth, blockHeight, angle, gameStateObj);
            break;
            
          case 'ground':
            // Ground is a special case - draw a horizontal line
            if (gameObject.properties.vertices) {
              this.drawGround(gameObject.properties.vertices);
            } else {
              // Default ground if no specific vertices
              const groundWidth = gameObject.properties.width || worldWidth * 2;
              const groundY = position.y || worldHeight * -0.5;
              const vertices = [
                { x: -groundWidth/2, y: groundY },
                { x: groundWidth/2, y: groundY }
              ];
              this.drawGround(vertices);
            }
            break;
        }
      }
      
      // If we have a current bird in aiming mode, render it at its current position
      if (gameStateObj && gameStateObj.currentBird && gameStateObj.isAiming && gameStateObj.birdPosition) {
        const birdPosition = gameStateObj.birdPosition;
        const bird = gameStateObj.currentBird;
        
        // Get uniqueId from the bird
        const birdUniqueId = bird.userData?.id;
        
        // Find bird properties (radius) from registration
        let birdRadius = 0.5; // Default
        if (birdUniqueId && this.gameObjects.has(birdUniqueId)) {
          const birdObj = this.gameObjects.get(birdUniqueId);
          if (birdObj && birdObj.properties && birdObj.properties.radius) {
            birdRadius = birdObj.properties.radius;
          }
        }
        
        // Draw the current bird at the aiming position
        this.drawBird(birdPosition.x, birdPosition.y, birdRadius, 0, gameStateObj);
      }
      
      this.restoreCanvas();
      
      // Store basic statistics
      if (gameStateObj) {
        gameStateObj.bodyShapesCount = this.gameObjects.size;
      }
    } catch (error) {
      console.error("Error in renderGameObjects:", error);
    }
  }
  
  // Transform point with rotation and translation
  transformPoint(xf, v) {
    return {
      x: xf.p.x + xf.q.c * v.x - xf.q.s * v.y,
      y: xf.p.y + xf.q.s * v.x + xf.q.c * v.y
    };
  }
  
  // Configure debug draw flags
  SetFlags(flags) {
    const debugDraw = this.debugDrawCommandBuffer.GetDebugDraw();
    for (const [key, value] of Object.entries(flags)) {
      debugDraw[key] = value;
    }
  }
  
  // Draw game UI elements
  drawUI(gameState) {
    const canvas = this.ctx.canvas;
    const ctx = this.ctx;
    
    // Calculate strap end position based on game state and animation
    let strapEndPosition;
    
    // Handle strap animation after bird is launched
    if (gameState.strapAnimation && gameState.strapAnimation.active) {
      const animation = gameState.strapAnimation;
      const currentTime = Date.now();
      const elapsedTime = currentTime - animation.startTime;
      
      if (elapsedTime < animation.duration) {
        // First 25% - Snap quickly to the opposite side (recoil)
        if (elapsedTime < animation.duration * 0.25) {
          const fastProgress = Math.min(1, elapsedTime / (animation.duration * 0.25));
          // Quadratic ease out for quick snap
          const snapEase = 1 - Math.pow(1 - fastProgress, 2);
          strapEndPosition = {
            x: animation.initialPosition.x * (1 - snapEase) + animation.snapPosition.x * snapEase,
            y: animation.initialPosition.y * (1 - snapEase) + animation.snapPosition.y * snapEase
          };
        } 
        // For the rest of the time (1500ms), gradually settle back to resting position
        else {
          // Use a natural spring-like motion with damped oscillation
          const t = (elapsedTime - animation.duration * 0.25) / (animation.duration * 0.75);
          
          // Damped oscillation: e^(-6*t) * cos(12*t)
          // Simulates a spring with a bit of bounce
          const oscillation = Math.exp(-6 * t) * Math.cos(12 * t);
          
          // Add oscillation to a standard ease-out
          const progress = 1 - Math.pow(1 - Math.min(t, 1), 3); // Cubic ease-out
          const finalProgress = progress + oscillation * (1 - progress) * 0.15; // 15% oscillation effect
          
          strapEndPosition = {
            x: animation.snapPosition.x * (1 - finalProgress) + animation.targetPosition.x * finalProgress,
            y: animation.snapPosition.y * (1 - finalProgress) + animation.targetPosition.y * finalProgress
          };
        }
      } else {
        // Animation complete, use rest position
        strapEndPosition = { ...animation.targetPosition };
        gameState.strapAnimation.active = false;
      }
    }
    // Default behavior - straps follow bird during aiming
    else if (gameState.isAiming && gameState.birdPosition) {
      strapEndPosition = { ...gameState.birdPosition };
    }
    // When not animating or aiming, show straps at rest position
    else {
      strapEndPosition = {
        x: gameState.slingPosition.x,
        y: gameState.slingPosition.y + 2.5 // Default position at top of slingshot
      };
    }
    
    // Save current transform
    ctx.save();
    // Switch to physics space for drawing straps
    this.prepareCanvas();
    
    // Draw the straps
    this.drawSlingshotRubber(strapEndPosition, gameState.slingPosition);
    
    // Restore to screen space
    this.restoreCanvas();
    // Restore the original context state
    ctx.restore();
    
    // Switch to screen space for UI elements
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Draw score panel
    ctx.fillStyle = this.colors.ui.background;
    ctx.fillRect(10, 10, 300, 40);
    
    // Draw score
    ctx.font = '24px Arial';
    ctx.fillStyle = this.colors.ui.score;
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${gameState.score || 0}`, 20, 38);
    
    // Draw birds remaining
    ctx.fillStyle = this.colors.ui.text;
    ctx.textAlign = 'right';
    ctx.fillText(`Birds: ${gameState.birdsRemaining || 0}`, canvas.width - 20, 38);
    
    // If game is over, show message
    if (gameState.gameOver) {
      const message = gameState.victory ? 'VICTORY!' : 'GAME OVER';
      
      // Semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw message
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = gameState.victory ? '#4CAF50' : '#F44336';
      ctx.fillText(message, canvas.width / 2, canvas.height / 2);
      
      // Draw restart message
      ctx.font = '24px Arial';
      ctx.fillStyle = this.colors.ui.text;
      ctx.fillText('Press ENTER to restart', canvas.width / 2, canvas.height / 2 + 60);
    }
    
    // No game instructions at bottom of screen
    
    ctx.restore();
  }
  
  // Draw slingshot rubber connecting to bird
  drawSlingshotRubber(birdPos, slingPos) {
    if (!birdPos || !slingPos) return;
    
    // Draw in physics space
    this.ctx.save();
    
    // Calculate Y slingshot top positions
    const width = 2; // Same as slingshot width
    const height = 3; // Same as slingshot height
    const leftForkX = slingPos.x - width/2;
    const rightForkX = slingPos.x + width/2;
    const forkY = slingPos.y + height;
    
    // Draw straps with slight curve for more realistic look
    // Left strap - draw as shape with gradient
    this.ctx.beginPath();
    
    // Calculate control point for curve based on distance
    const dx = birdPos.x - leftForkX;
    const dy = birdPos.y - forkY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Make curve more pronounced as the bird is pulled back
    const curveFactor = Math.min(0.25, distance * 0.05);
    const controlX = (leftForkX + birdPos.x) / 2 - dy * curveFactor;
    const controlY = (forkY + birdPos.y) / 2 + dx * curveFactor;
    
    // Path for left strap
    this.ctx.moveTo(leftForkX, forkY);
    this.ctx.quadraticCurveTo(controlX, controlY, birdPos.x, birdPos.y);
    
    // Strap style with gradient
    this.ctx.lineWidth = 0.3;
    
    // Create gradient for the strap
    const leftGradient = this.ctx.createLinearGradient(leftForkX, forkY, birdPos.x, birdPos.y);
    leftGradient.addColorStop(0, '#FFD700'); // Yellow/gold at the fork
    leftGradient.addColorStop(0.5, '#FFC125'); // Darker in the middle for depth
    leftGradient.addColorStop(1, '#FFD700'); // Yellow/gold at the bird
    
    this.ctx.strokeStyle = leftGradient;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
    
    // Right strap
    this.ctx.beginPath();
    
    // Calculate control point for right side
    const controlX2 = (rightForkX + birdPos.x) / 2 + dy * curveFactor;
    const controlY2 = (forkY + birdPos.y) / 2 - dx * curveFactor;
    
    // Path for right strap
    this.ctx.moveTo(rightForkX, forkY);
    this.ctx.quadraticCurveTo(controlX2, controlY2, birdPos.x, birdPos.y);
    
    // Similar gradient for right strap
    const rightGradient = this.ctx.createLinearGradient(rightForkX, forkY, birdPos.x, birdPos.y);
    rightGradient.addColorStop(0, '#FFD700'); // Yellow/gold
    rightGradient.addColorStop(0.5, '#FFC125'); // Darker in the middle
    rightGradient.addColorStop(1, '#FFD700'); // Yellow/gold
    
    this.ctx.strokeStyle = rightGradient;
    this.ctx.stroke();
    
    // Add slight 3D effect with a thinner highlight
    this.ctx.beginPath();
    this.ctx.moveTo(leftForkX, forkY);
    this.ctx.quadraticCurveTo(controlX, controlY, birdPos.x, birdPos.y);
    this.ctx.lineWidth = 0.1;
    this.ctx.strokeStyle = '#FFEC8B'; // Lighter yellow for highlight
    this.ctx.stroke();
    
    this.ctx.beginPath();
    this.ctx.moveTo(rightForkX, forkY);
    this.ctx.quadraticCurveTo(controlX2, controlY2, birdPos.x, birdPos.y);
    this.ctx.strokeStyle = '#FFEC8B'; // Lighter yellow for highlight
    this.ctx.stroke();
    
    this.ctx.restore();
  }
  
  // Main draw method called from game loop - does NOT use Box2D debug drawing
  Draw(worldId, gameState = {}) {
    try {
      const canvas = this.ctx.canvas;
      
      // Clear the canvas completely
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Fill with background color
      this.ctx.fillStyle = this.colors.background;
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Display registered game objects on first render for debugging
      if (!this.hasLoggedEntityMapping) {
        this.hasLoggedEntityMapping = true;
      }
      
      // Render all game objects directly
      this.renderGameObjects(gameState);
      
      // Draw UI elements on top
      this.drawUI(gameState);
    } catch (error) {
      console.error("Error in Draw function:", error);
    }
  }
}