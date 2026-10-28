import { apiClient } from './client.js';

export const sreApi = {
  // Query SRE Engine using deterministic natural language parser
  query: async (queryText) => {
    try {
      const response = await apiClient.post('/sre/query', { query: queryText });
      return response.data;
    } catch (err) {
      if (err.response?.data) {
        return err.response.data;
      }
      throw err;
    }
  },

  // Fetch live dependency topology graph
  getTopology: async () => {
    const response = await apiClient.get('/sre/topology');
    return response.data;
  },

  // Time Travel metric & log comparison
  compareTimeTravel: async (payload) => {
    const response = await apiClient.post('/sre/time-travel', payload);
    return response.data;
  },

  // Google SRE SLI/SLO evaluation & multi-window burn rate
  evaluateSLO: async (payload) => {
    const response = await apiClient.post('/sre/slo/evaluate', payload);
    return response.data;
  },

  // Configuration drift comparison
  compareDrift: async (payload) => {
    const response = await apiClient.post('/sre/drift/compare', payload);
    return response.data;
  },

  // Incident post-mortem report generation
  generatePostMortem: async (payload) => {
    const response = await apiClient.post('/sre/postmortem/generate', payload);
    return response.data;
  },

  // Trigger manual topology sync from database
  triggerSync: async () => {
    const response = await apiClient.post('/sre/sync');
    return response.data;
  },
};
