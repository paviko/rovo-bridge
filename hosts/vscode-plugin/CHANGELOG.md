# Changelog

All notable changes to the RovoBridge VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial VSCode extension implementation
- Complete feature parity with JetBrains plugin
- Cross-platform backend binary support
- Comprehensive packaging and build system

## [0.1.0] - 2025-XX-XX

### Added
- Extension activation and webview panel management
- Backend process lifecycle management with ResourceExtractor and BackendLauncher
- Settings management with real-time synchronization
- Context menu commands for files, folders, and editor selections
- Bi-directional communication bridge between VSCode and web UI
- File monitoring and font size synchronization
- Drag-and-drop functionality for file operations
- Error handling and recovery mechanisms
- Comprehensive test suite
- Build and packaging scripts for development and distribution
- Cross-platform binary distribution system
- GitHub Actions CI/CD workflow
- Development workflow scripts and documentation

### Features
- **Backend Management**: Automatic extraction and launching of rovo-bridge binaries
- **UI Integration**: Embedded web UI using VSCode's Webview API
- **IDE Commands**: Context menu actions for adding files/folders to terminal context
- **Settings Sync**: Real-time synchronization of font size, UI mode, and panel states
- **File Operations**: Drag-and-drop support and path insertion utilities
- **Cross-Platform**: Support for Windows, macOS, and Linux with appropriate binaries
- **Error Recovery**: Comprehensive error handling with user-friendly notifications
