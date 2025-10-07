//go:build windows

package conpty

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const procThreadAttributePseudoConsole = 0x00020016

// Process represents a process attached to a Windows ConPTY pseudo console.
type Process struct {
	stdin         *os.File
	stdout        *os.File
	proc          *os.Process
	state         *os.ProcessState
	hpc           windows.Handle
	attrs         *windows.ProcThreadAttributeListContainer
	processHandle windows.Handle
	done          chan struct{}

	waitOnce  sync.Once
	waitErr   error
	closeOnce sync.Once
}

// Start launches cmd with args attached to a ConPTY pseudo console, using env and dir.
func Start(ctx context.Context, cmd string, args []string, env []string, dir string) (*Process, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	hpc, stdinPipe, stdoutPipe, err := createPseudoConsole()
	if err != nil {
		return nil, err
	}

	attrs, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: failed to allocate attribute list: %w", err)
	}

	if err := attrs.Update(procThreadAttributePseudoConsole, unsafe.Pointer(hpc), unsafe.Sizeof(hpc)); err != nil {
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: failed to update attribute list: %w", err)
	}

	resolvedPath, err := lookExtensions(cmd, dir)
	if err != nil {
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: lookExtensions failed: %w", err)
	}
	if dir != "" {
		if joined, joinErr := joinExeDirAndFName(dir, cmd); joinErr == nil {
			resolvedPath = joined
		}
	}

	argv0p, err := windows.UTF16PtrFromString(resolvedPath)
	if err != nil {
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: failed to encode command path: %w", err)
	}

	commandLine := append([]string{cmd}, args...)
	composed := windows.ComposeCommandLine(commandLine)
	argvp, err := windows.UTF16PtrFromString(composed)
	if err != nil {
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: failed to encode command line: %w", err)
	}

	var dirp *uint16
	if dir != "" {
		dirp, err = windows.UTF16PtrFromString(dir)
		if err != nil {
			attrs.Delete()
			stdinPipe.Close()
			stdoutPipe.Close()
			windows.ClosePseudoConsole(hpc)
			return nil, fmt.Errorf("conpty: failed to encode working directory: %w", err)
		}
	}

	finalEnv := env
	var envPtr *uint16
	if len(finalEnv) > 0 {
		deduped := addCriticalEnv(dedupEnvCase(true, finalEnv))
		block := createEnvBlock(deduped)
		envPtr = &block[0]
	}

	siEx := &windows.StartupInfoEx{}
	siEx.Cb = uint32(unsafe.Sizeof(*siEx))
	siEx.ProcThreadAttributeList = attrs.List()
	siEx.StartupInfo.Flags = windows.STARTF_USESTDHANDLES

	pi := &windows.ProcessInformation{}
	flags := uint32(windows.CREATE_UNICODE_ENVIRONMENT) | windows.EXTENDED_STARTUPINFO_PRESENT

	if err := windows.CreateProcess(
		argv0p,
		argvp,
		nil,
		nil,
		false,
		flags,
		envPtr,
		dirp,
		&siEx.StartupInfo,
		pi,
	); err != nil {
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: CreateProcess failed: %w", err)
	}

	if err := windows.CloseHandle(pi.Thread); err != nil {
		// non-fatal, but report
	}

	process, err := os.FindProcess(int(pi.ProcessId))
	if err != nil {
		windows.TerminateProcess(pi.Process, 1)
		windows.CloseHandle(pi.Process)
		attrs.Delete()
		stdinPipe.Close()
		stdoutPipe.Close()
		windows.ClosePseudoConsole(hpc)
		return nil, fmt.Errorf("conpty: failed to find process: %w", err)
	}

	p := &Process{
		stdin:         stdinPipe,
		stdout:        stdoutPipe,
		proc:          process,
		hpc:           hpc,
		attrs:         attrs,
		processHandle: pi.Process,
		done:          make(chan struct{}),
	}

	if ctx.Done() != nil {
		go p.monitorContext(ctx)
	}

	return p, nil
}

// Stdin returns a writer connected to the child process standard input.
func (p *Process) Stdin() io.WriteCloser {
	return p.stdin
}

// Stdout returns a reader for the child process combined standard output and error streams.
func (p *Process) Stdout() io.ReadCloser {
	return p.stdout
}

// Read implements io.Reader by reading from the pseudo-console stdout.
func (p *Process) Read(b []byte) (int, error) {
	return p.stdout.Read(b)
}

// Write implements io.Writer by writing to the pseudo-console stdin.
func (p *Process) Write(b []byte) (int, error) {
	return p.stdin.Write(b)
}

// Process returns the underlying os.Process.
func (p *Process) Process() *os.Process {
	return p.proc
}

// ProcessState returns the process state after Wait has completed.
func (p *Process) ProcessState() *os.ProcessState {
	return p.state
}

// Resize adjusts the ConPTY console dimensions.
func (p *Process) Resize(cols, rows int) error {
	if p.hpc == 0 {
		return fmt.Errorf("conpty: pseudo console handle is invalid")
	}
	coord := windows.Coord{X: int16(cols), Y: int16(rows)}
	return windows.ResizePseudoConsole(p.hpc, coord)
}

// Wait waits for the process to exit.
func (p *Process) Wait() error {
	p.waitOnce.Do(func() {
		state, err := p.proc.Wait()
		p.state = state
		p.waitErr = err
		p.cleanup()
	})
	return p.waitErr
}

// Close releases all resources associated with the process and pseudo console.
func (p *Process) Close() error {
	p.cleanup()
	return nil
}

func (p *Process) cleanup() {
	p.closeOnce.Do(func() {
		close(p.done)
		if p.stdin != nil {
			_ = p.stdin.Close()
		}
		if p.stdout != nil {
			_ = p.stdout.Close()
		}
		if p.attrs != nil {
			p.attrs.Delete()
			p.attrs = nil
		}
		if p.hpc != 0 {
			windows.ClosePseudoConsole(p.hpc)
			p.hpc = 0
		}
		if p.processHandle != 0 {
			windows.CloseHandle(p.processHandle)
			p.processHandle = 0
		}
	})
}

func (p *Process) monitorContext(ctx context.Context) {
	select {
	case <-ctx.Done():
		windows.TerminateProcess(p.processHandle, 1)
	case <-p.done:
	}
}

// ConsoleSize returns the current console window width and height in character cells.
func ConsoleSize() (int, int, error) {
	handle, err := windows.GetStdHandle(windows.STD_OUTPUT_HANDLE)
	if err != nil {
		return 0, 0, fmt.Errorf("conpty: failed to get stdout handle: %w", err)
	}

	var info windows.ConsoleScreenBufferInfo
	if err := windows.GetConsoleScreenBufferInfo(handle, &info); err != nil {
		return 0, 0, fmt.Errorf("conpty: failed to query console buffer info: %w", err)
	}

	width := int(info.Window.Right-info.Window.Left) + 1
	height := int(info.Window.Bottom-info.Window.Top) + 1
	if width <= 0 || height <= 0 {
		return 0, 0, fmt.Errorf("conpty: invalid console dimensions (%d x %d)", width, height)
	}

	return width, height, nil
}

func createPseudoConsole() (windows.Handle, *os.File, *os.File, error) {
	ptyIn, inPipe, err := os.Pipe()
	if err != nil {
		return 0, nil, nil, fmt.Errorf("conpty: failed to create input pipe: %w", err)
	}

	outPipe, ptyOut, err := os.Pipe()
	if err != nil {
		inPipe.Close()
		ptyIn.Close()
		return 0, nil, nil, fmt.Errorf("conpty: failed to create output pipe: %w", err)
	}

	var hpc windows.Handle
	size := windows.Coord{X: 80, Y: 25}
	if err := windows.CreatePseudoConsole(size, windows.Handle(ptyIn.Fd()), windows.Handle(ptyOut.Fd()), 0, &hpc); err != nil {
		inPipe.Close()
		ptyIn.Close()
		outPipe.Close()
		ptyOut.Close()
		return 0, nil, nil, fmt.Errorf("conpty: CreatePseudoConsole failed: %w", err)
	}

	ptyIn.Close()
	ptyOut.Close()

	return hpc, inPipe, outPipe, nil
}

func lookExtensions(path, dir string) (string, error) {
	if filepath.Base(path) == path {
		path = filepath.Join(".", path)
	}

	if dir == "" {
		return exec.LookPath(path)
	}

	if filepath.VolumeName(path) != "" {
		return exec.LookPath(path)
	}

	if len(path) > 1 && os.IsPathSeparator(path[0]) {
		return exec.LookPath(path)
	}

	dirandpath := filepath.Join(dir, path)
	lp, err := exec.LookPath(dirandpath)
	if err != nil {
		return "", err
	}

	ext := strings.TrimPrefix(lp, dirandpath)
	return path + ext, nil
}

func dedupEnvCase(caseInsensitive bool, env []string) []string {
	out := make([]string, 0, len(env))
	seen := make(map[string]int, len(env))
	for _, kv := range env {
		eq := strings.Index(kv, "=")
		if eq < 0 {
			out = append(out, kv)
			continue
		}
		key := kv[:eq]
		if caseInsensitive {
			key = strings.ToLower(key)
		}
		if idx, ok := seen[key]; ok {
			out[idx] = kv
			continue
		}
		seen[key] = len(out)
		out = append(out, kv)
	}
	return out
}

func addCriticalEnv(env []string) []string {
	for _, kv := range env {
		eq := strings.Index(kv, "=")
		if eq < 0 {
			continue
		}
		key := kv[:eq]
		if strings.EqualFold(key, "SYSTEMROOT") {
			return env
		}
	}
	return append(env, "SYSTEMROOT="+os.Getenv("SYSTEMROOT"))
}

func createEnvBlock(envv []string) []uint16 {
	if len(envv) == 0 {
		return []uint16{0, 0}
	}

	length := 0
	for _, s := range envv {
		length += len(s) + 1
	}
	length++

	b := make([]byte, length)
	i := 0
	for _, s := range envv {
		copy(b[i:i+len(s)], s)
		i += len(s)
		b[i] = 0
		i++
	}
	b[i] = 0

	encoded := utf16.Encode([]rune(string(b)))
	if len(encoded) == 0 || encoded[len(encoded)-1] != 0 {
		encoded = append(encoded, 0)
	}
	return encoded
}

func joinExeDirAndFName(dir, p string) (string, error) {
	if len(p) == 0 {
		return "", syscall.EINVAL
	}
	if len(p) > 2 && isSlash(p[0]) && isSlash(p[1]) {
		return p, nil
	}
	if len(p) > 1 && p[1] == ':' {
		if len(p) == 2 {
			return "", syscall.EINVAL
		}
		if isSlash(p[2]) {
			return p, nil
		}
		normalized, err := normalizeDir(dir)
		if err != nil {
			return "", err
		}
		if volToUpper(int(p[0])) == volToUpper(int(normalized[0])) {
			return syscall.FullPath(normalized + "\\" + p[2:])
		}
		return syscall.FullPath(p)
	}
	normalized, err := normalizeDir(dir)
	if err != nil {
		return "", err
	}
	if isSlash(p[0]) {
		return windows.FullPath(normalized[:2] + p)
	}
	return windows.FullPath(normalized + "\\" + p)
}

func normalizeDir(dir string) (string, error) {
	ndir, err := syscall.FullPath(dir)
	if err != nil {
		return "", err
	}
	if len(ndir) > 2 && isSlash(ndir[0]) && isSlash(ndir[1]) {
		return "", syscall.EINVAL
	}
	return ndir, nil
}

func volToUpper(ch int) int {
	if 'a' <= ch && ch <= 'z' {
		ch += 'A' - 'a'
	}
	return ch
}

func isSlash(c byte) bool {
	return c == '\\' || c == '/'
}
