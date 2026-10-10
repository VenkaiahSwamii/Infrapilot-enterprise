package scrubber

import (
	"regexp"
	"strings"
)

var (
	// emailRegex matches standard email formats
	emailRegex = regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)

	// ipv4Regex matches IPv4 addresses
	ipv4Regex = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)

	// ccRegex matches 16-digit credit card numbers
	ccRegex = regexp.MustCompile(`\b(?:\d[ -]*?){13,16}\b`)

	// awsKeyRegex matches AWS Access Key IDs
	awsKeyRegex = regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`)

	// jwtRegex matches JSON Web Tokens
	jwtRegex = regexp.MustCompile(`\beyJ[a-zA-Z0-9_-]{8,}\.eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b`)

	// githubTokenRegex matches GitHub personal access tokens
	githubTokenRegex = regexp.MustCompile(`\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b`)

	// gitlabTokenRegex matches GitLab personal access tokens
	gitlabTokenRegex = regexp.MustCompile(`\bglpat-[a-zA-Z0-9\-_]{20,}\b`)

	// dbURIPrefixRegex matches database connection URIs (postgres, mysql, redis, mongodb)
	dbURIPrefixRegex = regexp.MustCompile(`(?i)\b(postgres|postgresql|mysql|mongodb|redis)://([^\s]+)`)

	// privateKeyRegex matches multi-line RSA/DSA/EC/OpenSSH private key blocks
	privateKeyRegex = regexp.MustCompile(`(?s)-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----`)

	// slackWebhookRegex matches Slack webhook URLs
	slackWebhookRegex = regexp.MustCompile(`https://hooks\.slack\.com/services/T[a-zA-Z0-9_]+/B[a-zA-Z0-9_]+/[a-zA-Z0-9_]+`)

	// keyValueSecretRegex matches password/secret parameters in logs (e.g. password="xyz", secret=123)
	keyValueSecretRegex = regexp.MustCompile(`(?i)\b(password|passwd|api_secret|client_secret|auth_token)\s*([:=])\s*(?:"([^"]+)"|'([^']+)'|([^\s,;]+))`)
)

// Scrub deep-cleans sensitive PII, credentials, tokens, DB URIs, and private keys from log streams
func Scrub(input string) string {
	if input == "" {
		return ""
	}
	scrubbed := input

	// 1. Redact multi-line Private Keys first
	scrubbed = privateKeyRegex.ReplaceAllString(scrubbed, "[PRIVATE_KEY_REDACTED]")

	// 2. Redact Database Connection URI Passwords (handles special chars & multiple @ in passwords)
	scrubbed = dbURIPrefixRegex.ReplaceAllStringFunc(scrubbed, func(m string) string {
		schemeEnd := strings.Index(m, "://")
		if schemeEnd == -1 {
			return m
		}
		afterScheme := m[schemeEnd+3:]
		colonIdx := strings.Index(afterScheme, ":")
		if colonIdx == -1 {
			return m
		}
		lastAtIdx := strings.LastIndex(afterScheme, "@")
		if lastAtIdx == -1 || lastAtIdx <= colonIdx {
			return m
		}
		user := afterScheme[:colonIdx]
		rest := afterScheme[lastAtIdx:]
		return m[:schemeEnd+3] + user + ":[PASSWORD_REDACTED]" + rest
	})

	// 3. Redact AWS Access Keys
	scrubbed = awsKeyRegex.ReplaceAllString(scrubbed, "[AWS_KEY_REDACTED]")

	// 4. Redact JWTs
	scrubbed = jwtRegex.ReplaceAllString(scrubbed, "[JWT_REDACTED]")

	// 5. Redact GitHub / GitLab Access Tokens
	scrubbed = githubTokenRegex.ReplaceAllString(scrubbed, "[GH_TOKEN_REDACTED]")
	scrubbed = gitlabTokenRegex.ReplaceAllString(scrubbed, "[GITLAB_TOKEN_REDACTED]")

	// 6. Redact Slack Webhooks
	scrubbed = slackWebhookRegex.ReplaceAllString(scrubbed, "https://hooks.slack.com/services/[WEBHOOK_REDACTED]")

	// 7. Redact Key-Value secret definitions (e.g. password=secret)
	scrubbed = keyValueSecretRegex.ReplaceAllStringFunc(scrubbed, func(m string) string {
		parts := keyValueSecretRegex.FindStringSubmatch(m)
		if len(parts) >= 3 {
			key := parts[1]
			delim := parts[2]
			return key + delim + "[REDACTED]"
		}
		return m
	})

	// 8. Redact Credit Cards
	scrubbed = ccRegex.ReplaceAllString(scrubbed, "[CC REDACTED]")

	// 9. Redact Email addresses, preserving systemd service units (e.g. user@1000.service)
	scrubbed = emailRegex.ReplaceAllStringFunc(scrubbed, func(match string) string {
		if strings.HasSuffix(match, ".service") || strings.HasSuffix(match, ".slice") {
			return match
		}
		return "[EMAIL REDACTED]"
	})

	return scrubbed
}
