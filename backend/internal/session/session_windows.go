//go:build windows

package session

import (
	"context"

	"github.com/example/rovobridge/internal/conpty"
)

func startPTY(ctx context.Context, cfg Config, env []string) (*Session, error) {
	proc, err := conpty.Start(ctx, cfg.Cmd, cfg.Args, env, cfg.Dir)
	if err != nil {
		return nil, err
	}

	stdin := proc.Stdin()
	stdout := proc.Stdout()

	closeFn := func() error {
		return proc.Close()
	}

	resizeFn := func(cols, rows int) error {
		return proc.Resize(cols, rows)
	}

	return &Session{
		wait:   proc.Wait,
		proc:   proc.Process(),
		stdin:  stdin,
		stdout: stdout,
		resize: resizeFn,
		closer: closeFn,
	}, nil
}
