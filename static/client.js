// Audio settings
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

// Connect to WebSocket endpoint on our server
const WS_URL = window.location.origin.replace('http', 'ws') + '/ws/';
console.log('Connecting to WebSocket at:', WS_URL);
let socket;
let audioContext;
let mediaStream;
let processor;
let button = document.getElementById('btn');

// Connect to the WebSocket and set up listeners
function setupWebSocket() {
  let statusElement = document.getElementById('status');
  statusElement.textContent = "Connecting...";
  
  socket = new WebSocket(WS_URL);
  
  socket.onopen = () => {
    console.log('WebSocket connected!');
    statusElement.textContent = "Connected! Ready to talk to Maya.";
    button.disabled = false;
  };
  
  socket.onclose = () => {
    console.log('WebSocket closed');
    statusElement.textContent = "Connection lost. Reconnecting...";
    button.disabled = true;
    setTimeout(setupWebSocket, 2000); // Try to reconnect after 2 seconds
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusElement.textContent = "Connection error. Please check your network.";
  };
  
  // Handle incoming audio data from the server
  socket.onmessage = async (event) => {
    const audioData = await event.data.arrayBuffer();
    playAudio(audioData);
  };
}

// Set up audio context and get user media for microphone
async function setupAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create audio processor
    processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Connect the processor
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    console.log('Audio setup complete');
  } catch (error) {
    console.error('Error setting up audio:', error);
  }
}

// Play received audio from the server
function playAudio(audioData) {
  const audioBuffer = new Int16Array(audioData);
  
  // Convert Int16Array to Float32Array for AudioBuffer
  const floatArray = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i++) {
    floatArray[i] = audioBuffer[i] / 32768.0;
  }
  
  // Create AudioBuffer and play it
  const buffer = audioContext.createBuffer(1, floatArray.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(floatArray);
  
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
}

// Send audio data to the server
function sendAudio(audioData) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(audioData);
  }
}

// Set up button events for push-to-talk
function setupButton() {
  button.addEventListener('mousedown', () => {
    console.log('Button pressed, starting recording');
    audioContext.resume();
    
    // Start processing audio
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = new Int16Array(input.length);
      
      // Convert Float32Array to Int16Array
      for (let i = 0; i < input.length; i++) {
        output[i] = input[i] * 32767;
      }
      
      sendAudio(output.buffer);
    };
  });
  
  button.addEventListener('mouseup', () => {
    console.log('Button released, stopping recording');
    processor.onaudioprocess = null;
  });
  
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    button.dispatchEvent(new Event('mousedown'));
  });
  
  button.addEventListener('touchend', (e) => {
    e.preventDefault();
    button.dispatchEvent(new Event('mouseup'));
  });
}

// Initialize everything when the page loads
window.addEventListener('DOMContentLoaded', async () => {
  button.disabled = true;
  await setupAudio();
  setupButton();
  setupWebSocket();
});
