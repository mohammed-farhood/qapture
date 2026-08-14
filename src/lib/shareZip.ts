/**
 * shareZip.ts — hand a finished campaign to the phone's share sheet.
 *
 * WHY
 * ---
 * On a phone there is no Downloads folder anyone opens. A tester finishing a
 * session on their phone has a file they cannot find and no obvious way to
 * get it to you — which quietly makes phone testing useless, exactly where a
 * lot of real bug-hunting happens.
 *
 * The Web Share API is the native answer: it opens the OS sheet the tester
 * already knows (WhatsApp, Telegram, Mail, Files, AirDrop) with the ZIP
 * attached.
 *
 * THE GESTURE PROBLEM (and why sharing can take two taps)
 * -------------------------------------------------------
 * `navigator.share()` must be called from a user gesture. Building a ZIP with
 * screenshots is asynchronous and can easily take longer than the browser's
 * patience — Safari in particular rejects a share that comes back after too
 * much `await`. So this module treats a rejected-for-gesture share as normal,
 * not as an error: the caller keeps the built blob and shows a "Share now"
 * button, whose click IS a fresh gesture with the file already in hand.
 *
 * Nothing is uploaded anywhere. The file goes from the page to the OS sheet;
 * where it travels next is the tester's choice, exactly like Export.
 */

export type ShareOutcome =
  /** The sheet opened (whether or not the tester picked a target). */
  | { status: 'shared' }
  /** The tester dismissed the sheet. Not an error; don't nag. */
  | { status: 'cancelled' }
  /**
   * The browser refused because too long elapsed since the tap. The blob is
   * good — offer a button that shares it from a fresh gesture.
   */
  | { status: 'needs-gesture' }
  /** Sharing files isn't available here. Fall back to a download. */
  | { status: 'unsupported' };

/** Whether this browser can share an actual file (not just a link). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    // canShare() is the only honest test: several browsers expose share()
    // but refuse files, and a probe File is cheap.
    const probe = new File([new Blob(['x'])], 'probe.zip', { type: 'application/zip' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Offer `blob` to the OS share sheet as `filename`.
 * Never throws — every failure mode is a returned status.
 */
export async function shareZipFile(
  blob: Blob,
  filename: string,
  title: string,
): Promise<ShareOutcome> {
  if (!canShareFiles()) return { status: 'unsupported' };
  try {
    const file = new File([blob], filename, { type: 'application/zip' });
    if (!navigator.canShare({ files: [file] })) return { status: 'unsupported' };
    await navigator.share({ files: [file], title });
    return { status: 'shared' };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    // AbortError = the tester closed the sheet. Their choice, not a failure.
    if (name === 'AbortError') return { status: 'cancelled' };
    // NotAllowedError / SecurityError = the gesture expired while the ZIP was
    // being built. The blob is fine; the caller re-offers it from a fresh tap.
    if (name === 'NotAllowedError' || name === 'SecurityError') return { status: 'needs-gesture' };
    return { status: 'unsupported' };
  }
}
