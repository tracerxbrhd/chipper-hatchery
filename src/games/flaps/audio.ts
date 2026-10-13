/** Original two-note synthesised cues. An AudioContext is opened only after user input. */
export class FlapsAudio {
  private context: AudioContext | null = null;
  private enabled: boolean;
  constructor(enabled: boolean) { this.enabled = enabled; }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  play(kind: 'flap' | 'score' | 'hit'): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const freq = kind === 'flap' ? 490 : kind === 'score' ? 740 : 140;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(freq, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 65 : freq * 1.25, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.045, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      oscillator.connect(gain); gain.connect(this.context.destination);
      oscillator.start(now); oscillator.stop(now + 0.12);
    } catch { /* Browsers without WebAudio remain silent. */ }
  }
  stop(): void {
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
