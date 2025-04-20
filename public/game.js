// TronGame class - Multiplayer implementation
class TronGame {
    constructor(canvasId, isFirstPlayer, sendDataCallback) {
      // Configuration
      this.ARENA = 600;
      this.MAX = 50;
      this.ACC = 20;
      this.TURN = Math.PI;
      this.TRAIL_MAX = 1400;
      this.HIT_SQ = 9;
      
      // Canvas and game state
      this.canvasId = canvasId;
      this.isFirstPlayer = isFirstPlayer;
      this.sendData = sendDataCallback;
      this.lastSentTime = 0;
      this.updateInterval = 50; // ms between position updates
      this.keys = {};
      this.gameOver = false;
    }
    
    start() {
      // Get canvas and initialize engine
      const canvas = document.getElementById(this.canvasId);
      this.engine = new BABYLON.Engine(canvas, true);
      this.scene = new BABYLON.Scene(this.engine);
      this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
      
      // Set up lighting
      new BABYLON.HemisphericLight('L', new BABYLON.Vector3(0, 1, 0), this.scene);
      
      // Create grid material for ground
      const grid = new BABYLON.GridMaterial('grid', this.scene);
      grid.gridRatio = 10;
      grid.opacity = 0.35;
      
      // Create ground
      BABYLON.MeshBuilder.CreateGround('G', {
        width: this.ARENA,
        height: this.ARENA
      }, this.scene).material = grid;
      
      // Create bikes with appropriate colors
      this.playerColor = this.isFirstPlayer ? BABYLON.Color3.Teal() : BABYLON.Color3.Yellow();
      this.opponentColor = this.isFirstPlayer ? BABYLON.Color3.Yellow() : BABYLON.Color3.Teal();
      
      this.player = this.makeBike(this.playerColor);
      this.opponent = this.makeBike(this.opponentColor);
      
      // Position bikes at opposite corners
      if (this.isFirstPlayer) {
        this.player.node.position.x = -this.ARENA / 4;
        this.opponent.node.position.x = this.ARENA / 4;
        this.opponent.angle = Math.PI;
      } else {
        this.player.node.position.x = this.ARENA / 4;
        this.opponent.node.position.x = -this.ARENA / 4;
        this.player.angle = Math.PI;
      }
      
      // Set up camera
      this.setupCamera();
      
      // Setup input
      window.addEventListener('keydown', e => this.keys[e.code] = true);
      window.addEventListener('keyup', e => this.keys[e.code] = false);
      
      // Start game loop
      this.engine.runRenderLoop(() => this.update());
      window.addEventListener('resize', () => this.engine.resize());
    }
    
    makeBike(col) {
      // Bike factory that creates a light cycle with given color
      const root = new BABYLON.TransformNode('bike', this.scene);
      
      // Wheel material
      const wheelMat = new BABYLON.StandardMaterial('wm', this.scene);
      wheelMat.emissiveColor = col;
      wheelMat.diffuseColor = BABYLON.Color3.Black();
      
      // Create wheels
      const wheel = () => BABYLON.MeshBuilder.CreateTorus('w', {
        diameter: 4,
        thickness: 0.6,
        tessellation: 32
      }, this.scene);
      
      const front = wheel();
      const back = wheel();
      
      [front, back].forEach(w => {
        w.material = wheelMat;
        w.rotation.z = Math.PI / 2; // wheels upright
        w.parent = root;
      });
      
      front.position.z = 2;
      back.position.z = -2;
      
      // Create body
      const body = BABYLON.MeshBuilder.CreateBox('body', {
        width: 1.2,
        height: 1.2,
        depth: 4
      }, this.scene);
      
      body.material = wheelMat.clone('bm');
      body.parent = root;
      
      // Create trail material
      const trailMat = new BABYLON.StandardMaterial('tm', this.scene);
      trailMat.emissiveColor = col.scale(0.6);
      trailMat.alpha = 0.45;
      
      return {
        node: root,
        angle: 0,
        speed: this.MAX * 0.2,
        trail: [],
        rib: null,
        trailMat
      };
    }
    
    setupCamera() {
      // Create follow camera that locks on player's bike
      this.camera = new BABYLON.FollowCamera('cam', this.player.node.position.clone(), this.scene);
      this.camera.lockedTarget = this.player.node;
      this.camera.radius = 30; // distance behind
      this.camera.heightOffset = 8; // height
      this.camera.rotationOffset = 180; // directly behind
      this.camera.cameraAcceleration = 0.1;
      this.camera.maxCameraSpeed = 100;
    }
    
    update() {
      if (this.gameOver) return;
      
      const dt = this.engine.getDeltaTime() / 1000;
      
      // Player controls
      const turn = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);
      const accel = this.keys['KeyW'] ? this.ACC : this.keys['KeyS'] ? -this.ACC : 0;
      
      // Update player angle and speed
      this.player.angle += turn * this.TURN * dt;
      this.player.speed = BABYLON.Scalar.Clamp(this.player.speed + accel * dt, 0, this.MAX);
      
      // Update player position
      this.player.node.rotation.y = -this.player.angle + Math.PI / 2;
      this.player.node.position.addInPlace(this.direction(this.player.angle).scale(this.player.speed * dt));
      
      // Handle collisions with arena boundaries
      if (this.checkBoundaryCollision(this.player)) {
        this.player.angle += Math.PI; // Reverse direction if hitting wall
      }
      
      // Update trails
      this.updateTrail(this.player);
      this.updateTrail(this.opponent);
      
      // Check collisions
      this.checkCollisions();
      
      // Send player position to opponent
      const now = Date.now();
      if (now - this.lastSentTime > this.updateInterval) {
        this.sendData({
          type: 'position',
          x: this.player.node.position.x,
          z: this.player.node.position.z,
          angle: this.player.angle,
          speed: this.player.speed
        });
        this.lastSentTime = now;
      }
      
      this.scene.render();
    }
    
    direction(angle) {
      return new BABYLON.Vector3(Math.cos(angle), 0, Math.sin(angle));
    }
    
    checkBoundaryCollision(bike) {
      const pos = bike.node.position;
      let hit = false;
      
      if (Math.abs(pos.x) > this.ARENA / 2) {
        pos.x = BABYLON.Scalar.Clamp(pos.x, -this.ARENA / 2, this.ARENA / 2);
        hit = true;
      }
      
      if (Math.abs(pos.z) > this.ARENA / 2) {
        pos.z = BABYLON.Scalar.Clamp(pos.z, -this.ARENA / 2, this.ARENA / 2);
        hit = true;
      }
      
      return hit;
    }
    
    updateTrail(bike) {
      // Add current position to trail
      bike.trail.push(bike.node.position.clone());
      if (bike.trail.length > this.TRAIL_MAX) bike.trail.shift();
      
      // Remove existing ribbon mesh if it exists
      bike.rib?.dispose();
      
      // Create new ribbon if there are at least 2 points
      if (bike.trail.length > 1) {
        const segs = bike.trail.map(p => [
          p.add(new BABYLON.Vector3(0, 0.6, 0)),
          p.add(new BABYLON.Vector3(0, -0.6, 0))
        ]);
        
        bike.rib = BABYLON.MeshBuilder.CreateRibbon('r', {
          pathArray: segs,
          sideOrientation: 2
        }, this.scene);
        
        bike.rib.material = bike.trailMat;
      }
    }
    
    checkCollisions() {
      // Only check player collisions on this client
      if (this.hitTrail(this.player, this.opponent.trail)) {
        this.endGame('You crashed into opponent\'s trail!');
      } else if (this.hitTrail(this.player, this.player.trail)) {
        this.endGame('You crashed into your own trail!');
      }
    }
    
    hitTrail(bike, trail) {
      // Check if bike position hits any segment of the trail
      // Skip the last few segments of trail to avoid self-collision at start
      const startIdx = Math.min(20, trail.length - 1);
      
      for (let i = startIdx; i > 0; i--) {
        if (this.segDistSq(bike.node.position, trail[i - 1], trail[i]) < this.HIT_SQ) {
          return true;
        }
      }
      return false;
    }
    
    segDistSq(pt, a, b) {
      // Calculate squared distance from point to line segment
      const ab = b.subtract(a);
      const t = BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(pt.subtract(a), ab) / ab.lengthSquared(), 0, 1);
      return pt.subtract(a.add(ab.scale(t))).lengthSquared();
    }
    
    updateOpponentPosition(x, z, angle, speed) {
      // Update opponent bike position based on received data
      this.opponent.node.position.x = x;
      this.opponent.node.position.z = z;
      this.opponent.angle = angle;
      this.opponent.speed = speed;
      this.opponent.node.rotation.y = -angle + Math.PI / 2;
    }
    
    endGame(message) {
      this.gameOver = true;
      document.getElementById('game-message').textContent = message;
      document.getElementById('game-message').style.display = 'block';
      
      // Stop game loop
      this.engine.stopRenderLoop();
      
      // Return to lobby after delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }