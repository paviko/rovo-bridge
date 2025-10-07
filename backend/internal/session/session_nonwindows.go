//go:build !windows

package session

import (
    "context"
    "os/exec"

    "github.com/creack/pty"
)

func startPTY(ctx context.Context, cfg Config, env []string) (*Session, error) {
    cmd := exec.CommandContext(ctx, cfg.Cmd, cfg.Args...)
    cmd.Env = env
    if cfg.Dir != "" {
        cmd.Dir = cfg.Dir
    }

    size := &pty.Winsize{Rows: 24, Cols: 80}
    ptyFile, err := pty.StartWithSize(cmd, size)
    if err != nil {
        return nil, err
    }

    resizeFn := func(cols, rows int) error {
        return pty.Setsize(ptyFile, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
    }

    closeFn := func() error {
        return ptyFile.Close()
    }

    return &Session{
        wait:   cmd.Wait,
        proc:   cmd.Process,
        stdin:  ptyFile,
        stdout: ptyFile,
        resize: resizeFn,
        closer: closeFn,
    }, nil
}
