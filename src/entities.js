/**
 * Entities module - Handles creation and management of game entities
 */
import { getIdFromBody, generateUniqueId } from './utils.js';

export class EntityManager {
  constructor(physics, worldId, renderer, worldDimensions) {
    this.physics = physics;
    this.worldId = worldId;
    this.renderer = renderer;
    this.worldDimensions = worldDimensions;
    
    // Entity tracking
    this.entities = {}; // Maps entityId -> { type, bodyId, properties }
    this.bodyToEntity = new Map(); // Maps bodyId -> entityId for fast lookups
    this.nextEntityId = 1; // For generating unique entity IDs
    
    // Tracked bodies for game mechanics
    this.trackedBodies = {
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
  }
  
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
  }
  
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
  }
  
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
    
    return null;
  }
  
  // Get entity by its entity ID
  getEntity(entityId) {
    return this.entities[entityId] || null;
  }
  
  // Get the Box2D body from uniqueId
  getBodyByUniqueId(uniqueId) {
    if (!uniqueId) return null;
    
    // Look up entity by uniqueId
    const entity = this.findEntityByUniqueId(uniqueId);
    if (entity && entity.bodyId) {
      return entity.bodyId;
    }
    
    // Try to find in tracked bodies
    const findInTracked = (map, mapName) => {
      const info = map.get(uniqueId);
      if (info && info.active) {
        const entity = this.entities[info.entityId];
        if (entity && entity.bodyId) {
          return entity.bodyId;
        }
      }
      return null;
    };
    
    // Try to find in birds, pigs, and blocks
    return findInTracked(this.trackedBodies.birds, 'birds') || 
           findInTracked(this.trackedBodies.pigs, 'pigs') || 
           findInTracked(this.trackedBodies.blocks, 'blocks');
  }
  
  // Remove entity
  removeEntity(entityId) {
    if (this.entities[entityId]) {
      delete this.entities[entityId];
      return true;
    }
    return false;
  }
  
  // Track a body with its entity ID
  trackBody(bodyId, type, entityId) {
    // Get the entity info
    const entity = this.getEntity(entityId);
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
    
    // Create tracking info
    const trackInfo = {
      entityId,
      uniqueId,
      active: true
    };
    
    // Add to the appropriate collection using ONLY the unique ID
    if (type === 'bird') {
      this.trackedBodies.birds.set(uniqueId, trackInfo);
    } else if (type === 'pig') {
      this.trackedBodies.pigs.set(uniqueId, trackInfo);
    } else { // blocks or wood - all go in blocks collection
      this.trackedBodies.blocks.set(uniqueId, trackInfo);
    }
  }
  
  // Create ground
  createGround() {
    const { 
      b2DefaultBodyDef, b2BodyType, b2CreateBody, 
      b2DefaultShapeDef, b2Segment, b2Vec2, b2CreateSegmentShape 
    } = this.physics;
    const worldLeft = this.worldDimensions.left;
    const worldRight = this.worldDimensions.right;
    const worldBottom = this.worldDimensions.bottom;
    const physicsWidth = this.worldDimensions.width;
    
    const bd_ground = new b2DefaultBodyDef();
    // Static bodies for ground
    bd_ground.type = b2BodyType.b2_staticBody;
    
    const groundId = b2CreateBody(this.worldId, bd_ground);
    
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
    const entityId = this.createEntity('ground', groundId, properties);
    
    // Get the entity to access the uniqueId
    const entity = this.getEntity(entityId);
    
    // Register with renderer with correct position information
    this.renderer.registerGameObject(groundId, 'ground', {
      ...properties,
      uniqueId: entity.uniqueId,
      x: groundX,
      y: groundY
    });
    
    return groundId;
  }
  
  // Create a wood block
  createWoodBlock(x, y, width, height, angle = 0) {
    const { 
      b2DefaultBodyDef, b2BodyType, b2Vec2, b2CreateBody, 
      b2DefaultShapeDef, b2MakeBox, b2CreatePolygonShape 
    } = this.physics;
    
    const bd = new b2DefaultBodyDef();
    bd.type = b2BodyType.b2_dynamicBody;
    bd.position = new b2Vec2(x, y);
    bd.angle = angle;
    
    const bodyId = b2CreateBody(this.worldId, bd);
    
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
    const entityId = this.createEntity('wood', bodyId, properties);
    
    // Get the entity to access the uniqueId
    const entity = this.getEntity(entityId);
    
    // Register with renderer using ONLY userData.id and including position
    this.renderer.registerGameObject(bodyId, 'wood', {
      ...properties,
      uniqueId: entity.uniqueId,
      x, y, angle
    });
    
    this.trackBody(bodyId, 'wood', entityId);
    
    return bodyId;
  }
  
  // Create a pig
  createPig(x, y, radius = 1.0) {
    const { 
      b2DefaultBodyDef, b2BodyType, b2Vec2, b2CreateBody, 
      b2DefaultShapeDef, b2MakeCircle, b2CreateCircleShape,
      b2MakeBox, b2CreatePolygonShape
    } = this.physics;
    
    const bd = new b2DefaultBodyDef();
    bd.type = b2BodyType.b2_dynamicBody;
    bd.position = new b2Vec2(x, y);
    
    const bodyId = b2CreateBody(this.worldId, bd);
    
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
    const entityId = this.createEntity('pig', bodyId, properties);
    
    // Get the entity to access the uniqueId
    const entity = this.getEntity(entityId);
    
    // Register with renderer using ONLY userData.id
    this.renderer.registerGameObject(bodyId, 'pig', {
      ...properties,
      uniqueId: entity.uniqueId,
      x, y
    });
    
    this.trackBody(bodyId, 'pig', entityId);
    
    return bodyId;
  }
  
  // Create a bird
  createBird(x, y, radius = 0.5) {
    const { 
      b2DefaultBodyDef, b2BodyType, b2Vec2, b2CreateBody, 
      b2Body_SetBullet, b2DefaultShapeDef, b2MakeCircle, 
      b2CreateCircleShape, b2MakeBox, b2CreatePolygonShape
    } = this.physics;
    
    const bd = new b2DefaultBodyDef();
    bd.type = b2BodyType.b2_dynamicBody;
    bd.position = new b2Vec2(x, y);
    bd.bullet = true; // Enable continuous collision detection for fast-moving objects
    bd.fixedRotation = false; // Allow rotation for more realistic physics
    
    // Create the Box2D body
    const bodyId = b2CreateBody(this.worldId, bd);
    
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
      
      // Add a box shape as well for better collision
      const boxSize = radius * 0.7;  // Slightly smaller than the radius
      const box = b2MakeBox(boxSize, boxSize);
      b2CreatePolygonShape(bodyId, shapeDef, box);
    } catch (e) {
      console.error("Error creating shapes for bird:", e);
      // Fallback to a simple box
      const shape = b2MakeBox(radius, radius);
      b2CreatePolygonShape(bodyId, shapeDef, shape);
    }
    
    // Create an entity for this bird
    const properties = { radius, x, y, angle: 0 };
    const entityId = this.createEntity('bird', bodyId, properties);
    
    // Get the entity to access the uniqueId
    const entity = this.getEntity(entityId);
    
    // Register with renderer using ONLY userData.id
    this.renderer.registerGameObject(bodyId, 'bird', {
      ...properties,
      uniqueId: entity.uniqueId,
      x, y
    });
    
    this.trackBody(bodyId, 'bird', entityId);
    
    return bodyId;
  }
}