package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/LeoPenaguin/pixels/server/internal/account"
)

const (
	sessionCookie = "session"
	stateCookie   = "oauth_state"
)

// Google configures "Sign in with Google" (OpenID Connect, authorization code flow). Only the
// account id is requested (scope "openid"): no e-mail, no name. Without it (nil), sign-in is off
// and anyone can paint, counted by IP, as before accounts existed.
type Google struct {
	ClientID, Secret string
	PublicURL        string // where the site is served, e.g. https://pixels.example; the callback is under it
	AuthURL          string // overridable for tests
	TokenURL         string
}

func (g *Google) redirectURI() string {
	return strings.TrimSuffix(g.PublicURL, "/") + "/api/auth/callback"
}

func (g *Google) secure() bool { return strings.HasPrefix(g.PublicURL, "https://") }

// sub exchanges an authorization code for the Google account id.
func (g *Google) sub(ctx context.Context, code string) (string, error) {
	form := url.Values{
		"code": {code}, "client_id": {g.ClientID}, "client_secret": {g.Secret},
		"redirect_uri": {g.redirectURI()}, "grant_type": {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = res.Body.Close() }()
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if derr := json.NewDecoder(res.Body).Decode(&tok); derr != nil || res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint: %d %w", res.StatusCode, derr)
	}
	// The ID token comes straight from Google over TLS, so its signature need not be checked
	// (OpenID Connect Core, 3.1.3.7); its audience still must be us.
	parts := strings.Split(tok.IDToken, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed id token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("id token: %w", err)
	}
	var claims struct{ Sub, Aud string }
	if jerr := json.Unmarshal(payload, &claims); jerr != nil || claims.Sub == "" || claims.Aud != g.ClientID {
		return "", fmt.Errorf("id token claims: %w", jerr)
	}
	return claims.Sub, nil
}

func (s *Server) cookie(w http.ResponseWriter, name, value string, maxAge int) {
	//nolint:gosec // G124: Secure follows PUBLIC_URL, so that sign-in also works over plain HTTP in dev
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: s.google.secure(), SameSite: http.SameSiteLaxMode,
	})
}

// login sends the browser to Google, with a random state kept in a cookie against forged callbacks.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)
	s.cookie(w, stateCookie, state, 600)
	q := url.Values{
		"client_id": {s.google.ClientID}, "redirect_uri": {s.google.redirectURI()},
		"response_type": {"code"}, "scope": {"openid"}, "state": {state}, "prompt": {"select_account"},
	}
	http.Redirect(w, r, s.google.AuthURL+"?"+q.Encode(), http.StatusFound)
}

// callback finishes the sign-in: opens a session and goes back to the board.
func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	state, err := r.Cookie(stateCookie)
	if err != nil || state.Value == "" || r.FormValue("state") != state.Value {
		http.Error(w, "bad state", http.StatusBadRequest)
		return
	}
	s.cookie(w, stateCookie, "", -1)
	if r.FormValue("error") != "" { // cancelled on Google's page
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	sub, err := s.google.sub(r.Context(), r.FormValue("code"))
	if err != nil {
		http.Error(w, "google sign-in failed", http.StatusBadGateway)
		return
	}
	tok, err := s.accounts.SignIn(r.Context(), sub, s.now())
	if err != nil {
		http.Error(w, "redis error", http.StatusInternalServerError)
		return
	}
	s.cookie(w, sessionCookie, tok, int(account.SessionTTL.Seconds()))
	http.Redirect(w, r, "/", http.StatusFound)
}

// session returns the session token of a request ("" if none).
func session(r *http.Request) string {
	if c, err := r.Cookie(sessionCookie); err == nil {
		return c.Value
	}
	return ""
}

// user returns the signed-in user of a request; false if anonymous (or Redis failed: same effect).
func (s *Server) user(r *http.Request) (account.User, bool) {
	u, ok, _ := s.accounts.SessionUser(r.Context(), session(r))
	return u, ok
}

// me returns the signed-in user, or null.
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if u, ok := s.user(r); ok {
		writeJSON(w, u)
		return
	}
	writeJSON(w, nil)
}

// accountError answers the error of an account operation; false if there was none.
func accountError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, account.ErrNoSession):
		http.Error(w, err.Error(), http.StatusUnauthorized)
	case errors.Is(err, account.ErrPseudoInvalid):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, account.ErrPseudoTaken):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, "redis error", http.StatusInternalServerError)
	}
	return true
}

// setPseudo chooses or changes the pseudo: {"pseudo": "…"}.
func (s *Server) setPseudo(w http.ResponseWriter, r *http.Request) {
	var body struct{ Pseudo string }
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad body", http.StatusBadRequest)
		return
	}
	if !accountError(w, s.accounts.SetPseudo(r.Context(), session(r), strings.TrimSpace(body.Pseudo))) {
		w.WriteHeader(http.StatusNoContent)
	}
}

// logout ends the session of this browser.
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	_ = s.accounts.EndSession(r.Context(), session(r))
	s.cookie(w, sessionCookie, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

// deleteMe deletes the account; its past paints stay, anonymous.
func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) {
	if !accountError(w, s.accounts.Delete(r.Context(), session(r))) {
		s.logout(w, r)
	}
}
