type Role = 'customer' | 'agent' | 'admin';
type ToolType = 'read' | 'write';

interface ToolDefinition {
  name: string;
  type: ToolType;
}

const TOOL_REGISTRY: ToolDefinition[] = [
  { name: 'search_policy_documents', type: 'read' },
  { name: 'check_claim_status', type: 'read' },
  { name: 'list_claims', type: 'read' },
  { name: 'get_customer_profile', type: 'read' },
  // Write tools intentionally not registered for customer-facing AI
  // { name: 'approve_claim', type: 'write' },
  // { name: 'update_policy', type: 'write' },
];

const ROLE_PERMISSIONS: Record<Role, ToolType[]> = {
  customer: ['read'],
  agent: ['read', 'write'],
  admin: ['read', 'write'],
};

export function checkToolAccess(
  role: Role,
  toolName: string
): { allowed: boolean; reason?: string } {
  const toolDef = TOOL_REGISTRY.find((t) => t.name === toolName);

  if (!toolDef) {
    return { allowed: false, reason: `Tool '${toolName}' is not registered` };
  }

  const allowedTypes = ROLE_PERMISSIONS[role];
  if (!allowedTypes.includes(toolDef.type)) {
    return {
      allowed: false,
      reason: `Role '${role}' does not have '${toolDef.type}' access`,
    };
  }

  return { allowed: true };
}

export function getAvailableTools(role: Role): ToolDefinition[] {
  const allowedTypes = ROLE_PERMISSIONS[role];
  return TOOL_REGISTRY.filter((t) => allowedTypes.includes(t.type));
}
