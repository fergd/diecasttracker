import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import styles from './CameraCapture.module.css';

export type CameraStep = 'front' | 'back';

export interface CameraCaptureProps {
  step: CameraStep;
  packagingType: 'carded' | 'loose';
  onCapture: (blob: Blob, step: CameraStep) => void;
  onSkip: () => void;
  onClose: () => void;
}

/** Full-screen in-app camera: front then back, auto-advancing after each
 * shutter tap with a brief freeze-frame + checkmark so the fast transition
 * doesn't read as a failed capture. Requires a secure context - the FAB
 * decides whether to render this or fall back to a native <input capture>. */
export function CameraCapture({ step, packagingType, onCapture, onSkip, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.();
        setTorchSupported(!!caps && 'torch' in caps);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not access the camera.');
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode]);

  useEffect(() => {
    return () => {
      if (frozenFrame) URL.revokeObjectURL(frozenFrame);
    };
  }, [frozenFrame]);

  function captureFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video) return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
  }

  async function handleShutter() {
    const blob = await captureFrame();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setFrozenFrame(url);
    await new Promise((r) => setTimeout(r, 350));
    setFrozenFrame(null);
    onCapture(blob, step);
  }

  async function handleFlip() {
    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
  }

  async function handleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      /* torch toggle unsupported mid-stream on this device - ignore */
    }
  }

  const backLabel = packagingType === 'loose' ? 'Base' : 'Back';
  const stepLabel = step === 'front' ? 'Front' : backLabel;

  return (
    <div className={styles.overlay}>
      <div className={styles.topBar}>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close">
          <Icon name="cancel01" size={20} />
        </button>
        <span className={styles.stepLabel}>{stepLabel}</span>
        {step === 'back' ? (
          <button className={styles.textButton} onClick={onSkip}>
            Skip
          </button>
        ) : (
          <span className={styles.spacer} />
        )}
      </div>

      <div className={styles.viewport}>
        <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
        {frozenFrame && (
          <div className={styles.freezeFrame}>
            <img src={frozenFrame} alt="" />
            <div className={styles.checkmark}>
              <Icon name="tick02" size={32} />
            </div>
          </div>
        )}
        {error && <div className={styles.errorBanner}>{error}</div>}
      </div>

      <div className={styles.bottomBar}>
        {torchSupported ? (
          <button className={styles.iconButton} onClick={handleTorch} aria-label="Toggle flash">
            <Icon name={torchOn ? 'flashOff' : 'flash'} size={22} />
          </button>
        ) : (
          <span className={styles.spacer} />
        )}
        <button className={styles.shutter} onClick={handleShutter} aria-label="Capture" />
        <button className={styles.iconButton} onClick={handleFlip} aria-label="Flip camera">
          <Icon name="switchCamera" size={22} />
        </button>
      </div>
    </div>
  );
}
