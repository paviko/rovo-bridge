package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/example/rovobridge/internal/httpapi"
	"github.com/example/rovobridge/internal/ws"
)

type connInfo struct {
	Port   int    `json:"port"`
	Token  string `json:"token"`
	UIBase string `json:"uiBase"`
}

func randToken() string {
	b := make([]byte, 24) // 192 bits
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func main() {
	addr := flag.String("http", "127.0.0.1:0", "HTTP listen address (loopback only)")
	serveUI := flag.Bool("serve-ui", true, "Serve embedded web UI")
	printConn := flag.Bool("print-conn-json", true, "Print connection JSON to stdout on start")
	customCmd := flag.String("cmd", "", "Custom command to execute (overrides default 'acli rovodev run')")
	flag.Parse()

	token := randToken()

	mux := http.NewServeMux()
	wss := ws.NewServer(token)
	router := ws.NewRouter(*customCmd)
	router.Attach(wss)
	mux.HandleFunc("/ws", wss.HandleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/font-size", func(w http.ResponseWriter, r *http.Request) {
		// Require Authorization: Bearer <token>; do not accept token in URL or other locations
		auth := r.Header.Get("Authorization")
		authorized := (auth == "Bearer "+token)
		if !authorized {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		fontSize := router.GetAndResetFontSize()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]int{"fontSize": fontSize})
	})
	var cwd string
	if d, err := os.Getwd(); err == nil {
		cwd = d
	}
	if *serveUI {
		mux.Handle("/", httpapi.UIHandlerWithCwd(token, cwd))
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("listen error: %v", err)
	}
	srv := &http.Server{Handler: mux}
	go func() {
		_ = srv.Serve(ln)
	}()

	port := ln.Addr().(*net.TCPAddr).Port
	info := connInfo{Port: port, Token: token, UIBase: fmt.Sprintf("http://127.0.0.1:%d/", port)}
	if *serveUI {
		log.Printf("UI available at %s", info.UIBase)
	}
	if *printConn {
		enc := json.NewEncoder(os.Stdout)
		_ = enc.Encode(info)
	}

	// wait for signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	_ = srv.Close()
}
