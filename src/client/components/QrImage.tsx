import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function QrImage({ value, size = 220, label }: { value: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1f24', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div className="qr-placeholder" style={{ width: size, height: size }} />;
  return <img className="qr" src={src} width={size} height={size} alt={label ?? value} />;
}
