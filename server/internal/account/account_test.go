package account

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

func newTestStore(t *testing.T) (*Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	return NewStore(redis.NewClient(&redis.Options{Addr: mr.Addr(), MaxRetries: -1})), mr
}

func signIn(t *testing.T, s *Store, sub string) (string, User) {
	t.Helper()
	tok, err := s.SignIn(ctx, "google", sub, time.UnixMilli(42))
	if err != nil {
		t.Fatal(err)
	}
	u, ok, err := s.SessionUser(ctx, tok)
	if !ok || err != nil {
		t.Fatal(ok, err)
	}
	return tok, u
}

func TestSignInCreatesTheUserOnce(t *testing.T) {
	s, mr := newTestStore(t)
	tok1, u1 := signIn(t, s, "g1")
	tok2, u2 := signIn(t, s, "g1")
	if u1.ID != u2.ID || tok1 == tok2 || u1.Pseudo != "" {
		t.Errorf("same Google account: %+v, %+v; want one user, two sessions", u1, u2)
	}
	if mr.HGet("user:"+u1.ID, "google") != "g1" || mr.HGet("user:"+u1.ID, "created") != "42" {
		t.Error("the user must remember its Google account and creation time")
	}
	if ttl := mr.TTL("session:" + tok1); ttl != SessionTTL {
		t.Errorf("session TTL = %v", ttl)
	}
	if _, u3 := signIn(t, s, "g2"); u3.ID == u1.ID {
		t.Error("another Google account must be another user")
	}
}

func TestSignInKeepsProvidersApart(t *testing.T) {
	s, mr := newTestStore(t)
	_, g := signIn(t, s, "1")
	tok, err := s.SignIn(ctx, "discord", "1", time.UnixMilli(42))
	if err != nil {
		t.Fatal(err)
	}
	d, _, _ := s.SessionUser(ctx, tok)
	if d.ID == g.ID || mr.HGet("user:"+d.ID, "discord") != "1" {
		t.Errorf("the same id at Discord and Google must be two users: %+v, %+v", d, g)
	}
	if err := s.Delete(ctx, tok); err != nil || mr.Exists("discord:1") || !mr.Exists("google:1") {
		t.Errorf("deleting the Discord account frees its key only: %v", err)
	}
}

func TestSessionUserUnknown(t *testing.T) {
	s, mr := newTestStore(t)
	if _, ok, err := s.SessionUser(ctx, "nope"); ok || err != nil {
		t.Errorf("unknown session: %v, %v", ok, err)
	}
	_ = mr.Set("session:orphan", "gone")
	if _, ok, err := s.SessionUser(ctx, "orphan"); ok || err != nil {
		t.Errorf("session of a deleted user: %v, %v", ok, err)
	}
}

func TestEndSession(t *testing.T) {
	s, _ := newTestStore(t)
	tok, _ := signIn(t, s, "g1")
	if err := s.EndSession(ctx, tok); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.SessionUser(ctx, tok); ok {
		t.Error("signed out: the session must be gone")
	}
}

func TestSetPseudo(t *testing.T) {
	s, mr := newTestStore(t)
	a, ua := signIn(t, s, "a")
	b, _ := signIn(t, s, "b")
	if err := s.SetPseudo(ctx, a, "Élodie_42"); err != nil {
		t.Fatal(err)
	}
	if u, _, _ := s.SessionUser(ctx, a); u.Pseudo != "Élodie_42" {
		t.Errorf("pseudo = %q", u.Pseudo)
	}
	if err := s.SetPseudo(ctx, b, "élodie_42"); !errors.Is(err, ErrPseudoTaken) {
		t.Errorf("same pseudo, other case: %v; want taken", err)
	}
	if err := s.SetPseudo(ctx, a, "ÉLODIE_42"); err != nil {
		t.Errorf("changing the case of one's own pseudo: %v", err)
	}
	if err := s.SetPseudo(ctx, a, "Pixel"); err != nil {
		t.Fatal(err)
	}
	if mr.Exists("pseudo:élodie_42") {
		t.Error("the previous pseudo must be freed")
	}
	if err := s.SetPseudo(ctx, b, "élodie_42"); err != nil {
		t.Errorf("a freed pseudo can be taken: %v", err)
	}
	if got, _ := mr.Get("pseudo:pixel"); got != ua.ID {
		t.Errorf("pseudo:pixel = %q", got)
	}
}

func TestSetPseudoRefusals(t *testing.T) {
	s, mr := newTestStore(t)
	tok, _ := signIn(t, s, "a")
	for _, p := range []string{"ab", "un pseudo", "abcdefghijklmnopqrstu", "<b>", ""} {
		if err := s.SetPseudo(ctx, tok, p); !errors.Is(err, ErrPseudoInvalid) {
			t.Errorf("%q: %v; want invalid", p, err)
		}
	}
	if err := s.SetPseudo(ctx, "nope", "Pixel"); !errors.Is(err, ErrNoSession) {
		t.Errorf("without a session: %v", err)
	}
	mr.Close()
	if err := s.SetPseudo(ctx, tok, "Pixel"); err == nil {
		t.Error("Redis down: an error was expected")
	}
}

func TestDelete(t *testing.T) {
	s, mr := newTestStore(t)
	tok, u := signIn(t, s, "a")
	other, _ := signIn(t, s, "a") // a second device
	_ = s.SetPseudo(ctx, tok, "Pixel")
	if err := s.Delete(ctx, tok); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"user:" + u.ID, "google:a", "pseudo:pixel", "session:" + tok} {
		if mr.Exists(k) {
			t.Errorf("%s must be deleted", k)
		}
	}
	if _, ok, _ := s.SessionUser(ctx, other); ok {
		t.Error("the other sessions must stop working")
	}
	if err := s.Delete(ctx, tok); !errors.Is(err, ErrNoSession) {
		t.Errorf("deleting twice: %v", err)
	}
	if _, u2 := signIn(t, s, "a"); u2.ID == u.ID {
		t.Error("signing in again after deletion starts a new account")
	}
	tok3, _ := signIn(t, s, "b") // never chose a pseudo
	if err := s.Delete(ctx, tok3); err != nil {
		t.Error(err)
	}
}

func TestRedisDown(t *testing.T) {
	s, mr := newTestStore(t)
	mr.Close()
	if _, err := s.SignIn(ctx, "google", "a", time.Now()); err == nil {
		t.Error("SignIn: an error was expected")
	}
	if _, _, err := s.SessionUser(ctx, "t"); err == nil {
		t.Error("SessionUser: an error was expected")
	}
}

func TestPseudos(t *testing.T) {
	s, mr := newTestStore(t)
	tok, u := signIn(t, s, "a")
	_ = s.SetPseudo(ctx, tok, "Minou")
	_, noPseudo := signIn(t, s, "b")
	got, err := s.Pseudos(ctx, []string{u.ID, noPseudo.ID, "deleted", ""})
	if err != nil || len(got) != 4 || got[0] != "Minou" || got[1] != "" || got[2] != "" || got[3] != "" {
		t.Errorf("pseudos = %q, %v", got, err)
	}
	_ = mr.Set("user:broken", "not a hash")
	if _, err := s.Pseudos(ctx, []string{"broken"}); err == nil {
		t.Error("a Redis error must be returned")
	}
}

func TestSetBanned(t *testing.T) {
	s, _ := newTestStore(t)
	tok, u := signIn(t, s, "a")
	_ = s.SetPseudo(ctx, tok, "Minou")
	if err := s.SetBanned(ctx, "minou", true); err != nil {
		t.Fatal(err)
	}
	if b, _, _ := s.SessionUser(ctx, tok); !b.Banned || !s.Banned(ctx, u.ID) {
		t.Error("the owner of the pseudo, any case, must be banned")
	}
	if err := s.SetBanned(ctx, "Minou", false); err != nil {
		t.Fatal(err)
	}
	if b, _, _ := s.SessionUser(ctx, tok); b.Banned || s.Banned(ctx, u.ID) {
		t.Error("the ban must be lifted")
	}
	if err := s.SetBanned(ctx, "personne", true); !errors.Is(err, ErrNoPseudo) {
		t.Errorf("unknown pseudo: %v; want ErrNoPseudo", err)
	}
}
