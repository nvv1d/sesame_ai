const btn = document.getElementById("btn");
let ws, recorder, audioCtx, source, processor;

btn.addEventListener("mousedown", async () => {
  ws = new WebSocket(`wss://${location.host}/ws/`);
  await new Promise(r => ws.addEventListener("open", r));
  audioCtx = new AudioContext({ sampleRate: 16000 });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = e => {
    const float32 = e.inputBuffer.getChannelData(0);
    // convert to 16-bit PCM
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++)
      pcm[i] = Math.max(-1, Math.min(1, float32[i])) * 0x7fff;
    ws.send(pcm.buffer);
  };
  source.connect(processor);
  processor.connect(audioCtx.destination);
  ws.onmessage = ({ data }) => {
    // play back WAV chunk
    audioCtx.decodeAudioData(data, buf => {
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start();
    });
  };
});

btn.addEventListener("mouseup", () => {
  processor.disconnect();
  source.disconnect();
  ws.close();
});
