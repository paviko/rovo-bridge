//go:build windows

package main

import (
	"github.com/example/rovobridge/internal/conpty"
)

func getTerminalSize() (int, int) {
	width, height, err := conpty.ConsoleSize()
	if err != nil {
		return 80, 24
	}
	return width, height
}
