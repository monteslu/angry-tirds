/** 

Simple utils for loading assets
and getting input from a gamepad or keyboard

Copyright 2025 Luis Montes. Licensed under the MIT License.

**/

const window = globalThis;

let audioContext;

export async function loadSound(url) {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const soundBuffer = await fetch(url).then((res) => res.arrayBuffer());

  const audioBuffer = await audioContext.decodeAudioData(soundBuffer);
  return audioBuffer;
}

export function playSound(audioBuffer, loop = false) {
  if (!audioBuffer) {
    return;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = audioBuffer;

  bufferSource.connect(audioContext.destination);
  if (loop) {
    bufferSource.loop = true;
  }
  bufferSource.start();
  bufferSource.onended = () => {
    bufferSource.disconnect();
  };
  return bufferSource;
}

// loads image from a url as a promise
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export function createResourceLoader() {
  return {
    imgCount: 0,
    soundCount: 0,
    imgLoadedCount: 0,
    soundLoadedCount: 0,
    images: {},
    sounds: {},
    imagePromises: [],
    soundPromises: [],
    addImage(name, src) {
      this.imgCount++;
      const promise = loadImage(src).then((img) => {
        this.images[name] = img;
        this.imgLoadedCount++;
        return img;
      });
      this.imagePromises.push(promise);
      return promise;
    },
    addSound(name, src) {
      this.soundCount++;
      const promise = loadSound(src).then((sound) => {
        this.sounds[name] = sound;
        this.soundLoadedCount++;
        return sound;
      });
      this.soundPromises.push(promise);
      return promise;
    },
    getPercentComplete() {
      return (this.imgLoadedCount + this.soundLoadedCount) / (this.imgCount + this.soundCount);
    },
    isComplete() {
      return this.imgLoadedCount === this.imgCount && this.soundLoadedCount === this.soundCount;
    },
    load() {
      return Promise.all([...this.imagePromises, ...this.soundPromises]);
    },
    reset() {
      this.imgLoadedCount = 0;
      this.soundLoadedCount = 0;
      this.images = {};
      this.sounds = {};
      this.imagePromises = [];
      this.soundPromises = [];
    },
  };
}

export function drawLoadingScreen(ctx, percentComplete, backgroundColor = 'black', foregroundColor = 'white') {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const fontSize = height * 0.1;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = foregroundColor;
  ctx.font = `${fontSize}px monospace`;
  // draw loading text in center of screen
  ctx.fillText('Loading...', width / 2 - ctx.measureText('Loading...').width / 2, height / 2);
  const loadingBarWidth = width * 0.8;
  const loadingBarCompletedWidth = loadingBarWidth * percentComplete;
  const loadingBarHeight = height * 0.1;
  ctx.fillStyle = foregroundColor;
  ctx.strokeStyle = foregroundColor;
  ctx.lineWidth = height * 0.01;
  ctx.fillRect(width / 2 - loadingBarWidth / 2, height / 2 - loadingBarHeight / 2 + fontSize, loadingBarCompletedWidth, loadingBarHeight);
  ctx.strokeRect(width / 2 - loadingBarWidth / 2, height / 2 - loadingBarHeight / 2 + fontSize, loadingBarWidth, loadingBarHeight);
}

function getDefaultBtn() {
  return {
    pressed: false,
    value: 0,
  };
}

// allows games to override the default key mapping
export const KEYMAP = {
  'DPAD_UP': 'ArrowUp',
  'DPAD_DOWN': 'ArrowDown',
  'DPAD_LEFT': 'ArrowLeft',
  'DPAD_RIGHT': 'ArrowRight',
  'BUTTON_SOUTH': 'z',
  'BUTTON_EAST': 'x',
  'BUTTON_WEST': 'a',
  'BUTTON_NORTH': 's',
  'LEFT_SHOULDER': 'q',
  'RIGHT_SHOULDER': 'r',
  'LEFT_TRIGGER': 'w',
  'RIGHT_TRIGGER': 'e',
  'SELECT': 'Shift',
  'START': 'Enter',
  'GUIDE': 'Escape',
  'LEFT_STICK': 'c',
  'RIGHT_STICK': 'v',
};

const keys = {};
window.addEventListener('keydown', (e) => {
  console.log('keydown', e.key);
  keys[e.key] = keys[e.key] || getDefaultBtn();
  keys[e.key].pressed = true;
  keys[e.key].value = 1;
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = keys[e.key] || getDefaultBtn();
  keys[e.key].pressed = false;
  keys[e.key].value = 0;
});

// normalizes input from a gamepad or keyboard
// if there's a gamepad, player 1 is the gamead and player 2 is the keyboard
// if there's no gamepad, player 1 is the keyboard
export function getInput() {
  let gamepads = navigator.getGamepads();
  gamepads = gamepads.filter((gp) => gp && (gp.mapping === 'standard' || gp.mapping === 'xbox'));
  const players = [];
  gamepads.forEach((gp) => {
    if (gp) {
      const player = {
        type: 'gp',
        name: gp.id,
        DPAD_UP: gp.buttons[12],
        DPAD_DOWN: gp.buttons[13],
        DPAD_LEFT: gp.buttons[14],
        DPAD_RIGHT: gp.buttons[15],
        BUTTON_SOUTH: gp.buttons[0], // A on xbox, B on nintendo
        BUTTON_EAST: gp.buttons[1], // B on xbox, A on nintendo
        BUTTON_WEST: gp.buttons[2], // X on xbox, Y on nintendo
        BUTTON_NORTH: gp.buttons[3], // Y on xbox, X on nintendo
        LEFT_SHOULDER: gp.buttons[4] || getDefaultBtn(),
        RIGHT_SHOULDER: gp.buttons[5] || getDefaultBtn(),
        LEFT_TRIGGER: gp.buttons[6] || getDefaultBtn(),
        RIGHT_TRIGGER: gp.buttons[7] || getDefaultBtn(),
        SELECT: gp.buttons[8] || getDefaultBtn(),
        START: gp.buttons[9] || getDefaultBtn(),
        GUIDE: gp.buttons[16] || getDefaultBtn(),
        LEFT_STICK: gp.buttons[10] || getDefaultBtn(),
        RIGHT_STICK: gp.buttons[11] || getDefaultBtn(),
        LEFT_STICK_X: gp.axes[0] || 0,
        LEFT_STICK_Y: gp.axes[1] || 0,
        RIGHT_STICK_X: gp.axes[2] || 0,
        RIGHT_STICK_Y: gp.axes[3] || 0,
      };
      players.push(player);
    }
  });
  players.push({
    type: 'keyboard',
    name: 'keyboard',
    DPAD_UP: keys[KEYMAP.DPAD_UP] || getDefaultBtn(),
    DPAD_DOWN: keys[KEYMAP.DPAD_DOWN] || getDefaultBtn(),
    DPAD_LEFT: keys[KEYMAP.DPAD_LEFT] || getDefaultBtn(),
    DPAD_RIGHT: keys[KEYMAP.DPAD_RIGHT] || getDefaultBtn(),
    BUTTON_SOUTH: keys[KEYMAP.BUTTON_SOUTH] || getDefaultBtn(),
    BUTTON_EAST: keys[KEYMAP.BUTTON_EAST] || getDefaultBtn(),
    BUTTON_WEST: keys[KEYMAP.BUTTON_WEST] || getDefaultBtn(),
    BUTTON_NORTH: keys[KEYMAP.BUTTON_NORTH] || getDefaultBtn(),
    LEFT_SHOULDER: keys[KEYMAP.LEFT_SHOULDER] || getDefaultBtn(),
    RIGHT_SHOULDER: keys[KEYMAP.RIGHT_SHOULDER] || getDefaultBtn(),
    LEFT_TRIGGER: keys[KEYMAP.LEFT_TRIGGER] || getDefaultBtn(),
    RIGHT_TRIGGER: keys[KEYMAP.RIGHT_TRIGGER] || getDefaultBtn(),
    SELECT: keys[KEYMAP.SELECT] || getDefaultBtn(),
    START: keys[KEYMAP.START] || getDefaultBtn(),
    GUIDE: keys[KEYMAP.GUIDE] || getDefaultBtn(),
    LEFT_STICK: keys[KEYMAP.LEFT_STICK] || getDefaultBtn(),
    RIGHT_STICK: keys[KEYMAP.RIGHT_STICK] || getDefaultBtn(),
    LEFT_STICK_X: 0,
    LEFT_STICK_Y: 0,
    RIGHT_STICK_X: 0,
    RIGHT_STICK_Y: 0,
  });
  return players;
}

/**
 * Generates a unique string ID for Box2D bodies
 * @returns {string} Unique string ID
 */
export function generateUniqueId() {
  return Math.random() + '_' + Math.random();
}

/**
 * Extracts a consistent ID from a Box2D body object
 * Works for bodies coming from WebAssembly
 * @param {Object|number|string} body - Body object or ID
 * @returns {string|number} Extracted ID
 */
export function getIdFromBody(body) {
  // Simple direct access to userData.id
  if (body && typeof body === 'object' && body.userData && body.userData.id) {
    return body.userData.id;
  }
  
  // Otherwise return null - we don't want to auto-generate IDs
  return null;
}

// Add a debug helper to test and log the ID extraction
export function testIdExtraction(body) {
  const bodyId = getIdFromBody(body);
  console.log('Body Object:', body);
  console.log('Extracted ID:', bodyId);
  console.log('Type of ID:', typeof bodyId);
  return bodyId;
}

/**
 * Debug utility to dump physics body information
 * @param {Object} box2d - Box2D module 
 * @param {number} bodyId - Body ID to inspect
 * @returns {Object|null} Body data or null if an error occurred
 */
export function debugPhysicsBody(box2d, bodyId) {
  if (!bodyId) return null;
  
  try {
    // Only use functions we know exist
    const { b2Body_GetPosition, b2Body_GetLinearVelocity } = box2d;
    
    // Get position if available
    let position = { x: 0, y: 0 };
    try {
      if (b2Body_GetPosition) {
        const pos = b2Body_GetPosition(bodyId);
        position = { x: pos.x, y: pos.y };
      } else if (bodyId.GetPosition) {
        const pos = bodyId.GetPosition();
        position = { x: pos.x, y: pos.y };
      }
    } catch (e) {
      console.warn("Could not get position:", e);
    }
    
    // Get velocity if available
    let velocity = { x: 0, y: 0 };
    let speed = 0;
    try {
      if (b2Body_GetLinearVelocity) {
        const vel = b2Body_GetLinearVelocity(bodyId);
        velocity = { x: vel.x, y: vel.y };
        speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      } else if (bodyId.GetLinearVelocity) {
        const vel = bodyId.GetLinearVelocity();
        velocity = { x: vel.x, y: vel.y };
        speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      }
    } catch (e) {
      console.warn("Could not get velocity:", e);
    }
    
    // Get userData if available
    let userData = null;
    try {
      userData = bodyId.userData || null;
    } catch (e) {
      console.warn("Could not get userData:", e);
    }
    
    return {
      bodyId,
      position,
      velocity,
      speed,
      userData
    };
  } catch (e) {
    console.error("Failed to debug body:", e);
    return null;
  }
}
