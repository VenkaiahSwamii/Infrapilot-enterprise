package scrubber

import (
	"regexp"
)

var (
	// emailRegex matches standard email formats
	emailRegex = regexp.MustCompile(`(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`)

	// ipv4Regex matches IPv4 addresses (basic pattern)
	ipv4Regex = regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`)

	// ccRegex matches 16-digit credit card numbers (with or without dashes/spaces)
	ccRegex = regexp.MustCompile(`\b(?:\d[ -]*?){13,16}\b`)
)

// Scrub removes or masks sensitive PII data like Emails, IPv4 addresses, and Credit Cards from the input string.
func Scrub(input string) string {
	scrubbed := input

	// Redact Credit Cards first because they are just numbers and less prone to false positives than simple IPs
	scrubbed = ccRegex.ReplaceAllString(scrubbed, "[CC REDACTED]")

	// Redact Email addresses, but ignore systemd service names that look like emails (e.g. user@1000.service)
	scrubbed = emailRegex.ReplaceAllStringFunc(scrubbed, func(match string) string {
		if len(match) > 8 && match[len(match)-8:] == ".service" {
			return match
		}
		return "[EMAIL REDACTED]"
	})

	// Redact IPv4 addresses
	scrubbed = ipv4Regex.ReplaceAllString(scrubbed, "[IP REDACTED]")

	return scrubbed
}
