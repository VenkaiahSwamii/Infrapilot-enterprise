const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

export const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8080/ws`;

export function getWebSocketUrl(customPath = null) {
  let targetUrl = WS_URL;
  if (customPath) {
    if (customPath.startsWith('ws://') || customPath.startsWith('wss://')) {
      targetUrl = customPath;
    } else {
      const cleanPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
      const baseUrl = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:8080`;
      const baseOrigin = baseUrl.replace(/\/ws\/?$/, '');
      targetUrl = `${baseOrigin}${cleanPath}`;
    }
  }

  const token = localStorage.getItem('token');
  if (token) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    return `${targetUrl}${separator}token=${encodeURIComponent(token)}`;
  }
  return targetUrl;
}

export function createLiveEventsSocket(customPath = null) {
  return new WebSocket(getWebSocketUrl(customPath));
}

