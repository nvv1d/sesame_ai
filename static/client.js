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
let btnContainer = document.getElementById('btn-container');
let audioIndicators = document.getElementById('audio-indicators');
let bufferInfo = document.getElementById('buffer-info');
let latencyInfo = document.getElementById('latency-info');
let chunksInfo = document.getElementById('chunks-info');

// Audio playback variables
let audioQueue = [];
let isPlaying = false;
let scheduledTime = 0;
let audioBufferSize = 0.2; // Start with a small buffer size (in seconds)
let jitterBuffer = []; // Buffer for incoming audio
let minBufferSize = 0.05; // Min buffer size in seconds
let maxBufferSize = 0.3; // Max buffer size in seconds
let lastLatency = 0;
let gainNode;
let isSpeaking = false;
let isListening = false;

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
    processIncomingAudio(audioData);
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
    
    // Create gain node for smoother transitions
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    
    // Add some audio processing for more natural sound
    // Create a compressor node to normalize volume
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    
    // Create a biquad filter to enhance voice quality
    const filter = audioContext.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = 2500; // Enhance voice frequencies
    filter.Q.value = 1.0;
    filter.gain.value = 3.0;
    
    // Connect processing chain
    gainNode.connect(compressor);
    compressor.connect(filter);
    filter.connect(audioContext.destination);
    
    // Connect the processor
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    // Initialize scheduled time
    scheduledTime = audioContext.currentTime;
    
    console.log('Audio setup complete with enhanced processing');
  } catch (error) {
    console.error('Error setting up audio:', error);
  }
}

// Process incoming audio and add to jitter buffer
function processIncomingAudio(audioData) {
  const audioBuffer = new Int16Array(audioData);
  
  // Convert Int16Array to Float32Array for AudioBuffer
  const floatArray = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i++) {
    floatArray[i] = audioBuffer[i] / 32768.0;
  }
  
  // Add to jitter buffer
  jitterBuffer.push(floatArray);
  
  // Start playing if not already playing
  if (!isPlaying) {
    playFromBuffer();
  }
  
  // Dynamic buffer size adjustment based on jitter/latency
  adjustBufferSize();
}

// Dynamically adjust buffer size based on network conditions
function adjustBufferSize() {
  const bufferTimeRemaining = scheduledTime - audioContext.currentTime;
  
  // Calculate current latency
  const currentLatency = bufferTimeRemaining;
  const latencyDelta = currentLatency - lastLatency;
  lastLatency = currentLatency;
  
  // Adjust buffer size based on latency trends
  if (latencyDelta > 0.05) {
    // Latency increasing, increase buffer
    audioBufferSize = Math.min(audioBufferSize * 1.1, maxBufferSize);
  } else if (latencyDelta < -0.05 && bufferTimeRemaining < audioBufferSize * 0.5) {
    // Latency decreasing too much, decrease buffer
    audioBufferSize = Math.max(audioBufferSize * 0.9, minBufferSize);
  }
  
  // Update debug info every few chunks
  if (jitterBuffer.length % 5 === 0) {
    updateDebugInfo();
  }
}

// Update debug information in the UI
function updateDebugInfo() {
  const bufferTimeRemaining = scheduledTime - audioContext.currentTime;
  bufferInfo.textContent = `Buffer size: ${audioBufferSize.toFixed(3)}s`;
  latencyInfo.textContent = `Latency: ${(bufferTimeRemaining * 1000).toFixed(0)}ms`;
  chunksInfo.textContent = `Chunks in queue: ${jitterBuffer.length}`;
}

// Play audio from buffer with smooth transitions
function playFromBuffer() {
  if (jitterBuffer.length === 0) {
    isPlaying = false;
    if (isSpeaking) {
      isSpeaking = false;
      audioIndicators.classList.remove('speaking');
    }
    return;
  }
  
  // Update visual indicators
  if (!isSpeaking) {
    isSpeaking = true;
    audioIndicators.classList.add('speaking');
  }
  
  isPlaying = true;
  const floatArray = jitterBuffer.shift();
  
  // Create AudioBuffer and schedule it
  const buffer = audioContext.createBuffer(1, floatArray.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(floatArray);
  
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  
  // Connect through gain node for smoother transitions
  source.connect(gainNode);
  
  // Schedule this buffer
  const duration = buffer.duration;
  source.start(scheduledTime);
  scheduledTime += duration;
  
  // Update debug UI
  updateDebugInfo();
  
  // Schedule next playback
  source.onended = () => {
    // Small delay before playing next chunk to avoid clicks
    setTimeout(playFromBuffer, 5);
  };
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
    
    // Update UI state
    isListening = true;
    btnContainer.classList.add('listening');
    
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
    
    // Update UI state
    isListening = false;
    btnContainer.classList.remove('listening');
  });
  
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    button.dispatchEvent(new Event('mousedown'));
  });
  
  button.addEventListener('touchend', (e) => {
    e.preventDefault();
    button.dispatchEvent(new Event('mouseup'));
  });

// Initialize everything when the page loads
window.addEventListener('DOMContentLoaded', async () => {
  button.disabled = true;
  await setupAudio();
  setupButton();
  setupWebSocket();
});
