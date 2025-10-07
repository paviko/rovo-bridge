package httpapi

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"
)

//go:embed ui/*
var uiFS embed.FS

func UIHandler(token string) http.Handler { // legacy without cwd
	return UIHandlerWithCwd(token, "")
}

func UIHandlerWithCwd(token string, cwd string) http.Handler {
	// Template index.html to inject bootstrap config
	base, _ := fs.Sub(uiFS, "ui")
	tpl := template.Must(template.ParseFS(base, "index.html"))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			// Do NOT inject the token into the served UI to avoid exposure
			_ = tpl.Execute(w, map[string]any{
				"CWD": cwd,
			})
			return
		}
		http.FileServer(http.FS(base)).ServeHTTP(w, r)
	})
}
