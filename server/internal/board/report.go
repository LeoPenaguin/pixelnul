package board

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
)

// Report is a player's report of the content around a pixel, or of a bug.
type Report struct {
	ID      string `json:"id"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Reason  string `json:"reason"` // one of Reasons
	Comment string `json:"comment"`
	By      string `json:"by"` // pseudo of the reporter; "" if signed out
	At      int64  `json:"at"` // Unix ms
}

// Reasons a report can give; "bug" is about the site, not the board.
var Reasons = []string{"hate", "sexual", "personal", "other", "bug"}

// MaxReports caps the pending reports: a flood cannot fill Redis.
const MaxReports = 200

// ErrTooManyReports is returned while MaxReports reports are pending.
var ErrTooManyReports = errors.New("too many pending reports")

const reportsKey = "reports" // hash: report id → Report as JSON

// AddReport stores a report until a moderator dismisses it.
// ponytail: the cap is checked then written, not atomically: a burst may exceed it by a few.
func (s *Store) AddReport(ctx context.Context, r *Report) error {
	n, err := s.rdb.HLen(ctx, reportsKey).Result()
	if err != nil {
		return err
	}
	if n >= MaxReports {
		return ErrTooManyReports
	}
	b, _ := json.Marshal(r)
	return s.rdb.HSet(ctx, reportsKey, r.ID, b).Err()
}

// Reports returns the pending reports, newest first.
func (s *Store) Reports(ctx context.Context) ([]Report, error) {
	vals, err := s.rdb.HVals(ctx, reportsKey).Result()
	if err != nil {
		return nil, err
	}
	reports := make([]Report, len(vals))
	for i, v := range vals {
		if err := json.Unmarshal([]byte(v), &reports[i]); err != nil {
			return nil, fmt.Errorf("report: %w", err)
		}
	}
	slices.SortFunc(reports, func(a, b Report) int { return cmp.Compare(b.At, a.At) })
	return reports, nil
}

// DeleteReport dismisses a report; an unknown id is not an error.
func (s *Store) DeleteReport(ctx context.Context, id string) error {
	return s.rdb.HDel(ctx, reportsKey, id).Err()
}
