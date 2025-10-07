package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	"github.com/example/rovobridge/internal/conpty"
)

func runScenario(ctx context.Context, args []string) error {
	log.Printf("=== Running: %s ===", strings.Join(args, " "))

	proc, err := conpty.Start(ctx, args[0], args[1:], nil, "")
	if err != nil {
		return fmt.Errorf("conpty start failed: %w", err)
	}
	defer func() {
		_ = proc.Close()
	}()

	stdout := proc.Stdout()
	done := make(chan struct{})
	go func() {
		defer close(done)
		reader := bufio.NewReader(stdout)
		for {
			line, readErr := reader.ReadString('\n')
			if line != "" {
				fmt.Printf("[child] %s", line)
			}
			if readErr != nil {
				if readErr != io.EOF {
					log.Printf("stdout read error: %v", readErr)
				}
				return
			}
		}
	}()

	if err := proc.Wait(); err != nil {
		return fmt.Errorf("process wait failed: %w", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		log.Println("timeout waiting for stdout reader")
	}

	if state := proc.ProcessState(); state != nil {
		exitCode := state.ExitCode()
		log.Printf("child exit code: %d (0x%X)", exitCode, uint32(exitCode))
		if exitCode != 0 {
			return fmt.Errorf("child exit code %d", exitCode)
		}
	}

	return nil
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Println("manual-conpty-test starting")

	scenarios := [][]string{
		{"cmd.exe", "/c", "echo", "hello-from-manual-conpty"},
		{"java", "-version"},
		{"node", "--version"},
	}

	for _, sc := range scenarios {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		if err := runScenario(ctx, sc); err != nil {
			log.Printf("scenario %v failed: %v", sc, err)
		}
		cancel()
	}

	log.Println("manual-conpty-test finished")
}
