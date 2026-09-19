import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE,
});

// Add token automatically
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

// Default export for deploy.js and other axios-based files
export default apiClient;

// Compatibility helpers for older files
export async function apiGet(path, config = {}) {
  const response = await apiClient.get(path, config);
  return response.data;
}

export async function apiPost(path, body, config = {}) {
  const response = await apiClient.post(path, body, config);
  return response.data;
}

export async function apiPut(path, body, config = {}) {
  const response = await apiClient.put(path, body, config);
  return response.data;
}

export async function apiPatch(path, body, config = {}) {
  const response = await apiClient.patch(path, body, config);
  return response.data;
}

export async function apiDelete(path, config = {}) {
  const response = await apiClient.delete(path, config);
  return response.data;
}
