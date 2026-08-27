export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT';
  agent_status?: 'ONLINE' | 'BUSY' | 'OFFLINE';
}
