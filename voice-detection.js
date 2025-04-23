// Voice Activity Detection (VAD)
const VAD_UPDATE_RATE = 50; // Update rate in ms
const SILENCE_THRESHOLD = 0.01; // Silence threshold
const VOICE_THRESHOLD = 0.05; // Voice activity threshold
const SILENCE_TIME = 1000; // Time of silence before stopping in ms
const MIN_VOICE_TIME = 300; // Minimum voice duration in ms

let audioProcessor = null;
let isDetecting = false;
let voiceDetected = false;
let silenceTimer = null;
let voiceTimer = null;
let energy = 0;
let autoBtn = null;
let energyValue = null;
let thresholdMarker = null;
let vadStatus = null;

// Start voice detection
function startAutoDetection() {
    if (isDetecting) return;
    
    console.log('Starting voice detection');
    isDetecting = true;
    voiceDetected = false;
    
    // Get UI elements
    autoBtn = document.getElementById('auto-btn');
    energyValue = document.getElementById('energy-value');
    thresholdMarker = document.getElementById('threshold-marker');
    vadStatus = document.getElementById('vad-status');
    
    // Set threshold marker position
    if (thresholdMarker) {
        thresholdMarker.style.left = `${VOICE_THRESHOLD * 100}%`;
    }
    
    // Create analyzer node
    const analyzerNode = audioContext.createAnalyser();
    analyzerNode.fftSize = 256;
    const bufferLength = analyzerNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    
    // Connect source to analyzer
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyzerNode);
    
    // Processing function for voice detection
    const processAudio = () => {
        if (!isDetecting) return;
        
        // Get audio data
        analyzerNode.getFloatTimeDomainData(dataArray);
        
        // Calculate RMS (energy)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        energy = Math.sqrt(sum / bufferLength);
        
        // Update UI
        if (energyValue) {
            energyValue.style.width = `${Math.min(energy * 100 * 5, 100)}%`;
        }
        
        // Check for voice activity
        if (energy > VOICE_THRESHOLD && !voiceDetected) {
            // Start voice detection
            clearTimeout(silenceTimer);
            voiceDetected = true;
            vadStatus.textContent = 'Voice detected: Yes';
            
            // Update UI
            autoBtn.style.backgroundColor = '#f44336';
            document.getElementById('auto-detect').classList.add('listening');
            
            // Start recording
            processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const output = new Int16Array(input.length);
                
                for (let i = 0; i < input.length; i++) {
                    output[i] = input[i] * 32767;
                }
                
                sendAudio(output.buffer);
            };
            
        } else if (energy < SILENCE_THRESHOLD && voiceDetected) {
            // Schedule end of voice detection
            if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                    voiceDetected = false;
                    vadStatus.textContent = 'Voice detected: No';
                    
                    // Update UI
                    autoBtn.style.backgroundColor = '#4CAF50';
                    document.getElementById('auto-detect').classList.remove('listening');
                    
                    // Stop recording
                    processor.onaudioprocess = null;
                    silenceTimer = null;
                }, SILENCE_TIME);
            }
        } else if (energy > SILENCE_THRESHOLD && voiceDetected) {
            // Reset silence timer if voice is detected again
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        
        // Schedule next update
        setTimeout(processAudio, VAD_UPDATE_RATE);
    };
    
    // Start processing
    processAudio();
}

// Stop voice detection
function stopAutoDetection() {
    console.log('Stopping voice detection');
    isDetecting = false;
    voiceDetected = false;
    
    if (processor) {
        processor.onaudioprocess = null;
    }
    
    clearTimeout(silenceTimer);
    clearTimeout(voiceTimer);
    silenceTimer = null;
    voiceTimer = null;
}

// Make functions available globally
window.startAutoDetection = startAutoDetection;
window.stopAutoDetection = stopAutoDetection;
