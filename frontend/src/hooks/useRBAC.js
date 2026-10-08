import { useMemo } from 'react';
import { useUserProfile } from '../components/layout/Layout.jsx';

/**
 * useRBAC hook for role-based authorization in InfraPilot Enterprise.
 * Normalizes roles: SuperAdmin, Admin, OrgAdmin, DevOps, Operator, Viewer.
 */
export function useRBAC() {
  const userProfile = useUserProfile();
  const storedRole = localStorage.getItem('user_role');
  const rawRole = userProfile?.role || storedRole || 'Viewer';
  const role = String(rawRole).trim().toLowerCase();

  return useMemo(() => {
    const isSuperAdmin = role.includes('superadmin');
    const isAdmin = isSuperAdmin || role.includes('admin') || role.includes('orgadmin');
    const isDevOps = role.includes('devops');
    const isOperator = isAdmin || isDevOps || role.includes('operator');
    const isViewer = !isAdmin && !isOperator;

    const can = (action) => {
      switch (action) {
        // SuperAdmin / Admin only: Destructive operations, remote terminal, system governance
        case 'delete_server':
        case 'delete_machine':
        case 'uninstall_agent':
        case 'execute_terminal':
        case 'manage_users':
        case 'manage_orgs':
        case 'manage_backups':
        case 'manage_settings':
        case 'block_server':
        case 'rotate_keys':
        case 'deploy_agent':
        case 'manage_sre_policies':
          return isAdmin;

        // Operator + Admin: Operational actions, service lifecycle, container actions, remediations
        case 'restart_service':
        case 'start_service':
        case 'stop_service':
        case 'manage_containers':
        case 'auto_remediate':
        case 'ack_alert':
        case 'resolve_alert':
        case 'manage_alert_rules':
        case 'run_automation':
        case 'trigger_scans':
          return isOperator;

        // Read-only actions: Available to all authenticated users (including Viewer)
        case 'view_dashboards':
        case 'view_servers':
        case 'view_metrics':
        case 'view_alerts':
        case 'view_logs':
        case 'view_traces':
        case 'view_apm':
        case 'view_docker':
        case 'view_kubernetes':
        case 'view_reports':
          return true;

        default:
          return false;
      }
    };

    return {
      role: rawRole,
      isSuperAdmin,
      isAdmin,
      isDevOps,
      isOperator,
      isViewer,
      can,
    };
  }, [role, rawRole]);
}

export default useRBAC;
