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
	"time"

	"github.com/LeoPenaguin/pixels/server/internal/account"
)

const (
	sessionCookie = "session"
	stateCookie   = "oauth_state"
)

// Provider is an OAuth 2 sign-in service (authorization code flow). Only the account id is
// requested: no e-mail, no name. Without any provider, sign-in is off and anyone can paint,
// counted by IP, as before accounts existed.
type Provider struct {
	Name             string // route segment and Redis key prefix; one of account.Providers
	ClientID, Secret string
	AuthURL          string
	TokenURL         string
	Scope            string
	Prompt           string // "prompt" parameter of the authorization page
	// UserURL, if set, is read with the access token for the account id ("id", e.g. Discord);
	// otherwise the id is the "sub" of the OpenID Connect ID token (e.g. Google).
	UserURL string
}

// providerClient calls the providers with a deadline: a hanging endpoint must not hold the callback.
var providerClient = &http.Client{Timeout: 10 * time.Second}

func (p *Provider) redirectURI(publicURL string) string {
	return strings.TrimSuffix(publicURL, "/") + "/api/auth/" + p.Name + "/callback"
}

// call sends a request and decodes its JSON answer, which must be a 200.
func call(req *http.Request, out any) error {
	res, err := providerClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: status %d", req.URL.Path, res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("%s: %w", req.URL.Path, err)
	}
	return nil
}

// sub exchanges an authorization code for the provider's account id.
func (p *Provider) sub(ctx context.Context, code, publicURL string) (string, error) {
	form := url.Values{
		"code": {code}, "client_id": {p.ClientID}, "client_secret": {p.Secret},
		"redirect_uri": {p.redirectURI(publicURL)}, "grant_type": {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var tok struct {
		IDToken     string `json:"id_token"`
		AccessToken string `json:"access_token"`
	}
	if cerr := call(req, &tok); cerr != nil {
		return "", cerr
	}
	if p.UserURL != "" {
		return p.user(ctx, tok.AccessToken)
	}
	// The ID token comes straight from the provider over TLS, so its signature need not be
	// checked (OpenID Connect Core, 3.1.3.7); its audience still must be us.
	parts := strings.Split(tok.IDToken, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed id token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("id token: %w", err)
	}
	var claims struct{ Sub, Aud string }
	if jerr := json.Unmarshal(payload, &claims); jerr != nil || claims.Sub == "" || claims.Aud != p.ClientID {
		return "", fmt.Errorf("id token claims: %w", jerr)
	}
	return claims.Sub, nil
}

// user reads the account id from the provider's user endpoint.
func (p *Provider) user(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.UserURL, http.NoBody)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	var u struct{ ID string }
	if err := call(req, &u); err != nil {
		return "", err
	}
	if u.ID == "" {
		return "", errors.New("no user id")
	}
	return u.ID, nil
}

func (s *Server) cookie(w http.ResponseWriter, name, value string, maxAge int) {
	//nolint:gosec // G124: Secure follows PUBLIC_URL, so that sign-in also works over plain HTTP in dev
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: strings.HasPrefix(s.opts.PublicURL, "https://"), SameSite: http.SameSiteLaxMode,
	})
}

// provider returns the provider named in the route; false (and a 404) if there is none.
func (s *Server) provider(w http.ResponseWriter, r *http.Request) (*Provider, bool) {
	p, ok := s.providers[r.PathValue("provider")]
	if !ok {
		http.NotFound(w, r)
	}
	return p, ok
}

// login sends the browser to the provider, with a random state kept in a cookie against forged callbacks.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	p, ok := s.provider(w, r)
	if !ok {
		return
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)
	s.cookie(w, stateCookie, state, 600)
	q := url.Values{
		"client_id": {p.ClientID}, "redirect_uri": {p.redirectURI(s.opts.PublicURL)},
		"response_type": {"code"}, "scope": {p.Scope}, "state": {state}, "prompt": {p.Prompt},
	}
	http.Redirect(w, r, p.AuthURL+"?"+q.Encode(), http.StatusFound)
}

// callback finishes the sign-in: opens a session and goes back to the board.
func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	p, ok := s.provider(w, r)
	if !ok {
		return
	}
	state, err := r.Cookie(stateCookie)
	if err != nil || state.Value == "" || r.FormValue("state") != state.Value {
		http.Error(w, "bad state", http.StatusBadRequest)
		return
	}
	s.cookie(w, stateCookie, "", -1)
	if r.FormValue("error") != "" { // cancelled on the provider's page
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	sub, err := p.sub(r.Context(), r.FormValue("code"), s.opts.PublicURL)
	if err != nil {
		http.Error(w, p.Name+" sign-in failed", http.StatusBadGateway)
		return
	}
	tok, err := s.accounts.SignIn(r.Context(), p.Name, sub, s.now())
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
		writeJSON(w, struct {
			account.User
			Admin bool `json:"admin"`
		}{u, s.opts.Admins[u.ID]})
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
	case errors.Is(err, account.ErrBanned):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, account.ErrPseudoTooSoon):
		http.Error(w, err.Error(), http.StatusTooManyRequests)
	case errors.Is(err, account.ErrNoPseudo):
		http.Error(w, err.Error(), http.StatusNotFound)
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
	if !accountError(w, s.accounts.SetPseudo(r.Context(), session(r), strings.TrimSpace(body.Pseudo), s.now())) {
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
