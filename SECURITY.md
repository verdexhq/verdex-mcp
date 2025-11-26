# Security Policy

## Supported Versions

We actively support the following versions of Verdex MCP with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Security Considerations

### Browser Automation Risks

Verdex MCP controls Chrome/Chromium browsers through CDP (Chrome DevTools Protocol). When using Verdex, be aware of:

- **Authentication State**: Storage state files contain session cookies and tokens. Treat these as sensitive credentials.
- **Network Access**: Verdex can navigate to any URL and interact with any webpage the browser can access.
- **Local File Access**: Bridge code runs in isolated JavaScript contexts but can read DOM content.
- **CDP Permissions**: The CDP session has broad browser control capabilities.

### Best Practices

1. **Protect Storage State Files**
   ```bash
   # Never commit auth files to version control
   echo "*.auth.json" >> .gitignore
   echo ".auth/" >> .gitignore
   ```

2. **Review URLs Before Navigation**
   - Validate URLs in production test suites
   - Use allowlists for permitted domains when possible

3. **Isolated Test Environments**
   - Run tests in containerized or sandboxed environments
   - Use separate authentication for test accounts (never production credentials)

4. **Dependency Hygiene**
   - Regularly update dependencies: `npm update`
   - Monitor security advisories for Puppeteer and MCP SDK

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow responsible disclosure:

### How to Report

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities privately via one of these methods:

1. **GitHub Security Advisories** (preferred)
   - Go to https://github.com/verdexhq/verdex-mcp/security/advisories
   - Click "Report a vulnerability"
   - Provide detailed information about the vulnerability

2. **Email** (alternative)
   - Send email to: security@verdexhq.com (if available) or create a draft GitHub Advisory
   - Include "SECURITY" in the subject line
   - Encrypt sensitive details using our PGP key (if provided)

### What to Include

Please include the following information in your report:

- **Description**: Clear description of the vulnerability
- **Impact**: What can an attacker do? What is compromised?
- **Affected Versions**: Which versions are vulnerable?
- **Reproduction Steps**: Detailed steps to reproduce the issue
- **Proof of Concept**: Code, screenshots, or logs demonstrating the issue
- **Suggested Fix**: If you have recommendations (optional)
- **Disclosure Timeline**: Your expectations for public disclosure

### Response Timeline

We aim to respond to security reports according to the following timeline:

| Stage | Timeline |
|-------|----------|
| Initial Response | Within 48 hours |
| Vulnerability Confirmation | Within 7 days |
| Fix Development | Depends on severity (typically 7-30 days) |
| Release & Public Disclosure | After fix is released and users have time to update |

### Severity Classification

We classify vulnerabilities using the following severity levels:

#### Critical
- Remote code execution
- Authentication bypass
- Arbitrary file read/write
- **Response**: Immediate patch release, security advisory

#### High
- XSS or injection vulnerabilities
- Information disclosure (credentials, sensitive data)
- Privilege escalation
- **Response**: Patch within 7 days, security advisory

#### Medium
- Denial of Service
- Limited information disclosure
- Security misconfiguration with workaround
- **Response**: Patch in next minor release, documented in CHANGELOG

#### Low
- Security hardening opportunities
- Best practice violations
- **Response**: Fix in regular development cycle

## Security Updates

Security updates will be released as:

1. **Patch Releases** (e.g., 0.1.5 → 0.1.6)
   - For critical and high severity issues
   - Published immediately to npm
   - Security advisory published on GitHub

2. **Security Advisories**
   - Posted at: https://github.com/verdexhq/verdex-mcp/security/advisories
   - Include CVE identifier (if applicable)
   - List affected versions and remediation steps

3. **Notification Channels**
   - GitHub Security Advisories (automatic)
   - Release notes in CHANGELOG.md
   - GitHub Discussions announcement
   - npm package update notices

## Credit

We believe in recognizing security researchers who help us keep Verdex secure. With your permission, we will:

- Credit you in the security advisory
- Add your name to a security researchers acknowledgments section
- Link to your GitHub profile or website (if desired)

If you prefer to remain anonymous, we will respect that choice.

## Out of Scope

The following are considered out of scope for security vulnerabilities:

- Social engineering attacks targeting Verdex users
- Vulnerabilities in third-party dependencies (report directly to those projects)
- Theoretical vulnerabilities without practical exploit path
- Issues requiring physical access to the machine
- Browser vulnerabilities (report to Chrome/Chromium team)

However, we still appreciate hearing about these issues as they may inform our security guidance.

## Security-Related Configuration

### Restricting Browser Capabilities

You can limit Verdex's browser access in production environments:

```javascript
// Example: Network isolation (theoretical - not yet implemented)
// This is a suggestion for future enhancement
const browser = new MultiContextBrowser({
  allowedDomains: ['app.example.com', 'staging.example.com'],
  blockThirdParty: true
});
```

### Audit Logging

Consider enabling audit logs for security-sensitive operations:

```bash
# Enable detailed logging (for development/debugging only)
DEBUG=verdex:* node dist/index.js
```

## Questions?

If you have questions about this security policy, please:

- Open a GitHub Discussion: https://github.com/verdexhq/verdex-mcp/discussions
- Contact the maintainers via the methods listed above

---

**Last Updated**: November 26, 2025

