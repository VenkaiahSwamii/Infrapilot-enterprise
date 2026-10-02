package synthetic

import (
	"strings"
	"time"

	"infrapilot/backend/internal/database"
	"infrapilot/backend/internal/models"

	"github.com/google/uuid"
)

type OverviewStats struct {
	TotalTests      int64   `json:"total_tests"`
	Healthy         int64   `json:"healthy"`
	Degraded        int64   `json:"degraded"`
	Failed          int64   `json:"failed"`
	AvailabilityPct float64 `json:"availability_pct"`
	AvgResponseMs   float64 `json:"avg_response_ms"`
}

type Repository interface {
	CreateTest(test *models.SyntheticTest) error
	UpdateTest(test *models.SyntheticTest) error
	DeleteTest(id uuid.UUID) error
	GetTestByID(id uuid.UUID) (*models.SyntheticTest, error)
	GetAllTests() ([]models.SyntheticTest, error)
	GetEnabledTests() ([]models.SyntheticTest, error)
	SaveResult(result *models.SyntheticTestResult) error
	GetTestResults(testID uuid.UUID, timeRange string, limit int) ([]models.SyntheticTestResult, error)
	GetOverviewStats() (*OverviewStats, error)
	CalculateAvailability(testID uuid.UUID) (float64, error)
}

type postgresRepository struct{}

func NewRepository() Repository {
	return &postgresRepository{}
}

func (r *postgresRepository) CreateTest(test *models.SyntheticTest) error {
	if database.DB == nil {
		return nil
	}
	if test.ID == uuid.Nil {
		test.ID = uuid.New()
	}
	now := time.Now()
	test.CreatedAt = now
	test.UpdatedAt = now
	if test.Method == "" {
		test.Method = "GET"
	}
	if test.ExpectedStatus <= 0 {
		test.ExpectedStatus = 200
	}
	if test.ResponseTimeThresholdMs <= 0 {
		test.ResponseTimeThresholdMs = 200.0
	}
	if test.TimeoutMs <= 0 {
		test.TimeoutMs = 5000
	}
	if test.IntervalSeconds <= 0 {
		test.IntervalSeconds = 30
	}
	test.LastStatus = "UNKNOWN"
	test.AvailabilityPct = 100.0

	return database.DB.Create(test).Error
}

func (r *postgresRepository) UpdateTest(test *models.SyntheticTest) error {
	if database.DB == nil {
		return nil
	}
	test.UpdatedAt = time.Now()
	return database.DB.Save(test).Error
}

func (r *postgresRepository) DeleteTest(id uuid.UUID) error {
	if database.DB == nil {
		return nil
	}
	database.DB.Where("test_id = ?", id).Delete(&models.SyntheticTestResult{})
	return database.DB.Where("id = ?", id).Delete(&models.SyntheticTest{}).Error
}

func (r *postgresRepository) GetTestByID(id uuid.UUID) (*models.SyntheticTest, error) {
	if database.DB == nil {
		tests := mockTests()
		for _, t := range tests {
			if t.ID == id {
				return &t, nil
			}
		}
		if len(tests) > 0 {
			return &tests[0], nil
		}
		return nil, nil
	}
	var test models.SyntheticTest
	if err := database.DB.Where("id = ?", id).First(&test).Error; err != nil {
		return nil, err
	}
	return &test, nil
}

func (r *postgresRepository) GetAllTests() ([]models.SyntheticTest, error) {
	if database.DB == nil {
		return mockTests(), nil
	}
	var tests []models.SyntheticTest
	if err := database.DB.Order("created_at desc").Find(&tests).Error; err != nil {
		return nil, err
	}
	if len(tests) == 0 {
		return mockTests(), nil
	}
	return tests, nil
}

func (r *postgresRepository) GetEnabledTests() ([]models.SyntheticTest, error) {
	if database.DB == nil {
		return mockTests(), nil
	}
	var tests []models.SyntheticTest
	if err := database.DB.Where("enabled = ?", true).Find(&tests).Error; err != nil {
		return nil, err
	}
	return tests, nil
}

func (r *postgresRepository) SaveResult(result *models.SyntheticTestResult) error {
	if database.DB == nil {
		return nil
	}
	if result.ID == uuid.Nil {
		result.ID = uuid.New()
	}
	if result.Timestamp.IsZero() {
		result.Timestamp = time.Now()
	}

	if err := database.DB.Create(result).Error; err != nil {
		return err
	}

	// Update test summary status in database
	now := result.Timestamp
	avail, _ := r.CalculateAvailability(result.TestID)

	database.DB.Model(&models.SyntheticTest{}).Where("id = ?", result.TestID).Updates(map[string]interface{}{
		"last_status":            result.Status,
		"last_response_time_ms":  result.ResponseTimeMs,
		"last_checked_at":        &now,
		"availability_pct":       avail,
		"updated_at":             now,
	})

	return nil
}

func (r *postgresRepository) GetTestResults(testID uuid.UUID, timeRange string, limit int) ([]models.SyntheticTestResult, error) {
	if database.DB == nil {
		return mockResults(testID), nil
	}
	var results []models.SyntheticTestResult
	db := database.DB.Model(&models.SyntheticTestResult{}).Where("test_id = ?", testID)

	if timeRange != "" && timeRange != "ALL" {
		start := parseRange(timeRange)
		if !start.IsZero() {
			db = db.Where("timestamp >= ?", start)
		}
	}

	if limit <= 0 {
		limit = 100
	}

	if err := db.Order("timestamp desc").Limit(limit).Find(&results).Error; err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return mockResults(testID), nil
	}

	return results, nil
}

func (r *postgresRepository) GetOverviewStats() (*OverviewStats, error) {
	tests, err := r.GetAllTests()
	if err != nil {
		return &OverviewStats{}, err
	}

	stats := &OverviewStats{
		TotalTests: int64(len(tests)),
	}

	var sumLatency float64
	var sumAvail float64
	var countWithLatency int

	for _, t := range tests {
		switch strings.ToUpper(t.LastStatus) {
		case "PASS":
			stats.Healthy++
		case "DEGRADED":
			stats.Degraded++
		case "FAIL", "TIMEOUT", "ERROR":
			stats.Failed++
		default:
			stats.Healthy++
		}

		if t.LastResponseTimeMs > 0 {
			sumLatency += t.LastResponseTimeMs
			countWithLatency++
		}
		sumAvail += t.AvailabilityPct
	}

	if stats.TotalTests > 0 {
		stats.AvailabilityPct = sumAvail / float64(stats.TotalTests)
	} else {
		stats.AvailabilityPct = 100.0
	}

	if countWithLatency > 0 {
		stats.AvgResponseMs = sumLatency / float64(countWithLatency)
	} else {
		stats.AvgResponseMs = 120.0
	}

	return stats, nil
}

func (r *postgresRepository) CalculateAvailability(testID uuid.UUID) (float64, error) {
	if database.DB == nil {
		return 99.85, nil
	}
	var total int64
	var passCount int64

	database.DB.Model(&models.SyntheticTestResult{}).Where("test_id = ?", testID).Count(&total)
	if total == 0 {
		return 100.0, nil
	}

	database.DB.Model(&models.SyntheticTestResult{}).Where("test_id = ? AND status IN ('PASS', 'DEGRADED')", testID).Count(&passCount)
	return (float64(passCount) / float64(total)) * 100.0, nil
}

func parseRange(tr string) time.Time {
	now := time.Now()
	switch strings.ToLower(tr) {
	case "5m":
		return now.Add(-5 * time.Minute)
	case "15m":
		return now.Add(-15 * time.Minute)
	case "30m":
		return now.Add(-30 * time.Minute)
	case "1h":
		return now.Add(-1 * time.Hour)
	case "6h":
		return now.Add(-6 * time.Hour)
	case "24h":
		return now.Add(-24 * time.Hour)
	case "7d":
		return now.Add(-7 * 24 * time.Hour)
	default:
		return time.Time{}
	}
}

func mockTests() []models.SyntheticTest {
	now := time.Now()
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	id3 := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	return []models.SyntheticTest{
		{
			ID:                      id1,
			Name:                    "Backend Health Endpoint",
			URL:                     "https://httpbin.org/get",
			Method:                  "GET",
			ExpectedStatus:          200,
			ResponseTimeThresholdMs: 200,
			TimeoutMs:               5000,
			IntervalSeconds:         30,
			Enabled:                 true,
			LastStatus:              "PASS",
			LastResponseTimeMs:      87.4,
			LastCheckedAt:           &now,
			AvailabilityPct:         99.98,
			CreatedAt:               now.Add(-24 * time.Hour),
		},
		{
			ID:                      id2,
			Name:                    "Payment API Gateway",
			URL:                     "https://httpbin.org/post",
			Method:                  "POST",
			Headers:                 `{"Content-Type":"application/json"}`,
			Body:                    `{"action":"test"}`,
			ExpectedStatus:          200,
			ResponseTimeThresholdMs: 200,
			TimeoutMs:               5000,
			IntervalSeconds:         30,
			Enabled:                 true,
			LastStatus:              "DEGRADED",
			LastResponseTimeMs:      327.1,
			LastCheckedAt:           &now,
			AvailabilityPct:         98.71,
			CreatedAt:               now.Add(-24 * time.Hour),
		},
		{
			ID:                      id3,
			Name:                    "User Auth API",
			URL:                     "https://httpbin.org/status/500",
			Method:                  "GET",
			ExpectedStatus:          200,
			ResponseTimeThresholdMs: 200,
			TimeoutMs:               5000,
			IntervalSeconds:         30,
			Enabled:                 true,
			LastStatus:              "FAIL",
			LastResponseTimeMs:      412.0,
			LastCheckedAt:           &now,
			AvailabilityPct:         94.20,
			CreatedAt:               now.Add(-24 * time.Hour),
		},
	}
}

func mockResults(testID uuid.UUID) []models.SyntheticTestResult {
	now := time.Now()
	return []models.SyntheticTestResult{
		{
			ID:                uuid.New(),
			TestID:            testID,
			Timestamp:         now,
			Status:            "PASS",
			HTTPStatus:        200,
			ResponseTimeMs:    87.4,
			DNSTimeMs:         12.1,
			TLSTimeMs:         24.3,
			TTFBMs:            45.0,
			ValidationPassed:  true,
			ResponseSizeBytes: 1420,
			TargetURL:         "https://httpbin.org/get",
			Method:            "GET",
		},
		{
			ID:                uuid.New(),
			TestID:            testID,
			Timestamp:         now.Add(-30 * time.Second),
			Status:            "PASS",
			HTTPStatus:        200,
			ResponseTimeMs:    92.1,
			DNSTimeMs:         11.8,
			TLSTimeMs:         25.0,
			TTFBMs:            48.1,
			ValidationPassed:  true,
			ResponseSizeBytes: 1420,
			TargetURL:         "https://httpbin.org/get",
			Method:            "GET",
		},
		{
			ID:                uuid.New(),
			TestID:            testID,
			Timestamp:         now.Add(-60 * time.Second),
			Status:            "DEGRADED",
			HTTPStatus:        200,
			ResponseTimeMs:    318.5,
			DNSTimeMs:         45.0,
			TLSTimeMs:         89.0,
			TTFBMs:            160.0,
			ErrorMessage:      "Response time SLA exceeded: 318.5 ms (Threshold: 200 ms)",
			ValidationPassed:  true,
			ResponseSizeBytes: 1420,
			TargetURL:         "https://httpbin.org/get",
			Method:            "GET",
		},
	}
}
