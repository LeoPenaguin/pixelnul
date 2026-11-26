package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/LeoPenaguin/pixels/server/internal/board"

	"golang.org/x/time/rate"
)

func TestReportsReachTheAdminsUntilDismissed(t *testing.T) {
	e, adminTok, kevinTok := adminEnv(t)
	if res := request(t, http.MethodPost, e.url+"/api/reports", `{"x":3,"y":-4,"reason":"hate","comment":"  une croix  "}`, "session="+kevinTok); res.code != http.StatusNoContent {
		t.Fatalf("report = %d %s", res.code, res.body)
	}
	if res := request(t, http.MethodPost, e.url+"/api/reports", `{"x":0,"y":0,"reason":"bug","comment":"rien ne charge"}`); res.code != http.StatusNoContent {
		t.Fatalf("signed-out report = %d %s", res.code, res.body)
	}
	if res := request(t, http.MethodGet, e.url+"/api/admin/reports", "", "session="+kevinTok); res.code != http.StatusForbidden {
		t.Errorf("a player listing the reports = %d; want 403", res.code)
	}
	res := request(t, http.MethodGet, e.url+"/api/admin/reports", "", "session="+adminTok)
	var list []board.Report
	if err := json.Unmarshal([]byte(res.body), &list); err != nil || len(list) != 2 {
		t.Fatalf("reports = %s, %v", res.body, err)
	}
	byReason := map[string]board.Report{list[0].Reason: list[0], list[1].Reason: list[1]}
	if r := byReason["hate"]; r.X != 3 || r.Y != -4 || r.Comment != "une croix" || r.By != "Kevin" || r.At != 42 || r.ID == "" {
		t.Errorf("hate report = %+v", r)
	}
	if r := byReason["bug"]; r.By != "" {
		t.Errorf("signed-out report by %q; want anonymous", r.By)
	}
	id := byReason["hate"].ID
	if res := request(t, http.MethodDelete, e.url+"/api/admin/reports/"+id, "", "session="+kevinTok); res.code != http.StatusForbidden {
		t.Errorf("a player dismissing = %d; want 403", res.code)
	}
	if res := request(t, http.MethodDelete, e.url+"/api/admin/reports/"+id, "", "session="+adminTok); res.code != http.StatusNoContent {
		t.Errorf("dismiss = %d", res.code)
	}
	if list, _ := e.s.store.Reports(context.Background()); len(list) != 1 || list[0].Reason != "bug" {
		t.Errorf("left = %+v; want the bug only", list)
	}
}

func TestReportRefusals(t *testing.T) {
	e, _, _ := adminEnv(t, unlimitedReports)
	long := strings.Repeat("é", maxComment+1)
	for _, c := range []struct {
		body string
		want int
	}{
		{`pas du json`, http.StatusBadRequest},
		{`{"x":640,"y":0,"reason":"hate"}`, http.StatusBadRequest},
		{`{"x":0,"y":0,"reason":"meh"}`, http.StatusBadRequest},
		{`{"x":0,"y":0,"reason":"other","comment":"  "}`, http.StatusBadRequest},
		{`{"x":0,"y":0,"reason":"bug"}`, http.StatusBadRequest},
		{`{"x":0,"y":0,"reason":"hate","comment":"` + long + `"}`, http.StatusBadRequest},
		{`{"x":0,"y":0,"reason":"sexual"}`, http.StatusNoContent},
	} {
		if res := request(t, http.MethodPost, e.url+"/api/reports", c.body); res.code != c.want {
			t.Errorf("%.40s = %d; want %d", c.body, res.code, c.want)
		}
	}
}

// unlimitedReports lifts the per-IP report limit: every test request comes from the same IP.
func unlimitedReports(s *Server) { s.reportQuotas = newQuotas(1, rate.Inf) }

func TestReportsAreLimitedPerIP(t *testing.T) {
	e, _, _ := adminEnv(t)
	body := `{"x":0,"y":0,"reason":"hate"}`
	for i := range reportsBurst {
		if res := request(t, http.MethodPost, e.url+"/api/reports", body); res.code != http.StatusNoContent {
			t.Fatalf("report %d = %d", i, res.code)
		}
	}
	if res := request(t, http.MethodPost, e.url+"/api/reports", body); res.code != http.StatusTooManyRequests {
		t.Errorf("one report too many = %d; want 429", res.code)
	}
}

func TestReportsAreCappedWhilePending(t *testing.T) {
	e, _, _ := adminEnv(t, unlimitedReports)
	body := `{"x":0,"y":0,"reason":"hate"}`
	for i := range board.MaxReports {
		_ = e.s.store.AddReport(context.Background(), &board.Report{ID: strconv.Itoa(i)})
	}
	if res := request(t, http.MethodPost, e.url+"/api/reports", body); res.code != http.StatusServiceUnavailable {
		t.Errorf("report while full = %d; want 503", res.code)
	}
}

func TestReportsRedisErrors(t *testing.T) {
	e, adminTok, _ := adminEnv(t, unlimitedReports)
	_ = e.mr.Set("reports", "not a hash")
	if res := request(t, http.MethodPost, e.url+"/api/reports", `{"x":0,"y":0,"reason":"hate"}`); res.code != http.StatusInternalServerError {
		t.Errorf("report = %d; want 500", res.code)
	}
	if res := request(t, http.MethodGet, e.url+"/api/admin/reports", "", "session="+adminTok); res.code != http.StatusInternalServerError {
		t.Errorf("list = %d; want 500", res.code)
	}
	if res := request(t, http.MethodDelete, e.url+"/api/admin/reports/x", "", "session="+adminTok); res.code != http.StatusInternalServerError {
		t.Errorf("dismiss = %d; want 500", res.code)
	}
}
