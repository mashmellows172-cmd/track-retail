'use client';

import CameraTrialsPanel from '@/components/CameraTrialsPanel';
import ReceiptMetricsPanel from '@/components/ReceiptMetricsPanel';

export default function PruebasPage() {
  return (
    <div className="flex flex-col gap-6">
      <CameraTrialsPanel />
      <ReceiptMetricsPanel />
    </div>
  );
}
