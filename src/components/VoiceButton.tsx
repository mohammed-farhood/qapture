/**
 * VoiceButton — say it instead of typing it.
 *
 * WHY THIS EARNS ITS PLACE
 * ------------------------
 * The single most valuable field in a report is the one people leave empty,
 * and they leave it empty because typing is work. A client who would write
 * "button broken" will happily SAY three sentences about what they expected,
 * why it matters, and what they were trying to do — and those three sentences
 * are the difference between an agent fixing the right thing and an agent
 * inventing an interpretation.
 *
 * It matters more in Arabic than in English. Typing Arabic on a laptop
 * keyboard is slow enough that people switch to transliterated English or give
 * up on detail; speaking it is not.
 *
 * HOW IT WORKS, AND WHAT IT COSTS
 * -------------------------------
 * The browser's own SpeechRecognition. Nothing is uploaded by this widget,
 * there is no API key, and no audio is stored — the recogniser returns text
 * and the audio is gone. (Chrome does send audio to Google's service to do the
 * recognition; that is the browser's behaviour, not ours, and it is why this
 * is a button the tester presses rather than something always listening.)
 *
 * Support is uneven — Chrome and Edge yes, Safari partially, Firefox no — so
 * this renders NOTHING at all where it is unsupported, rather than a dead
 * control that makes the tool look broken.
 *
 * Text is APPENDED to whatever is in the box, never replacing it, so dictating
 * into a half-typed sentence adds to it. Interim results are shown live and
 * replaced by the final text, so the tester can see it is listening.
 */

import { useEffect, useRef, useState } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

// The API is prefixed in Chrome and unprefixed in the spec; neither is typed
// in lib.dom, so this is the minimum shape we actually use.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type Ctor = new () => SpeechRecognitionLike;

function recogniser(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether dictation exists in this browser at all. */
export function voiceSupported(): boolean {
  return recogniser() !== null;
}

export default function VoiceButton({
  onText,
  onInterim,
}: {
  /** Called with a finished phrase, to be appended to the field. */
  onText: (text: string) => void;
  /** Called with the in-progress phrase, for a live preview. */
  onInterim?: (text: string) => void;
}) {
  const { lang, t } = useQa();
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<SpeechRecognitionLike | null>(null);

  // Stop listening if the card goes away mid-phrase, or the microphone stays
  // live behind a closed panel.
  useEffect(() => () => { ref.current?.abort(); ref.current = null; }, []);

  const Ctor = recogniser();
  if (!Ctor) return null;

  const stop = () => {
    ref.current?.stop();
    ref.current = null;
    setListening(false);
    onInterim?.('');
  };

  const start = () => {
    if (listening) { stop(); return; }
    setFailed(null);
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      setFailed(t('voice_failed'));
      return;
    }
    // Arabic testers get Iraqi Arabic; everyone else gets the page's language.
    rec.lang = lang === 'ar' ? 'ar-IQ' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let done = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) done += text; else partial += text;
      }
      if (done.trim()) onText(done.trim());
      onInterim?.(partial);
    };
    rec.onerror = (e) => {
      // 'no-speech' and 'aborted' are ordinary: the tester paused, or pressed
      // stop. Only a real refusal is worth a message.
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        setFailed(e.error === 'not-allowed' ? t('voice_denied') : t('voice_failed'));
      }
      setListening(false);
      onInterim?.('');
    };
    rec.onend = () => { setListening(false); onInterim?.(''); };

    try {
      rec.start();
      ref.current = rec;
      setListening(true);
    } catch {
      setFailed(t('voice_failed'));
    }
  };

  return (
    <span className="qa-inline-flex qa-items-center qa-gap-1.5">
      <button
        type="button"
        onClick={start}
        aria-pressed={listening}
        title={listening ? t('voice_stop') : t('voice_start')}
        data-qa-voice={listening ? 'listening' : 'idle'}
        className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-11 qa-focus-ring ${
          listening ? 'qa-bg-danger-tint qa-text-danger' : 'qa-bg-2 qa-text-mid'
        }`}
        style={{ cursor: 'pointer' }}
      >
        <Icon name={listening ? 'Square' : 'Mic'} size={12} />
        {listening ? t('voice_stop') : t('voice_start')}
      </button>
      {failed && <span className="qa-text-10 qa-text-danger">{failed}</span>}
    </span>
  );
}
