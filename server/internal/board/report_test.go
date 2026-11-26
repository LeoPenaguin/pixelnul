package board

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

func TestReportsAreListedNewestFirstUntilDismissed(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	for i, id := range []string{"a", "b", "c"} {
		if err := s.AddReport(ctx, &Report{ID: id, Reason: "hate", At: int64(i)}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.DeleteReport(ctx, "b"); err != nil {
		t.Fatal(err)
	}
	got, err := s.Reports(ctx)
	if err != nil || len(got) != 2 || got[0].ID != "c" || got[1].ID != "a" {
		t.Errorf("reports = %+v, %v; want c then a", got, err)
	}
}

func TestReportsAreCapped(t *testing.T) {
	s, _ := newTestStore(t)
	ctx := context.Background()
	for i := range MaxReports {
		_ = s.AddReport(ctx, &Report{ID: strconv.Itoa(i)})
	}
	if err := s.AddReport(ctx, &Report{ID: "one more"}); !errors.Is(err, ErrTooManyReports) {
		t.Errorf("err = %v; want ErrTooManyReports", err)
	}
}

func TestReportsRedisErrors(t *testing.T) {
	s, mr := newTestStore(t)
	ctx := context.Background()
	_ = mr.Set(reportsKey, "not a hash")
	if err := s.AddReport(ctx, &Report{ID: "a"}); err == nil {
		t.Error("AddReport: want an error")
	}
	if _, err := s.Reports(ctx); err == nil {
		t.Error("Reports: want an error")
	}
	if err := s.DeleteReport(ctx, "a"); err == nil {
		t.Error("DeleteReport: want an error")
	}
	mr.Del(reportsKey)
	mr.HSet(reportsKey, "a", "not json")
	if _, err := s.Reports(ctx); err == nil {
		t.Error("Reports of a corrupt report: want an error")
	}
}
