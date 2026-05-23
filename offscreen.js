chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "play-alert-sound") {
    playBeep();
  }
});

function playBeep() {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextType !== "function") {
    return;
  }

  const ctx = new AudioContextType();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
  gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.13);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.45);
  osc.onended = () => {
    void ctx.close();
  };
}
