import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Button } from './Button';
import { Badge } from './Badge';
import { Sheet } from './Sheet';
import { CameraCapture, type CameraStep } from './CameraCapture';
import { useInventory } from '../api/InventoryContext';
import {
  scanCard,
  updateItem,
  deleteItem,
  findDuplicate,
  matchLabel,
  matchBadgeVariant,
  type InventoryItem,
  type PackagingType,
} from '../api/inventory';
import styles from './ScanFab.module.css';

type ViewState = 'idle' | 'camera' | 'fallback-pending' | 'scanning' | 'duplicate' | 'confirm' | 'error';

function cameraSupported(): boolean {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export interface ScanFabProps {
  packagingType: PackagingType;
}

export function ScanFab({ packagingType }: ScanFabProps) {
  const navigate = useNavigate();
  const { items, addItem, updateItemLocal } = useInventory();
  const [view, setView] = useState<ViewState>('idle');
  const [cameraStep, setCameraStep] = useState<CameraStep>('front');
  const [errorMsg, setErrorMsg] = useState('');
  const [scanResult, setScanResult] = useState<InventoryItem | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<InventoryItem | null>(null);

  const pendingMainRef = useRef<Blob | File | null>(null);
  const fallbackFrontInput = useRef<HTMLInputElement>(null);
  const fallbackBackInput = useRef<HTMLInputElement>(null);

  function handleFabClick() {
    if (cameraSupported()) {
      pendingMainRef.current = null;
      setCameraStep('front');
      setView('camera');
    } else {
      fallbackFrontInput.current?.click();
    }
  }

  function handleCameraCapture(blob: Blob, step: CameraStep) {
    if (step === 'front') {
      pendingMainRef.current = blob;
      setCameraStep('back');
    } else {
      setView('scanning');
      void submitScan(pendingMainRef.current!, blob);
    }
  }

  function handleCameraSkip() {
    setView('scanning');
    void submitScan(pendingMainRef.current!, null);
  }

  function handleCameraClose() {
    pendingMainRef.current = null;
    setView('idle');
  }

  function handleFallbackFront(file: File | undefined) {
    if (!file) return;
    pendingMainRef.current = file;
    setView('fallback-pending');
  }

  function handleFallbackBack(file: File | undefined) {
    setView('scanning');
    void submitScan(pendingMainRef.current!, file ?? null);
  }

  async function submitScan(main: Blob | File, base: Blob | File | null) {
    try {
      const newItem = await scanCard(main, packagingType, base);
      pendingMainRef.current = null;
      const dupe = findDuplicate(newItem, items ?? []);
      setScanResult(newItem);
      if (dupe) {
        setDuplicateMatch(dupe);
        setView('duplicate');
      } else {
        setView('confirm');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setView('error');
    }
  }

  function resetToIdle() {
    setView('idle');
    setScanResult(null);
    setDuplicateMatch(null);
    setErrorMsg('');
    if (fallbackFrontInput.current) fallbackFrontInput.current.value = '';
    if (fallbackBackInput.current) fallbackBackInput.current.value = '';
  }

  async function handleDuplicateSkip() {
    if (scanResult) await deleteItem(scanResult.id).catch(() => {});
    resetToIdle();
  }

  async function handleDuplicateAdd() {
    if (!scanResult || !duplicateMatch) return;
    const updated = await updateItem(duplicateMatch.id, { quantity: duplicateMatch.quantity + 1 });
    updateItemLocal(updated);
    await deleteItem(scanResult.id).catch(() => {});
    resetToIdle();
  }

  async function handleReject() {
    if (scanResult) await deleteItem(scanResult.id).catch(() => {});
    resetToIdle();
  }

  function handleAdd() {
    if (scanResult) addItem(scanResult);
    resetToIdle();
  }

  function handleEdit() {
    if (scanResult) {
      addItem(scanResult);
      navigate(`/item/${scanResult.id}`);
    }
    setView('idle');
    setScanResult(null);
    setDuplicateMatch(null);
    setErrorMsg('');
  }

  return (
    <>
      <button className={styles.fab} onClick={handleFabClick} aria-label="Scan a car">
        <Icon name="cameraAdd01" size={26} />
      </button>

      <input
        ref={fallbackFrontInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFallbackFront(e.target.files?.[0])}
      />
      <input
        ref={fallbackBackInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFallbackBack(e.target.files?.[0])}
      />

      {view === 'camera' && (
        <CameraCapture
          step={cameraStep}
          packagingType={packagingType}
          onCapture={handleCameraCapture}
          onSkip={handleCameraSkip}
          onClose={handleCameraClose}
        />
      )}

      {view === 'fallback-pending' && (
        <div className={styles.fallbackBar}>
          <Button variant="text" onClick={() => handleFallbackBack(undefined)}>
            Skip
          </Button>
          <Button variant="tonal" onClick={() => fallbackBackInput.current?.click()}>
            + Back photo
          </Button>
        </div>
      )}

      <Sheet open={view === 'scanning'} dismissible={false}>
        <div className={styles.scanningBody}>
          <Icon name="scan" size={32} className={styles.scanningIcon} />
          <span className={styles.scanningLabel}>SCANNING</span>
        </div>
      </Sheet>

      <Sheet open={view === 'error'} onClose={resetToIdle}>
        <h2 className={styles.sheetTitle}>Scan failed</h2>
        <p className={styles.sheetText}>{errorMsg}</p>
        <Button variant="filled" onClick={resetToIdle}>
          OK
        </Button>
      </Sheet>

      <Sheet open={view === 'duplicate'} onClose={handleDuplicateSkip}>
        {duplicateMatch && (
          <>
            <h2 className={styles.sheetTitle}>Already in your collection</h2>
            <p className={styles.sheetText}>
              You already have {duplicateMatch.quantity} of{' '}
              <strong>{duplicateMatch.castingName}</strong>. Add this scan to the total, or skip it?
            </p>
            <div className={styles.sheetActions}>
              <Button variant="text" onClick={handleDuplicateSkip}>
                Skip
              </Button>
              <Button variant="filled" onClick={handleDuplicateAdd}>
                Add to total
              </Button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={view === 'confirm'} onClose={handleReject}>
        {scanResult && (
          <>
            <h2 className={styles.sheetTitle}>{scanResult.castingName || 'Unrecognized item'}</h2>
            <p className={styles.sheetText}>
              {[scanResult.brand, scanResult.carMake, scanResult.year].filter(Boolean).join(' · ')}
            </p>
            <div className={styles.matchRow}>
              <Badge variant={matchBadgeVariant(scanResult.matchStatus)}>{matchLabel(scanResult)}</Badge>
            </div>
            {scanResult.matchNotes && <p className={styles.sheetText}>{scanResult.matchNotes}</p>}
            {scanResult.price != null && (
              <p className={styles.sheetText}>Recommended: ${scanResult.price.toFixed(2)}</p>
            )}
            <div className={styles.sheetActions}>
              <Button variant="text" onClick={handleReject}>
                Reject
              </Button>
              <Button variant="outlined" onClick={handleEdit}>
                Edit
              </Button>
              <Button variant="filled" onClick={handleAdd}>
                Add
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
