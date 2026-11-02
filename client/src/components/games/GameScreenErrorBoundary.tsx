import { Component, type ErrorInfo, type ReactNode } from 'react';
import './game-screen-error.css';

type Props = { children: ReactNode; onBackToLobby: () => void };
type State = { failed: boolean };

export class GameScreenErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Game screen crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <section className="game-screen-recovery" role="alert">
        <div>
          <span className="eyebrow">A LITTLE HICCUP</span>
          <h2>This game ran into a problem.</h2>
          <p>Your room is still here. Go back to the lobby and try again.</p>
          <button className="button primary" type="button" onClick={this.props.onBackToLobby}>Back to lobby</button>
        </div>
      </section>;
    }
    return this.props.children;
  }
}
