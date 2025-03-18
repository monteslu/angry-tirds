/**
 * Physics module - Handles Box2D physics functionality
 */

// Helper function to extract Box2D functions from the module
export function setupPhysics(box2d) {
  // Extract needed Box2D functions
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
    b2Body_GetRotation,
    b2Body_GetLinearVelocity,
    b2Body_ApplyLinearImpulse,
    b2Body_SetTransform,
    b2Body_GetType,
    b2Body_GetNext,
    b2DestroyBody,
    b2Body_GetUserData,
    b2Body_SetUserData,
    b2MakeCircle,
    b2Body_SetBullet,
    b2World_SetContinuousPhysics,
    b2Body_GetTransform
  } = box2d;

  // Setup world
  const setupWorld = () => {
    const worldDef = b2DefaultWorldDef();
    worldDef.gravity.Set(0, -10); // Earth-like gravity
    
    // Set global physics settings for better collision detection
    if (worldDef.velocityIterations !== undefined) {
      worldDef.velocityIterations = 10; // Increase from default 6 for better stability
    }
    if (worldDef.positionIterations !== undefined) {
      worldDef.positionIterations = 8; // Increase from default 3 for better stability
    }
    
    // Enable multi-threading if available
    let worldId, taskSystem;
    if (navigator.hardwareConcurrency > 1) {
      taskSystem = new TaskSystem(navigator.hardwareConcurrency);
      worldId = b2CreateThreadedWorld(worldDef, taskSystem);
    } else {
      worldId = b2CreateWorld(worldDef);
    }
    
    // Enable continuous physics for the world if function is available
    const enableContinuousPhysics = typeof b2World_SetContinuousPhysics === 'function';
    if (enableContinuousPhysics) {
      try {
        b2World_SetContinuousPhysics(worldId, true);
        console.log("Enabled continuous physics for the world");
      } catch (e) {
        console.error("Failed to enable continuous physics:", e);
      }
    }
    
    return { worldId, taskSystem };
  };

  // Step the physics simulation
  const stepWorld = (worldId, deltaTime, subSteps = 4) => {
    const timeStep = Math.min(deltaTime, 0.016); // Cap at 60fps time step
    
    for (let i = 0; i < subSteps; i++) {
      b2World_Step(worldId, timeStep / subSteps, 10);
    }
  };

  // Return all functions and objects needed for physics
  return {
    setupWorld,
    stepWorld,
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
    b2Body_GetRotation,
    b2Body_GetLinearVelocity,
    b2Body_ApplyLinearImpulse,
    b2Body_SetTransform,
    b2Body_GetType,
    b2Body_GetNext,
    b2DestroyBody,
    b2Body_GetUserData,
    b2Body_SetUserData,
    b2MakeCircle,
    b2Body_SetBullet,
    b2World_SetContinuousPhysics,
    b2Body_GetTransform
  };
}