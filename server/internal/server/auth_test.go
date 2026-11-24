package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/LeoPenaguin/pixels/server/internal/account"
)

// idToken builds an unsigned ID token around claims (the server does not check signatures).
func idToken(claims string) string {
	return "h." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".sig"
}

const site = "http://site.test/"

// fakeProvider serves a provider's token endpoint, answering `status` and `body` for the code
// "ok". With `user`, the provider has a user endpoint answering it for the access token "at".
func fakeProvider(t *testing.T, name string, status int, body, user string) *Provider {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/user" {
			if r.Header.Get("Authorization") != "Bearer at" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			_, _ = io.WriteString(w, user)
			return
		}
		if r.FormValue("code") != "ok" || r.FormValue("client_id") != "cid" || r.FormValue("client_secret") != "secret" ||
			r.FormValue("redirect_uri") != "http://site.test/api/auth/"+name+"/callback" || r.FormValue("grant_type") != "authorization_code" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(ts.Close)
	p := &Provider{
		Name: name, ClientID: "cid", Secret: "secret", Scope: "openid", Prompt: "select_account",
		AuthURL: "https://" + name + ".test/auth", TokenURL: ts.URL + "/token",
	}
	if user != "" {
		p.UserURL = ts.URL + "/user"
	}
	return p
}

func goodGoogle(t *testing.T) *Provider {
	t.Helper()
	return fakeProvider(t, "google", http.StatusOK, `{"id_token":"`+idToken(`{"sub":"g1","aud":"cid"}`)+`"}`, "")
}

func goodDiscord(t *testing.T) *Provider {
	t.Helper()
	return fakeProvider(t, "discord", http.StatusOK, `{"access_token":"at"}`, `{"id":"d1","username":"minou"}`)
}

// signInOn: Google sign-in on, served at site.
func signInOn(t *testing.T, burst int, refill time.Duration) Options {
	t.Helper()
	return Options{Burst: burst, Refill: refill, Providers: []*Provider{goodGoogle(t)}, PublicURL: site}
}

type response struct {
	code    int
	loc     string // Location header
	body    string
	cookies []*http.Cookie
}

func (r response) cookie(name string) *http.Cookie {
	for _, c := range r.cookies {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// request sends a request (with a JSON Content-Type unless GET) without following redirects; cookies are "name=value" pairs.
func request(t *testing.T, method, target, body string, cookies ...string) response {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), method, target, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(cookies) > 0 {
		req.Header.Set("Cookie", strings.Join(cookies, "; "))
	}
	if method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json") // as the front does
	}
	client := http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	return response{res.StatusCode, res.Header.Get("Location"), string(b), res.Cookies()}
}

// signedIn opens a session directly in the store and gives it a pseudo ("" = none).
func signedIn(t *testing.T, e testEnv, sub, pseudo string) string {
	t.Helper()
	tok, err := e.s.accounts.SignIn(context.Background(), "google", sub, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if pseudo != "" {
		if err := e.s.accounts.SetPseudo(context.Background(), tok, pseudo, time.Now()); err != nil {
			t.Fatal(err)
		}
	}
	return tok
}

func me(t *testing.T, e testEnv, tok string) string {
	t.Helper()
	return strings.TrimSpace(request(t, http.MethodGet, e.url+"/api/me", "", "session="+tok).body)
}

func TestConfigListsTheProviders(t *testing.T) {
	for _, c := range []struct {
		providers []*Provider
		want      string
	}{
		{nil, `[]`},
		{[]*Provider{goodDiscord(t), goodGoogle(t)}, `["discord","google"]`},
	} {
		_, body := get(t, newTestEnv(t, Options{Burst: 1, Providers: c.providers}).url+"/api/config")
		var cfg struct{ Auth json.RawMessage }
		if err := json.Unmarshal(body, &cfg); err != nil || string(cfg.Auth) != c.want {
			t.Errorf("auth = %s; want %s (%v)", cfg.Auth, c.want, err)
		}
	}
}

func TestSignInRoutesOffWithoutProviders(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1})
	if res := request(t, http.MethodGet, e.url+"/api/auth/google/login", ""); res.code != http.StatusNotFound {
		t.Errorf("login without providers: %d", res.code)
	}
	if got := me(t, e, ""); got != "null" {
		t.Errorf("me = %s; want null", got)
	}
}

func TestUnknownProvider(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	for _, path := range []string{"/api/auth/discord/login", "/api/auth/discord/callback?code=ok&state=s1"} {
		if res := request(t, http.MethodGet, e.url+path, "", "oauth_state=s1"); res.code != http.StatusNotFound {
			t.Errorf("%s: %d; want 404", path, res.code)
		}
	}
}

func TestLoginRedirectsToTheProvider(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	res := request(t, http.MethodGet, e.url+"/api/auth/google/login", "")
	loc, _ := url.Parse(res.loc)
	state := res.cookie(stateCookie)
	q := loc.Query()
	if res.code != http.StatusFound || loc.Host != "google.test" || q.Get("client_id") != "cid" ||
		q.Get("redirect_uri") != "http://site.test/api/auth/google/callback" || q.Get("scope") != "openid" ||
		q.Get("prompt") != "select_account" || q.Get("response_type") != "code" ||
		state == nil || q.Get("state") != state.Value || len(state.Value) != 32 {
		t.Errorf("redirect = %d %s, state cookie %+v", res.code, loc, state)
	}
	if !state.HttpOnly || state.Secure || state.SameSite != http.SameSiteLaxMode {
		t.Errorf("state cookie flags: %+v", state)
	}
}

func TestCookiesAreSecureOverHTTPS(t *testing.T) {
	o := signInOn(t, 1, 0)
	o.PublicURL = "https://site.test"
	e := newTestEnv(t, o)
	if res := request(t, http.MethodGet, e.url+"/api/auth/google/login", ""); !res.cookie(stateCookie).Secure {
		t.Error("over HTTPS, cookies must be Secure")
	}
}

func TestCallbackSignsIn(t *testing.T) {
	e := newTestEnv(t, Options{Burst: 1, Providers: []*Provider{goodGoogle(t), goodDiscord(t)}, PublicURL: site})
	for provider, sub := range map[string]string{"google": "g1", "discord": "d1"} {
		res := request(t, http.MethodGet, e.url+"/api/auth/"+provider+"/callback?code=ok&state=s1", "", "oauth_state=s1")
		sess := res.cookie(sessionCookie)
		if res.code != http.StatusFound || res.loc != "/" || sess == nil {
			t.Fatalf("%s callback = %d %s, session %+v", provider, res.code, res.loc, sess)
		}
		if st := res.cookie(stateCookie); st == nil || st.MaxAge >= 0 {
			t.Error("the state cookie must be cleared")
		}
		var u account.User
		if err := json.Unmarshal([]byte(me(t, e, sess.Value)), &u); err != nil || u.ID == "" || u.Pseudo != "" {
			t.Errorf("me = %+v, %v", u, err)
		}
		if e.mr.HGet("user:"+u.ID, provider) != sub {
			t.Errorf("the user must be tied to the %s account id", provider)
		}
	}
}

func TestCallbackRefusals(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	for _, c := range []struct {
		query, cookie string
		want          int
	}{
		{"code=ok&state=s1", "", http.StatusBadRequest},                      // no state cookie
		{"code=ok&state=s2", "oauth_state=s1", http.StatusBadRequest},        // forged
		{"code=ok", "oauth_state=", http.StatusBadRequest},                   // empty state
		{"error=access_denied&state=s1", "oauth_state=s1", http.StatusFound}, // cancelled: back to the board
		{"code=wrong&state=s1", "oauth_state=s1", http.StatusBadGateway},     // the provider refuses the code
	} {
		res := request(t, http.MethodGet, e.url+"/api/auth/google/callback?"+c.query, "", c.cookie)
		if res.code != c.want || res.cookie(sessionCookie) != nil {
			t.Errorf("%s: %d; want %d and no session", c.query, res.code, c.want)
		}
	}
	e.mr.Close()
	if res := request(t, http.MethodGet, e.url+"/api/auth/google/callback?code=ok&state=s1", "", "oauth_state=s1"); res.code != http.StatusInternalServerError {
		t.Errorf("Redis down: %d", res.code)
	}
}

func TestProviderErrors(t *testing.T) {
	ctx := context.Background()
	idTok := func(claims string) string { return `{"id_token":"` + idToken(claims) + `"}` }
	for name, p := range map[string]*Provider{
		"status":        fakeProvider(t, "google", http.StatusUnauthorized, `{}`, ""),
		"not json":      fakeProvider(t, "google", http.StatusOK, `<html>`, ""),
		"no dots":       fakeProvider(t, "google", http.StatusOK, `{"id_token":"abc"}`, ""),
		"base64":        fakeProvider(t, "google", http.StatusOK, `{"id_token":"a.!!!.c"}`, ""),
		"claims":        fakeProvider(t, "google", http.StatusOK, idTok(`[]`), ""),
		"no sub":        fakeProvider(t, "google", http.StatusOK, idTok(`{"aud":"cid"}`), ""),
		"other aud":     fakeProvider(t, "google", http.StatusOK, idTok(`{"sub":"g1","aud":"evil"}`), ""),
		"unreachable":   {ClientID: "cid", TokenURL: "http://" + closedAddr(t)},
		"bad url":       {ClientID: "cid", TokenURL: "http://bad host"}, //nolint:gosec // G101: test URL, no credential
		"user refused":  fakeProvider(t, "discord", http.StatusOK, `{"access_token":"expired"}`, `{"id":"d1"}`),
		"user not json": fakeProvider(t, "discord", http.StatusOK, `{"access_token":"at"}`, `<html>`),
		"user no id":    fakeProvider(t, "discord", http.StatusOK, `{"access_token":"at"}`, `{}`),
		"user bad url":  {ClientID: "cid", UserURL: "http://bad host"},
	} {
		if p.Name == "" && p.UserURL != "" { // straight to the user endpoint
			if sub, err := p.user(ctx, "at"); err == nil {
				t.Errorf("%s: id %q; want an error", name, sub)
			}
			continue
		}
		if sub, err := p.sub(ctx, "ok", site); err == nil {
			t.Errorf("%s: sub %q; want an error", name, sub)
		}
	}
}

func TestPseudoRoute(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	tok := signedIn(t, e, "a", "")
	other := signedIn(t, e, "b", "Pixel")
	for _, c := range []struct {
		body, tok string
		want      int
	}{
		{`{"pseudo":"  Minou "}`, tok, http.StatusNoContent},
		{`{"pseudo":"pixel"}`, tok, http.StatusConflict},
		{`{"pseudo":"Chaton"}`, tok, http.StatusTooManyRequests}, // a week between two changes
		{`{"pseudo":"a b"}`, tok, http.StatusBadRequest},
		{`pas du json`, tok, http.StatusBadRequest},
		{`{"pseudo":"Minou2"}`, "nope", http.StatusUnauthorized},
	} {
		if res := request(t, http.MethodPost, e.url+"/api/me/pseudo", c.body, "session="+c.tok); res.code != c.want {
			t.Errorf("%s: %d %s; want %d", c.body, res.code, res.body, c.want)
		}
	}
	if got := me(t, e, tok); !strings.Contains(got, `"pseudo":"Minou"`) {
		t.Errorf("me = %s; the pseudo must be trimmed and saved", got)
	}
	body := request(t, http.MethodPost, e.url+"/api/me/pseudo", `{"pseudo":"Pixel"}`, "session="+tok).body
	if strings.TrimSpace(body) != account.ErrPseudoTaken.Error() {
		t.Errorf("the refusal must say why: %q", body)
	}
	_ = e.s.accounts.SetBanned(context.Background(), "Pixel", true)
	if res := request(t, http.MethodPost, e.url+"/api/me/pseudo", `{"pseudo":"Chaton"}`, "session="+other); res.code != http.StatusForbidden {
		t.Errorf("banned: %d; want 403", res.code)
	}
	e.mr.Close()
	if res := request(t, http.MethodPost, e.url+"/api/me/pseudo", `{"pseudo":"Minou3"}`, "session="+other); res.code != http.StatusInternalServerError {
		t.Errorf("Redis down: %d", res.code)
	}
}

func TestLogout(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	tok := signedIn(t, e, "a", "Pixel")
	res := request(t, http.MethodPost, e.url+"/api/auth/logout", "", "session="+tok)
	if c := res.cookie(sessionCookie); res.code != http.StatusNoContent || c == nil || c.MaxAge >= 0 {
		t.Errorf("logout = %d, cookie %+v", res.code, c)
	}
	if got := me(t, e, tok); got != "null" {
		t.Errorf("after logout, me = %s", got)
	}
}

func TestDeleteMe(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	tok := signedIn(t, e, "a", "Pixel")
	if res := request(t, http.MethodDelete, e.url+"/api/me", "", "session="+tok); res.code != http.StatusNoContent {
		t.Errorf("delete = %d", res.code)
	}
	if got := me(t, e, tok); got != "null" || e.mr.Exists("pseudo:pixel") {
		t.Errorf("after deletion, me = %s", got)
	}
	if res := request(t, http.MethodDelete, e.url+"/api/me", "", "session="+tok); res.code != http.StatusUnauthorized {
		t.Errorf("delete without a session = %d", res.code)
	}
}

// dialAs opens a WebSocket connection with a session cookie.
func dialAs(t *testing.T, e testEnv, tok string) *websocket.Conn {
	t.Helper()
	c, err := tryDial(e, &websocket.DialOptions{HTTPHeader: http.Header{"Cookie": {"session=" + tok}}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	return c
}

func TestPaintingNeedsAnAccountWithAPseudo(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 5, time.Hour))
	anon, noPseudo := dial(t, e), dialAs(t, e, signedIn(t, e, "a", ""))
	send(t, anon, `{"x":1,"y":1,"c":5}`)
	send(t, noPseudo, `{"x":2,"y":1,"c":5}`)

	tok := signedIn(t, e, "b", "Pixel")
	ws := dialAs(t, e, tok)
	if m := read(t, ws); m.T != "q" || int(m.N) != 5 {
		t.Errorf("on connection, the account's quota: %+v", m)
	}
	send(t, ws, `{"x":3,"y":1,"c":5}`)
	read(t, ws) // quota
	if m := read(t, ws); m.T != "b" || m.P[0] != 3 {
		t.Errorf("only the pixel of the account with a pseudo is painted: %+v", m)
	}

	// The quota follows the account to another tab.
	if m := read(t, dialAs(t, e, tok)); m.T != "q" || int(m.N) != 4 {
		t.Errorf("second tab quota: %+v; want 4", m)
	}
	u, _, _ := e.s.accounts.SessionUser(context.Background(), tok)
	if info, _ := e.s.store.Info(context.Background(), 3, 1); info.User != u.ID || info.Changes != 1 {
		t.Errorf("pixel = %+v; want one paint by %s", info, u.ID)
	}
}

func TestDeletedAccountStopsPaintingOnItsOpenConnection(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 5, time.Hour))
	tok := signedIn(t, e, "a", "Pixel")
	ws := dialAs(t, e, tok)
	read(t, ws) // quota
	_ = e.s.accounts.Delete(context.Background(), tok)
	send(t, ws, `{"x":4,"y":4,"c":5}`)
	time.Sleep(50 * time.Millisecond)
	if info, _ := e.s.store.Info(context.Background(), 4, 4); info.Changes != 0 {
		t.Error("a deleted account must not paint, even on a connection opened before")
	}
}

func TestChangesNeedAJSONBody(t *testing.T) {
	e := newTestEnv(t, signInOn(t, 1, 0))
	tok := signedIn(t, e, "a", "Pixel")
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, e.url+"/api/me/pseudo",
		strings.NewReader(`{"pseudo":"Minou"}`))
	req.Header.Set("Content-Type", "text/plain") // what a form of another site can send
	req.Header.Set("Cookie", "session="+tok)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Errorf("text body = %d; want 415", res.StatusCode)
	}
}
