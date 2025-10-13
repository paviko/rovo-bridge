package ws

import (
	"bytes"
	"errors"
	"os/exec"
	"runtime"
)

// getClipboard returns current system clipboard text using best-effort, cross-platform approach.
func getClipboard() (string, error) {
	switch runtime.GOOS {
	case "darwin":
		// pbpaste
		out, err := exec.Command("pbpaste").Output()
		if err != nil {
			return "", err
		}
		return string(out), nil
	case "windows":
		// Use PowerShell to read clipboard as raw text
		// -Raw avoids extra newlines, and we write directly to stdout
		cmd := exec.Command("powershell", "-NoProfile", "-Command", `[Console]::Out.Write((Get-Clipboard -Raw))`)
		out, err := cmd.Output()
		if err != nil {
			return "", err
		}
		return string(out), nil
	default:
		// Try Wayland first: wl-paste
		if out, err := exec.Command("wl-paste", "-n").Output(); err == nil {
			return string(out), nil
		}
		// Try xclip (X11)
		if out, err := exec.Command("xclip", "-selection", "clipboard", "-o").Output(); err == nil {
			return string(out), nil
		}
		// Try xsel (X11)
		if out, err := exec.Command("xsel", "-b", "-o").Output(); err == nil {
			return string(out), nil
		}
		return "", errors.New("no clipboard utility available (tried wl-paste, xclip, xsel)")
	}
}

// setClipboard sets system clipboard text using best-effort, cross-platform approach.
func setClipboard(s string) error {
	data := []byte(s)
	switch runtime.GOOS {
	case "darwin":
		// pbcopy reads from stdin
		cmd := exec.Command("pbcopy")
		cmd.Stdin = bytes.NewReader(data)
		return cmd.Run()
	case "windows":
		// Use PowerShell, pipe stdin and set clipboard with exact content
		cmd := exec.Command("powershell", "-NoProfile", "-Command", `Set-Clipboard -Value ([Console]::In.ReadToEnd())`)
		cmd.Stdin = bytes.NewReader(data)
		return cmd.Run()
	default:
		// Try Wayland: wl-copy
		cmd := exec.Command("wl-copy", "--type", "text/plain")
		cmd.Stdin = bytes.NewReader(data)
		if err := cmd.Run(); err == nil {
			return nil
		}
		// Try xclip (X11)
		cmd = exec.Command("xclip", "-selection", "clipboard")
		cmd.Stdin = bytes.NewReader(data)
		if err := cmd.Run(); err == nil {
			return nil
		}
		// Try xsel (X11)
		cmd = exec.Command("xsel", "-b", "-i")
		cmd.Stdin = bytes.NewReader(data)
		if err := cmd.Run(); err == nil {
			return nil
		}
		return errors.New("no clipboard utility available to set content (tried wl-copy, xclip, xsel)")
	}
}
