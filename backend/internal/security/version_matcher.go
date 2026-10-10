package security

import (
	"strconv"
	"strings"
	"unicode"
)

// CompareVersions compares two version strings (Debian, Semver, or numeric).
// Returns:
//   1 if v1 > v2
//  -1 if v1 < v2
//   0 if v1 == v2
func CompareVersions(v1, v2 string) int {
	v1 = strings.TrimSpace(v1)
	v2 = strings.TrimSpace(v2)

	if v1 == v2 {
		return 0
	}
	if v1 == "" {
		return -1
	}
	if v2 == "" {
		return 1
	}

	// 1. Strip and compare Debian epoch prefixes if both have explicit epochs
	hasEpoch1 := strings.Index(v1, ":") != -1
	hasEpoch2 := strings.Index(v2, ":") != -1

	epoch1, v1NoEpoch := extractEpoch(v1)
	epoch2, v2NoEpoch := extractEpoch(v2)

	if hasEpoch1 && hasEpoch2 && epoch1 != epoch2 {
		if epoch1 > epoch2 {
			return 1
		}
		return -1
	}

	// 2. Tokenize upstream version and debian revision
	t1 := tokenizeVersion(v1NoEpoch)
	t2 := tokenizeVersion(v2NoEpoch)

	maxLen := len(t1)
	if len(t2) > maxLen {
		maxLen = len(t2)
	}

	for i := 0; i < maxLen; i++ {
		var chunk1, chunk2 string
		if i < len(t1) {
			chunk1 = t1[i]
		}
		if i < len(t2) {
			chunk2 = t2[i]
		}

		if chunk1 == chunk2 {
			continue
		}

		num1, err1 := strconv.Atoi(chunk1)
		num2, err2 := strconv.Atoi(chunk2)

		if err1 == nil && err2 == nil {
			if num1 != num2 {
				if num1 > num2 {
					return 1
				}
				return -1
			}
		} else {
			// Lexicographical comparison for alphabetic tokens
			if chunk1 > chunk2 {
				return 1
			}
			return -1
		}
	}

	return 0
}

func extractEpoch(v string) (int, string) {
	if idx := strings.Index(v, ":"); idx != -1 {
		if epoch, err := strconv.Atoi(v[:idx]); err == nil {
			return epoch, v[idx+1:]
		}
	}
	return 0, v
}

// tokenizeVersion breaks a version string into alternating numeric and non-numeric chunks.
// e.g. "10.2p1-2ubuntu3.6" -> ["10", ".", "2", "p", "1", "-", "2", "ubuntu", "3", ".", "6"]
func tokenizeVersion(v string) []string {
	var tokens []string
	var current strings.Builder
	var lastIsDigit bool

	for i, r := range v {
		isDigit := unicode.IsDigit(r)
		if i == 0 {
			lastIsDigit = isDigit
			current.WriteRune(r)
			continue
		}

		if isDigit == lastIsDigit {
			current.WriteRune(r)
		} else {
			tokens = append(tokens, current.String())
			current.Reset()
			current.WriteRune(r)
			lastIsDigit = isDigit
		}
	}

	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}
	return tokens
}

// IsVulnerable checks if an installed version is vulnerable according to the fixed version.
// If installed >= fixedVersion, it is NOT vulnerable (returns false).
// If minVulnerable is provided and installed < minVulnerable, it is NOT vulnerable (returns false).
func IsVulnerable(installedVersion, minVulnerable, fixedVersion string) bool {
	if installedVersion == "" {
		return false
	}

	// If minVulnerable is set (e.g. "8.5p1") and installed is older than the vulnerability was introduced
	if minVulnerable != "" && CompareVersions(installedVersion, minVulnerable) < 0 {
		return false
	}

	// If fixedVersion is set and installed is >= fixedVersion, it is patched
	if fixedVersion != "" && CompareVersions(installedVersion, fixedVersion) >= 0 {
		return false
	}

	return true
}
