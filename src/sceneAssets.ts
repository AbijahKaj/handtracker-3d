import * as THREE from 'three';

export interface AssetConfig {
  gridSize?: number;
  spacing?: number;
  baseSize?: number;
  sphereProbability?: number;
  randomSpheresCount?: number;
  enableRandomRotation?: boolean;
}

export interface GeneratedAssets {
  cubes: THREE.Mesh[];
  spheres: THREE.Mesh[];
  cones: THREE.Mesh[];
  rotatingAssets: THREE.Mesh[];
  group: THREE.Group;
}

// Helper function to calculate size based on distance from center
function getSizeFromCenter(x: number, y: number, gridSize: number, baseSize: number): number {
  const centerX = (gridSize - 1) / 2;
  const centerY = (gridSize - 1) / 2;
  const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
  const maxDist = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
  // Middle items are larger (1.5x), edges are smaller (0.7x)
  const sizeMultiplier = 1.5 - (distFromCenter / maxDist) * 0.8;
  // Add some randomness
  const randomVariation = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  return baseSize * sizeMultiplier * randomVariation;
}

// Create a cube
function createCube(
  size: number,
  position: THREE.Vector3,
  color: number,
  material: THREE.MeshStandardMaterial,
  enableRotation: boolean
): { mesh: THREE.Mesh; shouldRotate: boolean } {
  const cubeGeometry = new THREE.BoxGeometry(size, size, size);
  const cube = new THREE.Mesh(cubeGeometry, material.clone());
  cube.material.color.setHex(color);

  // Add slight random rotation
  cube.rotation.set(
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2
  );

  cube.position.copy(position);

  const shouldRotate = enableRotation && Math.random() < 0.3; // 30% chance to rotate

  return { mesh: cube, shouldRotate };
}

// Create a sphere
function createSphere(
  size: number,
  position: THREE.Vector3,
  material: THREE.MeshStandardMaterial,
  enableRotation: boolean
): { mesh: THREE.Mesh; shouldRotate: boolean } {
  const sphereGeometry = new THREE.SphereGeometry(size, 32, 32);
  const sphere = new THREE.Mesh(sphereGeometry, material.clone());

  // Vary colors for spheres
  const hue = Math.random() * 0.3 + 0.5; // 0.5 to 0.8 (blue to cyan range)
  sphere.material.color.setHSL(hue, 0.7, 0.6);

  sphere.position.copy(position);

  const shouldRotate = enableRotation && Math.random() < 0.4; // 40% chance to rotate

  return { mesh: sphere, shouldRotate };
}

// Create a cone
function createCone(
  size: number,
  position: THREE.Vector3,
  material: THREE.MeshStandardMaterial,
  enableRotation: boolean
): { mesh: THREE.Mesh; shouldRotate: boolean } {
  const coneGeometry = new THREE.ConeGeometry(size, size * 1.5, 32);
  const cone = new THREE.Mesh(coneGeometry, material.clone());

  // Vary colors for cones
  const hue = Math.random() * 0.2 + 0.1; // 0.1 to 0.3 (red to orange range)
  cone.material.color.setHSL(hue, 0.8, 0.6);

  // Add slight random rotation
  cone.rotation.set(
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2
  );

  cone.position.copy(position);

  const shouldRotate = enableRotation && Math.random() < 0.5; // 50% chance to rotate

  return { mesh: cone, shouldRotate };
}

export function generateSceneAssets(
  scene: THREE.Scene,
  cubeMaterial: THREE.MeshStandardMaterial,
  sphereMaterial: THREE.MeshStandardMaterial,
  config: AssetConfig = {}
): GeneratedAssets {
  const {
    gridSize = 5,
    spacing = 0.5,
    baseSize = 0.15,
    sphereProbability = 0.3,
    randomSpheresCount = 15,
    enableRandomRotation = true,
  } = config;

  // Create a group to hold all objects
  const group = new THREE.Group();
  scene.add(group);

  const cubes: THREE.Mesh[] = [];
  const spheres: THREE.Mesh[] = [];
  const cones: THREE.Mesh[] = [];
  const rotatingAssets: THREE.Mesh[] = [];

  // Create first layer with cubes, spheres, and cones
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const offsetX = (x - (gridSize - 1) / 2) * spacing;
      const offsetY = (y - (gridSize - 1) / 2) * spacing;
      const isCenter = x === Math.floor(gridSize / 2) && y === Math.floor(gridSize / 2);
      const rand = Math.random();

      const size = getSizeFromCenter(x, y, gridSize, baseSize);
      const position = new THREE.Vector3(
        offsetX + (Math.random() - 0.5) * 0.1,
        offsetY + (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      );

      let asset: { mesh: THREE.Mesh; shouldRotate: boolean };

      // Decide asset type: 30% sphere, 10% cone, 60% cube (or always sphere in center)
      if (isCenter || rand < sphereProbability) {
        asset = createSphere(size, position, sphereMaterial, enableRandomRotation);
        spheres.push(asset.mesh);
      } else if (rand < sphereProbability + 0.1) {
        // 10% chance for cone
        asset = createCone(size, position, cubeMaterial, enableRandomRotation);
        cones.push(asset.mesh);
      } else {
        // Cube
        const color = (x + y) % 2 === 0 ? 0xf59e0b : 0x3b82f6; // Orange or Blue
        asset = createCube(size, position, color, cubeMaterial, enableRandomRotation);
        cubes.push(asset.mesh);
      }

      if (asset.shouldRotate) {
        rotatingAssets.push(asset.mesh);
      }

      group.add(asset.mesh);
    }
  }

  // Add a second layer behind for depth (mirror effect)
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const offsetX = (x - (gridSize - 1) / 2) * spacing;
      const offsetY = (y - (gridSize - 1) / 2) * spacing;
      const isCenter = x === Math.floor(gridSize / 2) && y === Math.floor(gridSize / 2);
      const rand = Math.random();

      const size = getSizeFromCenter(x, y, gridSize, baseSize);
      const position = new THREE.Vector3(
        offsetX + (Math.random() - 0.5) * 0.1,
        offsetY + (Math.random() - 0.5) * 0.1,
        -spacing * 2 + (Math.random() - 0.5) * 0.2
      );

      let asset: { mesh: THREE.Mesh; shouldRotate: boolean };

      if (isCenter || rand < sphereProbability) {
        asset = createSphere(size, position, sphereMaterial, enableRandomRotation);
        spheres.push(asset.mesh);
      } else if (rand < sphereProbability + 0.1) {
        asset = createCone(size, position, cubeMaterial, enableRandomRotation);
        cones.push(asset.mesh);
      } else {
        const color = (x + y) % 2 === 0 ? 0x3b82f6 : 0xf59e0b; // Inverted colors
        asset = createCube(size, position, color, cubeMaterial, enableRandomRotation);
        cubes.push(asset.mesh);
      }

      if (asset.shouldRotate) {
        rotatingAssets.push(asset.mesh);
      }

      group.add(asset.mesh);
    }
  }

  // Add some additional random spheres, cubes, and cones scattered around
  for (let i = 0; i < randomSpheresCount; i++) {
    const size = 0.08 + Math.random() * 0.12; // Random size
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 2
    );

    const rand = Math.random();
    let asset: { mesh: THREE.Mesh; shouldRotate: boolean };

    if (rand < 0.5) {
      // Sphere
      asset = createSphere(size, position, sphereMaterial, enableRandomRotation);
      spheres.push(asset.mesh);
    } else if (rand < 0.7) {
      // Cone
      asset = createCone(size, position, cubeMaterial, enableRandomRotation);
      cones.push(asset.mesh);
    } else {
      // Cube
      const color = Math.random() < 0.5 ? 0xf59e0b : 0x3b82f6;
      asset = createCube(size, position, color, cubeMaterial, enableRandomRotation);
      cubes.push(asset.mesh);
    }

    if (asset.shouldRotate) {
      rotatingAssets.push(asset.mesh);
    }

    group.add(asset.mesh);
  }

  return {
    cubes,
    spheres,
    cones,
    rotatingAssets,
    group,
  };
}
