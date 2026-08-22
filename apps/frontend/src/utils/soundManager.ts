class SoundManager {
  private ctx: AudioContext | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  public seVolume: number = 0.5;
  public bgmVolume: number = 0.5;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  // Plays a simple beep
  private playTone(freq: number, type: OscillatorType, duration: number, volMultiplier: number = 1) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.seVolume === 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    // Simple envelope to avoid clicks
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.seVolume * volMultiplier * 0.5, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Plays an arpeggio (sequence of notes)
  private playArpeggio(freqs: number[], type: OscillatorType, stepDuration: number, volMultiplier: number = 1) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.seVolume === 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqs[0], this.ctx.currentTime);
    
    let time = this.ctx.currentTime;
    for (let i = 1; i < freqs.length; i++) {
      time += stepDuration;
      osc.frequency.setValueAtTime(freqs[i], time);
    }

    const totalDuration = freqs.length * stepDuration;

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.seVolume * volMultiplier * 0.5, this.ctx.currentTime + 0.01);
    gain.gain.setValueAtTime(this.seVolume * volMultiplier * 0.5, this.ctx.currentTime + totalDuration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + totalDuration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + totalDuration);
  }

  public playSe(type: 'move' | 'rotate' | 'drop' | 'clear' | 'tetris' | 'gameover' | 'test' | 'hold') {
    switch (type) {
      case 'move':
        this.playTone(400, 'square', 0.05, 0.3);
        break;
      case 'rotate':
        this.playTone(600, 'square', 0.05, 0.4);
        break;
      case 'hold':
        this.playTone(300, 'sawtooth', 0.08, 0.4);
        break;
      case 'drop':
        this.playTone(150, 'square', 0.1, 0.8);
        break;
      case 'clear':
        // C5, E5, G5, C6
        this.playArpeggio([523.25, 659.25, 783.99, 1046.50], 'square', 0.08, 0.6);
        break;
      case 'tetris':
        // C5, D5, E5, F5, G5, A5, B5, C6
        this.playArpeggio([523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50], 'square', 0.05, 0.7);
        break;
      case 'gameover':
        // Descending dissonant notes
        this.playArpeggio([300, 280, 250, 200, 150, 100, 50], 'sawtooth', 0.15, 0.8);
        break;
      case 'test':
        this.playTone(880, 'square', 0.1, 0.5);
        break;
    }
  }

  public setVolumes(se: number, bgm: number) {
    this.seVolume = Math.max(0, Math.min(1, se));
    this.bgmVolume = Math.max(0, Math.min(1, bgm));
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.bgmVolume;
    }
  }

  public playBgm(url: string = '/sounds/bgm.mp3') {
    if (this.bgmVolume === 0) return;
    
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(url);
      this.bgmAudio.loop = true;
    } else if (this.bgmAudio.src && !this.bgmAudio.src.includes(url)) {
      this.bgmAudio.src = url;
    }
    
    this.bgmAudio.volume = this.bgmVolume;
    this.bgmAudio.play().catch(err => {
      // Browsers may block auto-play until user interaction
      console.warn('BGM auto-play prevented. Needs user interaction first.', err);
    });
  }

  public stopBgm() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }
}

export const soundManager = new SoundManager();
