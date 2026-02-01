# Hand Tracking 3D Demo

Interactive 3D hand tracking demonstration using MediaPipe and Three.js. Control 3D objects with hand gestures in real-time through your webcam. Features dynamic audio feedback and video recording capabilities.

Built with TypeScript, Vite, Three.js, MediaPipe, and Tone.js.

## Features

- **Real-time hand tracking** via webcam using MediaPipe
- **3D scene control** with hand gestures:
  - Left hand controls rotation
  - Right hand controls zoom (pinch gesture)
  - Both hands together control pan
- **Dynamic audio feedback** that responds to movement using Tone.js
- **Video recording** of the interactive experience
- **Mobile responsive** with split-screen layout

## Scripts

- **`yarn dev`** — Start dev server (Vite)
- **`yarn build`** — Production build (output in `dist/`)
- **`yarn preview`** — Preview production build locally

## Usage

1. Start the development server with `yarn dev`
2. Open the application in your browser
3. Click "Start Hand Tracking" to begin
4. Allow camera access when prompted
5. Use your hands to control the 3D scene:
   - Move your left hand to rotate the scene
   - Use your right hand's pinch gesture to zoom in/out
   - Use both hands together to pan the scene
6. Click "Start Recording" to capture your interaction as a video

## Requirements

- Modern browser with WebGL support
- Webcam access

## Attribution

Inspired by [this facebook video](https://www.facebook.com/reel/748257761671884).
