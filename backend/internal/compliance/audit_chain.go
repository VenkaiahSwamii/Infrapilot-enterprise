package compliance

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

var chainMutex sync.Mutex

// CalculateRecordHash computes the SHA-256 digest binding a record to its predecessor
func CalculateRecordHash(prevHash string, seq int64, orgID, userID, action, resType, resID, ip, details string, ts time.Time) string {
	payload := fmt.Sprintf("%s|%d|%s|%s|%s|%s|%s|%s|%s|%d",
		prevHash,
		seq,
		orgID,
		userID,
		action,
		resType,
		resID,
		ip,
		details,
		ts.UTC().UnixNano(),
	)
	hashBytes := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(hashBytes[:])
}

// AppendChainedAuditRecord atomically appends a new audit record linked to the previous record's hash
func AppendChainedAuditRecord(db *gorm.DB, orgID, userID, username, action, resType, resID, ip, details string) (*models.ImmutableAuditRecord, error) {
	if db == nil {
		return nil, errors.New("database connection is nil")
	}

	chainMutex.Lock()
	defer chainMutex.Unlock()

	var lastRecord models.ImmutableAuditRecord
	prevHash := GenesisHash
	var seq int64 = 1

	err := db.Where("organization_id = ? OR organization_id = ''", orgID).
		Order("sequence_num desc, created_at desc").
		First(&lastRecord).Error

	if err == nil {
		prevHash = lastRecord.CurrentHash
		seq = lastRecord.SequenceNum + 1
	}

	now := time.Now().UTC()
	currentHash := CalculateRecordHash(prevHash, seq, orgID, userID, action, resType, resID, ip, details, now)

	record := &models.ImmutableAuditRecord{
		ID:             uuid.New(),
		OrganizationID: orgID,
		UserID:         userID,
		Username:       username,
		Action:         action,
		ResourceType:   resType,
		ResourceID:     resID,
		SourceIP:       ip,
		SequenceNum:    seq,
		PrevHash:       prevHash,
		CurrentHash:    currentHash,
		TamperDetected: false,
		DetailsJSON:    details,
		CreatedAt:      now,
	}

	if err := db.Create(record).Error; err != nil {
		return nil, fmt.Errorf("failed to insert chained audit record: %w", err)
	}

	return record, nil
}

// ChainVerificationResult provides comprehensive report of audit log integrity
type ChainVerificationResult struct {
	TotalRecords     int       `json:"total_records"`
	ValidRecords     int       `json:"valid_records"`
	TamperedRecords  int       `json:"tampered_records"`
	IsChainIntact    bool      `json:"is_chain_intact"`
	BrokenAtSequence int64     `json:"broken_at_sequence,omitempty"`
	BrokenRecordID   string    `json:"broken_record_id,omitempty"`
	VerificationTime time.Time `json:"verification_time"`
	Details          string    `json:"details"`
}

// VerifyAuditChain traverses the entire immutable audit chain and validates cryptographic continuity
func VerifyAuditChain(db *gorm.DB, orgID string) (*ChainVerificationResult, error) {
	if db == nil {
		return nil, errors.New("database connection is nil")
	}

	var records []models.ImmutableAuditRecord
	query := db.Order("sequence_num asc, created_at asc")
	if orgID != "" {
		query = query.Where("organization_id = ? OR organization_id = ''", orgID)
	}

	if err := query.Find(&records).Error; err != nil {
		return nil, fmt.Errorf("failed to query audit records: %w", err)
	}

	res := &ChainVerificationResult{
		TotalRecords:     len(records),
		ValidRecords:     0,
		TamperedRecords:  0,
		IsChainIntact:    true,
		VerificationTime: time.Now().UTC(),
		Details:          "Audit chain verified: all cryptographic hashes intact.",
	}

	if len(records) == 0 {
		res.Details = "No audit records found in chain."
		return res, nil
	}

	expectedPrevHash := GenesisHash

	for i, r := range records {
		// 1. Check parent linkage
		if i == 0 {
			// Genesis block must match genesis hash or recorded prev hash
			expectedPrevHash = r.PrevHash
		} else if r.PrevHash != expectedPrevHash {
			res.IsChainIntact = false
			res.TamperedRecords++
			res.BrokenAtSequence = r.SequenceNum
			res.BrokenRecordID = r.ID.String()
			res.Details = fmt.Sprintf("Broken parent link at sequence %d (Record ID: %s): expected %s, found %s",
				r.SequenceNum, r.ID.String(), expectedPrevHash[:12], r.PrevHash[:12])
			// Flag in DB if needed
			_ = db.Model(&models.ImmutableAuditRecord{}).Where("id = ?", r.ID).Update("tamper_detected", true)
			break
		}

		// 2. Recompute current hash
		recomputed := CalculateRecordHash(r.PrevHash, r.SequenceNum, r.OrganizationID, r.UserID, r.Action, r.ResourceType, r.ResourceID, r.SourceIP, r.DetailsJSON, r.CreatedAt)
		if recomputed != r.CurrentHash {
			res.IsChainIntact = false
			res.TamperedRecords++
			res.BrokenAtSequence = r.SequenceNum
			res.BrokenRecordID = r.ID.String()
			res.Details = fmt.Sprintf("Content payload tampering at sequence %d (Record ID: %s): hash mismatch",
				r.SequenceNum, r.ID.String())
			_ = db.Model(&models.ImmutableAuditRecord{}).Where("id = ?", r.ID).Update("tamper_detected", true)
			break
		}

		res.ValidRecords++
		expectedPrevHash = r.CurrentHash
	}

	return res, nil
}
