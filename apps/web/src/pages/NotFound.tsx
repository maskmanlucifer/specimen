import { Link } from 'react-router-dom';
import { Label } from '../components/ui';
import '../editor/editor.css';

/** 404 (system state 4v). */
export default function NotFound() {
  return (
    <div className="state-page">
      <div className="state-card">
        <Label tone="hot">404</Label>
        <h1 className="display">
          Nothing <em>here</em>
        </h1>
        <p className="read">This page does not exist. If you followed a board link, it may have been moved or unpublished.</p>
        <div className="state-actions">
          <Link to="/boards" className="ui-btn ui-btn--primary ui-btn--md">
            Your boards
          </Link>
          <Link to="/" className="ui-btn ui-btn--secondary ui-btn--md">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
