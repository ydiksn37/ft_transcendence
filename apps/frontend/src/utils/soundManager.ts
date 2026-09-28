class SoundManager {
  private ctx: AudioContext | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private pendingBgmUrl: string | null = null;
  private waitingForInteraction = false;
  private interactionReceived = false;
  public seVolume: number = 0.5;
  public bgmVolume: number = 0.5;

  private init(): AudioContext | null {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  private hasUserActivation() {
    if (this.interactionReceived) return true;
    const activation = (navigator as Navigator & {
      userActivation?: { hasBeenActive: boolean };
    }).userActivation;
    return activation?.hasBeenActive === true;
  }

  private removeInteractionListeners() {
    if (!this.waitingForInteraction) return;
    window.removeEventListener('pointerdown', this.handleUserInteraction, true);
    window.removeEventListener('keydown', this.handleUserInteraction, true);
    window.removeEventListener('touchstart', this.handleUserInteraction, true);
    this.waitingForInteraction = false;
  }

  private handleUserInteraction = () => {
    this.interactionReceived = true;
    this.removeInteractionListeners();

    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }

    const pendingBgmUrl = this.pendingBgmUrl;
    if (pendingBgmUrl) {
      this.pendingBgmUrl = null;
      this.startBgm(pendingBgmUrl);
    }
  };

  private waitForUserInteraction() {
    if (this.waitingForInteraction) return;
    this.waitingForInteraction = true;
    window.addEventListener('pointerdown', this.handleUserInteraction, true);
    window.addEventListener('keydown', this.handleUserInteraction, true);
    window.addEventListener('touchstart', this.handleUserInteraction, true);
  }

  private withRunningContext(play: (ctx: AudioContext) => void) {
    if (!this.hasUserActivation()) {
      this.waitForUserInteraction();
      return;
    }

    const ctx = this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume()
        .then(() => play(ctx))
        .catch(() => this.waitForUserInteraction());
      return;
    }
    play(ctx);
  }

  // Plays a simple beep
  private playTone(freq: number, type: OscillatorType, duration: number, volMultiplier: number = 1) {
    if (this.seVolume === 0) return;

    this.withRunningContext((ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Simple envelope to avoid clicks
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.seVolume * volMultiplier * 0.5, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    });
  }

  // Plays an arpeggio (sequence of notes)
  private playArpeggio(freqs: number[], type: OscillatorType, stepDuration: number, volMultiplier: number = 1) {
    if (this.seVolume === 0) return;

    this.withRunningContext((ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqs[0], ctx.currentTime);

      let time = ctx.currentTime;
      for (let i = 1; i < freqs.length; i++) {
        time += stepDuration;
        osc.frequency.setValueAtTime(freqs[i], time);
      }

      const totalDuration = freqs.length * stepDuration;

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.seVolume * volMultiplier * 0.5, ctx.currentTime + 0.01);
      gain.gain.setValueAtTime(this.seVolume * volMultiplier * 0.5, ctx.currentTime + totalDuration - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + totalDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + totalDuration);
    });
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

    if (!this.hasUserActivation()) {
      this.pendingBgmUrl = url;
      this.waitForUserInteraction();
      return;
    }
    this.startBgm(url);
  }

  private startBgm(url: string) {
    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(url);
      this.bgmAudio.loop = true;
    } else if (this.bgmAudio.src && !this.bgmAudio.src.includes(url)) {
      this.bgmAudio.src = url;
    }
    
    this.bgmAudio.volume = this.bgmVolume;
    this.bgmAudio.play().catch(err => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        this.pendingBgmUrl = url;
        this.waitForUserInteraction();
        return;
      }
      this.pendingBgmUrl = null;
    });
  }

  public stopBgm() {
    this.pendingBgmUrl = null;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }
}

export const soundManager = new SoundManager();
