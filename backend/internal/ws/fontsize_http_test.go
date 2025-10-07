package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// buildMuxWithFontSizeHandler constructs an HTTP mux containing only the /font-size handler
// equivalent to the one in cmd/rovo-bridge/main.go, parameterized by a known token and router.
func buildMuxWithFontSizeHandler(token string, router *Router) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/font-size", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer "+token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		fontSize := router.GetAndResetFontSize()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]int{"fontSize": fontSize})
	})
	return mux
}

func TestFontSizeEndpoint_AuthRequired(t *testing.T) {
	r := NewRouter("")
	token := "tok"
	mux := buildMuxWithFontSizeHandler(token, r)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	// No Authorization header -> 403
	resp, err := http.Get(ts.URL + "/font-size")
	if err != nil {
		t.Fatalf("GET error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for missing auth, got %d", resp.StatusCode)
	}

	// Wrong Authorization header -> 403
	req, _ := http.NewRequest("GET", ts.URL+"/font-size", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET with wrong auth error: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong auth, got %d", resp2.StatusCode)
	}
}

func TestFontSizeEndpoint_ReturnsAndResets(t *testing.T) {
	r := NewRouter("")
	token := "tok"
	mux := buildMuxWithFontSizeHandler(token, r)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	// Initially, without setting any font size, should return 0
	req0, _ := http.NewRequest("GET", ts.URL+"/font-size", nil)
	req0.Header.Set("Authorization", "Bearer "+token)
	resp0, err := http.DefaultClient.Do(req0)
	if err != nil {
		t.Fatalf("GET error: %v", err)
	}
	defer resp0.Body.Close()
	var out0 struct{ FontSize int `json:"fontSize"` }
	if err := json.NewDecoder(resp0.Body).Decode(&out0); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if out0.FontSize != 0 {
		t.Fatalf("expected 0 initially, got %d", out0.FontSize)
	}

	// Simulate frontend notifying font size changed via router.handle
	_ = r.handle(nil, map[string]any{"type": "fontSizeChanged", "fontSize": 18})

	// Read value -> expect 18
	req1, _ := http.NewRequest("GET", ts.URL+"/font-size", nil)
	req1.Header.Set("Authorization", "Bearer "+token)
	resp1, err := http.DefaultClient.Do(req1)
	if err != nil {
		t.Fatalf("GET error: %v", err)
	}
	defer resp1.Body.Close()
	var out1 struct{ FontSize int `json:"fontSize"` }
	if err := json.NewDecoder(resp1.Body).Decode(&out1); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if out1.FontSize != 18 {
		t.Fatalf("expected 18, got %d", out1.FontSize)
	}

	// Reading again should reset to 0
	req2, _ := http.NewRequest("GET", ts.URL+"/font-size", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("GET error: %v", err)
	}
	defer resp2.Body.Close()
	var out2 struct{ FontSize int `json:"fontSize"` }
	if err := json.NewDecoder(resp2.Body).Decode(&out2); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if out2.FontSize != 0 {
		t.Fatalf("expected reset to 0, got %d", out2.FontSize)
	}
}
