import * as THREE from "three";
import * as Tone from "tone";

export interface AudioMetrics {
  rotationSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  exposedFaces: number;
}

// Musical scales for different sides of the scene
const SCALE_MAJOR = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88]; // C major
const SCALE_MINOR = [261.63, 293.66, 311.13, 349.23, 392.0, 415.3, 466.16]; // C minor
const SCALE_PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0]; // C pentatonic

// Simple melodies for each side (as note indices in their scales)
const MELODIES: Record<string, number[]> = {
  front: [0, 2, 4, 2, 0, 4, 2], // Ascending/descending major
  back: [0, 1, 3, 1, 0, 3, 1], // Minor pattern
  left: [0, 2, 4, 2, 0], // Pentatonic pattern
  right: [0, 2, 4, 3, 1, 0], // Different pentatonic
  top: [0, 2, 4, 6, 4, 2, 0], // Major arpeggio
  bottom: [0, 1, 3, 5, 3, 1, 0], // Minor arpeggio
  center: [0, 2, 4, 2, 0], // Simple pentatonic
};

export class DynamicAudioEngine {
  private isEnabled: boolean = true;

  // Tone.js synths for different sound types
  private rotationSynth: Tone.Synth | null = null;
  private panSynth: Tone.Synth | null = null;
  private zoomSynth: Tone.Synth | null = null;
  private sideSynths: Map<string, Tone.PolySynth> = new Map();

  private masterVolume: Tone.Volume;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;

  // Movement thresholds (increased to filter small vibrations)
  private readonly MIN_SPEED_THRESHOLD = 0.05; // Increased from 0.01

  // Smoothing buffers (exponential moving average)
  private smoothedRotationSpeed: number = 0;
  private smoothedPanSpeed: number = 0;
  private smoothedZoomSpeed: number = 0;
  private smoothingFactor: number = 0.15; // Lower = more smoothing (0-1)

  // Side detection and melody
  private currentSide: string = "center";
  private sideNotes: Map<string, number[]> = new Map();
  private melodySequences: Map<string, Tone.Sequence | null> = new Map();
  private melodyInterval: number = 0.4; // Time between melody notes

  // Debouncing
  private lastSoundTime: Map<string, number> = new Map();
  private minTimeBetweenSounds: number = 0.1; // Minimum 100ms between sounds

  constructor() {
    // Initialize Tone.js
    this.masterVolume = new Tone.Volume(-10); // Master volume at -10dB
    this.masterVolume.toDestination();

    // Initialize side notes (different scales for different sides)
    this.sideNotes.set("front", SCALE_MAJOR);
    this.sideNotes.set("back", SCALE_MINOR);
    this.sideNotes.set("left", SCALE_PENTATONIC);
    this.sideNotes.set("right", SCALE_PENTATONIC);
    this.sideNotes.set("top", SCALE_MAJOR);
    this.sideNotes.set("bottom", SCALE_MINOR);
    this.sideNotes.set("center", SCALE_PENTATONIC);
  }

  // Resume audio context (required after user interaction)
  async resume(): Promise<void> {
    await Tone.start();
    this.initializeSynths();
  }

  // Initialize all synths
  private initializeSynths() {
    // Rotation synth - smooth, melodic
    this.rotationSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.2,
        decay: 0.3,
        sustain: 0.4,
        release: 0.5,
      },
    }).connect(this.masterVolume);

    // Pan synth - lower, rumbling
    this.panSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.2,
        decay: 0.4,
        sustain: 0.3,
        release: 0.6,
      },
    }).connect(this.masterVolume);

    // Zoom synth - whooshing
    this.zoomSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: {
        attack: 0.1,
        decay: 0.3,
        sustain: 0.2,
        release: 0.4,
      },
    }).connect(this.masterVolume);

    // Side-specific polyphonic synths for melodies
    const sides = ["front", "back", "left", "right", "top", "bottom", "center"];
    sides.forEach((side) => {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.15,
          decay: 0.3,
          sustain: 0.5,
          release: 0.6,
        },
      }).connect(this.masterVolume);
      this.sideSynths.set(side, synth);
      this.melodySequences.set(side, null);
    });
  }

  // Smooth a value using exponential moving average
  private smoothValue(
    current: number,
    previous: number,
    factor: number,
  ): number {
    return previous * (1 - factor) + current * factor;
  }

  // Check if enough time has passed since last sound (debouncing)
  private canPlaySound(soundId: string): boolean {
    const now = Date.now();
    const lastTime = this.lastSoundTime.get(soundId) || 0;
    if (now - lastTime < this.minTimeBetweenSounds * 1000) {
      return false;
    }
    this.lastSoundTime.set(soundId, now);
    return true;
  }

  // Enable/disable audio
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stopAllSounds();
    }
  }

  // Get master volume node for recording
  getMasterVolume(): Tone.Volume {
    return this.masterVolume;
  }

  // Set up recording destination - connects master volume to recording destination
  setupRecordingDestination(
    destination: MediaStreamAudioDestinationNode,
  ): void {
    this.recordingDestination = destination;
    // Connect master volume to recording destination in addition to main destination
    // Tone.js nodes can connect to multiple destinations
    try {
      (this.masterVolume as any).connect(destination);
    } catch (error) {
      console.warn(
        "Error connecting master volume to recording destination:",
        error,
      );
    }
  }

  // Remove recording destination
  removeRecordingDestination(): void {
    if (this.recordingDestination) {
      try {
        (this.masterVolume as any).disconnect(this.recordingDestination);
      } catch (error) {
        console.warn("Error disconnecting recording destination:", error);
      }
      this.recordingDestination = null;
    }
  }

  // Stop all active sounds
  private stopAllSounds() {
    if (this.rotationSynth) {
      this.rotationSynth.triggerRelease();
    }
    if (this.panSynth) {
      this.panSynth.triggerRelease();
    }
    if (this.zoomSynth) {
      this.zoomSynth.triggerRelease();
    }
    this.sideSynths.forEach((synth) => {
      synth.releaseAll();
    });
    // Stop all melody sequences
    this.melodySequences.forEach((seq) => {
      if (seq) {
        seq.stop();
      }
    });
  }

  // Determine which side of the scene is facing the camera
  private detectSceneSide(rotation: THREE.Euler, camera: THREE.Camera): string {
    // Get camera direction
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Calculate dot products to determine which side is most visible
    const sides = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0),
      bottom: new THREE.Vector3(0, -1, 0),
    };

    // Rotate side vectors by scene rotation
    Object.keys(sides).forEach((key) => {
      sides[key as keyof typeof sides].applyEuler(rotation);
    });

    // Find side with highest dot product (most facing camera)
    let maxDot = -Infinity;
    let detectedSide = "center";

    Object.entries(sides).forEach(([side, direction]) => {
      const dot = direction.dot(cameraDirection);
      if (dot > maxDot) {
        maxDot = dot;
        detectedSide = side;
      }
    });

    return detectedSide;
  }

  // Get notes from scale for a melody
  private getMelodyNotes(side: string): number[] {
    const scale = this.sideNotes.get(side) || SCALE_PENTATONIC;
    const melodyIndices = MELODIES[side] || MELODIES.center;
    return melodyIndices.map(
      (index) => scale[Math.min(index, scale.length - 1)],
    );
  }

  // Start/update side-specific melody
  private updateSideMelody(side: string, speed: number) {
    if (!this.isEnabled) return;

    const synth = this.sideSynths.get(side);
    if (!synth) return;

    // Stop previous side if changed
    if (this.currentSide !== side) {
      const prevSynth = this.sideSynths.get(this.currentSide);
      const prevSeq = this.melodySequences.get(this.currentSide);
      if (prevSynth) {
        prevSynth.releaseAll();
      }
      if (prevSeq) {
        prevSeq.stop();
        this.melodySequences.set(this.currentSide, null);
      }
      this.currentSide = side;
    }

    // Only play melody if speed is significant
    if (speed < this.MIN_SPEED_THRESHOLD) {
      const currentSeq = this.melodySequences.get(side);
      if (currentSeq) {
        currentSeq.stop();
        this.melodySequences.set(side, null);
      }
      synth.releaseAll();
      return;
    }

    // Start or continue melody sequence
    let sequence = this.melodySequences.get(side);
    if (!sequence) {
      const notes = this.getMelodyNotes(side);
      const noteDuration = this.melodyInterval;

      sequence = new Tone.Sequence(
        (time, note) => {
          if (speed >= this.MIN_SPEED_THRESHOLD) {
            const volume = Math.min(speed * 10 - 15, 0);
            synth.volume.value = volume;
            synth.triggerAttackRelease(note, noteDuration * 0.8, time);
          }
        },
        notes,
        noteDuration,
      );

      sequence.start(0);
      this.melodySequences.set(side, sequence);
    }
  }

  // Update rotation sound (with smoothing and debouncing)
  private updateRotationSound(speed: number, rotation: THREE.Euler) {
    if (!this.rotationSynth || !this.isEnabled) return;

    // Smooth the speed
    this.smoothedRotationSpeed = this.smoothValue(
      speed,
      this.smoothedRotationSpeed,
      this.smoothingFactor,
    );

    if (this.smoothedRotationSpeed < this.MIN_SPEED_THRESHOLD) {
      this.rotationSynth.triggerRelease();
      return;
    }

    // Debounce
    if (!this.canPlaySound("rotation")) return;

    // Map speed to frequency (musical note)
    const baseFreq = 220; // A3
    const freq = baseFreq + this.smoothedRotationSpeed * 80; // Reduced multiplier
    const volume = Math.min(this.smoothedRotationSpeed * 15 - 25, 0); // Volume in dB

    this.rotationSynth.volume.value = volume;
    this.rotationSynth.triggerAttack(freq);
  }

  // Update pan sound (with smoothing)
  private updatePanSound(speed: number) {
    if (!this.panSynth || !this.isEnabled) return;

    // Smooth the speed
    this.smoothedPanSpeed = this.smoothValue(
      speed,
      this.smoothedPanSpeed,
      this.smoothingFactor,
    );

    if (this.smoothedPanSpeed < this.MIN_SPEED_THRESHOLD) {
      this.panSynth.triggerRelease();
      return;
    }

    // Debounce
    if (!this.canPlaySound("pan")) return;

    // Lower frequency for panning
    const freq = 80 + this.smoothedPanSpeed * 25; // Reduced multiplier
    const volume = Math.min(this.smoothedPanSpeed * 12 - 28, 0);

    this.panSynth.volume.value = volume;
    this.panSynth.triggerAttack(freq);
  }

  // Update zoom sound (with smoothing)
  private updateZoomSound(speed: number, zoomLevel: number) {
    if (!this.zoomSynth || !this.isEnabled) return;

    // Smooth the speed
    this.smoothedZoomSpeed = this.smoothValue(
      speed,
      this.smoothedZoomSpeed,
      this.smoothingFactor,
    );

    if (this.smoothedZoomSpeed < this.MIN_SPEED_THRESHOLD) {
      this.zoomSynth.triggerRelease();
      return;
    }

    // Debounce
    if (!this.canPlaySound("zoom")) return;

    const freq = 150 + zoomLevel * 40; // Reduced multiplier
    const volume = Math.min(this.smoothedZoomSpeed * 15 - 25, 0);

    this.zoomSynth.volume.value = volume;
    this.zoomSynth.triggerAttack(freq);
  }

  // Check if synths are initialized
  private areSynthsReady(): boolean {
    return (
      this.rotationSynth !== null &&
      this.panSynth !== null &&
      this.zoomSynth !== null &&
      this.sideSynths.size > 0
    );
  }

  // Update all sounds based on current metrics
  update(
    metrics: AudioMetrics,
    rotation: THREE.Euler,
    panDirection: THREE.Vector3,
    zoomLevel: number,
    cubes: THREE.Mesh[],
    camera: THREE.Camera,
  ) {
    if (!this.isEnabled || !this.areSynthsReady()) return;

    // Detect which side is facing camera
    const side = this.detectSceneSide(rotation, camera);

    // Update rotation sound (only if significant movement)
    if (metrics.rotationSpeed > this.MIN_SPEED_THRESHOLD * 0.5) {
      this.updateRotationSound(metrics.rotationSpeed, rotation);
    } else {
      this.rotationSynth?.triggerRelease();
    }

    // Update pan sound (only if significant movement)
    if (metrics.panSpeed > this.MIN_SPEED_THRESHOLD * 0.5) {
      this.updatePanSound(metrics.panSpeed);
    } else {
      this.panSynth?.triggerRelease();
    }

    // Update zoom sound (only if significant movement)
    if (metrics.zoomSpeed > this.MIN_SPEED_THRESHOLD * 0.5) {
      this.updateZoomSound(metrics.zoomSpeed, zoomLevel);
    } else {
      this.zoomSynth?.triggerRelease();
    }

    // Update side-specific melody (based on rotation speed)
    this.updateSideMelody(side, metrics.rotationSpeed);
  }

  // Cleanup
  destroy() {
    this.stopAllSounds();
    if (this.rotationSynth) {
      this.rotationSynth.dispose();
    }
    if (this.panSynth) {
      this.panSynth.dispose();
    }
    if (this.zoomSynth) {
      this.zoomSynth.dispose();
    }
    this.sideSynths.forEach((synth) => {
      synth.dispose();
    });
    this.melodySequences.forEach((seq) => {
      if (seq) {
        seq.dispose();
      }
    });
    this.masterVolume.dispose();
  }
}
