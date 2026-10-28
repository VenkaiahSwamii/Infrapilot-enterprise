import Settings from '../features/organization/Settings.jsx';

export default function SettingsPage({ initialTab }) {
  return (
    <Settings
      initialTab={initialTab}
      settings={{
        company_name: '',
        logo_url: '',
        timezone: 'UTC',
        primary_color: '#58a6ff',
        sidebar_color: '#0d1117',
        custom_domain: '',
        license_tier: 'enterprise',
      }}
      onSave={() => {}}
    />
  );
}
