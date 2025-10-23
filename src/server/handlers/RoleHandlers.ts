import type { MultiContextBrowser } from "../../runtime/MultiContextBrowser.js";
import type { RolesConfiguration } from "../../types.js";

export class RoleHandlers {
  constructor(
    private browser: MultiContextBrowser,
    private rolesConfig: RolesConfiguration | null
  ) {}

  async handleGetCurrentRole() {
    const currentRole = this.browser.getCurrentRole();
    return {
      content: [
        {
          type: "text",
          text: `Current role: ${currentRole}`,
        },
      ],
    };
  }

  async handleListRoles() {
    const currentRole = this.browser.getCurrentRole();
    let output = "Available roles:\n";

    // If we have roles configuration from MCP, use that
    if (this.rolesConfig && this.rolesConfig.roles) {
      const configuredRoles = Object.keys(this.rolesConfig.roles);

      if (configuredRoles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Available roles: none (configured in MCP)",
            },
          ],
        };
      }

      output += "\n🔧 Configured roles (from MCP):\n";
      const sortedConfigRoles = [...configuredRoles].sort();

      for (const role of sortedConfigRoles) {
        const isCurrent = role === currentRole;
        const roleConfig = this.rolesConfig.roles[role];
        output += `• ${role}${isCurrent ? " (current)" : ""}\n`;
        output += `  📁 Auth file: ${roleConfig.authPath}\n`;
        if (roleConfig.defaultUrl) {
          output += `  🌐 Default URL: ${roleConfig.defaultUrl}\n`;
        } else {
          output += `  🌐 Default URL: (none)\n`;
        }
      }
    }

    // Also show any manually added roles (from bridge usage)
    const manualRoles = this.browser.listRoles();
    const configuredRoleNames = this.rolesConfig
      ? Object.keys(this.rolesConfig.roles)
      : [];
    const manualOnlyRoles = manualRoles.filter(
      (role) => !configuredRoleNames.includes(role)
    );

    if (manualOnlyRoles.length > 0) {
      output += "\n🖥️ Active roles (from bridge usage):\n";
      const sortedManualRoles = [...manualOnlyRoles].sort();

      for (const role of sortedManualRoles) {
        const isCurrent = role === currentRole;
        output += `• ${role}${isCurrent ? " (current)" : ""}\n`;
      }
    }

    // If no roles at all
    if (
      (!this.rolesConfig || Object.keys(this.rolesConfig.roles).length === 0) &&
      manualRoles.length === 0
    ) {
      return {
        content: [
          {
            type: "text",
            text: "Available roles: none",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: output.trim(),
        },
      ],
    };
  }

  async handleSelectRole(args: { role: string }) {
    const { role } = args;
    await this.browser.selectRole(role);
    return {
      content: [
        {
          type: "text",
          text: `Switched to role: ${role}`,
        },
      ],
    };
  }
}
