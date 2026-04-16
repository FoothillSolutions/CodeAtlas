import { signal, computed } from '@preact/signals';
import { branchName, files } from './graph-store';

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'flagged' | 'needs-attention';

// Map of filePath -> ReviewStatus
export const reviewStatuses = signal<Map<string, ReviewStatus>>(new Map());

// Derived: progress
export const reviewProgress = computed(() => {
  const total = files.value.filter(f => f.isChanged).length;
  const reviewed = Array.from(reviewStatuses.value.values()).filter(s => s === 'reviewed').length;
  return { reviewed, total };
});

// Storage key
function storageKey(): string {
  return `codeatlas-review-${branchName.value}`;
}

// Load from localStorage
export function loadReviewState() {
  try {
    const key = storageKey();
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, ReviewStatus>;
      reviewStatuses.value = new Map(Object.entries(parsed));
    }
  } catch {
    // Ignore parse errors
  }
}

// Save to localStorage
function saveReviewState() {
  try {
    const key = storageKey();
    const obj: Record<string, ReviewStatus> = {};
    reviewStatuses.value.forEach((status, path) => {
      obj[path] = status;
    });
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // Ignore storage errors
  }
}

// Set review status for a file
export function setReviewStatus(filePath: string, status: ReviewStatus) {
  const statuses = new Map(reviewStatuses.value);
  if (status === 'unreviewed') {
    statuses.delete(filePath);
  } else {
    statuses.set(filePath, status);
  }
  reviewStatuses.value = statuses;
  saveReviewState();
}

// Get review status for a file
export function getReviewStatus(filePath: string): ReviewStatus {
  return reviewStatuses.value.get(filePath) ?? 'unreviewed';
}

// Cycle through statuses: unreviewed -> reviewed -> flagged -> needs-attention -> unreviewed
export function cycleReviewStatus(filePath: string) {
  const current = getReviewStatus(filePath);
  const next: ReviewStatus = current === 'unreviewed' ? 'reviewed'
    : current === 'reviewed' ? 'flagged'
    : current === 'flagged' ? 'needs-attention'
    : 'unreviewed';
  setReviewStatus(filePath, next);
}
