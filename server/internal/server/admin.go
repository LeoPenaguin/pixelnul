package server

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/LeoPenaguin/pixelnul/server/internal/board"
)

// ponytail: one fill is broadcast as one batch (~12 bytes a pixel per client): capped at a chunk's
// area. Bigger fills → tell the clients to reload the chunks instead.
const maxFill = board.ChunkSize * board.ChunkSize

// admin tells if the signed-in user is an admin; otherwise it answers 403.
func (s *Server) admin(w http.ResponseWriter, r *http.Request) bool {
	u, ok := s.user(r)
	if !ok || !s.opts.Admins[u.ID] {
		http.Error(w, "admins only", http.StatusForbidden)
		return false
	}
	return true
}

// fill paints a rectangle, corners included: {"x0","y0","x1","y1","c"}, in any corner order.
func (s *Server) fill(w http.ResponseWriter, r *http.Request) {
	if !s.admin(w, r) {
		return
	}
	var b struct{ X0, Y0, X1, Y1, C int }
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&b); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	x0, x1, y0, y1 := min(b.X0, b.X1), max(b.X0, b.X1), min(b.Y0, b.Y1), max(b.Y0, b.Y1)
	if !(board.Pixel{X: x0, Y: y0, C: b.C}).Valid() || !board.InWorld(x1, y1) {
		http.Error(w, "outside the world or not a colour", http.StatusBadRequest)
		return
	}
	if (x1-x0+1)*(y1-y0+1) > maxFill {
		http.Error(w, "too big", http.StatusRequestEntityTooLarge)
		return
	}
	s.paintMu.Lock()
	defer s.paintMu.Unlock()
	if err := s.store.Fill(r.Context(), x0, y0, x1, y1, b.C); err != nil {
		http.Error(w, "redis error", http.StatusInternalServerError)
		return
	}
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			s.hub.queue(board.Pixel{X: x, Y: y, C: b.C})
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// ban bans the account owning a pseudo, or lifts the ban: {"pseudo", "banned"}.
func (s *Server) ban(w http.ResponseWriter, r *http.Request) {
	if !s.admin(w, r) {
		return
	}
	var b struct {
		Pseudo string
		Banned bool
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&b); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if !accountError(w, s.accounts.SetBanned(r.Context(), strings.TrimSpace(b.Pseudo), b.Banned)) {
		w.WriteHeader(http.StatusNoContent)
	}
}

// maxComment is the longest report description, in characters.
const maxComment = 500

// report stores a report from anyone, signed in or not: {"x", "y", "reason", "comment"}. "other"
// and "bug" need a comment: the reason alone says nothing.
func (s *Server) report(w http.ResponseWriter, r *http.Request) {
	if !s.reportQuotas.get(clientIP(r)).Allow() {
		http.Error(w, "too many reports", http.StatusTooManyRequests)
		return
	}
	var b struct {
		X, Y            int
		Reason, Comment string
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&b); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	b.Comment = strings.TrimSpace(b.Comment)
	if !board.InWorld(b.X, b.Y) || !slices.Contains(board.Reasons, b.Reason) ||
		utf8.RuneCountInString(b.Comment) > maxComment || (b.Comment == "" && (b.Reason == "other" || b.Reason == "bug")) {
		http.Error(w, "bad report", http.StatusBadRequest)
		return
	}
	var by string
	if u, ok := s.user(r); ok {
		by = u.Pseudo
	}
	rep := board.Report{ID: rand.Text(), X: b.X, Y: b.Y, Reason: b.Reason, Comment: b.Comment, By: by, At: s.now().UnixMilli()}
	switch err := s.store.AddReport(r.Context(), &rep); {
	case errors.Is(err, board.ErrTooManyReports):
		http.Error(w, "too many pending reports", http.StatusServiceUnavailable)
	case err != nil:
		http.Error(w, "redis error", http.StatusInternalServerError)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// reports lists the pending reports, newest first.
func (s *Server) reports(w http.ResponseWriter, r *http.Request) {
	if !s.admin(w, r) {
		return
	}
	list, err := s.store.Reports(r.Context())
	if err != nil {
		http.Error(w, "redis error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, list)
}

// dismissReport removes a report once handled.
func (s *Server) dismissReport(w http.ResponseWriter, r *http.Request) {
	if !s.admin(w, r) {
		return
	}
	if err := s.store.DeleteReport(r.Context(), r.PathValue("id")); err != nil {
		http.Error(w, "redis error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
