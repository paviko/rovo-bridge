package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func clearScreen() {
	fmt.Print("\033[2J\033[H")
}

func moveCursor(row, col int) {
	fmt.Printf("\033[%d;%dH", row, col)
}

func drawInterface(width int, echoHistory []string, content []string, cursorRow, cursorCol int) {
	// Clear screen
	clearScreen()

	// Show echo history
	for _, echo := range echoHistory {
		fmt.Println("Echo:")
		fmt.Println(echo)
		fmt.Println()
	}

	// Draw input box top border
	fmt.Print("╭")
	for i := 0; i < width-2; i++ {
		fmt.Print("─")
	}
	fmt.Println("╮")

	// Draw content lines
	height := len(content) + 2 // +2 for borders
	for i := 0; i < height-2; i++ {
		fmt.Print("│")
		if i < len(content) {
			line := content[i]
			if len(line) > width-2 {
				line = line[:width-2]
			}
			fmt.Print(line)
			// Pad with spaces
			for j := len(line); j < width-2; j++ {
				fmt.Print(" ")
			}
		} else {
			// Empty line
			for j := 0; j < width-2; j++ {
				fmt.Print(" ")
			}
		}
		fmt.Println("│")
	}

	// Draw bottom border
	fmt.Print("╰")
	for i := 0; i < width-2; i++ {
		fmt.Print("─")
	}
	fmt.Print("╯")

	// Move cursor up to the correct input line and position
	// Move up by (total content lines - current cursor row) lines + 1 for the bottom border
	linesToMoveUp := len(content) - cursorRow
	if linesToMoveUp >= 0 {
		fmt.Printf("\033[%dA", linesToMoveUp) // Move cursor up
	}

	// Move cursor to the correct column position
	fmt.Printf("\033[%dG", 2+cursorCol) // Move to column (1-based)
}

func main() {
	// Enable raw mode for better terminal control
	// For simplicity, we'll use line-based input but with custom rendering

	width, _ := getTerminalSize()
	if width < 20 {
		width = 80
	}

	var inputLines []string
	currentLine := ""
	var echoHistory []string

	for {
		// Prepare display content
		displayLines := make([]string, 0)

		// Add existing input lines (only first line gets ">", others get "  ")
		for i, line := range inputLines {
			if i == 0 {
				displayLines = append(displayLines, " > "+line)
			} else {
				displayLines = append(displayLines, "   "+line)
			}
		}

		// Add current line
		var currentDisplay string
		if len(inputLines) == 0 {
			// First line gets ">"
			currentDisplay = " > " + currentLine
		} else {
			// Continuation lines get "  "
			currentDisplay = "   " + currentLine
		}
		displayLines = append(displayLines, currentDisplay)

		// Calculate cursor position
		cursorRow := len(displayLines) - 1
		cursorCol := len(currentDisplay)

		// Draw the interface
		drawInterface(width, echoHistory, displayLines, cursorRow, cursorCol)

		// Read input
		reader := bufio.NewReader(os.Stdin)
		input, err := reader.ReadString('\n')
		if err != nil {
			break
		}

		// Remove newline
		input = strings.TrimSuffix(input, "\n")
		input = strings.TrimSuffix(input, "\r")

		// Check for exit command
		fullInput := strings.Join(append(inputLines, currentLine+input), "\n")
		if strings.TrimSpace(fullInput) == "/exit" {
			break
		}

		// Check for line continuation
		if strings.HasSuffix(input, "\\") {
			// Remove the backslash and add to current line
			currentLine += strings.TrimSuffix(input, "\\")
			inputLines = append(inputLines, currentLine)
			currentLine = ""
			continue
		}

		// Regular input - echo and reset
		currentLine += input
		fullInput = strings.Join(append(inputLines, currentLine), "\n")

		// Add to echo history
		echoHistory = append(echoHistory, fullInput)

		// Reset for next input
		inputLines = []string{}
		currentLine = ""
	}

	clearScreen()
	fmt.Println("Goodbye!")
}
