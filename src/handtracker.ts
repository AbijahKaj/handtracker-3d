import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { generateSceneAssets, GeneratedAssets } from './sceneAssets';
import { DynamicAudioEngine, AudioMetrics } from './audioEngine';
import { VideoRecorder } from './videoRecorder';

/*!
 * MIT License
 *
 * Copyright (c) 2026 Abijah Kajabika
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

window.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  const videoElement = document.getElementById('video') as HTMLVideoElement;
  if (!(videoElement instanceof HTMLVideoElement)) {
    throw new Error('Video element not found or wrong type');
  }
  const canvasElement = document.getElementById('canvas') as HTMLCanvasElement;
  const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement;
  const statusElement = document.getElementById('status') as HTMLDivElement;
  const startButton = document.getElementById('startButton') as HTMLButtonElement;
  const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
  const recordButton = document.getElementById('recordButton') as HTMLButtonElement;
  const videoContainer = document.getElementById('videoContainer') as HTMLDivElement;

  if (
    !videoElement ||
    !canvasElement ||
    !threeCanvas ||
    !statusElement ||
    !startButton ||
    !stopButton ||
    !recordButton ||
    !videoContainer
  ) {
    throw new Error('Required DOM elements not found');
  }

  const canvasCtx = canvasElement.getContext('2d');
  if (!canvasCtx) {
    throw new Error('Could not get canvas context');
  }

  // Set canvas size
  canvasElement.width = 640;
  canvasElement.height = 480;

  // Three.js setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);

  // Initialize camera and renderer with mobile-responsive sizing
  const isMobile = window.innerWidth <= 768;
  const initialHeight = isMobile ? window.innerHeight * 0.5 : window.innerHeight;
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / initialHeight, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, initialHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Create materials
  const cubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.8,
    roughness: 0.2,
    envMapIntensity: 1.0,
  });

  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    metalness: 0.9,
    roughness: 0.1,
    envMapIntensity: 1.0,
  });

  // Generate scene assets with random rotation enabled
  const assets: GeneratedAssets = generateSceneAssets(scene, cubeMaterial, sphereMaterial, {
    gridSize: 5,
    spacing: 0.5,
    baseSize: 0.15,
    sphereProbability: 0.3,
    randomSpheresCount: 15,
    enableRandomRotation: true,
  });

  const cubeGroup = assets.group;
  const cubes = assets.cubes;
  const spheres = assets.spheres;
  const cones = assets.cones;
  const rotatingAssets = assets.rotatingAssets;

  // Add improved lighting
  // Increased ambient light for better overall visibility
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  // Main white point light
  const pointLight = new THREE.PointLight(0xffffff, 2.0);
  pointLight.position.set(5, 5, 5);
  scene.add(pointLight);

  // Warm orange point light
  const pointLight2 = new THREE.PointLight(0xf59e0b, 1.5);
  pointLight2.position.set(-5, -5, 5);
  scene.add(pointLight2);

  // Cool blue point light
  const pointLight3 = new THREE.PointLight(0x3b82f6, 1.5);
  pointLight3.position.set(0, 8, 0);
  scene.add(pointLight3);

  // Additional directional light from above
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(0, 10, 5);
  scene.add(directionalLight);

  // Additional point light from below for depth
  const pointLight4 = new THREE.PointLight(0xffffff, 1.0);
  pointLight4.position.set(0, -5, 0);
  scene.add(pointLight4);

  // Track hand positions and controls
  let hand0Position = new THREE.Vector3(0, 0, 0);
  let hand1Position = new THREE.Vector3(0, 0, 0);
  let targetPan = new THREE.Vector3(0, 0, 0);
  let targetRotation = new THREE.Euler(0, 0, 0);
  let targetZoom = 1.0;
  let currentRotation = new THREE.Euler(0, 0, 0);
  let currentZoom = 1.0;
  let autoRotationSpeed = 0.005; // Initial auto-rotation speed
  let isHandControlled = false; // Track if hands are controlling rotation

  // Calibration: store initial hand positions to center the scene
  let hand0Calibration: { x: number; y: number; z: number } | null = null;
  let hand1Calibration: { x: number; y: number; z: number } | null = null;
  let calibrationFrames = 0;
  const CALIBRATION_FRAME_COUNT = 10; // Average over 10 frames for stable calibration

  // Audio engine setup
  const audioEngine = new DynamicAudioEngine();
  let previousRotation = new THREE.Euler(0, 0, 0);
  let previousPan = new THREE.Vector3(0, 0, 0);
  let previousZoom = 1.0;
  let lastUpdateTime = Date.now();

  // Video recorder setup
  let videoRecorder: VideoRecorder | null = null;

  // MediaPipe setup with new tasks-vision API
  let handLandmarker: HandLandmarker | null = null;
  let detectionLoopRunning = false;

  // Initialize HandLandmarker on page load (not when camera starts)
  async function initializeHandLandmarker() {
    try {
      statusElement.textContent = 'Loading MediaPipe model...';
      statusElement.className = 'loading';

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // Start with VIDEO mode directly since that's what we'll be using
      // Try GPU first, fallback to CPU if needed
      try {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'GPU',
          },
          numHands: 2,
          runningMode: 'VIDEO', // Start with VIDEO mode directly
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuError) {
        console.warn('GPU initialization failed, trying CPU:', gpuError);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'CPU',
          },
          numHands: 2,
          runningMode: 'VIDEO', // Start with VIDEO mode directly
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }

      statusElement.textContent = 'Model loaded. Click "Start Hand Tracking" to begin.';
      statusElement.className = '';
      startButton.disabled = false;
    } catch (error) {
      console.error('Error initializing HandLandmarker:', error);
      statusElement.textContent = 'Error loading model. Check console.';
      statusElement.className = 'error';
      startButton.disabled = false;
      startButton.textContent = 'Retry';
    }
  }

  // Initialize model on page load
  initializeHandLandmarker();

  // Helper function to draw circle around a point
  function drawCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x * canvasElement.width, y * canvasElement.height, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Helper function to draw line between two points
  function drawLine(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    lineWidth: number = 2
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1 * canvasElement.width, y1 * canvasElement.height);
    ctx.lineTo(x2 * canvasElement.width, y2 * canvasElement.height);
    ctx.stroke();
  }

  // Helper function to draw text
  function drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string = '#FFFFFF',
    fontSize: number = 14
  ) {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x * canvasElement.width, y * canvasElement.height);
  }

  // Process hand detection results
  function processHandResults(results: any) {
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    // The new API returns results.landmarks directly (array of landmarks arrays)
    // Each landmark is an array of {x, y, z} objects
    const landmarks = results.landmarks || [];
    // MediaPipe also provides handedness: 'Left' or 'Right'
    const handednesses = results.handednesses || [];

    if (landmarks.length > 0) {
      const handCount = landmarks.length;
      statusElement.textContent = `${handCount} hand${handCount > 1 ? 's' : ''} detected`;
      statusElement.className = '';
      isHandControlled = true;

      // Find left and right hands based on handedness
      let leftHandIndex = -1;
      let rightHandIndex = -1;

      for (let i = 0; i < landmarks.length; i++) {
        if (handednesses[i] && handednesses[i].length > 0) {
          const categoryName = handednesses[i][0]?.categoryName || '';
          if (categoryName === 'Left') {
            leftHandIndex = i;
          } else if (categoryName === 'Right') {
            rightHandIndex = i;
          }
        }
      }

      // If handedness not detected, fall back to first hand as left, second as right
      if (leftHandIndex === -1 && rightHandIndex === -1) {
        leftHandIndex = 0;
        if (landmarks.length > 1) {
          rightHandIndex = 1;
        }
      } else if (leftHandIndex === -1) {
        // Only right hand detected, use it for rotation
        leftHandIndex = rightHandIndex;
        rightHandIndex = -1;
      } else if (rightHandIndex === -1) {
        // Only left hand detected, use it for rotation
        rightHandIndex = -1;
      }

      // Left hand controls rotation, right hand controls zoom
      const rotationHandIndex = leftHandIndex >= 0 ? leftHandIndex : 0;
      const zoomHandIndex = rightHandIndex >= 0 ? rightHandIndex : landmarks.length > 1 ? 1 : -1;

      // Process rotation hand (left hand)
      const rotationHand = landmarks[rotationHandIndex];
      const rotationHandWrist = rotationHand[0]; // Wrist landmark
      const rotationHandIndexTip = rotationHand[8]; // Index finger tip
      const rotationHandThumb = rotationHand[4]; // Thumb tip

      // Calibrate initial rotation hand position when hands first appear
      let rotationHandX: number, rotationHandY: number, rotationHandZ: number;

      if (hand0Calibration === null) {
        // Initialize calibration on first frame
        calibrationFrames = 1;
        hand0Calibration = {
          x: rotationHandWrist.x,
          y: rotationHandWrist.y,
          z: rotationHandWrist.z,
        };
        // Still calibrating, keep scene centered
        rotationHandX = 0;
        rotationHandY = 0;
        rotationHandZ = 0;
      } else {
        // Continue calibration if not complete
        if (calibrationFrames < CALIBRATION_FRAME_COUNT) {
          calibrationFrames++;
          // Update calibration average
          hand0Calibration.x =
            (hand0Calibration.x * (calibrationFrames - 1) + rotationHandWrist.x) /
            calibrationFrames;
          hand0Calibration.y =
            (hand0Calibration.y * (calibrationFrames - 1) + rotationHandWrist.y) /
            calibrationFrames;
          hand0Calibration.z =
            (hand0Calibration.z * (calibrationFrames - 1) + rotationHandWrist.z) /
            calibrationFrames;
        }

        // Use relative positioning from calibrated center
        if (calibrationFrames >= CALIBRATION_FRAME_COUNT) {
          rotationHandX = (rotationHandWrist.x - hand0Calibration.x) * 10;
          rotationHandY = (hand0Calibration.y - rotationHandWrist.y) * 10; // Inverted Y for natural movement
          rotationHandZ = (rotationHandWrist.z - hand0Calibration.z) * 5;
        } else {
          // Still calibrating, keep scene centered
          rotationHandX = 0;
          rotationHandY = 0;
          rotationHandZ = 0;
        }
      }

      hand0Position.set(rotationHandX, rotationHandY, rotationHandZ);

      // Calculate pinch distance for rotation hand (controls rotation)
      const rotationHandPinchDistance = Math.sqrt(
        Math.pow(rotationHandThumb.x - rotationHandIndexTip.x, 2) +
          Math.pow(rotationHandThumb.y - rotationHandIndexTip.y, 2) +
          Math.pow(rotationHandThumb.z - rotationHandIndexTip.z, 2)
      );

      // Map pinch distance to rotation (closer pinch = more rotation)
      // Use pinch distance to control rotation speed and direction
      const normalizedPinch = rotationHandPinchDistance * 10; // Scale for better control
      const rotationY = (rotationHandWrist.x - 0.5) * Math.PI * 2; // X position controls Y rotation
      const rotationX = (0.5 - rotationHandWrist.y) * Math.PI; // Y position controls X rotation
      targetRotation.set(rotationX, rotationY, normalizedPinch);

      // Draw thumb and index finger for rotation hand (left hand - green)
      const rotationHandColor = '#00FF00';
      const circleRadius = 15;
      drawCircle(
        canvasCtx,
        rotationHandThumb.x,
        rotationHandThumb.y,
        circleRadius,
        rotationHandColor
      );
      drawCircle(
        canvasCtx,
        rotationHandIndexTip.x,
        rotationHandIndexTip.y,
        circleRadius,
        rotationHandColor
      );
      drawLine(
        canvasCtx,
        rotationHandThumb.x,
        rotationHandThumb.y,
        rotationHandIndexTip.x,
        rotationHandIndexTip.y,
        rotationHandColor,
        3
      );

      // Draw pinch distance value for rotation hand
      const midX0 = (rotationHandThumb.x + rotationHandIndexTip.x) / 2;
      const midY0 = (rotationHandThumb.y + rotationHandIndexTip.y) / 2;
      drawText(
        canvasCtx,
        `L: ${rotationHandPinchDistance.toFixed(3)}`,
        midX0,
        midY0 - 0.03,
        rotationHandColor,
        12
      );

      // Process zoom hand (right hand) if available
      let zoomHandX: number = 0;
      let zoomHandY: number = 0;
      let zoomHandZ: number = 0;

      if (zoomHandIndex >= 0 && zoomHandIndex < landmarks.length) {
        const zoomHand = landmarks[zoomHandIndex];
        const zoomHandWrist = zoomHand[0];
        const zoomHandIndexTip = zoomHand[8];
        const zoomHandThumb = zoomHand[4];

        // Calibrate initial zoom hand position
        if (hand1Calibration === null) {
          // Initialize calibration on first frame (should match rotation hand calibration frame)
          hand1Calibration = { x: zoomHandWrist.x, y: zoomHandWrist.y, z: zoomHandWrist.z };
          // Still calibrating, keep scene centered
          zoomHandX = 0;
          zoomHandY = 0;
          zoomHandZ = 0;
        } else {
          // Continue calibration if not complete
          if (calibrationFrames < CALIBRATION_FRAME_COUNT) {
            // Update calibration average
            hand1Calibration.x =
              (hand1Calibration.x * (calibrationFrames - 1) + zoomHandWrist.x) / calibrationFrames;
            hand1Calibration.y =
              (hand1Calibration.y * (calibrationFrames - 1) + zoomHandWrist.y) / calibrationFrames;
            hand1Calibration.z =
              (hand1Calibration.z * (calibrationFrames - 1) + zoomHandWrist.z) / calibrationFrames;
          }

          // Use relative positioning from calibrated center
          if (calibrationFrames >= CALIBRATION_FRAME_COUNT) {
            zoomHandX = (zoomHandWrist.x - hand1Calibration.x) * 10;
            zoomHandY = (hand1Calibration.y - zoomHandWrist.y) * 10; // Inverted Y for natural movement
            zoomHandZ = (zoomHandWrist.z - hand1Calibration.z) * 5;
          } else {
            // Still calibrating, keep scene centered
            zoomHandX = 0;
            zoomHandY = 0;
            zoomHandZ = 0;
          }
        }

        hand1Position.set(zoomHandX, zoomHandY, zoomHandZ);

        // Calculate pinch distance for zoom hand (controls zoom)
        const zoomHandPinchDistance = Math.sqrt(
          Math.pow(zoomHandThumb.x - zoomHandIndexTip.x, 2) +
            Math.pow(zoomHandThumb.y - zoomHandIndexTip.y, 2) +
            Math.pow(zoomHandThumb.z - zoomHandIndexTip.z, 2)
        );

        // Map pinch distance to zoom - no clamping, uses full pinch range
        // Opening pinch (wider distance) = zoom in, closing pinch (closer distance) = zoom out
        // Direct mapping: wider pinch = higher zoom
        // Using a scaling factor to map pinch distance to zoom without any limits
        const pinchScale = 12.5; // Maps pinch distance to zoom range
        const baseZoom = 0.5; // Starting zoom when pinch is at minimum
        // Direct mapping without any clamping - uses full pinch range
        targetZoom = baseZoom + zoomHandPinchDistance * pinchScale;

        // Draw thumb and index finger for zoom hand (right hand - blue)
        const zoomHandColor = '#00AAFF';
        drawCircle(canvasCtx, zoomHandThumb.x, zoomHandThumb.y, circleRadius, zoomHandColor);
        drawCircle(canvasCtx, zoomHandIndexTip.x, zoomHandIndexTip.y, circleRadius, zoomHandColor);
        drawLine(
          canvasCtx,
          zoomHandThumb.x,
          zoomHandThumb.y,
          zoomHandIndexTip.x,
          zoomHandIndexTip.y,
          zoomHandColor,
          3
        );

        // Draw pinch distance value for zoom hand
        const midX1 = (zoomHandThumb.x + zoomHandIndexTip.x) / 2;
        const midY1 = (zoomHandThumb.y + zoomHandIndexTip.y) / 2;
        drawText(
          canvasCtx,
          `R: ${zoomHandPinchDistance.toFixed(3)}`,
          midX1,
          midY1 - 0.03,
          zoomHandColor,
          12
        );

        // Average both hand positions for pan
        targetPan.lerp(
          new THREE.Vector3(
            (rotationHandX + zoomHandX) / 2,
            (rotationHandY + zoomHandY) / 2,
            (rotationHandZ + zoomHandZ) / 2
          ),
          0.1
        );
      } else {
        // Only one hand - use it for pan
        targetPan.lerp(hand0Position, 0.1);
        // Reset zoom when only one hand
        targetZoom = 1.0;
      }
    } else {
      statusElement.textContent = 'No hand detected';
      statusElement.className = '';
      isHandControlled = false;
      // Reset to center when no hands
      targetPan.set(0, 0, 0);
      targetRotation.set(0, 0, 0);
      targetZoom = 1.0;
      // Reset calibration when hands disappear
      hand0Calibration = null;
      hand1Calibration = null;
      calibrationFrames = 0;
    }

    canvasCtx.restore();
  }

  // Initialize camera
  let isInitialized = false;
  let currentStream: MediaStream | null = null;

  async function initializeCamera() {
    if (isInitialized) return;

    try {
      startButton.disabled = true;
      startButton.textContent = 'Starting...';
      statusElement.textContent = 'Requesting camera access...';
      statusElement.className = 'loading';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: 'user',
        },
      });

      currentStream = stream;
      videoElement.srcObject = stream;

      // Check if model is loaded
      if (!handLandmarker) {
        statusElement.textContent = 'Model not loaded yet. Please wait...';
        statusElement.className = 'loading';
        startButton.disabled = false;
        startButton.textContent = 'Start Hand Tracking';
        return;
      }

      // Set up video stream
      await new Promise((resolve) => {
        videoElement.addEventListener('loadeddata', () => {
          videoElement.play().then(() => {
            resolve(undefined);
          });
        });
      });

      // Set canvas dimensions to match video (like the demo)
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;

      // Mark as initialized before starting detection
      isInitialized = true;

      // Start detection loop (following the demo pattern exactly)
      detectionLoopRunning = true;
      let lastVideoTime = -1;

      function detectHands() {
        if (!handLandmarker || !isInitialized || !detectionLoopRunning) {
          return;
        }

        // Check if video is ready and playing
        if (
          videoElement.readyState >= videoElement.HAVE_CURRENT_DATA &&
          videoElement.videoWidth > 0 &&
          videoElement.videoHeight > 0 &&
          !videoElement.paused &&
          !videoElement.ended
        ) {
          const startTimeMs = performance.now();
          const currentTime = videoElement.currentTime;

          // Only process if video time has changed (new frame) - exactly like the demo
          if (lastVideoTime !== currentTime) {
            lastVideoTime = currentTime;

            try {
              const results = handLandmarker!.detectForVideo(videoElement, startTimeMs);

              if (results) {
                processHandResults(results);
              } else {
                // No results - clear canvas and show no hands
                if (canvasCtx) {
                  canvasCtx.save();
                  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                  canvasCtx.drawImage(
                    videoElement,
                    0,
                    0,
                    canvasElement.width,
                    canvasElement.height
                  );
                  canvasCtx.restore();
                }
                statusElement.textContent = 'No hand detected';
                statusElement.className = '';
                isHandControlled = false;
              }
            } catch (error) {
              console.error('Error detecting hands:', error);
            }
          }
        }

        // Call this function again to keep predicting when the browser is ready (like the demo)
        if (detectionLoopRunning) {
          requestAnimationFrame(detectHands);
        }
      }

      // Start detection loop
      detectHands();

      // Resume audio context (requires user interaction)
      await audioEngine.resume();

      // Initialize video recorder
      videoRecorder = new VideoRecorder(
        {
          threeCanvas,
          videoElement,
          canvasElement,
        },
        (status: string, className: string) => {
          statusElement.textContent = status;
          statusElement.className = className;
        }
      );

      // Set up audio connection for recording
      const audioDestination = videoRecorder.getAudioDestination();
      if (audioDestination) {
        audioEngine.setupRecordingDestination(audioDestination);
      }

      // Hide start button, show stop button, record button and video container
      startButton.classList.add('hidden');
      stopButton.classList.remove('hidden');
      recordButton.classList.remove('hidden');
      videoContainer.classList.add('visible');
      statusElement.textContent = 'Camera ready';
      statusElement.className = '';
    } catch (error) {
      console.error('Error accessing camera:', error);
      statusElement.textContent = 'Camera access denied. Please allow camera access and try again.';
      statusElement.className = 'error';
      startButton.disabled = false;
      startButton.textContent = 'Start Hand Tracking';
    }
  }

  function stopCamera() {
    if (!isInitialized) return;

    // Stop recording if active
    if (videoRecorder && videoRecorder.isCurrentlyRecording()) {
      videoRecorder.stopRecording();
    }

    // Cleanup video recorder
    if (videoRecorder) {
      videoRecorder.cleanup();
      videoRecorder = null;
    }

    // Remove recording destination from audio engine
    audioEngine.removeRecordingDestination();

    // Stop detection loop
    detectionLoopRunning = false;

    // Cleanup hand landmarker
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
    }

    // Stop video stream
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }

    // Clear video element
    videoElement.srcObject = null;

    // Clear canvas
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // Stop audio
    audioEngine.setEnabled(false);

    // Reset state
    isInitialized = false;
    isHandControlled = false;
    targetPan.set(0, 0, 0);
    targetRotation.set(0, 0, 0);
    targetZoom = 1.0;
    currentZoom = 1.0;
    previousPan.set(0, 0, 0);
    previousRotation.set(0, 0, 0);
    previousZoom = 1.0;
    cubeGroup.position.set(0, 0, 0);
    cubeGroup.rotation.set(0, 0, 0);
    cubeGroup.scale.set(1, 1, 1);

    // Hide stop button, record button and video container, show start button
    stopButton.classList.add('hidden');
    recordButton.classList.add('hidden');
    videoContainer.classList.remove('visible');
    startButton.classList.remove('hidden');
    startButton.disabled = false;
    startButton.textContent = 'Start Hand Tracking';

    statusElement.textContent = 'Stopped. Click "Start Hand Tracking" to begin again.';
    statusElement.className = '';
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTime) / 1000; // Convert to seconds
    lastUpdateTime = currentTime;

    // Smoothly interpolate pan position
    cubeGroup.position.lerp(targetPan, 0.1);

    // Handle rotation - either from hands or auto-rotate
    if (isHandControlled) {
      // Smoothly interpolate rotation (hand 0 controls rotation via pinch)
      currentRotation.x = THREE.MathUtils.lerp(currentRotation.x, targetRotation.x, 0.1);
      currentRotation.y = THREE.MathUtils.lerp(currentRotation.y, targetRotation.y, 0.1);
      currentRotation.z = THREE.MathUtils.lerp(currentRotation.z, targetRotation.z, 0.1);
    } else {
      // Auto-rotate when no hands are detected
      currentRotation.y += autoRotationSpeed;
      currentRotation.x = Math.sin(Date.now() * 0.0005) * 0.3;
    }
    cubeGroup.rotation.copy(currentRotation);

    // Smoothly interpolate zoom (hand 1 controls zoom via pinch)
    currentZoom = THREE.MathUtils.lerp(currentZoom, targetZoom, 0.1);
    cubeGroup.scale.setScalar(currentZoom);

    // Calculate movement speeds for audio
    const rotationSpeed = calculateRotationSpeed(previousRotation, currentRotation, deltaTime);
    const panSpeed = calculatePanSpeed(previousPan, cubeGroup.position, deltaTime);
    const zoomSpeed = calculateZoomSpeed(previousZoom, currentZoom, deltaTime);

    // Calculate pan direction
    const panDirection = new THREE.Vector3()
      .subVectors(cubeGroup.position, previousPan)
      .normalize();

    // Update audio engine only if there's actual movement and hands are controlling
    if (isInitialized && isHandControlled) {
      // Only enable audio if there's significant movement
      const totalMovement = rotationSpeed + panSpeed + zoomSpeed;
      const MOVEMENT_THRESHOLD = 0.01; // Minimum movement to produce sound

      if (totalMovement > MOVEMENT_THRESHOLD) {
        audioEngine.setEnabled(true);
        const metrics: AudioMetrics = {
          rotationSpeed,
          panSpeed,
          zoomSpeed,
          exposedFaces: 0, // Will be calculated in update
        };
        audioEngine.update(metrics, currentRotation, panDirection, currentZoom, cubes, camera);
      } else {
        // No movement detected, disable audio
        audioEngine.setEnabled(false);
      }
    } else {
      // No hands or not initialized, disable audio
      audioEngine.setEnabled(false);
    }

    // Store previous values for next frame
    previousRotation.copy(currentRotation);
    previousPan.copy(cubeGroup.position);
    previousZoom = currentZoom;

    // Animate individual assets for visual interest
    const time = Date.now() * 0.001;

    // Pulsing effect for all cubes
    cubes.forEach((cube, index) => {
      const pulse = 1.0 + Math.sin(time * 2 + index * 0.1) * 0.05;
      cube.scale.setScalar(pulse);
    });

    // Pulsing effect for all spheres
    spheres.forEach((sphere, index) => {
      const pulse = 1.0 + Math.sin(time * 1.5 + index * 0.15) * 0.08;
      sphere.scale.setScalar(pulse);
    });

    // Pulsing effect for all cones
    cones.forEach((cone, index) => {
      const pulse = 1.0 + Math.sin(time * 1.8 + index * 0.12) * 0.06;
      cone.scale.setScalar(pulse);
    });

    // Random rotation for selected assets
    rotatingAssets.forEach((asset, index) => {
      const rotationSpeed = 0.01 + (index % 3) * 0.005; // Vary rotation speed
      asset.rotation.x += rotationSpeed;
      asset.rotation.y += rotationSpeed * 0.7;
      asset.rotation.z += rotationSpeed * 0.5;
    });

    // Rotate lights for dynamic lighting
    const lightTime = Date.now() * 0.0005;
    pointLight.position.x = Math.cos(lightTime) * 5;
    pointLight.position.y = Math.sin(lightTime) * 5;
    pointLight2.position.x = Math.cos(lightTime + Math.PI) * 5;
    pointLight2.position.y = Math.sin(lightTime + Math.PI) * 5;
    pointLight3.position.x = Math.cos(lightTime + Math.PI / 2) * 3;
    pointLight3.position.z = Math.sin(lightTime + Math.PI / 2) * 3;

    renderer.render(scene, camera);
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    // On mobile, threeCanvas takes 50% of viewport height
    const isMobile = window.innerWidth <= 768;
    const canvasHeight = isMobile ? window.innerHeight * 0.5 : window.innerHeight;
    const canvasWidth = window.innerWidth;

    camera.aspect = canvasWidth / canvasHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasWidth, canvasHeight);

    // Update recorder canvas size
    if (videoRecorder) {
      videoRecorder.handleResize();
    }
  });

  // Start button click handler
  startButton.addEventListener('click', () => {
    initializeCamera();
  });

  // Stop button click handler
  stopButton.addEventListener('click', () => {
    stopCamera();
  });

  // Record button click handler
  recordButton.addEventListener('click', async () => {
    if (!videoRecorder) {
      statusElement.textContent = 'Please start hand tracking first';
      statusElement.className = 'error';
      return;
    }

    if (videoRecorder.isCurrentlyRecording()) {
      videoRecorder.stopRecording();
      recordButton.textContent = 'Start Recording';
      recordButton.classList.remove('recording');
    } else {
      try {
        await videoRecorder.startRecording();
        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('recording');
      } catch (error) {
        console.error('Error starting recording:', error);
        statusElement.textContent = 'Error starting recording';
        statusElement.className = 'error';
      }
    }
  });

  // Helper functions to calculate speeds
  function calculateRotationSpeed(prev: THREE.Euler, curr: THREE.Euler, deltaTime: number): number {
    if (deltaTime === 0) return 0;
    const deltaX = Math.abs(curr.x - prev.x);
    const deltaY = Math.abs(curr.y - prev.y);
    const deltaZ = Math.abs(curr.z - prev.z);
    const totalDelta = deltaX + deltaY + deltaZ;
    return totalDelta / deltaTime;
  }

  function calculatePanSpeed(prev: THREE.Vector3, curr: THREE.Vector3, deltaTime: number): number {
    if (deltaTime === 0) return 0;
    const distance = prev.distanceTo(curr);
    return distance / deltaTime;
  }

  function calculateZoomSpeed(prev: number, curr: number, deltaTime: number): number {
    if (deltaTime === 0) return 0;
    return Math.abs(curr - prev) / deltaTime;
  }

  // Start animation loop (runs regardless of camera state)
  animate();
});
