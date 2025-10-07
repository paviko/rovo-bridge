import '@xterm/xterm/css/xterm.css';
import './app.css';
import './polyfills';
// Load the new modular bootstrap
import './ui/bootstrap';

// Inject globals
declare global {
  interface Window { __BOOTSTRAP__?: any; __SESSION_ID__?: string; }
}

