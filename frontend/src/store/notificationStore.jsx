import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client.js';

const NotificationContext = createContext(null);
const STORAGE_KEY = 'infrapilot_default_notification_recipient';

export function NotificationProvider({ children }) {
  const [defaultRecipient, setDefaultRecipientState] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached && cached !== 'infrapilotadmin@gmail.com' && cached !== 'admin@company.com') {
        return cached;
      }
    } catch (_) {}
    return '';
  });

  const [smtpSettings, setSmtpSettings] = useState({
    enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    from_address: '',
    default_recipient: '',
    send_resolved_emails: true,
  });

  const [loading, setLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/notifications/settings');
      if (res?.data) {
        const raw = res.data;
        const recipient = (raw.default_recipient || '').trim();
        const cleanRecipient = (recipient === 'infrapilotadmin@gmail.com' || recipient === 'admin@company.com')
          ? ''
          : recipient;

        setSmtpSettings({
          enabled: raw.enabled ?? false,
          smtp_host: raw.smtp_host || '',
          smtp_port: raw.smtp_port || 587,
          smtp_user: raw.smtp_user || '',
          from_address: raw.from_address || '',
          default_recipient: cleanRecipient,
          send_resolved_emails: raw.send_resolved_emails ?? true,
        });

        if (cleanRecipient) {
          setDefaultRecipientState(cleanRecipient);
          try {
            localStorage.setItem(STORAGE_KEY, cleanRecipient);
          } catch (_) {}
        }
      }
    } catch (_) {
      // Backend offline or fallback to local
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveDefaultRecipient = useCallback(async (newEmail) => {
    const clean = (newEmail || '').trim();
    setDefaultRecipientState(clean);
    try {
      localStorage.setItem(STORAGE_KEY, clean);
    } catch (_) {}

    setSmtpSettings((prev) => ({
      ...prev,
      default_recipient: clean,
    }));

    try {
      await apiClient.patch('/notifications/settings', {
        default_recipient: clean,
      });
      return { success: true, email: clean };
    } catch (err) {
      console.warn('Failed to sync default recipient to server:', err);
      return { success: false, error: err.message, email: clean };
    }
  }, []);

  const saveSmtpSettings = useCallback(async (formData) => {
    const cleanRecipient = (formData.default_recipient || '').trim();
    if (cleanRecipient) {
      setDefaultRecipientState(cleanRecipient);
      try {
        localStorage.setItem(STORAGE_KEY, cleanRecipient);
      } catch (_) {}
    }

    setSmtpSettings((prev) => ({
      ...prev,
      ...formData,
      default_recipient: cleanRecipient,
    }));

    try {
      const res = await apiClient.put('/notifications/settings', formData);
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        defaultRecipient,
        setDefaultRecipient: setDefaultRecipientState,
        saveDefaultRecipient,
        smtpSettings,
        saveSmtpSettings,
        refreshSettings: fetchSettings,
        loading,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationSettings() {
  const context = useContext(NotificationContext);
  if (!context) {
    // Return graceful fallback if context not wrapped
    return {
      defaultRecipient: '',
      setDefaultRecipient: () => {},
      saveDefaultRecipient: async () => ({ success: false }),
      smtpSettings: {},
      saveSmtpSettings: async () => ({ success: false }),
      refreshSettings: () => {},
      loading: false,
    };
  }
  return context;
}
