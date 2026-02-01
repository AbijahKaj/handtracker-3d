import * as Tone from 'tone';

export interface RecordingElements {
  threeCanvas: HTMLCanvasElement;
  videoElement: HTMLVideoElement;
  canvasElement: HTMLCanvasElement;
}

export class VideoRecorder {
  private isRecording: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private compositionCanvas: HTMLCanvasElement | null = null;
  private compositionCtx: CanvasRenderingContext2D | null = null;
  private recordingAnimationFrame: number | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private audioStream: MediaStream | null = null;
  private elements: RecordingElements | null = null;
  private onStatusUpdate: ((status: string, className: string) => void) | null = null;

  constructor(
    elements: RecordingElements,
    onStatusUpdate?: (status: string, className: string) => void
  ) {
    this.elements = elements;
    this.onStatusUpdate = onStatusUpdate || null;
    this.initializeCompositionCanvas();
  }

  private initializeCompositionCanvas() {
    // Create a canvas in Instagram Reel format (9:16 aspect ratio)
    // Standard Reel dimensions: 1080x1920 (portrait)
    const reelWidth = 1080;
    const reelHeight = 1920;
    
    this.compositionCanvas = document.createElement('canvas');
    this.compositionCanvas.width = reelWidth;
    this.compositionCanvas.height = reelHeight;
    this.compositionCtx = this.compositionCanvas.getContext('2d', {
      alpha: false, // Better performance for video
    });

    if (!this.compositionCtx) {
      throw new Error('Could not get composition canvas context');
    }
  }

  private setupAudioCapture() {
    // Audio capture setup is now handled in setupAudioConnection
    // This method is kept for compatibility but does nothing
  }

  /**
   * Set up audio capture by connecting the audio engine's output
   * This should be called with the master volume node from the audio engine
   * @deprecated Use setupAudioConnectionWithDestination instead
   */
  public setupAudioConnection(masterVolume: Tone.Volume): void {
    try {
      // Get Tone.js audio context
      const audioContext = Tone.getContext().rawContext as AudioContext;

      // Create a MediaStreamAudioDestinationNode to capture audio
      this.audioDestination = audioContext.createMediaStreamDestination();

      if (this.audioDestination && masterVolume) {
        // Connect the master volume to our audio destination
        // Tone.js nodes can be connected to Web Audio API nodes
        // We connect it in addition to the existing connection to destination
        // This creates a split - audio goes to both destination and our recorder
        (masterVolume as any).connect(this.audioDestination);
        this.audioStream = this.audioDestination.stream;
      }
    } catch (error) {
      console.warn('Error connecting audio for recording:', error);
      this.audioDestination = null;
      this.audioStream = null;
    }
  }

  /**
   * Get the audio destination node for the audio engine to connect to
   * This is the preferred method as it allows the audio engine to manage the connection
   */
  public getAudioDestination(): MediaStreamAudioDestinationNode | null {
    if (!this.audioDestination) {
      try {
        const audioContext = Tone.getContext().rawContext as AudioContext;
        this.audioDestination = audioContext.createMediaStreamDestination();
        this.audioStream = this.audioDestination.stream;
      } catch (error) {
        console.warn('Error creating audio destination:', error);
        this.audioDestination = null;
        this.audioStream = null;
      }
    }
    return this.audioDestination;
  }

  private drawCompositionFrame() {
    if (!this.compositionCanvas || !this.compositionCtx || !this.isRecording || !this.elements) {
      return;
    }

    const { threeCanvas, videoElement, canvasElement } = this.elements;
    const width = this.compositionCanvas.width; // 1080
    const height = this.compositionCanvas.height; // 1920
    
    // Three.js canvas takes 55% of height (top portion)
    const threeCanvasHeight = Math.floor(height * 0.55); // 1056px
    // Video takes 45% of height (bottom portion)
    const videoHeight = height - threeCanvasHeight; // 864px

    // Clear the composition canvas
    this.compositionCtx.fillStyle = '#0d1117';
    this.compositionCtx.fillRect(0, 0, width, height);

    // Draw Three.js canvas on top 55%
    if (threeCanvas) {
      // Scale Three.js canvas to fit the width while maintaining aspect ratio
      const threeCanvasAspect = threeCanvas.width / threeCanvas.height;
      const targetAspect = width / threeCanvasHeight;
      
      let drawWidth = width;
      let drawHeight = threeCanvasHeight;
      let offsetX = 0;
      let offsetY = 0;
      
      if (threeCanvasAspect > targetAspect) {
        // Three.js canvas is wider - fit to height and crop sides
        drawHeight = threeCanvasHeight;
        drawWidth = drawHeight * threeCanvasAspect;
        offsetX = (width - drawWidth) / 2;
      } else {
        // Three.js canvas is taller - fit to width and crop top/bottom
        drawWidth = width;
        drawHeight = drawWidth / threeCanvasAspect;
        offsetY = (threeCanvasHeight - drawHeight) / 2;
      }
      
      this.compositionCtx.drawImage(
        threeCanvas,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
      );
    }

    // Draw video + MediaPipe canvas on bottom 45%
    if (videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
      const targetAspect = width / videoHeight;

      let drawWidth = width;
      let drawHeight = videoHeight;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = videoElement.videoWidth;
      let sourceHeight = videoElement.videoHeight;
      let offsetX = 0;
      let offsetY = threeCanvasHeight; // Start at the bottom section

      if (videoAspect > targetAspect) {
        // Video is wider than target - crop sides (zoom in)
        // Fit to height, crop width
        drawHeight = videoHeight;
        drawWidth = drawHeight * targetAspect; // Use target aspect to fill width
        offsetX = (width - drawWidth) / 2;
        
        // Calculate source crop to center the video
        const scale = videoElement.videoHeight / drawHeight;
        sourceWidth = drawWidth * scale;
        sourceX = (videoElement.videoWidth - sourceWidth) / 2;
      } else {
        // Video is taller than target - crop top/bottom (zoom in)
        // Fit to width, crop height
        drawWidth = width;
        drawHeight = drawWidth / targetAspect; // Use target aspect to fill height
        offsetY = threeCanvasHeight + (videoHeight - drawHeight) / 2;
        
        // Calculate source crop to center the video
        const scale = videoElement.videoWidth / drawWidth;
        sourceHeight = drawHeight * scale;
        sourceY = (videoElement.videoHeight - sourceHeight) / 2;
      }

      // Draw video (mirrored and cropped)
      this.compositionCtx.save();
      this.compositionCtx.scale(-1, 1); // Mirror the video
      this.compositionCtx.drawImage(
        videoElement,
        sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle (crop)
        -offsetX - drawWidth, offsetY, drawWidth, drawHeight // Destination rectangle
      );
      this.compositionCtx.restore();

      // Draw MediaPipe canvas overlay on top of video (mirrored and cropped)
      if (canvasElement && canvasElement.width > 0 && canvasElement.height > 0) {
        // Calculate the same crop for the canvas overlay
        const canvasAspect = canvasElement.width / canvasElement.height;
        let canvasSourceX = 0;
        let canvasSourceY = 0;
        let canvasSourceWidth = canvasElement.width;
        let canvasSourceHeight = canvasElement.height;
        
        if (videoAspect > targetAspect) {
          // Same crop as video
          const scale = canvasElement.height / drawHeight;
          canvasSourceWidth = drawWidth * scale;
          canvasSourceX = (canvasElement.width - canvasSourceWidth) / 2;
        } else {
          // Same crop as video
          const scale = canvasElement.width / drawWidth;
          canvasSourceHeight = drawHeight * scale;
          canvasSourceY = (canvasElement.height - canvasSourceHeight) / 2;
        }
        
        this.compositionCtx.save();
        this.compositionCtx.scale(-1, 1); // Mirror the canvas overlay
        this.compositionCtx.drawImage(
          canvasElement,
          canvasSourceX, canvasSourceY, canvasSourceWidth, canvasSourceHeight, // Source rectangle (crop)
          -offsetX - drawWidth, offsetY, drawWidth, drawHeight // Destination rectangle
        );
        this.compositionCtx.restore();
      }
    }

    // Continue recording animation
    if (this.isRecording) {
      this.recordingAnimationFrame = requestAnimationFrame(() => this.drawCompositionFrame());
    }
  }

  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    if (!this.compositionCanvas || !this.compositionCtx || !this.elements) {
      this.initializeCompositionCanvas();
      if (!this.compositionCanvas || !this.compositionCtx) {
        throw new Error('Failed to initialize composition canvas');
      }
    }

    try {
      // Canvas is already set to Instagram Reel format (1080x1920)
      // No need to resize

      // Get video stream from composition canvas
      const videoStream = this.compositionCanvas.captureStream(30); // 30 FPS

      // Combine video and audio streams
      let combinedStream: MediaStream;

      if (this.audioStream) {
        // Combine video and audio tracks
        combinedStream = new MediaStream();
        videoStream.getVideoTracks().forEach((track) => {
          combinedStream.addTrack(track);
        });
        this.audioStream.getAudioTracks().forEach((track) => {
          combinedStream.addTrack(track);
        });
      } else {
        // Video only
        combinedStream = videoStream;
      }

      // Determine the best MIME type
      const options: MediaRecorderOptions = {};
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];

      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          options.mimeType = mimeType;
          break;
        }
      }

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(combinedStream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleRecordingStop();
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        this.updateStatus('Recording error occurred', 'error');
      };

      // Start recording
      this.isRecording = true;
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Start drawing frames
      this.drawCompositionFrame();

      // Update UI
      this.updateStatus('Recording...', 'recording');
    } catch (error) {
      console.error('Error starting recording:', error);
      this.isRecording = false;
      this.updateStatus('Error starting recording', 'error');
      throw error;
    }
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      return;
    }

    if (this.mediaRecorder.state === 'recording') {
      this.isRecording = false;
      this.mediaRecorder.stop();

      // Stop drawing frames
      if (this.recordingAnimationFrame) {
        cancelAnimationFrame(this.recordingAnimationFrame);
        this.recordingAnimationFrame = null;
      }

      this.updateStatus('Processing recording...', '');
    }
  }

  private handleRecordingStop() {
    // Create blob and download
    if (this.recordedChunks.length === 0) {
      this.updateStatus('No recording data available', 'error');
      return;
    }

    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `handtracker-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up after a delay to allow download to start
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);

    // Cleanup
    this.recordedChunks = [];
    this.updateStatus('Recording saved', '');
  }

  private updateStatus(status: string, className: string) {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(status, className);
    }
  }

  public isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  public cleanup(): void {
    if (this.isRecording) {
      this.stopRecording();
    }

    if (this.recordingAnimationFrame) {
      cancelAnimationFrame(this.recordingAnimationFrame);
      this.recordingAnimationFrame = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Stop all audio tracks (the audio engine will handle disconnecting)
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
    }

    this.mediaRecorder = null;
    this.recordedChunks = [];
    // Note: Don't set audioDestination to null here as the audio engine manages the connection
    // The audio engine's removeRecordingDestination will handle disconnection
    this.audioStream = null;
  }

  // Handle window resize
  // Note: Composition canvas is fixed to Instagram Reel format, so no resize needed
  public handleResize(): void {
    // Composition canvas is fixed to 1080x1920 (Instagram Reel format)
    // No resize needed
  }
}

