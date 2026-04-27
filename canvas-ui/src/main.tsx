import { render } from 'preact';
import type { MrGraph } from './types';
import { initGraph } from './state/graph-store';
import { loadReviewState } from './state/review-store';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';

const dataEl = document.getElementById('graph-data');
if (dataEl?.textContent) {
  try {
    const data: MrGraph = JSON.parse(dataEl.textContent);
    initGraph(data);
    loadReviewState();
  } catch (e) {
    console.error('Failed to parse graph data:', e);
  }
}

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById('app')!
);
