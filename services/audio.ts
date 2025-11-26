class AudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isPlayingBgm: boolean = false;
  private timerID: number | undefined;
  
  // Sequencing
  private currentStep = 0;
  private nextStepTime = 0;
  private tempo = 140; 
  private lookahead = 25.0; 
  private scheduleAheadTime = 0.1;

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.20; 
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.20, this.ctx!.currentTime, 0.1);
    }
    return this.isMuted;
  }

  playBgm() {
    if (this.isPlayingBgm) return;
    this.init();
    this.isPlayingBgm = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx!.currentTime;
    this.scheduler();
  }

  stopBgm() {
    this.isPlayingBgm = false;
    if (this.timerID) window.clearTimeout(this.timerID);
  }

  private scheduler() {
    if (!this.isPlayingBgm || !this.ctx) return;
    
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.playStep(this.nextStepTime);
      this.nextStepTime += (60.0 / this.tempo) / 4; // 16th notes
      this.currentStep++;
      if (this.currentStep >= 16) this.currentStep = 0;
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private playStep(time: number) {
    if (!this.ctx) return;
    const s = this.currentStep;

    // Bassline (Square Wave)
    const bassNotes = [110, 0, 110, 0, 110, 0, 130.8, 0, 146.8, 0, 146.8, 0, 98, 0, 110, 0];
    const bassFreq = bassNotes[s];
    if (bassFreq > 0) {
      this.playTone(time, bassFreq, 'square', 0.1, 0.15);
    }

    // Lead Melody (Sawtooth with filter)
    // Simple Arpeggio pattern
    const scale = [220, 261.6, 329.6, 440, 523.2]; // Am7 pentatonic
    if (s % 2 === 0 && Math.random() > 0.3) {
      const note = scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.8 ? 2 : 1);
      this.playTone(time, note, 'sawtooth', 0.05, 0.1);
    }

    // Percussion (Noise)
    // Kick on 0, 4, 8, 12
    if (s % 4 === 0) {
      this.playKick(time);
    }
    // Snare on 4, 12
    if (s % 8 === 4) {
      this.playSnare(time);
    }
    // HiHat every other
    if (s % 2 === 0) {
       this.playHiHat(time);
    }
  }

  // --- Synthesis Helpers ---

  private playTone(time: number, freq: number, type: OscillatorType, dur: number, vol: number) {
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    
    // Envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + dur);
  }

  private playKick(time: number) {
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  private playSnare(time: number) {
    const bufferSize = this.ctx!.sampleRate * 0.1;
    const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
    }
    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    noise.start(time);
  }

  private playHiHat(time: number) {
     const bufferSize = this.ctx!.sampleRate * 0.05;
     const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) {
         data[i] = (Math.random() * 2 - 1);
     }
     const noise = this.ctx!.createBufferSource();
     noise.buffer = buffer;
     const filter = this.ctx!.createBiquadFilter();
     filter.type = 'highpass';
     filter.frequency.value = 5000;
     const gain = this.ctx!.createGain();
     gain.gain.setValueAtTime(0.15, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
     noise.connect(filter);
     filter.connect(gain);
     gain.connect(this.masterGain!);
     noise.start(time);
  }

  // --- SFX ---

  playPlaceBomb() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.linearRampToValueAtTime(440, time + 0.05);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0, time + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  playExplosion() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.linearRampToValueAtTime(0, time + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    noise.start(time);
  }

  playPowerup() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    // Arpeggio up
    [440, 554, 659, 880].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time + i*0.06);
        gain.gain.setValueAtTime(0.1, time + i*0.06);
        gain.gain.linearRampToValueAtTime(0, time + i*0.06 + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(time + i*0.06);
        osc.stop(time + i*0.06 + 0.06);
    });
  }

  playDeath() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(10, time + 0.5);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0, time + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.5);
  }
  
  playWin() {
    if (!this.ctx || this.isMuted) return;
    const time = this.ctx.currentTime;
    // Victory fanfare
    const notes = [523.25, 523.25, 523.25, 659.25, 783.99, 1046.50];
    const times = [0, 0.15, 0.3, 0.45, 0.6, 0.9];
    notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, time + times[i]);
        gain.gain.exponentialRampToValueAtTime(0.001, time + times[i] + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(time + times[i]);
        osc.stop(time + times[i] + 0.3);
    });
  }
}

export const audioService = new AudioController();