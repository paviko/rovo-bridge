package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func wsURLFromHTTP(serverURL string, path string) string {
	ws := strings.Replace(serverURL, "http", "ws", 1)
	if !strings.HasSuffix(ws, "/") && !strings.HasPrefix(path, "/") {
		return ws + "/" + path
	}
	return ws + path
}

func startTestServer(t *testing.T, token string) (*httptest.Server, string) {
	t.Helper()
	mux := http.NewServeMux()
	s := NewServer(token)
	mux.HandleFunc("/ws", s.HandleWS)
	ts := httptest.NewServer(mux)
	return ts, wsURLFromHTTP(ts.URL, "/ws")
}

func TestWS_RejectsWithoutSubprotocol(t *testing.T) {
	ts, url := startTestServer(t, "secrettoken")
	defer ts.Close()

	d := websocket.Dialer{}
	h := http.Header{}
	h.Set("Origin", "http://localhost")
	c, resp, err := d.Dial(url, h)
	if err == nil {
		c.Close()
		t.Fatalf("expected error, got successful connection")
	}
	if resp == nil {
		t.Fatalf("expected HTTP response with status, got nil")
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden, got %d", resp.StatusCode)
	}
}

func TestWS_RejectsWithWrongToken(t *testing.T) {
	ts, url := startTestServer(t, "secrettoken")
	defer ts.Close()

	d := websocket.Dialer{Subprotocols: []string{"auth.bearer.wrong"}}
	h := http.Header{}
	h.Set("Origin", "http://localhost")
	c, resp, err := d.Dial(url, h)
	if err == nil {
		c.Close()
		t.Fatalf("expected error for wrong token, got successful connection")
	}
	if resp == nil {
		t.Fatalf("expected HTTP response with status, got nil")
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden, got %d", resp.StatusCode)
	}
}

func TestWS_AcceptsWithValidSubprotocolAndEcho(t *testing.T) {
	const token = "secrettoken"
	ts, url := startTestServer(t, token)
	defer ts.Close()

	d := websocket.Dialer{Subprotocols: []string{"auth.bearer." + token}}
	h := http.Header{}
	h.Set("Origin", "http://localhost")
	c, resp, err := d.Dial(url, h)
	if err != nil {
		t.Fatalf("expected successful connection, got error: %v", err)
	}
	defer c.Close()
	if resp == nil {
		t.Fatalf("expected handshake response, got nil")
	}
	// Server should echo back the selected subprotocol
	if got := c.Subprotocol(); got != "auth.bearer."+token {
		t.Fatalf("expected subprotocol to be echoed back, got %q", got)
	}
}

func TestWS_Origin_NullAllowed(t *testing.T) {
	ts, url := startTestServer(t, "tok")
	defer ts.Close()
	d := websocket.Dialer{Subprotocols: []string{"auth.bearer.tok"}}
	h := http.Header{}
	h.Set("Origin", "null")
	c, _, err := d.Dial(url, h)
	if err != nil {
		t.Fatalf("expected connection with Origin=null, got error: %v", err)
	}
	_ = c.Close()
}

func TestWS_Origin_EvilDisallowed(t *testing.T) {
	ts, url := startTestServer(t, "tok")
	defer ts.Close()
	d := websocket.Dialer{Subprotocols: []string{"auth.bearer.tok"}}
	h := http.Header{}
	h.Set("Origin", "http://evil.com")
	c, resp, err := d.Dial(url, h)
	if err == nil {
		c.Close()
		t.Fatalf("expected origin check failure, got successful connection")
	}
	if resp == nil {
		t.Fatalf("expected HTTP response with status, got nil")
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for bad origin, got %d", resp.StatusCode)
	}
}
