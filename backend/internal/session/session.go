package session

import (
	"bufio"
	"context"
	"errors"
	"io"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

type Mode int

const (
	ModeAutoPTY Mode = iota
	ModeForcePTY
	ModeNoPTY
)

type Config struct {
	Cmd  string
	Args []string
	Env  []string
	Dir  string // empty => inherit current process working directory
	Mode Mode
}

// ErrPTYNotSupported is returned when PTY mode is requested on a platform without implementation.
var ErrPTYNotSupported = errors.New("pty mode is not supported on this platform")

type Session struct {
	wait   func() error
	proc   *os.Process
	stdin  io.WriteCloser
	stdout io.ReadCloser
	resize func(cols, rows int) error
	closer func() error
}

func Start(ctx context.Context, cfg Config) (*Session, error) {
	// Use parent process environment
	baseEnv := os.Environ()

	if len(cfg.Env) > 0 {
		// allow caller overrides to take precedence
		baseEnv = append(baseEnv, cfg.Env...)
	}

	if cfg.Mode == ModeForcePTY || cfg.Mode == ModeAutoPTY {
		if s, err := startPTY(ctx, cfg, baseEnv); err == nil {
			return s, nil
		} else if cfg.Mode == ModeForcePTY {
			log.Printf("PTY start failed for %q%v: %v", cfg.Cmd, formatArgs(cfg.Args), err)
			return nil, err
		} else if errors.Is(err, ErrPTYNotSupported) {
			log.Printf("PTY mode not supported on %s; falling back to pipes for %q%v", runtime.GOOS, cfg.Cmd, formatArgs(cfg.Args))
		} else {
			log.Printf("PTY start failed for %q%v: %v; falling back to pipes", cfg.Cmd, formatArgs(cfg.Args), err)
		}
	}

	return startPipes(ctx, cfg, baseEnv)
}

func (s *Session) Stdin() io.Writer  { return s.stdin }
func (s *Session) Stdout() io.Reader { return bufio.NewReader(s.stdout) }

func (s *Session) Resize(cols, rows int) error {
	if s.resize == nil {
		return nil
	}
	return s.resize(cols, rows)
}

func (s *Session) Wait() error {
	if s.wait == nil {
		return nil
	}
	return s.wait()
}

func (s *Session) Close() error {
	if s.closer != nil {
		_ = s.closer()
	}
	if s.proc != nil && runtime.GOOS != "windows" {
		_ = s.proc.Kill()
	}
	return nil
}

// PID returns the OS process ID of the child process, or 0 if unavailable
func (s *Session) PID() int {
	if s != nil && s.proc != nil {
		return s.proc.Pid
	}
	return 0
}

// formatArgs formats command args for logging.
func formatArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	// Prepend a space to look like: cmd arg1 arg2
	return " " + strings.Join(args, " ")
}

func startPipes(ctx context.Context, cfg Config, env []string) (*Session, error) {
	cmd := exec.CommandContext(ctx, cfg.Cmd, cfg.Args...)
	cmd.Env = env
	if cfg.Dir != "" {
		cmd.Dir = cfg.Dir
	}

	in, err := cmd.StdinPipe()
	if err != nil {
		log.Printf("failed to create stdin pipe for %q%v: %v", cfg.Cmd, formatArgs(cfg.Args), err)
		return nil, err
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("failed to create stdout pipe for %q%v: %v", cfg.Cmd, formatArgs(cfg.Args), err)
		return nil, err
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("failed to create stderr pipe for %q%v: %v", cfg.Cmd, formatArgs(cfg.Args), err)
		return nil, err
	}

	merged := &multiReadCloser{
		Reader:  io.MultiReader(stdoutPipe, stderrPipe),
		Closers: []io.Closer{stdoutPipe, stderrPipe},
	}

	if err := cmd.Start(); err != nil {
		log.Printf("failed to start %q%v: %v", cfg.Cmd, formatArgs(cfg.Args), err)
		return nil, err
	}

	closeFn := func() error {
		var firstErr error
		if in != nil {
			if err := in.Close(); err != nil && firstErr == nil {
				firstErr = err
			}
		}
		if merged != nil {
			if err := merged.Close(); err != nil && firstErr == nil {
				firstErr = err
			}
		}
		return firstErr
	}

	return &Session{
		wait:   cmd.Wait,
		proc:   cmd.Process,
		stdin:  in,
		stdout: merged,
		resize: func(int, int) error { return nil },
		closer: closeFn,
	}, nil
}

type multiReadCloser struct {
	io.Reader
	Closers []io.Closer
}

func (m *multiReadCloser) Close() error {
	var firstErr error
	for _, c := range m.Closers {
		if err := c.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
