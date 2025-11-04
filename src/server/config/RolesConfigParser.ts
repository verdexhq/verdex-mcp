import { existsSync } from "fs";
import type { RolesConfiguration, RoleConfig } from "../../runtime/types.js";

export class RolesConfigParser {
  static parse(): RolesConfiguration | null {
    try {
      const roles: Record<string, RoleConfig> = {};
      const args = process.argv;

      // Parse --role <name> <auth_path> [default_url] arguments
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--role" && i + 2 < args.length) {
          const roleName = args[i + 1];
          const authPath = args[i + 2];
          const potentialDefaultUrl = args[i + 3]; // May be undefined

          if (typeof roleName !== "string" || roleName.trim() === "") {
            throw new Error(`Invalid role name: must be a non-empty string`);
          }

          if (typeof authPath !== "string" || authPath.trim() === "") {
            throw new Error(
              `Invalid auth file path for role "${roleName}": must be a non-empty string`
            );
          }

          // Check if the auth file exists (basic validation)
          try {
            if (!existsSync(authPath)) {
              console.warn(
                `⚠️ Warning: Auth file not found for role "${roleName}": ${authPath}`
              );
            }
          } catch (fsError) {
            console.warn(
              `⚠️ Warning: Could not verify auth file for role "${roleName}": ${authPath}`
            );
          }

          // Handle optional default URL
          let defaultUrl: string | undefined = undefined;
          let argsToSkip = 2; // By default, skip role name and auth path

          if (
            potentialDefaultUrl &&
            typeof potentialDefaultUrl === "string" &&
            potentialDefaultUrl.trim() !== ""
          ) {
            // Check if it's a valid URL
            try {
              new URL(potentialDefaultUrl);
              defaultUrl = potentialDefaultUrl;
              argsToSkip = 3; // Skip role name, auth path, and default URL
              console.log(
                `📍 Default URL configured for role "${roleName}": ${defaultUrl}`
              );
            } catch (urlError) {
              // Not a valid URL - might be the next --role flag or other argument
              // Don't treat it as a default URL, just skip 2 arguments
              console.log(
                `ℹ️ No default URL for role "${roleName}" (3rd argument not a valid URL)`
              );
            }
          } else {
            console.log(`ℹ️ No default URL configured for role "${roleName}"`);
          }

          roles[roleName] = {
            authPath: authPath,
            defaultUrl: defaultUrl,
          };
          i += argsToSkip; // Skip the processed arguments
        }
      }

      if (Object.keys(roles).length > 0) {
        console.log(
          `✅ Loaded roles configuration: ${Object.keys(roles).join(", ")}`
        );
        return { roles };
      } else {
        console.log(
          "ℹ️ No --role arguments found, using default role management"
        );
        return null;
      }
    } catch (error) {
      console.error("❌ Failed to parse role arguments:", error);
      return null;
    }
  }
}
