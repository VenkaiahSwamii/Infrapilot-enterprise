package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

// VerifyHMACSignature verifies if the provided hex-encoded signature matches the HMAC-SHA256 of data using secretKey.
func VerifyHMACSignature(data []byte, signature string, secretKey string) bool {
	if secretKey == "" {
		secretKey = "sre-secret-token-12345"
	}
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write(data)
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expectedSig))
}

// GenerateHMACSignature produces a hex-encoded HMAC-SHA256 signature for data using secretKey.
func GenerateHMACSignature(data []byte, secretKey string) string {
	if secretKey == "" {
		secretKey = "sre-secret-token-12345"
	}
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
