// Package account keeps users and their sessions in Redis. A user is known by a random id; the
// only personal data kept is their sign-in account id (Google, Discord: to recognise them) and the
// pseudo they chose.
package account

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// SessionTTL is how long a sign-in lasts.
const SessionTTL = 30 * 24 * time.Hour

// PseudoCooldown is the time between two pseudo changes (a change of case or accents only is free):
// a vandal cannot hide behind new names, nor take someone else's name the moment it is freed.
const PseudoCooldown = 7 * 24 * time.Hour

// Errors of the operations made with a session token; the pseudo ones are shown to the user.
var (
	ErrNoSession     = errors.New("not signed in")
	ErrPseudoInvalid = errors.New("3 à 20 lettres, chiffres, points, tirets ou soulignés, en commençant par une lettre")
	ErrPseudoTaken   = errors.New("ce pseudo est déjà pris")
	ErrPseudoTooSoon = errors.New("un seul changement de pseudo par semaine")
	ErrBanned        = errors.New("ce compte est banni")
	ErrNoPseudo      = errors.New("aucun compte avec ce pseudo")
)

// French letters only (Latin, with their accents): no look-alike from another alphabet (Cyrillic "е"
// for "e"), no combining accent (a decomposed "é" would look like another pseudo's).
const letters = `a-zA-Zàâäçéèêëîïôöùûüÿæœ` + `ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ`

// 3 to 20 characters, starting with a letter: letters, digits, ".", "_" or "-".
var pseudoRe = regexp.MustCompile(`^[` + letters + `][` + letters + `0-9._-]{2,19}$`)

// unaccent and the dropped separators make look-alike pseudos one: Léo, LEO and l.e_o share the key "leo".
var unaccent = strings.NewReplacer(
	"à", "a", "â", "a", "ä", "a", "ç", "c", "é", "e", "è", "e", "ê", "e", "ë", "e", "î", "i", "ï", "i",
	"ô", "o", "ö", "o", "ù", "u", "û", "u", "ü", "u", "ÿ", "y", "æ", "ae", "œ", "oe",
	".", "", "_", "", "-", "",
)

// pseudoKey is what makes a pseudo unique.
func pseudoKey(pseudo string) string { return unaccent.Replace(strings.ToLower(pseudo)) }

// reserved pseudos (by key) would pass for the site or its moderation.
var reserved = map[string]bool{
	"admin": true, "administrateur": true, "administrator": true, "modo": true, "moderateur": true,
	"moderation": true, "moderator": true, "pixels": true, "systeme": true, "system": true, "support": true,
}

// User is a signed-in person. Pseudo is empty until they choose one (they cannot paint before);
// a banned user cannot paint either.
type User struct {
	ID     string `json:"id"`
	Pseudo string `json:"pseudo"`
	Banned bool   `json:"banned"`
}

// Providers are the sign-in services an account can come from; each name prefixes its Redis keys.
var Providers = []string{"google", "discord"}

// Store keeps the accounts in Redis:
//
//	{provider}:{sub}  user id of a provider's account, e.g. google:{sub}, discord:{id}
//	user:{id}         hash: {provider} (sub), pseudo, pkey (pseudoKey), created and renamed (Unix ms),
//	                  banned ("1", missing if not)
//	banned:{provider}:{sub}  user id banned with that provider's account: a new account from it
//	                  (after a deletion) starts banned
//	pseudo:{pkey}    user id owning a pseudo (regardless of case, accents and separators)
//	session:{token}  user id, expires after SessionTTL
//
// The scripts below touch keys they compute themselves: fine on a single Redis, not on a cluster.
type Store struct{ rdb redis.UniversalClient }

// NewStore keeps the accounts in the given Redis.
func NewStore(rdb redis.UniversalClient) *Store { return &Store{rdb} }

func token(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b) // never fails (crypto/rand panics instead)
	return hex.EncodeToString(b)
}

// KEYS: {provider}:{sub}, session:{token}. ARGV: new user id, sub, now, session TTL (s), provider.
var signInScript = redis.NewScript(`
local id = redis.call('GET', KEYS[1])
if not id then
  id = ARGV[1]
  redis.call('SET', KEYS[1], id)
  redis.call('HSET', 'user:' .. id, ARGV[5], ARGV[2], 'created', ARGV[3])
  if redis.call('EXISTS', 'banned:' .. KEYS[1]) == 1 then redis.call('HSET', 'user:' .. id, 'banned', '1') end
end
redis.call('SET', KEYS[2], id, 'EX', ARGV[4])
return id
`)

// SignIn opens a session for a provider's account (one of Providers), created on first sign-in,
// and returns its token.
func (s *Store) SignIn(ctx context.Context, provider, sub string, now time.Time) (string, error) {
	tok := token(32)
	keys := []string{provider + ":" + sub, "session:" + tok}
	err := signInScript.Run(ctx, s.rdb, keys, token(8), sub, now.UnixMilli(), int(SessionTTL.Seconds()), provider).Err()
	return tok, err
}

// SessionUser returns the user of a session; false if the session or the user is gone.
func (s *Store) SessionUser(ctx context.Context, tok string) (User, bool, error) {
	id, err := s.rdb.Get(ctx, "session:"+tok).Result()
	if errors.Is(err, redis.Nil) {
		return User{}, false, nil
	}
	if err != nil {
		return User{}, false, err
	}
	h, err := s.rdb.HGetAll(ctx, "user:"+id).Result()
	if err != nil || len(h) == 0 {
		return User{}, false, err
	}
	return User{ID: id, Pseudo: h["pseudo"], Banned: h["banned"] != ""}, true, nil
}

// KEYS: pseudo:{pkey}. ARGV: "1" to ban, "" to lift the ban, then Providers. Returns 0 (no such pseudo) or 1.
var banScript = redis.NewScript(`
local id = redis.call('GET', KEYS[1])
if not id then return 0 end
local u = 'user:' .. id
for i = 2, #ARGV do
  local sub = redis.call('HGET', u, ARGV[i])
  if sub and ARGV[1] == '' then redis.call('DEL', 'banned:' .. ARGV[i] .. ':' .. sub)
  elseif sub then redis.call('SET', 'banned:' .. ARGV[i] .. ':' .. sub, id) end
end
if ARGV[1] == '' then redis.call('HDEL', u, 'banned')
else redis.call('HSET', u, 'banned', ARGV[1]) end
return 1
`)

// SetBanned bans the user owning a pseudo (see pseudoKey), or lifts the ban. The ban sticks to their
// sign-in accounts: deleting the account and signing in again gives a banned account.
func (s *Store) SetBanned(ctx context.Context, pseudo string, banned bool) error {
	flag := ""
	if banned {
		flag = "1"
	}
	args := make([]any, 0, 1+len(Providers))
	args = append(args, flag)
	for _, p := range Providers {
		args = append(args, p)
	}
	res, err := banScript.Run(ctx, s.rdb, []string{"pseudo:" + pseudoKey(pseudo)}, args...).Int()
	if err == nil && res == 0 {
		return ErrNoPseudo
	}
	return err
}

// Banned tells if a user is banned (false on a Redis error: painting fails then anyway).
func (s *Store) Banned(ctx context.Context, id string) bool {
	b, _ := s.rdb.HExists(ctx, "user:"+id, "banned").Result()
	return b
}

// EndSession signs out.
func (s *Store) EndSession(ctx context.Context, tok string) error {
	return s.rdb.Del(ctx, "session:"+tok).Err()
}

// KEYS: session:{token}. ARGV: pseudo, its key, now (Unix ms), cooldown (ms).
// Returns 0 (no session), 1 (taken), 2 (set), 3 (banned) or 4 (changed too recently).
var pseudoScript = redis.NewScript(`
local id = redis.call('GET', KEYS[1])
if not id or redis.call('EXISTS', 'user:' .. id) == 0 then return 0 end
local u = 'user:' .. id
local old = redis.call('HGET', u, 'pkey')
-- A banned account keeps its pseudo (a first one is allowed: a moderator needs it to lift the ban).
if old and redis.call('HEXISTS', u, 'banned') == 1 then return 3 end
local owner = redis.call('GET', 'pseudo:' .. ARGV[2])
if owner and owner ~= id then return 1 end
if old ~= ARGV[2] then
  local at = tonumber(redis.call('HGET', u, 'renamed') or 0)
  if old and tonumber(ARGV[3]) - at < tonumber(ARGV[4]) then return 4 end
  if old then redis.call('DEL', 'pseudo:' .. old) end
  redis.call('SET', 'pseudo:' .. ARGV[2], id)
  redis.call('HSET', u, 'renamed', ARGV[3])
end
redis.call('HSET', u, 'pseudo', ARGV[1], 'pkey', ARGV[2])
return 2
`)

// SetPseudo gives the user of a session a pseudo, unique by pseudoKey, and frees the previous one;
// changing it again must wait PseudoCooldown, unless only the case or accents change.
func (s *Store) SetPseudo(ctx context.Context, tok, pseudo string, now time.Time) error {
	if !pseudoRe.MatchString(pseudo) {
		return ErrPseudoInvalid
	}
	key := pseudoKey(pseudo)
	if reserved[key] {
		return ErrPseudoTaken
	}
	res, err := pseudoScript.Run(ctx, s.rdb, []string{"session:" + tok}, pseudo, key, now.UnixMilli(), PseudoCooldown.Milliseconds()).Int()
	switch {
	case err != nil:
		return err
	case res == 0:
		return ErrNoSession
	case res == 1:
		return ErrPseudoTaken
	case res == 3:
		return ErrBanned
	case res == 4:
		return ErrPseudoTooSoon
	}
	return nil
}

// KEYS: session:{token}. ARGV: Providers. Returns 0 (no session) or 1.
var deleteScript = redis.NewScript(`
local id = redis.call('GET', KEYS[1])
if not id then return 0 end
local u = 'user:' .. id
for _, p in ipairs(ARGV) do
  local sub = redis.call('HGET', u, p)
  if sub then redis.call('DEL', p .. ':' .. sub) end
end
local pkey = redis.call('HGET', u, 'pkey')
if pkey then redis.call('DEL', 'pseudo:' .. pkey) end
redis.call('DEL', u, KEYS[1])
return 1
`)

// Delete removes the account of a session. Its paints stay in the history under its random id,
// which no longer leads to anyone: the history becomes anonymous. Its other sessions die with it
// (SessionUser finds no user).
func (s *Store) Delete(ctx context.Context, tok string) error {
	res, err := deleteScript.Run(ctx, s.rdb, []string{"session:" + tok}, Providers).Int()
	if err == nil && res == 0 {
		return ErrNoSession
	}
	return err
}

// Pseudos returns the pseudo of each user id ("" for a deleted account, or one without a pseudo yet).
func (s *Store) Pseudos(ctx context.Context, ids []string) ([]string, error) {
	pipe := s.rdb.Pipeline()
	cmds := make([]*redis.StringCmd, len(ids))
	for i, id := range ids {
		cmds[i] = pipe.HGet(ctx, "user:"+id, "pseudo")
	}
	_, _ = pipe.Exec(ctx) // returns only the first error, maybe a harmless redis.Nil: each one is checked below
	out := make([]string, len(ids))
	for i, c := range cmds {
		if err := c.Err(); err != nil && !errors.Is(err, redis.Nil) {
			return nil, err
		}
		out[i] = c.Val()
	}
	return out, nil
}
