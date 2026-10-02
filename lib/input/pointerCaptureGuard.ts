/**
 * pointerCaptureGuard — best-effort Pointer Capture for three.js controls.
 * =========================================================================
 * OrbitControls / TransformControls call `setPointerCapture()` on every
 * pointerdown. If the pointer is already inactive at that point (fast click,
 * touch tap, pointer-lock transition, event replayed by the browser...),
 * the browser throws `InvalidStateError` / `NotFoundError`, which aborts the
 * whole controls handler and can leave the controls stuck.
 *
 * Pointer capture here is purely an optimization (mouse keeps flowing to the
 * canvas outside its bounds during a drag). Swallowing the throw is safe:
 * without capture the drag still works while the pointer stays over canvas.
 */

let patched = false;

export function patchPointerCaptureOnce(): void {
  if (patched) return;
  patched = true;
  if (typeof window === 'undefined' || typeof Element === 'undefined') return;

  const proto = Element.prototype as Element & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };

  if (typeof proto.setPointerCapture === 'function' && !(proto.setPointerCapture as { __guarded?: boolean }).__guarded) {
    const origSet = proto.setPointerCapture;
    const guarded = function (this: Element, pointerId: number): void {
      try {
        origSet.call(this, pointerId);
      } catch {
        // Pointer already inactive — capture is best-effort, ignore.
      }
    };
    (guarded as { __guarded?: boolean }).__guarded = true;
    proto.setPointerCapture = guarded;
  }

  if (typeof proto.releasePointerCapture === 'function' && !(proto.releasePointerCapture as { __guarded?: boolean }).__guarded) {
    const origRelease = proto.releasePointerCapture;
    const guardedRelease = function (this: Element, pointerId: number): void {
      try {
        origRelease.call(this, pointerId);
      } catch {
        // No capture held for this pointer — ignore.
      }
    };
    (guardedRelease as { __guarded?: boolean }).__guarded = true;
    proto.releasePointerCapture = guardedRelease;
  }
}
