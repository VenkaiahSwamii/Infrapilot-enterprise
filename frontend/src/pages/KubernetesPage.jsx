import React from 'react';
import KubernetesTab from '../features/machines/tabs/KubernetesTab.jsx';

export default function KubernetesPage() {
  return (
    <div className="kubernetes-page" style={{ padding: '0px' }}>
      <KubernetesTab machine={null} />
    </div>
  );
}
