// Beep sintetizzati via WebAudio (nessun asset audio), con mute persistente.
// L'AudioContext è lazy: creato solo dentro inizia(), da chiamare al primo
// user gesture (i browser bloccano l'audio prima di un gesto).
// Se l'AudioContext non esiste o fallisce, tutto è no-op silenzioso.

import { caricaMute, salvaMute } from '@/core/storage';

let ctx: AudioContext | null = null;

export function inizia(): void {
  const AC = globalThis.AudioContext;
  if (ctx === null) {
    if (typeof AC !== 'function') return;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
  }
  // Riprendi se sospeso (politiche di autoplay).
  void ctx.resume().catch(() => undefined);
}

export function beep(freq: number, durata: number, tipo: OscillatorType = 'square'): void {
  if (mute() || ctx === null) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Envelope breve (~5 ms) per evitare click di accensione/spegnimento.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.005);
    gain.gain.linearRampToValueAtTime(0.0001, t + durata);
    osc.type = tipo;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durata + 0.01);
  } catch {
    // Degrado silenzioso: l'audio non deve mai rompere il gioco.
  }
}

// La fonte di verità è lo storage (games:mute): ogni chiamata legge il
// valore corrente, così mute resta coerente anche se modificato altrove.
export function mute(): boolean {
  return caricaMute();
}

export function setMute(v: boolean): void {
  salvaMute(v);
}
